import { getDatabaseInfo } from "../../../db";
import { appSecretConfigured, db, ensureStore, getAdminSession, getProducts, getSettings, hashPassword, HttpError, normalizeOrder, normalizeProduct, randomPassword, randomToken, requireAdmin, seal, unseal, audit } from "../../../lib/asep-store";
import { normalizePanelKeys, validatePanelBaseUrl } from "../../../lib/pterodactyl-utils";
import { checkPterodactyl, provisionPterodactyl } from "../../../lib/pterodactyl-provision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "public-data";
    if (action === "public-data") {
      const settings = await getSettings();
      const privateSettings = await getSettings(true);
      settings.payment_auto_ready = await secretValue(privateSettings.nevapedia_api_key) ? "true" : "false";
      settings.payment_manual_ready = settings.manual_qris_image ? "true" : "false";
      return Response.json({ settings, products: await getProducts(true) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "order-status") {
      const id = url.searchParams.get("id") || "";
      const token = url.searchParams.get("token") || "";
      const row = await db().prepare("SELECT * FROM orders WHERE id=? AND access_token=?").bind(id, token).first<Record<string, unknown>>();
      if (!row) throw new HttpError(404, "Pesanan tidak ditemukan");
      let order = normalizeOrder(row);
      if (order.status === "pending" && order.gateway === "nevapedia" && order.gatewayInvoiceId) {
        try { order = await syncNevapedia(order); } catch { /* keep last known status so checkout stays usable */ }
      }
      const payload: Record<string, unknown> = {
        id: order.id,
        status: order.status,
        productName: order.productName,
        total: order.paymentTotal,
        gateway: order.gateway,
        qrisImage: order.qrisImage,
        expiresAt: order.gatewayExpiresAt,
        message: order.message,
      };
      if (order.status === "active") {
        const settings = await getSettings(true);
        payload.credentials = { url: settings.panel_url, username: order.panelUsername, password: await unseal(order.panelPassword) };
        const warrantyDays = Math.max(0, Number(settings.warranty_days) || 0);
        const warrantyStart = order.paidAt ? new Date(order.paidAt) : new Date(order.updatedAt);
        const warrantyExpires = new Date(warrantyStart.getTime() + warrantyDays * 86400000).toISOString();
        payload.warranty = {
          enabled: settings.warranty_enabled === "true" && warrantyDays > 0,
          label: settings.warranty_label || "Garansi Layanan",
          days: warrantyDays,
          expiresAt: warrantyExpires,
          terms: settings.warranty_terms || "",
        };
      }
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "admin-data") {
      const session = await requireAdmin(request);
      await ensureStore();
      const settings = await getSettings(true);
      const maskedSettings = {
        ...settings,
        nevapedia_api_key: mask(settings.nevapedia_api_key),
        pterodactyl_api_key: mask(settings.pterodactyl_api_key),
        pterodactyl_client_api_key: mask(settings.pterodactyl_client_api_key),
        telegram_bot_token: mask(settings.telegram_bot_token),
      };
      const orderRows = await db().prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all<Record<string, unknown>>();
      const logRows = await db().prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 40").all<Record<string, unknown>>();
      return Response.json({
        authenticated: true,
        csrf: session.csrf,
        settings: maskedSettings,
        products: await getProducts(false),
        orders: orderRows.results.map(normalizeOrder).map(safeOrder),
        logs: logRows.results,
        runtime: {
          database: getDatabaseInfo(),
          vercel: Boolean(process.env.VERCEL),
          appSecretConfigured: appSecretConfigured(),
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new HttpError(404, "Aksi tidak ditemukan");
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action || "");
    await ensureStore();

    if (action === "login") {
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      const admin = await db().prepare("SELECT * FROM admins WHERE username=?").bind(username).first<Record<string, unknown>>();
      if (!admin || await hashPassword(password, String(admin.salt)) !== String(admin.password_hash)) throw new HttpError(401, "Username atau password salah");
      const id = randomToken();
      const csrf = randomToken(16);
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      await db().prepare("INSERT INTO sessions (id,username,csrf,expires_at,created_at) VALUES (?,?,?,?,?)").bind(id, username, csrf, expires, new Date().toISOString()).run();
      await audit(username, "LOGIN", "Owner masuk ke dashboard");
      const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return Response.json({ ok: true }, { headers: { "Set-Cookie": `asep_admin=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}` } });
    }

    if (action === "logout") {
      const session = await getAdminSession(request);
      if (session) await db().prepare("DELETE FROM sessions WHERE id=?").bind(session.id).run();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": "asep_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" } });
    }

    if (action === "create-order") return createOrder(payload);

    const session = await requireAdmin(request, true);
    if (action === "save-product") {
      const item = sanitizeProduct(payload.product as Record<string, unknown> || {});
      const now = new Date().toISOString();
      await db().prepare("INSERT INTO products (id,name,category_key,description,ram,cpu,disk,price,active,popular,sort_order,egg_id,location_id,docker_image,startup,databases,backups,allocations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category_key=excluded.category_key,description=excluded.description,ram=excluded.ram,cpu=excluded.cpu,disk=excluded.disk,price=excluded.price,active=excluded.active,popular=excluded.popular,sort_order=excluded.sort_order,egg_id=excluded.egg_id,location_id=excluded.location_id,docker_image=excluded.docker_image,startup=excluded.startup,databases=excluded.databases,backups=excluded.backups,allocations=excluded.allocations,updated_at=excluded.updated_at")
        .bind(item.id, item.name, item.categoryKey, item.description, item.ram, item.cpu, item.disk, item.price, item.active ? 1 : 0, item.popular ? 1 : 0, item.sortOrder, item.eggId, item.locationId, item.dockerImage, item.startup, item.databases, item.backups, item.allocations, now, now).run();
      await audit(session.username, "PRODUCT_SAVE", `${item.name} (${item.id})`);
      return Response.json({ ok: true });
    }
    if (action === "delete-product") {
      const id = String(payload.id || "");
      await db().prepare("DELETE FROM products WHERE id=?").bind(id).run();
      await audit(session.username, "PRODUCT_DELETE", id);
      return Response.json({ ok: true });
    }
    if (action === "save-settings") {
      const incoming = payload.settings as Record<string, unknown> || {};
      const allowed = [
        "script_name", "store_name", "store_tagline", "cheap_label", "private_label", "hero_badge", "hero_title", "hero_subtitle",
        "catalog_title", "catalog_subtitle", "footer_text", "whatsapp", "support_email", "theme_primary", "theme_accent", "panel_url",
        "payment_mode", "manual_qris_name", "manual_payment_note", "manual_expiry_minutes", "nevapedia_url",
        "panel_default_egg_id", "panel_default_nest_id", "panel_default_location_id",
        "warranty_enabled", "warranty_label", "warranty_days", "warranty_terms", "checkout_sound_enabled", "checkout_sound_volume",
        "telegram_chat_id", "telegram_enabled", "testimonial_template",
      ];
      const now = new Date().toISOString();
      const statements = allowed.filter((key) => key in incoming).map((key) => db().prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, sanitizeSetting(key, incoming[key]), now));
      if ("manual_qris_image" in incoming) {
        statements.push(db().prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind("manual_qris_image", sanitizeQrisImage(incoming.manual_qris_image), now));
      }
      for (const key of ["nevapedia_api_key", "telegram_bot_token"]) {
        const value = String(incoming[key] || "").trim();
        if (value && !value.includes("••")) statements.push(db().prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, await seal(value), now));
      }
      if ("pterodactyl_api_key" in incoming || "pterodactyl_client_api_key" in incoming) {
        const current = await getSettings(true);
        const currentApplication = await secretValue(current.pterodactyl_api_key);
        const currentClient = await secretValue(current.pterodactyl_client_api_key);
        const incomingApplication = String(incoming.pterodactyl_api_key || "").trim();
        const incomingClient = String(incoming.pterodactyl_client_api_key || "").trim();
        const candidateApplication = incomingApplication && !incomingApplication.includes("••") ? incomingApplication : currentApplication;
        const candidateClient = incomingClient && !incomingClient.includes("••") ? incomingClient : currentClient;
        const normalized = normalizePanelKeysOrThrow(candidateApplication, candidateClient);
        if (normalized.applicationKey) statements.push(db().prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind("pterodactyl_api_key", await seal(normalized.applicationKey), now));
        if (normalized.clientKey) statements.push(db().prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind("pterodactyl_client_api_key", await seal(normalized.clientKey), now));
        if (normalized.swapped) await audit(session.username, "PTERODACTYL_KEYS_AUTO_SWAP", "PTLA/PTLC terdeteksi terbalik dan diperbaiki otomatis");
      }
      if (statements.length) await db().batch(statements);
      await audit(session.username, "SETTINGS_SAVE", "Pengaturan toko, payment, atau integrasi diperbarui");
      return Response.json({ ok: true });
    }
    if (action === "change-password") {
      const current = String(payload.currentPassword || "");
      const next = String(payload.newPassword || "");
      if (next.length < 10) throw new HttpError(422, "Password baru minimal 10 karakter");
      const admin = await db().prepare("SELECT * FROM admins WHERE username=?").bind(session.username).first<Record<string, unknown>>();
      if (!admin || await hashPassword(current, String(admin.salt)) !== String(admin.password_hash)) throw new HttpError(422, "Password lama salah");
      const salt = randomToken(16);
      const passwordHash = await hashPassword(next, salt);
      await db().prepare("UPDATE admins SET salt=?,password_hash=?,updated_at=? WHERE username=?").bind(salt, passwordHash, new Date().toISOString(), session.username).run();
      await db().prepare("DELETE FROM sessions WHERE username=? AND id<>?").bind(session.username, session.id).run();
      await audit(session.username, "PASSWORD_CHANGE", "Password owner diganti");
      return Response.json({ ok: true });
    }
    if (action === "mark-paid" || action === "retry-provision") {
      const order = await markPaid(String(payload.id || ""), action === "mark-paid" ? "owner-manual" : "owner-retry");
      await audit(session.username, action === "mark-paid" ? "ORDER_PAID" : "PROVISION_RETRY", order.id);
      return Response.json({ ok: true, status: order.status });
    }
    if (action === "mark-failed") {
      const id = String(payload.id || "");
      const now = new Date().toISOString();
      const result = await db().prepare("UPDATE orders SET status='payment_failed',message='Transaksi ditandai gagal oleh owner',updated_at=? WHERE id=? AND status='pending'").bind(now, id).run();
      if (!result.meta.changes) throw new HttpError(409, "Hanya transaksi pending yang dapat ditandai gagal");
      await audit(session.username, "ORDER_FAILED", id);
      return Response.json({ ok: true, status: "payment_failed" });
    }
    if (action === "test-pterodactyl") {
      const settings = await getSettings(true);
      const base = normalizePanelUrlOrThrow(settings.panel_url || "");
      const storedApplication = await secretValue(settings.pterodactyl_api_key);
      const storedClient = await secretValue(settings.pterodactyl_client_api_key);
      const keys = normalizePanelKeysOrThrow(storedApplication, storedClient);
      const nestId = Math.max(0, Number(settings.panel_default_nest_id) || 0);
      const eggId = Math.max(0, Number(settings.panel_default_egg_id) || 0);
      const locationId = Math.max(0, Number(settings.panel_default_location_id) || 0);
      if (!keys.applicationKey) throw new HttpError(422, "Application API Key (PTLA) wajib diisi");
      if (!nestId || !eggId || !locationId) throw new HttpError(422, "Nest ID, Egg ID, dan Location ID wajib diisi untuk tes provisioning");
      const result = await checkPterodactyl({
        baseUrl: base,
        applicationKey: keys.applicationKey,
        clientKey: keys.clientKey,
        nestId,
        eggId,
        locationId,
      });
      await audit(session.username, "PTERODACTYL_TEST", `Preflight ${result.ok ? "berhasil" : "gagal"}; Application=${result.application.status}; Client=${result.client.status}; Egg=${result.egg.status}; Location=${result.location.status}`);
      return Response.json(result);
    }
    if (action === "test-telegram") {
      const settings = await getSettings(true);
      await sendTelegram(settings, `✅ Tes koneksi Telegram ${settings.store_name}\nDashboard owner berhasil terhubung.`);
      await audit(session.username, "TELEGRAM_TEST", "Pesan tes dikirim");
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "Aksi tidak ditemukan");
  } catch (error) { return errorResponse(error); }
}

async function createOrder(payload: Record<string, unknown>) {
  const productId = String(payload.productId || "");
  const username = String(payload.username || "").trim();
  if (!/^[A-Za-z0-9_]{4,20}$/.test(username)) throw new HttpError(422, "Username harus 4-20 karakter, hanya huruf, angka, atau underscore");
  const row = await db().prepare("SELECT * FROM products WHERE id=? AND active=1").bind(productId).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Paket tidak tersedia");

  const product = normalizeProduct(row);
  const settings = await getSettings(true);
  const password = String(payload.password || "").length >= 8 ? String(payload.password) : randomPassword();
  const id = `AB-${Date.now().toString(36).toUpperCase()}-${randomToken(2).toUpperCase()}`;
  const accessToken = randomToken(16);
  const configuredMode = normalizePaymentMode(settings.payment_mode);
  const requestedMethod = String(payload.paymentMethod || "").toLowerCase();
  const automaticKey = await secretValue(settings.nevapedia_api_key);
  const paymentMethod = resolvePaymentMethod(configuredMode, requestedMethod, Boolean(automaticKey));

  let gateway = "demo";
  let invoiceId = "";
  let qrisImage = "";
  let paymentTotal = product.price;
  let expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let message = "Mode demo aktif. Owner dapat menandai transaksi lunas untuk pengujian.";

  if (paymentMethod === "automatic") {
    if (!automaticKey) throw new HttpError(422, "Payment otomatis belum dikonfigurasi oleh owner");
    const endpoint = new URL("/api/invoice", settings.nevapedia_url || "https://app.nevapedia.com");
    endpoint.searchParams.set("apikey", automaticKey);
    endpoint.searchParams.set("amount", String(product.price));
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok || data.success === false || !data.invoice_id) throw new HttpError(502, String(data.message || "Invoice payment gateway gagal dibuat"));
    gateway = "nevapedia";
    invoiceId = String(data.invoice_id);
    qrisImage = String(data.qris_image || "");
    paymentTotal = Number(data.total || product.price);
    expiresAt = String(data.expired_at || expiresAt);
    message = "Menunggu pembayaran otomatis";
  } else if (paymentMethod === "manual") {
    gateway = "manual";
    qrisImage = settings.manual_qris_image || "";
    const minutes = Math.min(1440, Math.max(5, Number(settings.manual_expiry_minutes) || 30));
    expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    message = settings.manual_payment_note || "Menunggu verifikasi pembayaran manual oleh owner";
  }

  const now = new Date().toISOString();
  await db().prepare("INSERT INTO orders (id,access_token,product_id,product_name,category_key,panel_username,panel_password,subtotal,total,payment_total,status,gateway,gateway_invoice_id,qris_image,gateway_expires_at,gateway_reference,message,telegram_sent_at,created_at,updated_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, accessToken, product.id, product.name, product.categoryKey, username, await seal(password), product.price, product.price, paymentTotal, "pending", gateway, invoiceId, qrisImage, expiresAt, "", message, "", now, now, "").run();

  return Response.json({ id, token: accessToken, status: "pending", productName: product.name, total: paymentTotal, qrisImage, expiresAt, gateway, demo: gateway === "demo", message }, { status: 201 });
}

async function syncNevapedia(order: ReturnType<typeof normalizeOrder>) {
  const settings = await getSettings(true);
  const key = await secretValue(settings.nevapedia_api_key);
  if (!key || order.gateway !== "nevapedia") return order;
  const endpoint = new URL("/api/invoice/status", settings.nevapedia_url || "https://app.nevapedia.com");
  endpoint.searchParams.set("apikey", key);
  endpoint.searchParams.set("invoice_id", order.gatewayInvoiceId);
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await response.json() as Record<string, unknown>;
  const status = String(data.status || "pending").toLowerCase();
  if (["paid", "success", "settlement"].includes(status)) return markPaid(order.id, order.gatewayInvoiceId);
  if (["expired", "failed", "cancelled", "canceled"].includes(status)) {
    const mapped = status === "expired" ? "expired" : "payment_failed";
    await db().prepare("UPDATE orders SET status=?,message=?,updated_at=? WHERE id=?").bind(mapped, `Status gateway: ${status}`, new Date().toISOString(), order.id).run();
    return { ...order, status: mapped, message: `Status gateway: ${status}` };
  }
  return order;
}

async function markPaid(id: string, reference: string) {
  const row = await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "Pesanan tidak ditemukan");
  let order = normalizeOrder(row);
  if (order.status === "active") return order;
  const productRow = await db().prepare("SELECT * FROM products WHERE id=?").bind(order.productId).first<Record<string, unknown>>();
  if (!productRow) throw new HttpError(404, "Produk pesanan sudah tidak tersedia");
  const now = new Date().toISOString();
  await db().prepare("UPDATE orders SET status='provisioning',paid_at=?,gateway_reference=?,message='Pembayaran diterima, panel sedang dibuat',updated_at=? WHERE id=?").bind(now, reference, now, id).run();
  try {
    const result = await provision(order, normalizeProduct(productRow));
    await db().prepare("UPDATE orders SET status=?,message=?,updated_at=? WHERE id=?").bind(result.status, result.message, new Date().toISOString(), id).run();
  } catch (error) {
    await db().prepare("UPDATE orders SET status='provision_failed',message=?,updated_at=? WHERE id=?").bind(error instanceof Error ? error.message : "Gagal membuat panel", new Date().toISOString(), id).run();
  }
  const updated = await db().prepare("SELECT * FROM orders WHERE id=?").bind(id).first<Record<string, unknown>>();
  order = normalizeOrder(updated!);
  if (order.status === "active" && !order.telegramSentAt) {
    try { await sendTestimonial(order); } catch { /* Telegram must never invalidate a paid transaction */ }
  }
  return order;
}

