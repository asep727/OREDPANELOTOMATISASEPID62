import { getDb, type DatabaseCompat } from "../db";

type D1 = DatabaseCompat;
type Row = Record<string, unknown>;

function runtimeEnv() {
  return { APP_SECRET: (process.env.APP_SECRET || "").trim() };
}

// Real check: APP_SECRET must actually be set (and reasonably long) in the
// deployment environment. On Vercel, credential encryption is refused until
// a real APP_SECRET is configured; local panel hosting creates one at startup.
export function appSecretConfigured() {
  const value = process.env.APP_SECRET || "";
  return value.trim().length >= 32;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  script_name: "ASEP BOT",
  store_name: "ASEP BOT",
  store_tagline: "DIGITAL HOSTING STORE",
  cheap_label: "Panel Pterodactyl",
  private_label: "Panel Private",
  hero_badge: "SISTEM OTOMATIS 100% AKTIF",
  hero_title: "Semua Kebutuhan Hosting & Bot WhatsApp Dalam Satu Tempat.",
  hero_subtitle: "Layanan hosting dan panel digital dengan checkout ringkas, transaksi terpantau, dan proses otomatis yang tetap bisa dikontrol owner.",
  catalog_title: "Pilih Varian Layanan",
  catalog_subtitle: "Paket fleksibel, harga transparan, dan proses pembayaran dapat dipantau langsung.",
  footer_text: "Layanan digital dengan proses transaksi yang jelas dan mudah dipantau.",
  whatsapp: "",
  support_email: "",
  theme_primary: "#3b82f6",
  theme_accent: "#2563eb",
  panel_url: "https://ptpanelbuy.asepid.my.id",
  payment_mode: "hybrid",
  manual_qris_name: "QRIS ASEP BOT",
  manual_qris_image: "",
  manual_payment_note: "Scan QRIS, selesaikan pembayaran sesuai nominal, lalu tunggu verifikasi owner. Simpan bukti pembayaran bila diperlukan.",
  manual_expiry_minutes: "30",
  nevapedia_url: "https://app.nevapedia.com",
  nevapedia_api_key: "",
  pterodactyl_api_key: "",
  pterodactyl_client_api_key: "",
  panel_default_egg_id: "15",
  panel_default_nest_id: "5",
  panel_default_location_id: "1",
  warranty_enabled: "true",
  warranty_label: "Full Garansi",
  warranty_days: "30",
  warranty_terms: "Garansi berlaku untuk kendala layanan yang berasal dari sistem. Penyalahgunaan akun, pelanggaran aturan, dan perubahan konfigurasi oleh pengguna dapat membatalkan garansi.",
  checkout_sound_enabled: "true",
  checkout_sound_volume: "70",
  telegram_bot_token: "",
  telegram_chat_id: "",
  telegram_enabled: "false",
  testimonial_template: "✅ TRANSAKSI {STORE} BERHASIL\nPaket: {PRODUCT}\nTotal: {TOTAL}\nOrder: {ORDER}\nStatus: Panel aktif\nWaktu: {TIME}",
};

const DEFAULT_PRODUCTS = [
  ["murah-1", "Starter 1GB", "cheap", "Cocok untuk bot ringan dan percobaan.", 1024, 40, 2048, 2000, 1, 0, 10],
  ["murah-2", "Hemat 2GB", "cheap", "Lebih lega untuk bot aktif harian.", 2048, 70, 4096, 4000, 1, 0, 20],
  ["murah-4", "Best 4GB", "cheap", "Paket favorit untuk performa stabil.", 4096, 120, 8192, 7000, 1, 1, 30],
  ["private-6", "Private 6GB", "private", "Resource private untuk kebutuhan lebih serius.", 6144, 170, 12288, 10000, 1, 0, 40],
  ["private-8", "Private 8GB", "private", "Performa tinggi untuk banyak proses.", 8192, 220, 16384, 13000, 1, 1, 50],
  ["private-unlimited", "Private Unlimited", "private", "Kapasitas maksimal untuk pengguna prioritas.", 0, 280, 25600, 17000, 1, 0, 60],
];

