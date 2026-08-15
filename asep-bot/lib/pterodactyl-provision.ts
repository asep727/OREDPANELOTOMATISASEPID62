import { extractEggEnvironment, readApiError, validatePanelBaseUrl } from "./pterodactyl-utils.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Check = { ok: boolean; status: number; message: string; skipped?: boolean };

type PanelConfig = {
  baseUrl: string;
  applicationKey: string;
  clientKey?: string;
  nestId: number;
  eggId: number;
  locationId: number;
};

type ProvisionInput = PanelConfig & {
  fetchImpl?: FetchLike;
  username: string;
  password: string;
  email: string;
  serverName: string;
  dockerImage: string;
  startup: string;
  limits: { memory: number; swap: number; disk: number; io: number; cpu: number };
  featureLimits: { databases: number; allocations: number; backups: number };
};

export async function checkPterodactyl(config: PanelConfig, fetchImpl: FetchLike = fetch) {
  const base = validatePanelBaseUrl(config.baseUrl);
  const appHeaders = applicationHeaders(config.applicationKey);

  const application = await runCheck(
    () => fetchImpl(`${base}/api/application/users?per_page=1`, { headers: appHeaders, cache: "no-store" }),
    "Application API tidak dapat membaca users",
  );

  const client = config.clientKey
    ? await runCheck(
      () => fetchImpl(`${base}/api/client/account`, { headers: clientHeaders(config.clientKey || ""), cache: "no-store" }),
      "Client API tidak dapat membaca account",
    )
    : { ok: true, status: 0, message: "Tidak diuji karena Client API Token kosong", skipped: true } satisfies Check;

  let egg: Check;
  let location: Check;
  if (!application.ok) {
    egg = { ok: false, status: 0, message: "Tidak diuji karena Application API gagal" };
    location = { ok: false, status: 0, message: "Tidak diuji karena Application API gagal" };
  } else {
    egg = await runCheck(
      () => fetchImpl(eggEndpoint(base, config.nestId, config.eggId), { headers: appHeaders, cache: "no-store" }),
      `Egg ${config.eggId} tidak dapat dibaca`,
    );
    location = await runCheck(
      () => fetchImpl(`${base}/api/application/locations/${config.locationId}`, { headers: appHeaders, cache: "no-store" }),
      `Location ${config.locationId} tidak dapat dibaca`,
    );
  }

  return {
    ok: application.ok && client.ok && egg.ok && location.ok,
    application,
    client,
    egg,
    location,
  };
}

export async function provisionPterodactyl(input: ProvisionInput) {
  const fetchImpl = input.fetchImpl || fetch;
  const base = validatePanelBaseUrl(input.baseUrl);
  const headers = applicationHeaders(input.applicationKey, true);

  const eggResponse = await fetchImpl(eggEndpoint(base, input.nestId, input.eggId), {
    headers: applicationHeaders(input.applicationKey),
    cache: "no-store",
  });
  if (!eggResponse.ok) throw new Error(`[EGG] ${await readApiError(eggResponse, `Egg ${input.eggId} tidak dapat dibaca`)}`);
  const eggData = await safeJson(eggResponse);
  const environment = extractEggEnvironment(eggData);

  const userResponse = await fetchImpl(`${base}/api/application/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: input.email,
      username: input.username,
      first_name: "ASEP",
      last_name: "BOT",
      password: input.password,
    }),
  });
  if (!userResponse.ok) throw new Error(`[CREATE_USER] ${await readApiError(userResponse, "Gagal membuat user Pterodactyl")}`);
  const userData = await safeJson(userResponse);
  const userId = nestedNumber(userData, "attributes", "id");
  if (!userId) throw new Error("[CREATE_USER] User berhasil dibuat tetapi ID user tidak ditemukan pada response API.");

  const serverResponse = await fetchImpl(`${base}/api/application/servers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: input.serverName,
      user: userId,
      egg: input.eggId,
      docker_image: input.dockerImage,
      startup: input.startup,
      environment,
      limits: input.limits,
      feature_limits: input.featureLimits,
      deploy: { locations: [input.locationId], dedicated_ip: false, port_range: [] },
    }),
  });

  if (!serverResponse.ok) {
    const serverError = await readApiError(serverResponse, "Gagal membuat server Pterodactyl");
    const cleanup = await cleanupTemporaryUser(base, input.applicationKey, userId, fetchImpl);
    throw new Error(`[CREATE_SERVER] ${serverError}. ${cleanup}`);
  }

  const serverData = await safeJson(serverResponse);
  return {
    userId,
    identifier: nestedString(serverData, "attributes", "identifier") || "berhasil dibuat",
    environment,
  };
}

function eggEndpoint(base: string, nestId: number, eggId: number) {
  return `${base}/api/application/nests/${nestId}/eggs/${eggId}?include=variables`;
}

function applicationHeaders(key: string, json = false): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "Application/vnd.pterodactyl.v1+json",
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function clientHeaders(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    Accept: "Application/vnd.pterodactyl.v1+json",
  };
}

async function runCheck(request: () => Promise<Response>, fallback: string): Promise<Check> {
  try {
    const response = await request();
    if (response.ok) return { ok: true, status: response.status, message: `HTTP ${response.status}: terhubung` };
    return { ok: false, status: response.status, message: await readApiError(response, fallback) };
  } catch (error) {
    return { ok: false, status: 0, message: `Koneksi gagal: ${error instanceof Error ? error.message : fallback}` };
  }
}

async function cleanupTemporaryUser(base: string, key: string, userId: number, fetchImpl: FetchLike) {
  try {
    const response = await fetchImpl(`${base}/api/application/users/${userId}`, {
      method: "DELETE",
      headers: applicationHeaders(key),
      cache: "no-store",
    });
    if (response.ok) return "User sementara berhasil dibersihkan";
    return `User sementara gagal dibersihkan (${await readApiError(response, "DELETE user ditolak")})`;
  } catch (error) {
    return `User sementara gagal dibersihkan (${error instanceof Error ? error.message : "koneksi gagal"})`;
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function nestedNumber(data: Record<string, unknown>, first: string, second: string) {
  const one = data[first];
  if (!one || typeof one !== "object" || Array.isArray(one)) return 0;
  return Number((one as Record<string, unknown>)[second]) || 0;
}

function nestedString(data: Record<string, unknown>, first: string, second: string) {
  const one = data[first];
  if (!one || typeof one !== "object" || Array.isArray(one)) return "";
  return String((one as Record<string, unknown>)[second] || "");
}
