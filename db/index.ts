import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

type SqlValue = string | number | bigint | null | Uint8Array;
type Row = Record<string, unknown>;

type TursoCell = { type: "null" | "integer" | "float" | "text" | "blob"; value?: string; base64?: string };
type TursoResult = {
  cols?: Array<{ name: string }>;
  rows?: TursoCell[][];
  affected_row_count?: number;
  last_insert_rowid?: string | null;
};
type TursoResponse = {
  results?: Array<{
    type: "ok" | "error";
    response?: { type: string; result?: TursoResult };
    error?: { message?: string; code?: string };
  }>;
};

export interface CompatStatement {
  readonly sql: string;
  readonly params: SqlValue[];
  bind(...params: SqlValue[]): CompatStatement;
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>;
  first<T extends Row = Row>(): Promise<T | null>;
  all<T extends Row = Row>(): Promise<{ results: T[]; success: true }>;
}

export interface DatabaseCompat {
  prepare(sql: string): CompatStatement;
  batch(statements: CompatStatement[]): Promise<Array<{ success: true; meta: { changes: number; last_row_id: number } }>>;
}

export class PreparedStatementCompat implements CompatStatement {
  constructor(
    private readonly database: DatabaseSync,
    readonly sql: string,
    readonly params: SqlValue[] = [],
  ) {}

  bind(...params: SqlValue[]) {
    return new PreparedStatementCompat(this.database, this.sql, params);
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return {
      success: true as const,
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: result.lastInsertRowid ? Number(result.lastInsertRowid) : 0,
      },
    };
  }

  async first<T extends Row = Row>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.params) as T | undefined;
    return row ?? null;
  }

  async all<T extends Row = Row>(): Promise<{ results: T[]; success: true }> {
    const results = this.database.prepare(this.sql).all(...this.params) as T[];
    return { results, success: true };
  }
}

export class SqliteDatabaseCompat implements DatabaseCompat {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new PreparedStatementCompat(this.database, sql);
  }

  async batch(statements: CompatStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export class RemotePreparedStatementCompat implements CompatStatement {
  constructor(
    private readonly database: TursoHttpDatabaseCompat,
    readonly sql: string,
    readonly params: SqlValue[] = [],
  ) {}

  bind(...params: SqlValue[]) {
    return new RemotePreparedStatementCompat(this.database, this.sql, params);
  }

  async run() {
    const result = await this.database.execute(this.sql, this.params);
    return {
      success: true as const,
      meta: {
        changes: Number(result.affected_row_count ?? 0),
        last_row_id: Number(result.last_insert_rowid ?? 0),
      },
    };
  }

  async first<T extends Row = Row>(): Promise<T | null> {
    const result = await this.database.execute(this.sql, this.params);
    const rows = resultToRows<T>(result);
    return rows[0] ?? null;
  }

  async all<T extends Row = Row>(): Promise<{ results: T[]; success: true }> {
    const result = await this.database.execute(this.sql, this.params);
    return { results: resultToRows<T>(result), success: true };
  }
}

export class TursoHttpDatabaseCompat implements DatabaseCompat {
  private readonly endpoint: string;

  constructor(url: string, private readonly token: string) {
    const normalized = url.trim().replace(/^libsql:\/\//i, "https://").replace(/^turso:\/\//i, "https://").replace(/\/$/, "");
    this.endpoint = normalized.endsWith("/v2/pipeline") ? normalized : `${normalized}/v2/pipeline`;
  }

  prepare(sql: string) {
    return new RemotePreparedStatementCompat(this, sql);
  }

  async execute(sql: string, params: SqlValue[] = []) {
    const data = await this.pipeline([{ type: "execute", stmt: { sql, args: params.map(toTursoArg) } }, { type: "close" }]);
    const result = data.results?.[0];
    if (!result || result.type !== "ok") throw new Error(result?.error?.message || "Database remote gagal mengeksekusi query");
    return result.response?.result ?? {};
  }

  async batch(statements: CompatStatement[]) {
    if (!statements.length) return [];
    const requests: Array<Record<string, unknown>> = [{ type: "execute", stmt: { sql: "BEGIN IMMEDIATE" } }];
    for (const statement of statements) {
      requests.push({ type: "execute", stmt: { sql: statement.sql, args: statement.params.map(toTursoArg) } });
    }
    requests.push({ type: "execute", stmt: { sql: "COMMIT" } }, { type: "close" });
    const data = await this.pipeline(requests);
    const statementResults = data.results?.slice(1, 1 + statements.length) ?? [];
    return statementResults.map((item) => {
      if (item.type !== "ok") throw new Error(item.error?.message || "Database remote gagal menjalankan batch");
      const result = item.response?.result;
      return {
        success: true as const,
        meta: {
          changes: Number(result?.affected_row_count ?? 0),
          last_row_id: Number(result?.last_insert_rowid ?? 0),
        },
      };
    });
  }

  private async pipeline(requests: Array<Record<string, unknown>>): Promise<TursoResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
      cache: "no-store",
    });
    const text = await response.text();
    let data: TursoResponse = {};
    try { data = text ? JSON.parse(text) as TursoResponse : {}; } catch { /* handled below */ }
    if (!response.ok) throw new Error(`Database remote HTTP ${response.status}: ${text.slice(0, 300)}`);
    const failed = data.results?.find((item) => item.type === "error");
    if (failed) throw new Error(failed.error?.message || failed.error?.code || "Database remote mengembalikan error");
    return data;
  }
}

let singleton: DatabaseCompat | null = null;
let databaseInfo: { mode: "local" | "turso"; persistent: boolean; detail: string } | null = null;

export function getDb(): DatabaseCompat {
  if (singleton) return singleton;

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoUrl && tursoToken) {
    singleton = new TursoHttpDatabaseCompat(tursoUrl, tursoToken);
    databaseInfo = { mode: "turso", persistent: true, detail: "Turso SQL over HTTP" };
    return singleton;
  }

  const configured = process.env.DATABASE_PATH?.trim();
  const onVercel = Boolean(process.env.VERCEL);
  const databasePath = onVercel
    ? path.join("/tmp", "asep-bot-store.sqlite")
    : configured
      ? path.resolve(configured)
      : path.join(process.cwd(), "data", "asep-bot.sqlite");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");

  singleton = new SqliteDatabaseCompat(sqlite);
  databaseInfo = {
    mode: "local",
    persistent: !onVercel,
    detail: onVercel ? "SQLite sementara di /tmp" : databasePath,
  };
  return singleton;
}

export function getDatabaseInfo() {
  if (!databaseInfo) getDb();
  return databaseInfo!;
}

function toTursoArg(value: SqlValue): TursoCell {
  if (value === null) return { type: "null" };
  if (value instanceof Uint8Array) return { type: "blob", base64: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return { type: "integer", value: value.toString() };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { type: "integer", value: String(value) };
    return { type: "float", value: String(value) };
  }
  return { type: "text", value };
}

function fromTursoCell(cell: TursoCell): unknown {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") {
    const raw = cell.value || "0";
    const numeric = Number(raw);
    return Number.isSafeInteger(numeric) ? numeric : raw;
  }
  if (cell.type === "float") return Number(cell.value || 0);
  if (cell.type === "blob") return Uint8Array.from(Buffer.from(cell.base64 || "", "base64"));
  return cell.value ?? "";
}

function resultToRows<T extends Row>(result: TursoResult): T[] {
  const columns = result.cols?.map((column) => column.name) ?? [];
  return (result.rows ?? []).map((cells) => Object.fromEntries(columns.map((name, index) => [name, fromTursoCell(cells[index])])) as T);
}