async function provision(order: ReturnType<typeof normalizeOrder>, product: ReturnType<typeof normalizeProduct>) {
  const settings = await getSettings(true);
  const storedApplication = await secretValue(settings.pterodactyl_api_key);
  const storedClient = await secretValue(settings.pterodactyl_client_api_key);
  let keys: ReturnType<typeof normalizePanelKeys>;
  try {
    keys = normalizePanelKeys(storedApplication, storedClient);
  } catch (error) {
    return { status: "configuration_required", message: error instanceof Error ? error.message : "Konfigurasi API Pterodactyl tidak valid" };
  }
  const eggId = product.eggId || Math.max(0, Number(settings.panel_default_egg_id) || 0);
  const nestId = Math.max(0, Number(settings.panel_default_nest_id) || 0);
  const locationId = product.locationId || Math.max(0, Number(settings.panel_default_location_id) || 0);
  let base = "";
  try { base = validatePanelBaseUrl(String(settings.panel_url || "")); }
  catch (error) { return { status: "configuration_required", message: error instanceof Error ? error.message : "URL panel tidak valid" }; }
  if (!keys.applicationKey || !eggId || !nestId || !locationId) {
    return { status: "configuration_required", message: "Pembayaran diterima. Konfigurasi Pterodactyl belum lengkap: pastikan PTLA, Nest ID, Egg ID, dan Location ID sudah terisi." };
  }

  const password = await unseal(order.panelPassword);
  const email = `${order.panelUsername}.${order.id.slice(-6)}@asepbot.local`;
  const result = await provisionPterodactyl({
    baseUrl: base,
    applicationKey: keys.applicationKey,
    clientKey: keys.clientKey,
    nestId,
    eggId,
    locationId,
    username: order.panelUsername,
    password,
    email,
    serverName: `${settings.store_name || "ASEP BOT"} - ${order.panelUsername}`,
    dockerImage: product.dockerImage,
    startup: product.startup,
    limits: { memory: product.ram, swap: 0, disk: product.disk, io: 500, cpu: product.cpu },
    featureLimits: { databases: product.databases, allocations: product.allocations, backups: product.backups },
  });
  return { status: "active", message: `Panel aktif. Server ${result.identifier}.` };
}