export function db(): D1 {
  return getDb();
}

export async function ensureStore() {
  const d1 = db();
  await d1.batch([
    d1.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category_key TEXT NOT NULL, description TEXT NOT NULL, ram INTEGER NOT NULL, cpu INTEGER NOT NULL, disk INTEGER NOT NULL, price INTEGER NOT NULL, active INTEGER NOT NULL, popular INTEGER NOT NULL, sort_order INTEGER NOT NULL, egg_id INTEGER NOT NULL, location_id INTEGER NOT NULL, docker_image TEXT NOT NULL, startup TEXT NOT NULL, databases INTEGER NOT NULL, backups INTEGER NOT NULL, allocations INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, access_token TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL, category_key TEXT NOT NULL, panel_username TEXT NOT NULL, panel_password TEXT NOT NULL, subtotal INTEGER NOT NULL, total INTEGER NOT NULL, payment_total INTEGER NOT NULL, status TEXT NOT NULL, gateway TEXT NOT NULL, gateway_invoice_id TEXT NOT NULL, qris_image TEXT NOT NULL, gateway_expires_at TEXT NOT NULL, gateway_reference TEXT NOT NULL, message TEXT NOT NULL, telegram_sent_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, username TEXT NOT NULL, csrf TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at)"),
  ]);

  const now = new Date().toISOString();
  await d1.batch(Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
    d1.prepare("INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)").bind(key, value, now)
  ));
  // Migrate only untouched legacy defaults so existing custom owner values are preserved.
  await d1.batch([
    d1.prepare("UPDATE settings SET value='ASEP BOT',updated_at=? WHERE key='store_name' AND value='FallZxStores'").bind(now),
    d1.prepare("UPDATE settings SET value='ASEP BOT',updated_at=? WHERE key='script_name' AND value='Asep Bot'").bind(now),
    d1.prepare("UPDATE settings SET value='QRIS ASEP BOT',updated_at=? WHERE key='manual_qris_name' AND value='QRIS FallZxStores'").bind(now),
    d1.prepare("UPDATE settings SET value='',updated_at=? WHERE key='support_email' AND value='fallzxcoderid@gmail.com'").bind(now),
  ]);
  await d1.batch(DEFAULT_PRODUCTS.map((p) => d1.prepare(
    "INSERT OR IGNORE INTO products (id,name,category_key,description,ram,cpu,disk,price,active,popular,sort_order,egg_id,location_id,docker_image,startup,databases,backups,allocations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(...p, 0, 0, "ghcr.io/parkervcp/yolks:nodejs_22", "npm start", 1, 1, 1, now, now)));

  const admin = await d1.prepare("SELECT username FROM admins WHERE username='admin'").first();
  if (!admin) {
    const salt = randomToken(16);
    const passwordHash = await hashPassword("AsepBot2097!", salt);
    await d1.prepare("INSERT INTO admins (username,salt,password_hash,updated_at) VALUES (?,?,?,?)")
      .bind("admin", salt, passwordHash, now).run();
  }
}

export async function getSettings(includeSecrets = false) {
  await ensureStore();
  const result = await db().prepare("SELECT key,value FROM settings").all<Row>();
  const settings = Object.fromEntries(result.results.map((row) => [String(row.key), String(row.value)]));
  if (!includeSecrets) {
    delete settings.nevapedia_api_key;
    delete settings.pterodactyl_api_key;
    delete settings.pterodactyl_client_api_key;
    delete settings.telegram_bot_token;
  }
  return settings;
}

export async function getProducts(activeOnly = false) {
  await ensureStore();
  const where = activeOnly ? "WHERE active=1" : "";
  const result = await db().prepare(`SELECT * FROM products ${where} ORDER BY sort_order ASC, created_at ASC`).all<Row>();
  return result.results.map(normalizeProduct);
}

export function normalizeProduct(row: Row) {
  return {
    id: String(row.id), name: String(row.name), categoryKey: String(row.category_key),
    description: String(row.description), ram: Number(row.ram), cpu: Number(row.cpu),
    disk: Number(row.disk), price: Number(row.price), active: Boolean(row.active),
    popular: Boolean(row.popular), sortOrder: Number(row.sort_order), eggId: Number(row.egg_id),
    locationId: Number(row.location_id), dockerImage: String(row.docker_image), startup: String(row.startup),
    databases: Number(row.databases), backups: Number(row.backups), allocations: Number(row.allocations),
  };
}

export function normalizeOrder(row: Row) {
  return {
    id: String(row.id), accessToken: String(row.access_token), productId: String(row.product_id),
    productName: String(row.product_name), categoryKey: String(row.category_key), panelUsername: String(row.panel_username),
    panelPassword: String(row.panel_password), subtotal: Number(row.subtotal), total: Number(row.total),
    paymentTotal: Number(row.payment_total), status: String(row.status), gateway: String(row.gateway),
    gatewayInvoiceId: String(row.gateway_invoice_id), qrisImage: String(row.qris_image),
    gatewayExpiresAt: String(row.gateway_expires_at), gatewayReference: String(row.gateway_reference),
    message: String(row.message), telegramSentAt: String(row.telegram_sent_at), createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), paidAt: String(row.paid_at),
  };
}

export async function getAdminSession(request: Request) {
  await ensureStore();
  const cookie = request.headers.get("cookie") || "";
  const id = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("asep_admin="))?.split("=")[1];
  if (!id) return null;
  const row = await db().prepare("SELECT * FROM sessions WHERE id=? AND expires_at>?").bind(id, new Date().toISOString()).first<Row>();
  if (!row) return null;
  return { id, username: String(row.username), csrf: String(row.csrf) };
}

