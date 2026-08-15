/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Settings = Record<string, string>;
type Product = { id: string; name: string; categoryKey: "cheap"|"private"; description: string; ram: number; cpu: number; disk: number; price: number; popular: boolean };
type Warranty = { enabled: boolean; label: string; days: number; expiresAt: string; terms: string };
type Order = { id: string; token: string; status: string; productName: string; total: number; gateway?: string; qrisImage?: string; expiresAt: string; demo?: boolean; message?: string; credentials?: { url: string; username: string; password: string }; warranty?: Warranty };

const defaultSettings: Settings = {
  script_name: "ASEP BOT",
  store_name: "ASEP BOT",
  store_tagline: "DIGITAL HOSTING STORE",
  cheap_label: "Panel Pterodactyl",
  private_label: "Panel Private",
  hero_badge: "SISTEM OTOMATIS 100% AKTIF",
  hero_title: "Semua Kebutuhan Hosting & Bot WhatsApp Dalam Satu Tempat.",
  hero_subtitle: "Layanan hosting dan panel digital dengan checkout ringkas, transaksi terpantau, dan proses otomatis yang tetap bisa dikontrol owner.",
  catalog_title: "Pilih Varian Layanan",
  catalog_subtitle: "Paket fleksibel dengan harga transparan dan proses transaksi yang mudah dipantau.",
  footer_text: "Layanan digital dengan proses transaksi yang jelas dan mudah dipantau.",
  whatsapp: "",
  support_email: "",
  theme_primary: "#3b82f6",
  theme_accent: "#2563eb",
  payment_mode: "hybrid",
  manual_qris_name: "QRIS ASEP BOT",
  manual_payment_note: "Scan QRIS, selesaikan pembayaran sesuai nominal, lalu tunggu verifikasi owner.",
  warranty_enabled: "true",
  warranty_label: "Full Garansi",
  warranty_days: "30",
  warranty_terms: "Garansi berlaku sesuai ketentuan layanan.",
  checkout_sound_enabled: "true",
  checkout_sound_volume: "70",
};