async function sendTestimonial(order: ReturnType<typeof normalizeOrder>) {
  const settings = await getSettings(true);
  if (settings.telegram_enabled !== "true") return;
  const text = settings.testimonial_template
    .replaceAll("{STORE}", settings.store_name)
    .replaceAll("{PRODUCT}", order.productName)
    .replaceAll("{TOTAL}", rupiah(order.paymentTotal))
    .replaceAll("{ORDER}", maskOrder(order.id))
    .replaceAll("{TIME}", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  await sendTelegram(settings, text);
  const now = new Date().toISOString();
  await db().prepare("UPDATE orders SET telegram_sent_at=?,updated_at=? WHERE id=?").bind(now, now, order.id).run();
}

async function sendTelegram(settings: Record<string, string>, text: string) {
  const token = await secretValue(settings.telegram_bot_token);
  const chatId = settings.telegram_chat_id;
  if (!token || !chatId) throw new HttpError(422, "Token bot dan Chat ID Telegram belum lengkap");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) throw new HttpError(502, "Telegram gagal menerima pesan");
}

function normalizePanelKeysOrThrow(applicationKey: string, clientKey: string) {
  try { return normalizePanelKeys(applicationKey, clientKey); }
  catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Konfigurasi API Pterodactyl tidak valid"); }
}

