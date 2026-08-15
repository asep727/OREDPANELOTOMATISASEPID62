export type PanelKeyKind = "application" | "client" | "unknown" | "empty";

export function classifyPanelKey(value: string): PanelKeyKind {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "empty";
  if (key.startsWith("ptla_")) return "application";
  if (key.startsWith("ptlc_")) return "client";
  return "unknown";
}

export function normalizePanelKeys(applicationKey: string, clientKey: string) {
  const app = String(applicationKey || "").trim();
  const client = String(clientKey || "").trim();
  const appKind = classifyPanelKey(app);
  const clientKind = classifyPanelKey(client);

  if (appKind === "client" && clientKind === "application") {
    return { applicationKey: client, clientKey: app, swapped: true };
  }
  if (appKind === "client") {
    throw new Error("Application API Key harus memakai prefix ptla_. Key ptlc_ adalah Client API Token.");
  }
  if (clientKind === "application") {
    throw new Error("Client API Token harus memakai prefix ptlc_. Key ptla_ adalah Application API Key.");
  }
  return { applicationKey: app, clientKey: client, swapped: false };
}

export function validatePanelBaseUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("URL panel wajib diisi");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL panel tidak valid");
  }
  if (url.protocol !== "https:") throw new Error("URL panel harus menggunakan HTTPS");
  if (!url.hostname) throw new Error("URL panel tidak valid");
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")}`;
}

export async function readApiError(response: Response, fallback: string) {
  let detail = "";
  try {
    const text = await response.text();
    if (text) {
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        const errors = Array.isArray(data.errors) ? data.errors as Array<Record<string, unknown>> : [];
        detail = String(errors[0]?.detail || errors[0]?.code || data.message || data.error || "").trim();
      } catch {
        detail = text.replace(/\s+/g, " ").trim().slice(0, 300);
      }
    }
  } catch {
    // Network/proxy response body could be unavailable; use the safe fallback.
  }
  const message = detail || fallback;
  return `HTTP ${response.status}: ${message}`;
}

export function extractEggEnvironment(rawEgg: unknown): Record<string, string> {
  const root = isRecord(rawEgg) ? rawEgg : {};
  const attributes = isRecord(root.attributes) ? root.attributes : root;
  const relationships = isRecord(attributes.relationships) ? attributes.relationships : {};
  const variablesRelation = isRecord(relationships.variables) ? relationships.variables : {};
  const relationData = Array.isArray(variablesRelation.data) ? variablesRelation.data : [];
  const directVariables = Array.isArray(attributes.variables) ? attributes.variables : [];
  const variables = relationData.length ? relationData : directVariables;
  const environment: Record<string, string> = {};

  for (const item of variables) {
    const itemRecord = isRecord(item) ? item : {};
    const variable = isRecord(itemRecord.attributes) ? itemRecord.attributes : itemRecord;
    const key = String(variable.env_variable || variable.envVariable || "").trim();
    if (!key) continue;
    const defaultValue = variable.default_value ?? variable.defaultValue ?? "";
    environment[key] = String(defaultValue ?? "");
  }
  return environment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
