# ASEP BOT Panel Otomatis

Website toko panel otomatis dengan katalog dinamis, dashboard admin, database D1, pembayaran Nevapedia, provisioning Pterodactyl, dan testimoni Telegram.

## Login admin awal

- URL: `/admin`
- Username: `admin`
- Password awal: `AsepBot2097!`

Segera ubah password melalui menu **Keamanan** setelah deployment pertama.

## Pengaturan yang tersedia

Dashboard admin dapat mengubah nama toko, tagline, judul dan deskripsi halaman, nama kategori Panel Murah, nama kategori Panel Private, nama paket, harga, RAM, CPU, disk, Egg ID, Location ID, Docker image, startup command, status produk, badge populer, API Nevapedia, API Pterodactyl, bot Telegram, Chat ID, serta template testimoni.

Perubahan identitas, kategori, dan produk langsung digunakan oleh halaman toko. Produk tidak perlu ditulis ulang di kode.

## Status transaksi

- `pending`: menunggu pembayaran
- `provisioning`: pembayaran diterima dan panel sedang dibuat
- `active`: panel berhasil dibuat
- `configuration_required`: pembayaran diterima tetapi konfigurasi Pterodactyl belum lengkap
- `expired`: invoice kedaluwarsa
- `payment_failed`: pembayaran gagal
- `provision_failed`: pembuatan panel gagal dan dapat dicoba ulang dari admin

## Konfigurasi awal produksi

1. Isi `APP_SECRET` sebagai secret environment variable.
2. Masuk ke dashboard admin dan ubah password awal.
3. Buka menu Integrasi API.
4. Isi URL panel dan Pterodactyl Application API Key.
5. Isi Egg ID dan Location ID pada setiap produk.
6. Isi URL dan API Key Nevapedia.
7. Jika testimoni otomatis digunakan, isi Telegram Bot Token dan Chat ID lalu tekan Kirim Pesan Tes.
8. Aktifkan Telegram setelah tes berhasil.

Testimoni hanya dikirim setelah status panel menjadi `active`. Password pelanggan, API key, dan token transaksi tidak dikirim ke Telegram.

## Catatan domain

Gunakan subdomain toko yang berbeda dari panel Pterodactyl:

- Toko: `shop.asepid.my.id`
- Panel: `ptpanelbuy.asepid.my.id`

Dengan pemisahan ini, domain toko dapat diarahkan ke hosting website sementara API tetap menggunakan domain panel.


## URL akses toko saat ini

```text
http://ptpanelbuy.asepid.my.id:2097
```

Jangan masukkan URL ber-port ini ke kolom `URL Panel` bila kolom tersebut dipakai untuk API Pterodactyl. Kolom `URL Panel` harus menunjuk ke panel Pterodactyl utama.
