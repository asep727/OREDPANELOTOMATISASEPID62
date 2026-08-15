# Deploy ASEP BOT ke Vercel

Project tetap mendukung hosting Node/Pterodactyl lama dan sekarang juga memiliki mode database serverless.

## Environment Variables production

Isi di Vercel Project Settings -> Environment Variables:

- `APP_SECRET`: secret acak minimal 32 karakter. Setelah mengubah Environment Variables, redeploy deployment Vercel.
- `TURSO_DATABASE_URL`: URL database Turso, format `libsql://...` atau `https://...`.
- `TURSO_AUTH_TOKEN`: token database Turso.
- `NEXT_PUBLIC_SITE_URL`: contoh `https://veve.vercel.app`.
- `PUBLIC_SITE_URL`: contoh `https://veve.vercel.app`.

Tanpa Turso, website tetap bisa menyala di Vercel memakai SQLite `/tmp`, tetapi data owner, transaksi, dan setting bersifat sementara. Dashboard Owner akan menampilkan peringatan jika kondisi ini terdeteksi.

## URL Owner

- Baru: `/owner`
- Lama tetap tersedia: `/admin`

Login awal tetap:

- Username: `admin`
- Password: `AsepBot2097!`

Segera ubah password melalui menu Keamanan.

## Payment

Menu Owner -> Payment mendukung:

- Otomatis melalui Nevapedia.
- Manual dengan QRIS yang dapat di-upload atau memakai URL HTTPS.
- Hybrid agar customer bisa memilih otomatis atau manual.
- Demo untuk pengujian lama.

Semua mode tetap memakai tabel transaksi yang sama sehingga status sukses, pending, gagal, dan provisioning dapat dipantau dari dashboard Owner.
