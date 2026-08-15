ASEP BOT - PANEL PORT EASY
==========================

TARGET:
Upload -> Extract -> pilih Node 22 -> Start.

TIDAK PERLU:
- Cloudflare Tunnel
- isi PORT manual
- edit start-panel.mjs
- membuat APP_SECRET manual
- menjalankan npm install manual pada instalasi pertama
- menjalankan npm run build manual pada instalasi pertama

PENGATURAN PANEL:
1. Upload semua isi ZIP ke root server.
2. Extract.
3. Pada Startup/Docker Image pilih Node.js 22.13+.
4. Startup command: npm start
5. Tekan Start.

SCRIPT AKAN OTOMATIS:
- membaca SERVER_PORT / PORT / P_SERVER_PORT / PRIMARY_PORT / ALLOCATION_PORT
- membuat APP_SECRET lokal di data/.app-secret bila belum ada
- menjalankan npm install bila dependency belum lengkap
- menjalankan next build bila belum pernah build
- menjalankan Next.js pada 0.0.0.0:<PORT PANEL>

CONTOH:
Jika panel memberikan port 7448, console akan menampilkan:
[ASEP BOT] PORT PANEL TERDETEKSI: 7448
[ASEP BOT] Website berjalan di 0.0.0.0:7448

Alamat akses mengikuti IP/hostname allocation provider, misalnya:
http://ptpanelbuy.asepid.my.id:2097

ADMIN AWAL:
URL      : /admin
Username : admin
Password : AsepBot2097!

WAJIB ganti password admin setelah login.

DATA:
Jangan hapus folder data.
Database tersimpan di data/asep-bot.sqlite.
Secret enkripsi tersimpan di data/.app-secret.
Backup kedua file tersebut sebelum reinstall server.

REBUILD SETELAH EDIT SOURCE:
Set variable REBUILD=1 lalu restart sekali. Setelah build selesai, REBUILD boleh dikembalikan ke 0/kosong.


URL PUBLIK YANG SUDAH DIMASUKKAN:
http://ptpanelbuy.asepid.my.id:2097

CATATAN:
URL ini hanya alamat akses toko/server. Untuk URL Panel Pterodactyl di dashboard admin, gunakan domain panel tanpa port server, misalnya https://ptpanelbuy.asepid.my.id. Jangan isi URL Panel Pterodactyl dengan :2097 kecuali API Pterodactyl memang berada di port itu.
