"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Settings = Record<string, string>;
type Product = { id: string; name: string; categoryKey: "cheap"|"private"; description: string; ram: number; cpu: number; disk: number; price: number; active: boolean; popular: boolean; sortOrder: number; eggId: number; locationId: number; dockerImage: string; startup: string; databases: number; backups: number; allocations: number };
type Order = { id: string; productName: string; categoryKey: string; panelUsername: string; paymentTotal: number; status: string; gateway: string; message: string; createdAt: string; paidAt: string; telegramSentAt: string };
type RuntimeInfo = { database?: { mode: string; persistent: boolean; detail: string }; vercel?: boolean; appSecretConfigured?: boolean };
type AdminData = { csrf: string; settings: Settings; products: Product[]; orders: Order[]; logs: Record<string, unknown>[]; runtime?: RuntimeInfo };
type Tab = "overview"|"products"|"orders"|"members"|"content"|"payment"|"warranty"|"integrations"|"security";
type Member = { username: string; orders: number; success: number; failed: number; spent: number; lastOrder: string };

const emptyProduct = (): Product => ({ id: `panel-${Date.now().toString(36)}`, name: "Paket Baru", categoryKey: "cheap", description: "Deskripsi singkat paket.", ram: 1024, cpu: 50, disk: 2048, price: 2000, active: true, popular: false, sortOrder: 99, eggId: 0, locationId: 0, dockerImage: "ghcr.io/parkervcp/yolks:nodejs_22", startup: "npm start", databases: 1, backups: 1, allocations: 1 });

