# ASEP BOT - Versi Node untuk Panel/Pterodactyl

Versi ini sudah dilepas dari Cloudflare Worker, Vinext, Wrangler, dan D1.
Aplikasi berjalan sebagai Next.js Node.js dan menyimpan database pada SQLite lokal.

## Runtime

- Node.js: 22.13 atau lebih baru
- Startup: `npm start`
- Build pertama: `npm install && npm run build`
- Database default: `./data/asep-bot.sqlite`

## Pengaturan panel

1. Upload seluruh isi ZIP ke server Node.js.
2. Pilih image Node.js 22.
3. Jalankan `npm install`.
4. Jalankan `npm run build`.
5. Isi environment variable `APP_SECRET` dengan string acak minimal 32 karakter.
6. Startup command: `npm start`.
7. Aplikasi otomatis membaca port dari `SERVER_PORT`, `PORT`, `P_SERVER_PORT`, atau `PRIMARY_PORT`.
8. Jika tidak ada variabel port, fallback ke 3000.

## Domain tanpa menulis :port

Node tetap wajib mendengarkan satu port internal. Agar pengunjung cukup membuka `https://domainkamu.com`, gunakan salah satu:

- fitur Reverse Proxy / Domain / Proxy pada panel hosting, arahkan domain ke port allocation aplikasi
- Cloudflare Tunnel, arahkan public hostname ke `http://127.0.0.1:PORT`
- reverse proxy Nginx/Caddy pada mesin host jika Anda memiliki akses root

DNS biasa saja tidak dapat menghilangkan port arbitrer dari URL. Cloudflare DNS proxy juga bukan pengganti reverse proxy untuk port allocation acak.

## Data persisten

Jangan hapus folder `data/`. File `data/asep-bot.sqlite` berisi produk, konfigurasi, admin, dan transaksi.
Jika hosting melakukan reinstall yang menghapus seluruh file server, backup file database terlebih dahulu.

## Admin awal

- URL: `/admin`
- Username: `admin`
- Password: `AsepBot2097!`

Ubah password setelah login pertama.


## Alamat publik preset

Paket ini sudah diberi alamat akses toko/server:

```text
http://ptpanelbuy.asepid.my.id:2097
```

Alamat ini dipakai sebagai `PUBLIC_SITE_URL`/`NEXT_PUBLIC_SITE_URL` dan tampil di log startup. Ini bukan pengganti `URL Panel` Pterodactyl untuk API provisioning.
