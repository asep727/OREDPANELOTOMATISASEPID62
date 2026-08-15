# Update ASEP BOT - Owner Center & Storefront

Versi ini mempertahankan alur produk, payment otomatis/manual, provisioning Pterodactyl, transaksi, member, Telegram, dan database yang sudah ada, lalu menambahkan pengaturan baru tanpa menghapus fungsi utama.

## Fitur yang ditambahkan

- Storefront diperhalus mengikuti referensi mobile: header bersih, hero terpusat, kartu keunggulan, katalog, alur beli, dan area kontak.
- Tombol Owner di halaman member dihilangkan. Owner tetap masuk melalui URL `/owner` atau `/admin` secara langsung.
- Halaman owner diberi `noindex` agar tidak ditujukan untuk mesin pencari.
- Menu **Garansi** di Owner Center:
  - aktif/nonaktif
  - label garansi
  - durasi hari
  - syarat dan ketentuan
  - masa garansi dihitung otomatis saat panel aktif
- Suara checkout dapat diaktifkan/nonaktifkan dan volume dapat diubah dari menu **Tampilan Toko**.
- Pesanan terakhir disimpan secara lokal di perangkat member. Tombol **Cek Pesanan** membaca kembali status menggunakan Order ID + access token yang tersimpan di browser.
- Checkout memberi bunyi singkat saat transaksi berhasil dibuat dan saat panel berubah menjadi aktif, bila suara diaktifkan.
- Menu **Integrasi** sekarang memiliki konfigurasi Pterodactyl yang lebih lengkap:
  - Domain / URL Panel
  - Application API Key
  - Client API Token / API Key
  - Default Egg ID
  - Default Nest ID
  - Default Location ID
  - tombol tes koneksi
- Provisioning tetap memakai Egg ID dan Location ID per produk. Jika nilainya 0, sistem memakai nilai default dari menu Integrasi.
- Client API Token disimpan terenkripsi seperti secret lainnya. Token ini disediakan untuk kebutuhan grab/cek client API. Provisioning create user/server tetap memakai Application API Key karena itu yang diwajibkan endpoint Application API Pterodactyl.

## Catatan Vercel

Agar transaksi dan setting tidak hilang saat instance serverless berganti, isi `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` di Environment Variables Vercel. `APP_SECRET` juga wajib diisi dengan nilai acak panjang agar credential terenkripsi konsisten.

## Keamanan

Jangan memasukkan API key atau token ke source code publik. Masukkan secret melalui Owner Center atau environment variable sesuai kebutuhan. Bila API key atau token pernah terlihat di screenshot/chat publik, rotasi key/token tersebut dari panel penyedia sebelum dipakai kembali.
