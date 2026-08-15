# ASEP BOT — Perbaikan Pterodactyl / Grab Panel

## Mapping API yang benar

- **Application API Key**: `ptla_...`
- **Client API Token**: `ptlc_...`

Jika kedua nilai tertukar (`ptlc_` masuk Application dan `ptla_` masuk Client), ASEP BOT sekarang mendeteksi dan menukarnya otomatis saat pengaturan disimpan. Runtime test/provisioning juga menormalisasi mapping lama agar upgrade database tidak langsung rusak.

## Tes koneksi dari Owner Center

Buka **Owner Center → Integrasi → Tes Koneksi Panel**. Pemeriksaan mencakup:

1. Application API (`/api/application/users`)
2. Client API (`/api/client/account`) bila PTLC diisi
3. Egg berdasarkan Nest + Egg ID
4. Location ID

Jika 403, dashboard menampilkan detail API seperti `HTTP 403: This action is unauthorized.` tanpa menampilkan API key.

## Permission Pterodactyl

Application API Key perlu izin yang memadai untuk:
- Users: read/write
- Servers: read/write
- Nests/Eggs: read
- Locations: read

Key harus dibuat dari panel/domain yang sama dengan URL Panel di Owner Center.

## Provisioning yang diperbaiki

Sebelum membuat server, ASEP BOT membaca variabel default Egg dan mengirimkannya sebagai `environment`. User Pterodactyl dibuat dengan identitas **ASEP BOT**.

Jika user berhasil dibuat tetapi server gagal, sistem mencoba menghapus user sementara supaya akun gagal tidak menumpuk. Error ditandai tahapnya, misalnya `[CREATE_USER]`, `[EGG]`, atau `[CREATE_SERVER]`.

## Vercel

Set `APP_SECRET` minimal 32 karakter. Untuk database permanen di Vercel, isi `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`, lalu redeploy.

Pada hosting Node/Pterodactyl, `start-panel.mjs` akan membuat `data/.app-secret` lokal otomatis bila `APP_SECRET` belum disediakan.