export async function requireAdmin(request: Request, csrf = false) {
  const session = await getAdminSession(request);
  if (!session) throw new HttpError(401, "Sesi admin sudah berakhir");
  if (csrf && request.headers.get("x-csrf-token") !== session.csrf) throw new HttpError(403, "Token keamanan tidak valid");
  return session;
}

export async function audit(username: string, action: string, detail: string) {
  await db().prepare("INSERT INTO audit_logs (username,action,detail,created_at) VALUES (?,?,?,?)")
    .bind(username, action, detail.slice(0, 500), new Date().toISOString()).run();
}

export async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120000, hash: "SHA-256" }, material, 256);
  return toHex(new Uint8Array(bits));
}

export function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(data);
}

export function randomPassword() {
  return `Ab${randomToken(5)}9!`;
}

export async function seal(value: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${toHex(iv)}.${toHex(new Uint8Array(encrypted))}`;
}

export async function unseal(value: string) {
  const configured = runtimeEnv().APP_SECRET;
  const candidates = [
    configured,
    "asep-bot-production-secret-key-change-later",
    "asep-bot-preview-secret-change-in-production",
    "asep-bot-local-preview-secret-not-for-production",
  ].filter((item, index, all) => Boolean(item) && all.indexOf(item) === index);
  const [ivHex, encryptedHex] = value.split(".");
  if (!ivHex || !encryptedHex) return "";
  for (const secret of candidates) {
    try {
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(ivHex) }, await keyFromSecret(secret), fromHex(encryptedHex));
      return new TextDecoder().decode(decrypted);
    } catch {
      // Try the next known key so deployments can migrate away from legacy fallback encryption.
    }
  }
  return "";
}

async function encryptionKey() {
  let secret = runtimeEnv().APP_SECRET;
  if (!secret && process.env.VERCEL) {
    throw new Error("APP_SECRET wajib diisi di Vercel (minimal 32 karakter) sebelum menyimpan credential produksi.");
  }
  if (!secret) secret = "asep-bot-local-preview-secret-not-for-production";
  return keyFromSecret(secret);
}

async function keyFromSecret(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toHex(data: Uint8Array) { return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function fromHex(value: string) { return new Uint8Array((value.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))); }

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
