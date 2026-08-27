# Referensi EV — Mobil Listrik Indonesia

Situs referensi mobil listrik di Indonesia, dibangun dengan **Astro** (mode SSR, adapter Node) dan dilengkapi **CMS admin** untuk mengelola seluruh konten (data mobil + teks halaman).

## Fitur

- Halaman utama: daftar mobil listrik dengan pencarian, filter, pengurutan, gambar siluet yang bisa diganti warna, dan pemilih varian.
- CMS admin di `/admin`:
  - Login admin (username + password, session cookie bertanda tangan HMAC).
  - **Banyak pengguna dengan tiga peran** (Pemilik / Admin / Editor), masing-masing
    dengan profil sendiri: nama, foto, email, dan ganti kata sandi.
  - **Tiga bahasa antarmuka**: Indonesia (bawaan), Inggris, dan Mandarin —
    bisa diganti seketika tanpa memuat ulang halaman.
  - Dasbor dengan sapaan personal, skor kelengkapan data, aksi cepat, dan
    log aktivitas (siapa mengubah apa, kapan).
  - Kelola semua konten: mobil, motor listrik, SPKLU, bengkel, berita.
  - Tambah / edit / hapus model mobil &amp; motor (merek, tipe bodi, spesifikasi, varian, warna, harga, video).
  - Upload gambar per mobil (disimpan di `data/uploads/` dan disajikan lewat `/api/uploads/...`); mobil tanpa gambar memakai siluet yang bisa diganti warna.
  - Edit teks halaman (hero, tentang, footer).
- Data disimpan di file `data/content.json` di server.

## Struktur

```
├── astro.config.mjs
├── package.json
├── .env                     (dibuat otomatis oleh wizard /install)
├── tools/i18n-check.mjs     (penjaga sinkronisasi terjemahan)
├── data/
│   ├── content.json         (data konten yang dikelola CMS)
│   ├── users.json           (akun panel, kata sandi ter-hash scrypt)
│   └── activity.json        (log aktivitas panel)
└── src/
    ├── layouts/Base.astro
    ├── lib/auth.ts          (session bertanda tangan + identitas pengguna)
    ├── lib/users.ts         (akun, peran, hash kata sandi)
    ├── lib/i18n/            (kamus id / en / zh + runtime terjemahan)
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

Jalankan mode pengembangan:

```bash
npm run dev
```

Buka `http://localhost:4321`, lalu selesaikan wizard di `http://localhost:4321/install`
untuk membuat akun admin dan kunci sesi. Wizard menulis file `.env` sendiri —
tidak perlu menyalin `.env.example` secara manual.

> Sebelum wizard dijalankan, login admin **selalu ditolak**: aplikasi tidak
> punya kredensial bawaan. `.env` tidak pernah ikut ke Git.

## Build & jalankan production

```bash
npm run build
npm run start
```

`npm run start` menjalankan server standalone (`node ./dist/server/entry.mjs`) dari root proyek, default port **4321**.

## Deploy ke CyberPanel / OpenLiteSpeed

1. Download rilis terbaru dari GitHub Releases (`evkita.zip`), lalu **ekstrak** ke
   folder di luar `public_html`, mis. `/home/domain-kamu/evkita/`.
2. Lewat SSH, masuk ke folder itu dan jalankan:
   ```bash
   cd /home/domain-kamu/evkita
   bash install.sh
   ```
   Installer memeriksa Node.js, memastikan `dist/` ada, **memilih port yang
   benar-benar bebas** (kalau 4321 sudah dipakai aplikasi Node lain di server
   yang sama, ia pindah ke 4322, dst.), menjalankan PM2, lalu memverifikasi
   aplikasi benar-benar merespons. Port yang dipakai dicatat di `.env` dan
   dicetak di akhir output — catat angkanya.