function normalizePanelUrlOrThrow(value: string) {
  try { return validatePanelBaseUrl(value); }
  catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "URL panel tidak valid"); }
}

function sanitizeProduct(raw: Record<string, unknown>) {
  const id = String(raw.id || `panel-${Date.now().toString(36)}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
  const name = String(raw.name || "Paket Baru").trim().slice(0, 70);
  if (!name) throw new HttpError(422, "Nama produk wajib diisi");
  return {
    id,
    name,
    categoryKey: raw.categoryKey === "private" ? "private" : "cheap",
    description: String(raw.description || "").slice(0, 240),
    ram: Math.max(0, Number(raw.ram) || 0),
    cpu: Math.max(0, Number(raw.cpu) || 0),
    disk: Math.max(0, Number(raw.disk) || 0),
    price: Math.max(1000, Number(raw.price) || 1000),
    active: Boolean(raw.active),
    popular: Boolean(raw.popular),
    sortOrder: Number(raw.sortOrder) || 0,
    eggId: Math.max(0, Number(raw.eggId) || 0),
    locationId: Math.max(0, Number(raw.locationId) || 0),
    dockerImage: String(raw.dockerImage || "ghcr.io/parkervcp/yolks:nodejs_22").slice(0, 200),
    startup: String(raw.startup || "npm start").slice(0, 300),
    databases: Math.max(0, Number(raw.databases) || 0),
    backups: Math.max(0, Number(raw.backups) || 0),
    allocations: Math.max(0, Number(raw.allocations) || 0),
  };
}

function normalizePaymentMode(value: string) {
  return ["automatic", "manual", "hybrid", "demo"].includes(value) ? value : "hybrid";
}

function resolvePaymentMethod(mode: string, requested: string, hasAutomaticKey: boolean) {
  if (mode === "demo") return "demo";
  if (mode === "automatic") return "automatic";
  if (mode === "manual") return "manual";
  if (requested === "manual" || requested === "automatic") return requested;
  return hasAutomaticKey ? "automatic" : "manual";
}

function sanitizeSetting(key: string, value: unknown) {
  const raw = String(value ?? "");
  if (key === "theme_primary" || key === "theme_accent") return /^#[0-9a-f]{6}$/i.test(raw) ? raw : "#3b82f6";
  if (key === "payment_mode") return normalizePaymentMode(raw);
  if (key === "manual_expiry_minutes") return String(Math.min(1440, Math.max(5, Number(raw) || 30)));
  if (key === "warranty_days") return String(Math.min(3650, Math.max(0, Number(raw) || 0)));
  if (key === "checkout_sound_volume") return String(Math.min(100, Math.max(0, Number(raw) || 70)));
  if (["panel_default_egg_id", "panel_default_nest_id", "panel_default_location_id"].includes(key)) return String(Math.max(0, Number(raw) || 0));
  if (["warranty_enabled", "checkout_sound_enabled", "telegram_enabled"].includes(key)) return raw === "true" ? "true" : "false";
  return raw.slice(0, key === "testimonial_template" || key === "manual_payment_note" || key === "warranty_terms" ? 5000 : 2000);
}

function sanitizeQrisImage(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 2_500_000) throw new HttpError(413, "Gambar QR terlalu besar. Gunakan gambar di bawah 1.8 MB atau URL gambar.");
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(raw)) return raw;
  if (/^https:\/\//i.test(raw)) return raw.slice(0, 4000);
  throw new HttpError(422, "QRIS harus berupa file gambar yang diunggah atau URL HTTPS");
}

function safeOrder(order: ReturnType<typeof normalizeOrder>) {
  const { accessToken, panelPassword, qrisImage, ...safe } = order;
  void accessToken; void panelPassword; void qrisImage;
  return safe;
}
async function secretValue(value: string) { return value && value.includes(".") ? unseal(value) : value; }
function mask(value: string) { return value ? `••••••••${value.slice(-4)}` : ""; }
function rupiah(value: number) { return `Rp${new Intl.NumberFormat("id-ID").format(value)}`; }
function maskOrder(value: string) { return `${value.slice(0, 3)}-****-${value.slice(-4)}`; }
function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : "Terjadi kesalahan server" }, { status });
}

type PterodactylResponse = { attributes?: { id?: number; identifier?: string }; errors?: Array<{ detail?: string }> };
