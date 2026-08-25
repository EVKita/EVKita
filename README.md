# Referensi EV — Mobil Listrik Indonesia

Situs referensi mobil listrik di Indonesia, dibangun dengan **Astro** (mode SSR, adapter Node) dan dilengkapi **CMS admin** untuk mengelola seluruh konten (data mobil + teks halaman).

## Fitur

- Halaman utama: daftar mobil listrik dengan pencarian, filter, pengurutan, gambar siluet yang bisa diganti warna, dan pemilih varian.
- CMS admin di `/admin`:
  - Login admin (username + password, session cookie bertanda tangan HMAC).
  - Kelola semua konten: mobil, motor listrik, SPKLU, bengkel, berita.
  - Tambah / edit / hapus model mobil &amp; motor (merek, tipe bodi, spesifikasi, varian, warna, harga, video).
  - Upload gambar per mobil (disimpan di `data/uploads/` dan disajikan lewat `/api/uploads/...`); mobil tanpa gambar memakai siluet yang bisa diganti warna.
  - Edit teks halaman (hero, tentang, footer).
- Data disimpan di file `data/content.json` di server.

## Struktur

```
├── astro.config.mjs
├── package.json
├── .env                     (buat dari .env.example)
├── data/
│   └── content.json         (data konten yang dikelola CMS)
└── src/
    ├── layouts/Base.astro
    ├── lib/auth.ts          (session & password)
    ├── lib/store.ts         (baca/tulis content.json)
    ├── pages/
    │   ├── index.astro
    │   ├── admin/login.astro
    │   ├── admin/index.astro
    │   └── api/…
    ├── scripts/app.js       (front-end halaman utama)
    ├── scripts/admin.js     (front-end dashboard admin)
    └── styles/…
```

## Menjalankan secara lokal

```bash
npm install
```

Salin file environment lalu isi password & secret Anda:

```bash
cp .env.example .env
```

Isi `.env`:

```
ADMIN_USERNAME=Maryamazkadynarachmat
ADMIN_PASSWORD=Nurrachmat1
SESSION_SECRET=string-acak-panjang
```

Jalankan mode pengembangan:

```bash
npm run dev
```

Buka `http://localhost:4321` untuk halaman utama, dan `http://localhost:4321/admin` untuk login admin.

> Kredensial admin default di `.env.example` adalah username `Maryamazkadynarachmat` dan password `Nurrachmat1`. **Segera ganti sebelum production.**

## Build & jalankan production

```bash
npm run build
npm run start
```

`npm run start` menjalankan server standalone (`node ./dist/server/entry.mjs`) dari root proyek, default port **4321**.

## Deploy ke CyberPanel

1. Download rilis terbaru dari GitHub Releases (file `evkita.zip`), atau jalankan di server:
   ```bash
   curl -L -o evkita.zip https://github.com/EVKita/EVKita/releases/latest/download/evkita.zip
   ```
2. Pastikan **Node.js** (v18/v20/v22) dan **PM2** terpasang di server.
3. Ekstrak ke folder aplikasi (mis. `/home/user/evkita`), lalu buat file `.env` dari `.env.example`:
   ```bash
   unzip evkita.zip -d /home/user/evkita
   cd /home/user/evkita
   cp .env.example .env   # lalu edit isi: ADMIN_*, SESSION_SECRET, GITHUB_REPO
   ```
4. Jalankan server sebagai proses permanen dengan **PM2**:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```
   > `ecosystem.config.cjs` membaca kredensial dari `.env` lalu menyuntikkannya ke proses. Server membaca `data/content.json` dan `data/uploads/` dari root proyek (`cwd`).
5. Di CyberPanel, buat **website** `evkita.com` dan arahkan ke aplikasi Node melalui reverse proxy (OpenLiteSpeed) ke `http://127.0.0.1:4321`. Pastikan direktori `data/` bisa ditulis oleh user server.

   Rewrite rules OpenLiteSpeed (Website > Rewrite):
   ```
   RewriteRule ^(.*)$ http://127.0.0.1:4321/$1 [P,L]
   ```
   Gunakan `ProxyPreserveHost On` bila tersedia agar domain tetap `evkita.com`.

## Update & Rilis (GitHub)

Setiap **push ke branch `main`** otomatis membuat rilis baru lewat GitHub Actions (`.github/workflows/release.yml`): menaikkan versi `patch`, build, lalu membuat release `vX.Y.Z` beserta file `evkita.zip`.

- **Manual:** tab **Actions → Release → Run workflow** untuk memilih `patch` / `minor` / `major` dan catatan rilis.
- Changelog dirangkum otomatis dari pesan commit sejak rilis sebelumnya.

Untuk update di server, jalankan:

```bash
cd /home/user/evkita
./deploy.sh          # pasang rilis terbaru
./deploy.sh 1.2.3    # pasang versi tertentu
```

`deploy.sh` mengunduh zip, mem-backup `data/` dan `.env`, mengekstrak, lalu restart PM2 — sehingga konten admin tidak hilang saat update.

Halaman **Admin → Pembaruan** (`/admin/update`) menampilkan daftar rilis GitHub beserta changelog, versi terpasang vs terbaru, dan tombol unduh.

## Keamanan

- `data/content.json` menyimpan seluruh konten dan ditulis ulang setiap penyimpanan.
- Autentikasi memakai cookie httpOnly bertanda tangan HMAC dengan `SESSION_SECRET`.
- Ganti `ADMIN_USERNAME`, `ADMIN_PASSWORD` dan `SESSION_SECRET` dengan nilai kuat sebelum produksi.
- Untuk skala lebih besar, pertimbangkan memindahkan penyimpanan ke database.