3. **Pasang reverse proxy.** Aplikasi sengaja hanya mendengarkan di
   `127.0.0.1`, jadi `http://IP-SERVER:PORT` tidak bisa dibuka dari internet.
   Di CyberPanel: **Websites → Manage → Config → vHost Conf**, tambahkan blok
   berikut (ganti `4321` dengan port dari langkah 2), lalu **Save**:

   ```
   extprocessor evkitanode {
     type                    proxy
     address                 127.0.0.1:4321
     maxConns                100
     pcKeepAliveTimeout      60
     initTimeout             60
     retryTimeout            0
     respBuffer              0
   }

   context / {
     type                    proxy
     handler                 evkitanode
     addDefaultCharset       off
   }
   ```

   Lalu restart LiteSpeed (**Server → Services**, atau `systemctl restart lsws`).

   > Jangan pakai `RewriteRule ^(.*)$ http://127.0.0.1:4321/$1 [P,L]`.
   > Flag `[P]` milik `mod_proxy` Apache dan **tidak bekerja** di
   > OpenLiteSpeed — proxy di OLS harus lewat `extprocessor` + `context`
   > seperti di atas. Blok `context /.well-known/acme-challenge` bawaan
   > CyberPanel tetap menang karena lebih spesifik, jadi perpanjangan
   > sertifikat Let's Encrypt tidak terganggu.

4. Buka `https://domain-kamu.com/install` dan ikuti **wizard instalasi**
   (buat akun admin + kunci keamanan).

Selesai — login admin di `https://domain-kamu.com/admin`.

> Kredensial & kunci sesi tersimpan di `.env` (dibuat otomatis oleh wizard).
> Untuk update selanjutnya: `bash deploy.sh` (backup `data/` & `.env` otomatis).

### Kalau domain menampilkan 503

Berarti reverse proxy sudah aktif tapi aplikasi Node tidak berjalan di port
yang dituju. Cek dengan:

```bash
pm2 list
pm2 logs evkita --lines 50
grep PORT /home/domain-kamu/evkita/.env
```

Penyebab paling umum: **port bentrok** dengan aplikasi Node lain di server yang
sama. Pastikan angka `PORT` di `.env` sama dengan `address` di vHost Conf.

## Update & Rilis (GitHub)

Setiap **push ke branch `main`** otomatis membuat rilis baru lewat GitHub Actions (`.github/workflows/release.yml`): menaikkan versi `patch`, build, lalu membuat release `vX.Y.Z` beserta file `evkita.zip`.

- **Manual:** tab **Actions → Release → Run workflow** untuk memilih `patch` / `minor` / `major` dan catatan rilis.
- Changelog dirangkum otomatis dari pesan commit sejak rilis sebelumnya.

Untuk update di server, jalankan:

```bash
cd /home/user/evkita
bash deploy.sh          # pasang rilis terbaru
bash deploy.sh 1.2.3    # pasang versi tertentu
```

`deploy.sh` mengunduh zip, mem-backup `data/` dan `.env`, mengekstrak, lalu restart PM2 — sehingga konten admin tidak hilang saat update.

> **Repo private:** set `GITHUB_TOKEN` (token dengan izin `Contents: read`) di server sebelum menjalankan `deploy.sh`, mis. `export GITHUB_TOKEN=github_pat_…`. Kalau repo public, tidak perlu token.

Halaman **Admin → Pembaruan** (`/admin/update`) menampilkan daftar rilis GitHub beserta changelog, versi terpasang vs terbaru, dan tombol unduh.

## Keamanan

- `data/content.json` menyimpan seluruh konten dan ditulis ulang setiap penyimpanan.
- Autentikasi memakai cookie httpOnly bertanda tangan HMAC dengan `SESSION_SECRET`.
- Aplikasi tidak punya kredensial bawaan: sebelum wizard `/install` dijalankan, login admin selalu ditolak dan cookie sesi apa pun dianggap tidak sah.
- Kata sandi disimpan sebagai hash `scrypt` di `data/users.json`, bukan teks polos di `.env`. Pemasangan lama dipindahkan otomatis sekali jalan saat aplikasi pertama kali dijalankan setelah pembaruan ini — tidak perlu instal ulang, tapi semua orang harus login sekali lagi karena bentuk token sesinya berubah.
- Pembatasan peran diberlakukan **di server** (`can(user, ...)`), bukan hanya disembunyikan di antarmuka: Editor benar-benar ditolak saat memanggil `/api/users`, `/api/backups`, dan `/api/update`.
- Cookie sesi dikirim dengan flag `Secure` saat diakses lewat HTTPS.
- Untuk skala lebih besar, pertimbangkan memindahkan penyimpanan ke database.