export default function ShopClient() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<"cheap"|"private">("cheap");
  const [selected, setSelected] = useState<Product|null>(null);
  const [order, setOrder] = useState<Order|null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"automatic"|"manual">("automatic");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const previousStatus = useRef("");

  useEffect(() => {
    fetch("/api/asep?action=public-data", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const nextSettings = { ...defaultSettings, ...(data.settings || {}) };
        setSettings(nextSettings);
        if (data.products) setProducts(data.products);
        if (nextSettings.payment_mode === "manual" || (nextSettings.payment_mode === "hybrid" && nextSettings.payment_auto_ready !== "true")) setPaymentMethod("manual");
      })
      .catch(() => setError("Katalog belum dapat dimuat. Coba segarkan halaman."))
      .finally(() => setLoading(false));
  }, []);

  const orderId = order?.id;
  const orderStatus = order?.status;
  const orderToken = order?.token;
  useEffect(() => {
    if (!orderId || !orderToken || !orderStatus || !["pending","provisioning","paid"].includes(orderStatus)) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/asep?action=order-status&id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(orderToken)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok) setOrder((current) => current ? { ...current, ...data, token: current.token } : current);
      } catch { /* polling resumes on the next interval */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [orderId, orderStatus, orderToken]);

  useEffect(() => {
    const next = order?.status || "";
    if (next === "active" && previousStatus.current && previousStatus.current !== "active") playCheckoutSound(settings, "success");
    previousStatus.current = next;
  }, [order?.status, settings]);

  const visible = useMemo(() => products.filter((item) => item.categoryKey === category), [products, category]);
  const style = {
    "--store-primary": settings.theme_primary || "#3b82f6",
    "--store-accent": settings.theme_accent || "#2563eb",
  } as CSSProperties;

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/asep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-order",
          productId: selected.id,
          username: form.get("username"),
          password: form.get("password"),
          paymentMethod,
        }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || "Pesanan gagal dibuat");
      else {
        const nextOrder = data as Order;
        setOrder(nextOrder);
        previousStatus.current = nextOrder.status;
        localStorage.setItem("asep_last_order", JSON.stringify({ id: nextOrder.id, token: nextOrder.token }));
        playCheckoutSound(settings, "created");
      }
    } catch {
      setError("Koneksi checkout bermasalah. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openLastOrder() {
    setMobileOpen(false);
    setError("");
    const raw = localStorage.getItem("asep_last_order");
    if (!raw) {
      setError("Belum ada transaksi tersimpan di perangkat ini.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      const saved = JSON.parse(raw) as { id?: string; token?: string };
      if (!saved.id || !saved.token) throw new Error("invalid");
      const response = await fetch(`/api/asep?action=order-status&id=${encodeURIComponent(saved.id)}&token=${encodeURIComponent(saved.token)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transaksi tidak ditemukan");
      setSelected(null);
      setOrder({ ...data, id: saved.id, token: saved.token });
      previousStatus.current = String(data.status || "");
      setTrackingOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Riwayat transaksi tidak dapat dibuka.");
    }
  }

  function openProduct(product: Product) {
    setSelected(product);
    setTrackingOpen(false);
    setOrder(null);
    setError("");
    previousStatus.current = "";
    if (settings.payment_mode === "manual" || (settings.payment_mode === "hybrid" && settings.payment_auto_ready !== "true")) setPaymentMethod("manual");
    else setPaymentMethod("automatic");
  }

  function closeModal() {
    setSelected(null);
    setTrackingOpen(false);
    setOrder(null);
    setError("");
    previousStatus.current = "";
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const message = String(form.get("message") || "").trim();
    const text = `Halo ${settings.store_name}, saya ${name}. ${message}`;
    const wa = settings.whatsapp?.replace(/\D/g, "");
    if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    else if (settings.support_email) window.location.href = `mailto:${settings.support_email}?subject=${encodeURIComponent(`Pesan untuk ${settings.store_name}`)}&body=${encodeURIComponent(text)}`;
  }

  const warrantyText = settings.warranty_enabled === "true"
    ? `${settings.warranty_label || "Garansi"}${Number(settings.warranty_days) > 0 ? ` ${settings.warranty_days} Hari` : ""}`
    : "Support Layanan";

  return <main className="store-shell" style={style}>
    <header className="store-header">
      <a className="brand" href="#top" aria-label={settings.store_name}>
        <span className="brand-icon">AB</span>
        <span><b>{settings.store_name}</b><small>{settings.store_tagline}</small></span>
      </a>
      <button className="mobile-menu-button" type="button" aria-label="Buka menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>☰</button>
      <nav className={mobileOpen ? "open" : ""}>
        <a href="#paket" onClick={() => setMobileOpen(false)}>Produk</a>
        <a href="#cara" onClick={() => setMobileOpen(false)}>Cara Beli</a>
        <a href="#kontak" onClick={() => setMobileOpen(false)}>Kontak</a>
        <button type="button" className="track-order-nav" onClick={openLastOrder}>Cek Pesanan</button>
      </nav>
    </header>

    <section className="hero reference-hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow hero-badge"><i /> {settings.hero_badge}</span>
        <h1>{settings.hero_title}</h1>
        <p>{settings.hero_subtitle}</p>
        <div className="hero-cta-row">
          <a href="#paket" className="hero-primary">Pesan Sekarang</a>
          <button type="button" className="hero-secondary" onClick={openLastOrder}>Cek Transaksi</button>
        </div>
        <div className="feature-grid">
          <Feature icon="🚀" title="Proses Instan" text="Pembayaran masuk, layanan langsung diproses." />
          <Feature icon="🔓" title="Script No Encrypt" text="Bebas custom script bot sesuai kebutuhan." />
          <Feature icon="🛡️" title={warrantyText} text="Pengaturan garansi dikontrol langsung dari owner center." />
          <Feature icon="🌐" title="Panel Lengkap" text="Pterodactyl, resource fleksibel, payment otomatis dan manual." />
        </div>
        <div className="trust-row compact-trust">
          <span>✓ Transaksi terpantau</span>
          <span>✓ QRIS otomatis & manual</span>
          <span>✓ Provisioning Pterodactyl</span>
        </div>
      </div>
    </section>

    {error && !selected && !trackingOpen && <div className="store-global-alert"><div className="alert error">{error}<button onClick={() => setError("")}>×</button></div></div>}

    <section className="catalog" id="paket">
      <div className="section-heading">
        <div>
          <span className="eyebrow">KATALOG PRODUK</span>
          <h2>{settings.catalog_title}</h2>
          <p>{settings.catalog_subtitle}</p>
        </div>
        <div className="category-tabs" role="tablist">
          <button className={category === "cheap" ? "active" : ""} onClick={() => setCategory("cheap")}>▣ {settings.cheap_label}</button>
          <button className={category === "private" ? "active" : ""} onClick={() => setCategory("private")}>⌘ {settings.private_label}</button>
        </div>
      </div>

      <div className="catalog-note">
        <b>{category === "cheap" ? settings.cheap_label : settings.private_label}</b>
        <span> hosting bot/game dengan performa stabil, pilihan resource jelas, dan harga terjangkau.</span>
      </div>

      <div className="product-grid">
        {loading ? [1,2,3].map((n) => <div className="product-card skeleton" key={n}/>) : visible.map((product) => <article className={`product-card ${product.popular ? "popular" : ""}`} key={product.id}>
          {product.popular && <span className="popular-badge">PALING LARIS</span>}
          <div className="product-category">{product.categoryKey === "cheap" ? settings.cheap_label : settings.private_label}</div>
          <h3>{product.name}</h3>
          <div className="price"><b>{rupiah(product.price)}</b><span>sekali bayar</span></div>
          <p>{product.description}</p>
          <div className="spec-list">
            <span><i>▤</i><b>{product.ram === 0 ? "Unlimited RAM" : `${formatMb(product.ram)} RAM`}</b></span>
            <span><i>▧</i><b>CPU {product.cpu}%</b></span>
            <span><i>✓</i><b>{warrantyText}</b></span>
            <span><i>□</i><b>Disk {formatMb(product.disk)}</b></span>
          </div>
          <div className="product-actions"><button className="cart-button" aria-label="Beli paket" onClick={() => openProduct(product)}>🛒</button><button className="buy-button" onClick={() => openProduct(product)}>▭ <span>Beli Sekarang</span></button></div>
        </article>)}
        {!loading && !visible.length && <div className="empty-store">Belum ada paket aktif dalam kategori ini.</div>}
      </div>
    </section>

    <section className="steps" id="cara">
      <span className="eyebrow">ALUR PEMBELIAN</span>
      <h2>Tiga langkah, status transaksi tetap kelihatan</h2>
      <div className="step-grid">
        <article><b>01</b><span className="step-icon">⌨</span><h3>Buat akun panel</h3><p>Pilih paket, tentukan username, dan isi password atau biarkan sistem membuatkannya.</p></article>
        <article><b>02</b><span className="step-icon">▦</span><h3>Pilih pembayaran</h3><p>Gunakan payment otomatis atau QRIS manual sesuai metode yang diaktifkan owner.</p></article>
        <article><b>03</b><span className="step-icon">↗</span><h3>Pantau sampai aktif</h3><p>Checkout memeriksa status dan menampilkan akses panel ketika provisioning selesai.</p></article>
      </div>
    </section>

    <section className="contact-section" id="kontak">
      <div className="contact-heading"><span className="eyebrow">HUBUNGI KAMI</span><h2>Punya Pertanyaan Lain?</h2><p>Gunakan kanal support atau kirim pesan langsung. Owner login tidak ditampilkan pada area member.</p></div>
      <div className="contact-layout">
        <div className="contact-info">
          <div className="contact-item"><span>☎</span><div><b>WhatsApp Chat</b><p>{settings.whatsapp ? `+${settings.whatsapp.replace(/\D/g, "")}` : "Atur nomor WhatsApp dari Owner Center"}</p></div></div>
          <div className="contact-item"><span>✉</span><div><b>Email Support</b><p>{settings.support_email || "Belum diatur"}</p></div></div>
          <div className="contact-item"><span>✓</span><div><b>{settings.script_name || "ASEP BOT"}</b><p>Sistem toko, checkout, payment, panel dan garansi dalam satu dashboard.</p></div></div>
        </div>
        <form className="contact-form" onSubmit={submitContact}>
          <h3>Kirim Pesan Langsung</h3>
          <label>Nama Lengkap<input name="name" required placeholder="Nama Anda"/></label>
          <label>Pesan Anda<textarea name="message" rows={5} required placeholder="Tulis kebutuhan atau kendala Anda"/></label>
          <button type="submit">Kirim Pesan</button>
        </form>
      </div>
    </section>

    <footer>
      <a className="brand" href="#top"><span className="brand-icon">AB</span><span><b>{settings.store_name}</b><small>{settings.store_tagline}</small></span></a>
      <p>{settings.footer_text}</p>
      <span>© 2026 {settings.store_name}</span>
    </footer>

    {(selected || trackingOpen) && <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="checkout-modal">
        <button className="modal-close" onClick={closeModal} aria-label="Tutup">×</button>
        {trackingOpen && order ? <><span className="eyebrow">CEK TRANSAKSI</span><PaymentState order={order} settings={settings}/></> : !order && selected ? <>
          <span className="eyebrow">CHECKOUT PRODUK</span>
          <h2>{selected.name}</h2>
          <p className="modal-lead">Isi data akun panel, lalu pilih metode pembayaran yang tersedia.</p>
          <div className="order-summary"><span>Total pembayaran</span><b>{rupiah(selected.price)}</b></div>
          <form onSubmit={submitOrder}>
            <label>Username panel<input name="username" minLength={4} maxLength={20} pattern="[A-Za-z0-9_]+" placeholder="Contoh: asepbot01" required/></label>
            <label>Password panel<input name="password" type="password" minLength={8} placeholder="Kosongkan untuk dibuat otomatis"/></label>
            <PaymentMethodPicker mode={settings.payment_mode || "hybrid"} automaticReady={settings.payment_auto_ready === "true"} value={paymentMethod} onChange={setPaymentMethod}/>
            {error && <div className="alert error">{error}</div>}
            <button className="button primary submit" disabled={submitting}>{submitting ? "MEMBUAT TRANSAKSI..." : "CHECKOUT SEKARANG"}</button>
          </form>
        </> : order ? <PaymentState order={order} settings={settings}/> : null}
      </div>
    </div>}
  </main>;
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <article className="feature-card"><span>{icon}</span><div><b>{title}</b><p>{text}</p></div></article>;
}

function PaymentMethodPicker({ mode, automaticReady, value, onChange }: { mode:string; automaticReady:boolean; value:"automatic"|"manual"; onChange:(v:"automatic"|"manual")=>void }) {
  if (mode === "automatic") return <div className="payment-method-single"><b>⚡ Payment Otomatis</b><span>Invoice diverifikasi oleh gateway.</span></div>;
  if (mode === "manual") return <div className="payment-method-single"><b>▦ QRIS Manual</b><span>Owner memverifikasi transaksi dari dashboard.</span></div>;
  if (mode === "demo") return <div className="payment-method-single"><b>🧪 Mode Demo</b><span>Untuk pengujian tanpa payment gateway.</span></div>;
  return <div className="payment-picker">
    <span className="picker-title">Metode pembayaran</span>
    <button type="button" disabled={!automaticReady} className={value === "automatic" ? "selected" : ""} onClick={() => onChange("automatic")}><b>⚡ Otomatis</b><small>{automaticReady ? "Gateway memeriksa status otomatis" : "Belum diaktifkan owner"}</small></button>
    <button type="button" className={value === "manual" ? "selected" : ""} onClick={() => onChange("manual")}><b>▦ Manual</b><small>Bayar QRIS dan diverifikasi owner</small></button>
  </div>;
}

function PaymentState({ order, settings }: { order: Order; settings: Settings }) {
  if (order.status === "active" && order.credentials) return <div className="payment-state success-state">
    <span className="big-status">✓</span><span className="eyebrow">PANEL BERHASIL DIBUAT</span><h2>Akun sudah aktif</h2>
    <p>Simpan data akses berikut. Password tidak ditampilkan lagi setelah halaman ditutup.</p>
    <code>URL: {order.credentials.url}</code><code>Username: {order.credentials.username}</code><code>Password: {order.credentials.password}</code>
    {order.warranty?.enabled && <div className="warranty-success"><b>🛡 {order.warranty.label}</b><span>{order.warranty.days} hari, aktif sampai {formatDate(order.warranty.expiresAt)}</span><small>{order.warranty.terms}</small></div>}
  </div>;

  if (["expired","payment_failed","provision_failed"].includes(order.status)) return <div className="payment-state failed-state">
    <span className="big-status">!</span><h2>Transaksi belum berhasil</h2><p>{order.message || `Status: ${order.status}`}</p><OrderProgress status={order.status}/>
  </div>;

  if (order.status === "configuration_required") return <div className="payment-state wait-state">
    <span className="big-status">✓</span><h2>Pembayaran diterima</h2><p>{order.message || "Owner akan menyelesaikan konfigurasi panel."}</p><OrderProgress status={order.status}/>
  </div>;

  const isManual = order.gateway === "manual";
  return <div className="payment-state pending-state">
    <span className="eyebrow">{isManual ? "PEMBAYARAN MANUAL" : order.demo ? "MODE DEMO" : "MENUNGGU PEMBAYARAN"}</span>
    <h2>{isManual ? settings.manual_qris_name || "QRIS Manual" : "Scan QRIS untuk membayar"}</h2>
    <p className="payment-total">{rupiah(order.total)}</p>
    {order.qrisImage ? <div className="qris-box"><img src={order.qrisImage} alt="QRIS pembayaran"/></div> : <div className="qris-empty">QR belum tersedia. Hubungi owner atau gunakan metode pembayaran lain.</div>}
    <OrderProgress status={order.status}/>
    <div className="payment-meta"><span>Order ID<b>{order.id}</b></span><span>Berlaku sampai<b>{formatDate(order.expiresAt)}</b></span></div>
    <p className="payment-note">{order.message || (isManual ? settings.manual_payment_note : "Status akan diperiksa otomatis.")}</p>
    <small>Status halaman diperbarui otomatis setiap beberapa detik dan pesanan terakhir tersimpan di perangkat ini.</small>
  </div>;
}

function OrderProgress({ status }: { status: string }) {
  const paid = ["provisioning","active","configuration_required"].includes(status);
  const active = status === "active";
  const failed = ["expired","payment_failed","provision_failed"].includes(status);
  return <div className="order-progress">
    <span className={failed ? "done" : "done"}><i>1</i><b>Pesanan</b></span>
    <span className={paid || active ? "done" : failed ? "failed" : "current"}><i>2</i><b>Pembayaran</b></span>
    <span className={active ? "done" : status === "provisioning" || status === "configuration_required" ? "current" : failed ? "failed" : ""}><i>3</i><b>Panel Aktif</b></span>
  </div>;
}

function playCheckoutSound(settings: Settings, kind: "created"|"success") {
  if (settings.checkout_sound_enabled === "false" || typeof window === "undefined") return;
  try {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    const volume = Math.min(1, Math.max(0.03, (Number(settings.checkout_sound_volume) || 70) / 100));
    gain.gain.setValueAtTime(volume * 0.13, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "success" ? 0.45 : 0.28));
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "success" ? 660 : 520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(kind === "success" ? 980 : 720, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === "success" ? 0.45 : 0.28));
    setTimeout(() => void ctx.close(), 600);
  } catch { /* sound is optional and must never block checkout */ }
}

function rupiah(v:number) { return `Rp ${new Intl.NumberFormat("id-ID").format(v || 0)}`; }
function formatMb(v:number) { return v >= 1024 ? `${Math.round(v/1024)} GB` : `${v} MB`; }
function formatDate(v:string) { return v ? new Date(v).toLocaleString("id-ID", { timeZone:"Asia/Jakarta", dateStyle:"medium", timeStyle:"short" }) : "-"; }