export default function AdminClient() {
  const [data, setData] = useState<AdminData|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Product|null>(null);
  const [orderFilter, setOrderFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function loadAdmin() {
    const response = await fetch("/api/asep?action=admin-data", { cache: "no-store" });
    return response.ok ? await response.json() as AdminData : null;
  }
  async function refresh() {
    setData(await loadAdmin());
    setLoading(false);
  }
  useEffect(() => { loadAdmin().then((result) => { setData(result); setLoading(false); }); }, []);

  async function api(payload: Record<string, unknown>) {
    setError("");
    setNotice("");
    const response = await fetch("/api/asep", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(data?.csrf ? { "x-csrf-token": data.csrf } : {}) },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Permintaan gagal");
      throw new Error(body.error || "Permintaan gagal");
    }
    return body as Record<string, unknown>;
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try { await api({ action: "login", username: form.get("username"), password: form.get("password") }); await refresh(); } catch { /* shown */ }
  }
  async function logout() { await api({ action: "logout" }); setData(null); }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api({ action: "save-settings", settings: values }); setNotice("Pengaturan berhasil disimpan dan langsung diterapkan."); await refresh(); } catch { /* shown */ }
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const product = { ...editing, ...Object.fromEntries(form), active: form.get("active") === "true", popular: form.get("popular") === "true" };
    try { await api({ action: "save-product", product }); setEditing(null); setNotice("Produk berhasil disimpan."); await refresh(); } catch { /* shown */ }
  }
  async function deleteProduct(item: Product) {
    if (!confirm(`Hapus ${item.name}? Riwayat transaksi lama tetap disimpan.`)) return;
    try { await api({ action: "delete-product", id: item.id }); setNotice("Produk dihapus. Riwayat transaksi tidak ikut terhapus."); await refresh(); } catch { /* shown */ }
  }
  async function orderAction(action: string, id: string) {
    if (action === "mark-paid" && !confirm("Tandai transaksi ini lunas? Sistem akan langsung memproses panel.")) return;
    if (action === "mark-failed" && !confirm("Tandai transaksi pending ini gagal?")) return;
    try {
      const result = await api({ action, id });
      setNotice(`Transaksi diperbarui menjadi ${statusLabel(String(result.status || "updated"))}.`);
      await refresh();
    } catch { /* shown */ }
  }

  const members = useMemo<Member[]>(() => aggregateMembers(data?.orders || []), [data?.orders]);

  if (loading) return <div className="admin-loading"><div className="loader"/><b>Memuat ASEP BOT Owner Center...</b></div>;
  if (!data) return <Login onSubmit={login} error={error}/>;

  const storeName = data.settings.store_name || "ASEP BOT";
  const paidStatuses = ["active", "configuration_required"];
  const failedStatuses = ["expired", "payment_failed", "provision_failed"];
  const revenue = data.orders.filter((o) => paidStatuses.includes(o.status)).reduce((sum, o) => sum + o.paymentTotal, 0);
  const successCount = data.orders.filter((o) => o.status === "active").length;
  const failedCount = data.orders.filter((o) => failedStatuses.includes(o.status)).length;
  const pendingCount = data.orders.filter((o) => ["pending", "provisioning"].includes(o.status)).length;
  const filteredOrders = data.orders.filter((order) => {
    const groupOk = orderFilter === "all"
      || (orderFilter === "success" && order.status === "active")
      || (orderFilter === "failed" && failedStatuses.includes(order.status))
      || (orderFilter === "pending_group" && ["pending", "provisioning"].includes(order.status))
      || order.status === orderFilter;
    return groupOk && `${order.id} ${order.panelUsername} ${order.productName} ${order.gateway}`.toLowerCase().includes(search.toLowerCase());
  });

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="brand admin-brand" href="/"><span className="brand-icon">AB</span><span><b>{storeName}</b><small>OWNER CENTER</small></span></Link>
      <div className="owner-label">WORKSPACE OWNER</div>
      <nav>
        <Nav id="overview" tab={tab} setTab={setTab} icon="⌂" label="Ringkasan"/>
        <Nav id="products" tab={tab} setTab={setTab} icon="◇" label="Produk"/>
        <Nav id="orders" tab={tab} setTab={setTab} icon="▤" label="Transaksi" count={pendingCount}/>
        <Nav id="members" tab={tab} setTab={setTab} icon="◎" label="Member"/>
        <Nav id="content" tab={tab} setTab={setTab} icon="Aa" label="Tampilan Toko"/>
        <Nav id="payment" tab={tab} setTab={setTab} icon="▦" label="Payment"/>
        <Nav id="warranty" tab={tab} setTab={setTab} icon="🛡" label="Garansi"/>
        <Nav id="integrations" tab={tab} setTab={setTab} icon="⌁" label="Integrasi"/>
        <Nav id="security" tab={tab} setTab={setTab} icon="⌾" label="Keamanan"/>
      </nav>
      <div className="sidebar-bottom"><Link href="/" target="_blank">↗ Lihat Toko</Link><button onClick={logout}>Keluar Owner</button></div>
    </aside>

    <main className="admin-main">
      <header className="admin-top">
        <div><span className="eyebrow">{(data.settings.script_name || "ASEP BOT").toUpperCase()} · OWNER CENTER</span><h1>{tabTitle(tab)}</h1><p>Kelola toko, payment, garansi, panel, member, dan transaksi dari satu pusat kontrol.</p></div>
        <div className="admin-top-actions"><span className="online-pill"><i/> SISTEM ONLINE</span><Link href="/" target="_blank" className="preview-button">Preview Toko ↗</Link></div>
      </header>

      {(!data.runtime?.database?.persistent || data.runtime?.appSecretConfigured === false) && <div className="runtime-warning-group">
        {!data.runtime?.database?.persistent && <div className="runtime-warning"><b>Penyimpanan Vercel belum permanen.</b><span>Transaksi dan setting bisa hilang saat instance berganti. Isi <code>TURSO_DATABASE_URL</code> dan <code>TURSO_AUTH_TOKEN</code> di Vercel Project Settings → Environment Variables, lalu redeploy.</span></div>}
        {data.runtime?.appSecretConfigured === false && <div className="runtime-warning danger"><b>APP_SECRET belum dikonfigurasi.</b><span>Penyimpanan credential produksi dikunci sampai <code>APP_SECRET</code> tersedia. Isi secret acak minimal 32 karakter di Vercel lalu redeploy sebelum menyimpan API key atau menerima transaksi produksi.</span></div>}
      </div>}
      {notice && <div className="alert success">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && <div className="alert error">{error}<button onClick={() => setError("")}>×</button></div>}

      {tab === "overview" && <>
        <section className="stats-grid owner-stats">
          <Stat label="Total Pendapatan" value={rupiah(revenue)} note="Transaksi terbayar" color="blue" icon="Rp"/>
          <Stat label="Transaksi Sukses" value={String(successCount)} note="Panel aktif" color="green" icon="✓"/>
          <Stat label="Menunggu Proses" value={String(pendingCount)} note="Pending / provisioning" color="amber" icon="…"/>
          <Stat label="Transaksi Gagal" value={String(failedCount)} note="Expired / payment / provision" color="red" icon="!"/>
          <Stat label="Total Member" value={String(members.length)} note="Username unik bertransaksi" color="violet" icon="◎"/>
        </section>
        <section className="overview-split">
          <div className="admin-card"><CardHead title="Transaksi Terbaru" subtitle="Pantau sukses, gagal, manual, dan otomatis" action={<button className="text-button" onClick={() => setTab("orders")}>Buka transaksi →</button>}/><OrderTable orders={data.orders.slice(0, 8)} settings={data.settings} onAction={orderAction}/></div>
          <div className="admin-card payment-health"><CardHead title="Payment Center" subtitle="Konfigurasi yang sedang aktif"/>
            <HealthRow label="Mode pembayaran" value={paymentModeLabel(data.settings.payment_mode)} good/>
            <HealthRow label="Gateway otomatis" value={data.settings.nevapedia_api_key ? "Terkonfigurasi" : "Belum diisi"} good={Boolean(data.settings.nevapedia_api_key)}/>
            <HealthRow label="QRIS manual" value={data.settings.manual_qris_image ? "QR tersedia" : "QR belum diunggah"} good={Boolean(data.settings.manual_qris_image)}/>
            <HealthRow label="Pterodactyl App API" value={data.settings.pterodactyl_api_key ? "Terkonfigurasi" : "Belum diisi"} good={Boolean(data.settings.pterodactyl_api_key)}/>
            <HealthRow label="Pterodactyl Client Token" value={data.settings.pterodactyl_client_api_key ? "Terkonfigurasi" : "Belum diisi"} good={Boolean(data.settings.pterodactyl_client_api_key)}/>
            <HealthRow label="Garansi otomatis" value={data.settings.warranty_enabled === "true" ? `${data.settings.warranty_days || "0"} hari` : "Nonaktif"} good={data.settings.warranty_enabled === "true"}/>
            <button className="small-primary full" onClick={() => setTab("payment")}>Atur Payment</button>
          </div>
        </section>
        <section className="admin-card"><CardHead title="Aktivitas Owner" subtitle="Perubahan terakhir pada dashboard"/>
          <div className="activity-grid">{data.logs.length ? data.logs.slice(0, 10).map((log, index) => <div className="activity" key={index}><span>✓</span><div><b>{String(log.action || "Aktivitas")}</b><p>{String(log.detail || "")}</p><small>{formatDate(String(log.created_at || ""))}</small></div></div>) : <Empty text="Belum ada aktivitas."/>}</div>
        </section>
      </>}

      {tab === "products" && <section className="admin-card"><CardHead title={`Produk ${data.settings.cheap_label} & ${data.settings.private_label}`} subtitle="Semua produk lama tetap dipertahankan dan bisa diedit" action={<button className="small-primary" onClick={() => setEditing(emptyProduct())}>+ Tambah Produk</button>}/>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Produk</th><th>Kategori</th><th>Resource</th><th>Harga</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{data.products.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.description}</small></td><td><span className={`category-chip ${item.categoryKey}`}>{item.categoryKey === "cheap" ? data.settings.cheap_label : data.settings.private_label}</span></td><td><b>{item.ram === 0 ? "Unlimited" : formatMb(item.ram)}</b><small>CPU {item.cpu}% · Disk {formatMb(item.disk)}</small></td><td><b>{rupiah(item.price)}</b>{item.popular && <small className="gold-text">★ Populer</small>}</td><td><span className={`status ${item.active ? "active" : "inactive"}`}>{item.active ? "Aktif" : "Nonaktif"}</span></td><td><div className="table-actions"><button onClick={() => setEditing(item)}>Edit</button><button className="danger-text" onClick={() => deleteProduct(item)}>Hapus</button></div></td></tr>)}</tbody></table></div>
      </section>}

      {tab === "orders" && <>
        <section className="transaction-summary">
          <MiniStat label="Semua" value={data.orders.length} active={orderFilter === "all"} onClick={() => setOrderFilter("all")}/>
          <MiniStat label="Sukses" value={successCount} active={orderFilter === "success"} onClick={() => setOrderFilter("success")} tone="success"/>
          <MiniStat label="Pending" value={pendingCount} active={orderFilter === "pending_group"} onClick={() => setOrderFilter("pending_group")} tone="pending"/>
          <MiniStat label="Gagal" value={failedCount} active={orderFilter === "failed"} onClick={() => setOrderFilter("failed")} tone="failed"/>
        </section>
        <section className="admin-card"><CardHead title="Semua Transaksi" subtitle="Filter transaksi berdasarkan status dan metode pembayaran"/>
          <div className="table-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari ID, member, paket, gateway..."/><select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}><option value="all">Semua Status</option><option value="success">Semua Sukses</option><option value="pending_group">Semua Pending</option><option value="failed">Semua Gagal</option><option value="pending">Pending Pembayaran</option><option value="provisioning">Provisioning</option><option value="active">Aktif</option><option value="configuration_required">Perlu Konfigurasi</option><option value="expired">Kedaluwarsa</option><option value="payment_failed">Pembayaran Gagal</option><option value="provision_failed">Provision Gagal</option></select></div>
          <OrderTable orders={filteredOrders} settings={data.settings} onAction={orderAction}/>
        </section>
      </>}

      {tab === "members" && <section className="admin-card"><CardHead title="Member & Riwayat Belanja" subtitle="Member dihitung dari username unik yang pernah membuat transaksi"/>
        <div className="admin-table-wrap"><table className="admin-table member-table"><thead><tr><th>Member</th><th>Total Transaksi</th><th>Sukses</th><th>Gagal</th><th>Total Belanja</th><th>Terakhir</th></tr></thead><tbody>{members.map((member) => <tr key={member.username}><td><div className="member-cell"><span>{member.username.slice(0,2).toUpperCase()}</span><div><b>@{member.username}</b><small>Customer / panel user</small></div></div></td><td><b>{member.orders}</b></td><td><span className="status active">{member.success} sukses</span></td><td><span className={member.failed ? "status failed" : "status inactive"}>{member.failed} gagal</span></td><td><b>{rupiah(member.spent)}</b></td><td><small>{formatDate(member.lastOrder)}</small></td></tr>)}{!members.length && <tr><td colSpan={6}><Empty text="Belum ada member yang bertransaksi."/></td></tr>}</tbody></table></div>
      </section>}

      {tab === "content" && <form className="settings-form" onSubmit={saveSettings}>
        <section className="admin-card"><CardHead title="Identitas & Tampilan Toko" subtitle="Atur teks dan warna storefront dari satu tempat"/><div className="form-grid two">
          <Field label="Nama Script"><input name="script_name" defaultValue={data.settings.script_name || "ASEP BOT"}/></Field><Field label="Nama Toko"><input name="store_name" defaultValue={data.settings.store_name}/></Field>
          <Field label="Tagline Kecil"><input name="store_tagline" defaultValue={data.settings.store_tagline}/></Field><Field label="Email Support"><input name="support_email" type="email" defaultValue={data.settings.support_email}/></Field>
          <Field label="Warna Utama"><input name="theme_primary" type="color" defaultValue={data.settings.theme_primary || "#3b82f6"}/></Field><Field label="Warna Aksen"><input name="theme_accent" type="color" defaultValue={data.settings.theme_accent || "#2563eb"}/></Field>
          <Field label="Nama Kategori 1"><input name="cheap_label" defaultValue={data.settings.cheap_label}/></Field><Field label="Nama Kategori 2"><input name="private_label" defaultValue={data.settings.private_label}/></Field>
          <Field label="Badge Hero"><input name="hero_badge" defaultValue={data.settings.hero_badge}/></Field><Field label="Judul Katalog"><input name="catalog_title" defaultValue={data.settings.catalog_title}/></Field>
          <Field label="Judul Utama" wide><textarea name="hero_title" defaultValue={data.settings.hero_title}/></Field><Field label="Deskripsi Utama" wide><textarea name="hero_subtitle" defaultValue={data.settings.hero_subtitle}/></Field>
          <Field label="Deskripsi Katalog" wide><textarea name="catalog_subtitle" defaultValue={data.settings.catalog_subtitle}/></Field><Field label="Teks Footer" wide><input name="footer_text" defaultValue={data.settings.footer_text}/></Field><Field label="Nomor WhatsApp" hint="Format 628xxxx"><input name="whatsapp" defaultValue={data.settings.whatsapp}/></Field>
          <Field label="Suara Checkout"><select name="checkout_sound_enabled" defaultValue={data.settings.checkout_sound_enabled || "true"}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></Field><Field label="Volume Suara (%)"><input name="checkout_sound_volume" type="number" min="0" max="100" defaultValue={data.settings.checkout_sound_volume || "70"}/></Field>
        </div><button className="save-button">Simpan Tampilan Toko</button></section>
      </form>}

      {tab === "payment" && <PaymentSettings data={data} onSubmit={saveSettings}/>} 

      {tab === "warranty" && <form className="settings-form" onSubmit={saveSettings}>
        <section className="admin-card warranty-card"><CardHead title="Garansi Otomatis" subtitle="Atur status, nama, durasi, dan ketentuan garansi yang tampil saat member membeli panel"/><div className="form-grid two">
          <Field label="Status Garansi"><select name="warranty_enabled" defaultValue={data.settings.warranty_enabled || "true"}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></Field>
          <Field label="Durasi Garansi (hari)"><input name="warranty_days" type="number" min="0" max="3650" defaultValue={data.settings.warranty_days || "30"}/></Field>
          <Field label="Label Garansi" wide hint="Contoh: Full Garansi, Garansi 30 Hari, Replacement Warranty"><input name="warranty_label" defaultValue={data.settings.warranty_label || "Full Garansi"}/></Field>
          <Field label="Syarat & Ketentuan Garansi" wide><textarea name="warranty_terms" rows={8} defaultValue={data.settings.warranty_terms}/></Field>
        </div><div className="warranty-preview"><span>PREVIEW MEMBER</span><b>🛡 {data.settings.warranty_label || "Full Garansi"} · {data.settings.warranty_days || "30"} Hari</b><p>Garansi mulai dihitung otomatis ketika transaksi berhasil dan panel aktif.</p></div><button className="save-button">Simpan Pengaturan Garansi</button></section>
      </form>}

      {tab === "integrations" && <form className="settings-form" onSubmit={saveSettings}>
        <section className="admin-card"><CardHead title="Pterodactyl / Grab Panel" subtitle="Konfigurasi dibuat mengikuti pola domain, API key, client token, Egg, Nest, dan Location"/><div className="integration-status-grid"><div><span>Application API</span><b className={data.settings.pterodactyl_api_key ? "ok" : "warn"}>{data.settings.pterodactyl_api_key ? "● Tersimpan" : "○ Belum diisi"}</b></div><div><span>Client API Token</span><b className={data.settings.pterodactyl_client_api_key ? "ok" : "warn"}>{data.settings.pterodactyl_client_api_key ? "● Tersimpan" : "○ Belum diisi"}</b></div></div><div className="form-grid two">
          <Field label="Domain / URL Panel" wide hint="Contoh: https://panel.domainanda.com"><input name="panel_url" defaultValue={data.settings.panel_url}/></Field>
          <Field label="Application API Key (PTLA)" hint="Wajib ptla_... untuk create user/server. Jika PTLA/PTLC tertukar, sistem akan memperbaikinya otomatis saat disimpan."><input name="pterodactyl_api_key" defaultValue={data.settings.pterodactyl_api_key} autoComplete="off"/></Field>
          <Field label="Client API Token (PTLC)" hint="Gunakan ptlc_... untuk endpoint Client API. Boleh dikosongkan jika tidak dipakai."><input name="pterodactyl_client_api_key" defaultValue={data.settings.pterodactyl_client_api_key} autoComplete="off"/></Field>
          <Field label="Default Egg ID"><input name="panel_default_egg_id" type="number" min="0" defaultValue={data.settings.panel_default_egg_id || "15"}/></Field>
          <Field label="Default Nest ID"><input name="panel_default_nest_id" type="number" min="0" defaultValue={data.settings.panel_default_nest_id || "5"}/></Field>
          <Field label="Default Location ID"><input name="panel_default_location_id" type="number" min="0" defaultValue={data.settings.panel_default_location_id || "1"}/></Field>
        </div><div className="button-row"><button className="save-button">Simpan Konfigurasi Panel</button><button type="button" className="secondary-button" onClick={async () => { try { const result = await api({ action: "test-pterodactyl" }); const summary = panelCheckSummary(result); if (result.ok) setNotice(summary); else setError(summary); } catch {} }}>Tes Koneksi Panel</button></div><div className="security-note panel-note"><b>Catatan provisioning</b><p>Egg ID dan Location ID pada produk tetap diprioritaskan. Jika nilainya 0, sistem memakai nilai default. Nest ID dipakai untuk membaca konfigurasi Egg dan environment default sebelum server dibuat, jadi ketiganya harus valid.</p></div></section>
        <section className="admin-card"><CardHead title="Telegram Testimoni" subtitle="Pesan dikirim setelah panel benar-benar aktif"/><div className="form-grid two"><Field label="Bot Token"><input name="telegram_bot_token" defaultValue={data.settings.telegram_bot_token} autoComplete="off"/></Field><Field label="Chat / Channel ID"><input name="telegram_chat_id" defaultValue={data.settings.telegram_chat_id}/></Field><Field label="Status"><select name="telegram_enabled" defaultValue={data.settings.telegram_enabled}><option value="false">Nonaktif</option><option value="true">Aktif</option></select></Field><Field label="Template Testimoni" wide hint="Variabel: {STORE}, {PRODUCT}, {TOTAL}, {ORDER}, {TIME}"><textarea name="testimonial_template" rows={7} defaultValue={data.settings.testimonial_template}/></Field></div><div className="button-row"><button className="save-button">Simpan Integrasi</button><button type="button" className="secondary-button" onClick={async () => { try { await api({ action: "test-telegram" }); setNotice("Pesan tes Telegram berhasil dikirim."); } catch {} }}>Kirim Pesan Tes</button></div></section>
      </form>}

      {tab === "security" && <SecurityForm api={api} setNotice={setNotice}/>} 
    </main>

    {editing && <div className="modal-backdrop"><form className="product-modal" onSubmit={saveProduct}><button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button><span className="eyebrow">MANAJEMEN PRODUK</span><h2>{data.products.some((p) => p.id === editing.id) ? "Edit Produk" : "Tambah Produk Baru"}</h2><div className="form-grid two compact">
      <Field label="ID Produk"><input name="id" defaultValue={editing.id} readOnly={data.products.some((p) => p.id === editing.id)}/></Field><Field label="Nama Paket"><input name="name" defaultValue={editing.name} required/></Field><Field label="Kategori"><select name="categoryKey" defaultValue={editing.categoryKey}><option value="cheap">{data.settings.cheap_label}</option><option value="private">{data.settings.private_label}</option></select></Field><Field label="Harga"><input name="price" type="number" min="1000" defaultValue={editing.price}/></Field><Field label="Deskripsi" wide><textarea name="description" defaultValue={editing.description}/></Field>
      <Field label="RAM MB"><input name="ram" type="number" min="0" defaultValue={editing.ram}/></Field><Field label="CPU %"><input name="cpu" type="number" min="0" defaultValue={editing.cpu}/></Field><Field label="Disk MB"><input name="disk" type="number" min="0" defaultValue={editing.disk}/></Field><Field label="Urutan"><input name="sortOrder" type="number" defaultValue={editing.sortOrder}/></Field><Field label="Status"><select name="active" defaultValue={String(editing.active)}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></Field><Field label="Badge Populer"><select name="popular" defaultValue={String(editing.popular)}><option value="false">Tidak</option><option value="true">Ya</option></select></Field>
      <Field label="Egg ID"><input name="eggId" type="number" min="0" defaultValue={editing.eggId}/></Field><Field label="Location ID"><input name="locationId" type="number" min="0" defaultValue={editing.locationId}/></Field><Field label="Docker Image" wide><input name="dockerImage" defaultValue={editing.dockerImage}/></Field><Field label="Startup Command" wide><input name="startup" defaultValue={editing.startup}/></Field><Field label="Database"><input name="databases" type="number" min="0" defaultValue={editing.databases}/></Field><Field label="Backup"><input name="backups" type="number" min="0" defaultValue={editing.backups}/></Field><Field label="Allocation"><input name="allocations" type="number" min="0" defaultValue={editing.allocations}/></Field>
    </div><button className="save-button">Simpan Produk</button></form></div>}
  </div>;
}

function PaymentSettings({ data, onSubmit }: { data: AdminData; onSubmit:(e:FormEvent<HTMLFormElement>)=>void }) {
  const [qris, setQris] = useState(data.settings.manual_qris_image || "");
  function handleFile(file?: File) {
    if (!file) return;
    if (file.size > 1_800_000) { alert("Ukuran QR terlalu besar. Maksimal sekitar 1.8 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setQris(String(reader.result || ""));
    reader.readAsDataURL(file);
  }
  return <form className="settings-form" onSubmit={onSubmit}>
    <section className="admin-card payment-master"><CardHead title="Payment Gateway" subtitle="Pilih otomatis, manual, keduanya, atau demo tanpa menghapus fungsi yang sudah ada"/><div className="payment-mode-grid">
      <label><input type="radio" name="payment_mode" value="automatic" defaultChecked={data.settings.payment_mode === "automatic"}/><span><b>⚡ Otomatis</b><small>Invoice dari Nevapedia dan status diperiksa otomatis.</small></span></label>
      <label><input type="radio" name="payment_mode" value="manual" defaultChecked={data.settings.payment_mode === "manual"}/><span><b>▦ Manual</b><small>QRIS sendiri, transaksi diverifikasi owner.</small></span></label>
      <label><input type="radio" name="payment_mode" value="hybrid" defaultChecked={!data.settings.payment_mode || data.settings.payment_mode === "hybrid"}/><span><b>⇄ Otomatis + Manual</b><small>Pembeli memilih metode saat checkout.</small></span></label>
      <label><input type="radio" name="payment_mode" value="demo" defaultChecked={data.settings.payment_mode === "demo"}/><span><b>🧪 Demo</b><small>Mode testing lama tetap tersedia.</small></span></label>
    </div></section>
    <section className="payment-columns">
      <div className="admin-card"><CardHead title="Payment Otomatis" subtitle="Konfigurasi gateway Nevapedia"/><div className="integration-badge"><span className={data.settings.nevapedia_api_key ? "dot good" : "dot"}/><b>{data.settings.nevapedia_api_key ? "API key tersimpan" : "API key belum diisi"}</b></div><div className="form-grid one"><Field label="URL API Nevapedia"><input name="nevapedia_url" defaultValue={data.settings.nevapedia_url}/></Field><Field label="Nevapedia API Key"><input name="nevapedia_api_key" defaultValue={data.settings.nevapedia_api_key} autoComplete="off"/></Field></div></div>
      <div className="admin-card"><CardHead title="QRIS Manual" subtitle="Upload QR atau gunakan URL HTTPS"/><input type="hidden" name="manual_qris_image" value={qris}/><div className="qris-admin-wrap"><div className="qris-preview">{qris ? <img src={qris} alt="Preview QRIS manual"/> : <span>QRIS<br/>BELUM ADA</span>}</div><div className="qris-controls"><label className="upload-button">Upload QR<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFile(e.target.files?.[0])}/></label><button type="button" className="secondary-button" onClick={() => setQris("")}>Hapus QR</button><input className="qris-url" value={qris.startsWith("http") ? qris : ""} onChange={(e) => setQris(e.target.value)} placeholder="Atau tempel URL HTTPS QRIS"/></div></div><div className="form-grid one"><Field label="Nama QRIS"><input name="manual_qris_name" defaultValue={data.settings.manual_qris_name}/></Field><Field label="Batas Waktu Manual (menit)"><input name="manual_expiry_minutes" type="number" min="5" max="1440" defaultValue={data.settings.manual_expiry_minutes || "30"}/></Field><Field label="Instruksi Pembayaran"><textarea name="manual_payment_note" rows={5} defaultValue={data.settings.manual_payment_note}/></Field></div></div>
    </section>
    <button className="save-button sticky-save">Simpan Seluruh Pengaturan Payment</button>
  </form>;
}

function Login({ onSubmit, error }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; error: string }) { return <main className="login-page"><div className="login-glow"/><form className="login-card" onSubmit={onSubmit}><Link className="brand" href="/"><span className="brand-icon">AB</span><span><b>ASEP BOT</b><small>OWNER CENTER</small></span></Link><span className="eyebrow">ASEP BOT · OWNER ACCESS</span><h1>Owner Center privat.</h1><p>Halaman member tidak menampilkan tombol masuk owner. Dashboard ini tetap dilindungi username, password, sesi HttpOnly, dan CSRF.</p>{error && <div className="alert error">{error}</div>}<label>Username<input name="username" defaultValue="admin" autoComplete="username" required/></label><label>Password<input name="password" type="password" placeholder="Masukkan password owner" autoComplete="current-password" required/></label><button className="save-button">Masuk Owner Center</button><Link href="/" className="back-store">← Kembali ke toko</Link></form></main>; }
function Nav({ id, tab, setTab, icon, label, count }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; icon: string; label: string; count?: number }) { return <button className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span className="nav-icon">{icon}</span>{label}{Boolean(count) && <b className="nav-count">{count}</b>}</button>; }
function Stat({ label, value, note, color, icon }: { label:string; value:string; note:string; color:string; icon:string }) { return <article className={`stat-card ${color}`}><div className="stat-icon">{icon}</div><span>{label}</span><b>{value}</b><small>{note}</small><i/></article>; }
function MiniStat({ label, value, active, onClick, tone="" }: { label:string; value:number; active:boolean; onClick:()=>void; tone?:string }) { return <button className={`mini-stat ${active ? "active" : ""} ${tone}`} onClick={onClick}><span>{label}</span><b>{value}</b></button>; }
function HealthRow({ label, value, good }: { label:string; value:string; good:boolean }) { return <div className="health-row"><span>{label}</span><b className={good ? "good" : "warn"}>{good ? "●" : "○"} {value}</b></div>; }
function CardHead({ title, subtitle, action }: { title:string; subtitle:string; action?: React.ReactNode }) { return <div className="card-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
function Field({ label, hint, wide, children }: { label:string; hint?:string; wide?:boolean; children:React.ReactNode }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Empty({ text }: { text:string }) { return <div className="admin-empty">{text}</div>; }
function OrderTable({ orders, settings, onAction }: { orders: Order[]; settings: Settings; onAction:(action:string,id:string)=>void }) { return <div className="admin-table-wrap"><table className="admin-table order-table"><thead><tr><th>ID & Waktu</th><th>Member</th><th>Paket</th><th>Payment</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b>{order.id}</b><small>{formatDate(order.createdAt)}</small></td><td><b>@{order.panelUsername}</b></td><td><b>{order.productName}</b><small>{order.categoryKey === "cheap" ? settings.cheap_label : settings.private_label}</small></td><td><span className={`gateway-chip ${order.gateway}`}>{gatewayLabel(order.gateway)}</span></td><td><b>{rupiah(order.paymentTotal)}</b></td><td><span className={`status ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>{order.telegramSentAt && <small className="telegram-mark">✓ Telegram terkirim</small>}</td><td><div className="table-actions">{order.status === "pending" && <><button className="green-action" onClick={() => onAction("mark-paid", order.id)}>Tandai Lunas</button><button className="danger-text" onClick={() => onAction("mark-failed", order.id)}>Gagal</button></>}{["provision_failed","configuration_required"].includes(order.status) && <button onClick={() => onAction("retry-provision", order.id)}>Coba Ulang</button>}{!["pending","provision_failed","configuration_required"].includes(order.status) && <small className="order-message">{order.message || "-"}</small>}</div></td></tr>)}{!orders.length && <tr><td colSpan={7}><Empty text="Transaksi tidak ditemukan."/></td></tr>}</tbody></table></div>; }
function SecurityForm({ api, setNotice }: { api:(payload:Record<string,unknown>)=>Promise<Record<string,unknown>>; setNotice:(v:string)=>void }) { async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); if (form.get("newPassword") !== form.get("confirmPassword")) return alert("Konfirmasi password tidak sama"); try { await api({ action:"change-password", currentPassword:form.get("currentPassword"), newPassword:form.get("newPassword") }); setNotice("Password owner berhasil diganti. Sesi perangkat lain sudah dikeluarkan."); event.currentTarget.reset(); } catch {} } return <form onSubmit={submit}><section className="admin-card security-card"><CardHead title="Ganti Password Owner" subtitle="Gunakan minimal 10 karakter dan jangan samakan dengan password panel"/><div className="form-grid one"><Field label="Password Lama"><input name="currentPassword" type="password" required/></Field><Field label="Password Baru"><input name="newPassword" type="password" minLength={10} required/></Field><Field label="Konfirmasi Password Baru"><input name="confirmPassword" type="password" minLength={10} required/></Field></div><button className="save-button">Ganti Password</button><div className="security-note"><b>Perlindungan aktif</b><p>Password disimpan dalam bentuk hash PBKDF2. Perubahan password mengeluarkan sesi owner pada perangkat lain.</p></div></section></form>; }
function aggregateMembers(orders: Order[]): Member[] { const map = new Map<string, Member>(); const failed = ["expired","payment_failed","provision_failed"]; for (const order of orders) { const current = map.get(order.panelUsername) || { username:order.panelUsername, orders:0, success:0, failed:0, spent:0, lastOrder:order.createdAt }; current.orders += 1; if (order.status === "active") current.success += 1; if (failed.includes(order.status)) current.failed += 1; if (["active","configuration_required"].includes(order.status)) current.spent += order.paymentTotal; if (new Date(order.createdAt).getTime() > new Date(current.lastOrder).getTime()) current.lastOrder = order.createdAt; map.set(order.panelUsername, current); } return [...map.values()].sort((a,b) => new Date(b.lastOrder).getTime() - new Date(a.lastOrder).getTime()); }
function panelCheckSummary(result: Record<string, unknown>) { const icon = (v: unknown) => { const item = v && typeof v === "object" ? v as Record<string, unknown> : {}; return `${item.ok ? "✅" : "❌"} ${String(item.message || "tidak ada respons")}`; }; return `Preflight Pterodactyl: Application ${icon(result.application)} | Client ${icon(result.client)} | Egg ${icon(result.egg)} | Location ${icon(result.location)}`; }
function tabTitle(tab:Tab) { return ({ overview:"Ringkasan Bisnis", products:"Manajemen Produk", orders:"Kontrol Transaksi", members:"Member & Pelanggan", content:"Tampilan Storefront", payment:"Payment Gateway", warranty:"Garansi Otomatis", integrations:"Integrasi Panel & API", security:"Keamanan Owner" })[tab]; }
function rupiah(v:number) { return `Rp ${new Intl.NumberFormat("id-ID").format(v || 0)}`; }
function formatMb(v:number) { return v >= 1024 ? `${Math.round(v/1024)} GB` : `${v} MB`; }
function formatDate(v:string) { return v ? new Date(v).toLocaleString("id-ID", { timeZone:"Asia/Jakarta", dateStyle:"medium", timeStyle:"short" }) : "-"; }
function statusClass(v:string) { return ({ active:"active", pending:"pending", provisioning:"pending", configuration_required:"warning", expired:"inactive", payment_failed:"failed", provision_failed:"failed" } as Record<string,string>)[v] || "inactive"; }
function statusLabel(v:string) { return ({ active:"Sukses", pending:"Pending", provisioning:"Memproses", configuration_required:"Perlu Konfigurasi", expired:"Kedaluwarsa", payment_failed:"Pembayaran Gagal", provision_failed:"Provision Gagal", updated:"Diperbarui" } as Record<string,string>)[v] || v; }
function gatewayLabel(v:string) { return ({ nevapedia:"Otomatis", manual:"Manual QRIS", demo:"Demo" } as Record<string,string>)[v] || v || "-"; }
function paymentModeLabel(v:string) { return ({ automatic:"Otomatis", manual:"Manual QRIS", hybrid:"Otomatis + Manual", demo:"Mode Demo" } as Record<string,string>)[v] || "Otomatis + Manual"; }
