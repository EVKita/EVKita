# Panduan Agent — EVKita

Dokumen ini berlaku untuk **semua** agent AI yang bekerja di repo ini
(Claude Code, Deepseek, dan lainnya). Baca sebelum mulai bekerja.

---

## Istilah: "rilis"

**"Rilis" adalah satu istilah baku di proyek ini.** Kalau user menulis
"rilis", "rilis dong", "tolong dirilis", atau menjawab "ya" atas tawaran
rilis, yang dimaksud adalah **seluruh rangkaian langkah di bawah ini** —
bukan sekadar `git push`.

### Kapan agent menawarkan rilis

Setiap kali sebuah permintaan perubahan dari user **selesai dikerjakan dan
sudah terverifikasi**, agent wajib menawarkan rilis di akhir jawabannya.
Cukup satu kalimat, mis. _"Perubahan sudah selesai. Mau saya rilis?"_

Jangan merilis tanpa persetujuan user. Menawarkan itu wajib; mengeksekusi
harus menunggu "ya".

Jangan menawarkan rilis kalau: pekerjaan belum selesai, build masih gagal,
atau perubahannya tidak menyentuh apa pun yang ikut ke dalam paket rilis
(mis. hanya mengubah `AGENTS.md` atau `README.md`).

### Langkah rilis

1. **Pastikan build lolos** di mesin lokal:
   ```bash
   npm run build
   ```
   Kalau gagal, hentikan. Jangan pernah merilis build yang gagal.

2. **Commit** semua perubahan dengan pesan
   [Conventional Commits](https://www.conventionalcommits.org)
   (`feat:`, `fix:`, `chore:`, `docs:`) — pesan commit inilah yang otomatis
   menjadi changelog rilis, jadi tulis dalam kalimat yang dimengerti user.

3. **Push ke `main`.** Push ke `main` otomatis menjalankan
   `.github/workflows/release.yml`, yang mengerjakan:
   - menaikkan versi `patch` di `package.json` (1.0.3 → 1.0.4)
   - `npm run build` (yang menjalankan `npm run i18n:check` lebih dulu)
   - mengemas `dist/`, `package.json`, `package-lock.json`,
     `ecosystem.config.cjs`, `deploy.sh`, `install.sh`, `.env.example`, dan
     `data/content.json` menjadi **`evkita.zip`**
   - membuat tag `vX.Y.Z` dan **GitHub Release** berisi zip tadi

   `node_modules/` **tidak** ikut ke dalam zip, dan tidak ada langkah
   `npm prune`: seluruh dependensi runtime sudah dibundel ke dalam `dist/`
   lewat `vite.ssr.noExternal` di `astro.config.mjs`. Membawanya berarti
   mengirim ±186 MB toolchain build yang tidak pernah dipakai server.

   Untuk kenaikan **minor/major**, atau kalau perlu catatan rilis tambahan,
   jalankan lewat **Actions → Release → Run workflow** dan pilih
   `patch`/`minor`/`major`.

4. **Tunggu CI selesai dan verifikasi** rilisnya benar-benar jadi:
   ```bash
   gh run watch
   curl -s https://api.github.com/repos/EVKita/EVKita/releases/latest \
     | grep -E '"tag_name"|"name": "evkita.zip"'
   ```
   Rilis dianggap gagal kalau tag ada tapi aset `evkita.zip` tidak ada.

5. **Laporkan ke user**: sebutkan nomor versinya, ringkasan isi perubahannya,
   dan ingatkan bahwa rilis itu sekarang muncul di **Admin → Pembaruan**
   (`/admin/update`).

6. **Beri tahu cara memasangnya.** Cara utama: user membuka
   **Admin → Pembaruan** (`/admin/update`), menekan tombol
   **"Perbarui ke vX.Y.Z"**, lalu menunggu panel progres selesai — halaman
   itu menjalankan `deploy.sh` di server dan menampilkan lognya langsung.

   Cadangan, kalau pembaruan lewat panel gagal (lognya akan menjelaskan
   sebabnya), jalankan manual lewat SSH:
   ```bash
   cd /home/evkita.com/evkita
   bash deploy.sh          # pasang rilis terbaru
   bash deploy.sh 1.2.3    # pasang versi tertentu / mundur ke versi lama
   ```

   Keduanya memakai `deploy.sh` yang sama, yang mem-backup `data/` dan
   `.env` lebih dulu — konten CMS dan kredensial admin tidak hilang.

### Aturan yang tidak boleh dilanggar saat rilis

- **Jangan pernah** menaikkan versi di `package.json` secara manual lalu
  push — CI yang melakukannya. Bump manual membuat versi meloncat dua kali.
- **Jangan** memasukkan `.env`, `data/uploads/`, atau kredensial apa pun ke
  dalam commit. Lihat `.gitignore`.
- Commit `chore: release vX.Y.Z [skip ci]` dibuat oleh bot. Jangan diutak-atik.

---

## Konteks server (produksi)

- Domain: **evkita.com**, di CyberPanel/OpenLiteSpeed, IP `158.69.117.157`.
- Aplikasi ada di `/home/evkita.com/evkita`, dijalankan PM2 dengan nama `evkita`.
- **EVKita memakai port 4322, bukan 4321.** Port 4321 sudah dipakai aplikasi
  Node lain di server yang sama (evdata.id). Jangan mengubah port ini tanpa
  ikut memperbarui `extprocessor evkitanode` di vHost Conf CyberPanel.
- Domain dilayani lewat reverse proxy OpenLiteSpeed (`extprocessor` + `context`
  di vHost Conf), **bukan** `RewriteRule [P,L]` — flag `[P]` milik Apache dan
  tidak bekerja di OLS.
- Aplikasi hanya mendengarkan di `127.0.0.1`, jadi `http://IP-SERVER:4322`
  memang tidak bisa dibuka dari luar. Itu disengaja.

## Aturan umum

- Bahasa yang dipakai di UI, komentar kode, dan pesan commit: **Bahasa Indonesia**.
- Tidak ada kredensial dengan nilai bawaan di dalam kode. Username, password,
  dan `SESSION_SECRET` hanya boleh berasal dari `.env`, yang dibuat oleh
  wizard di `/install`.
- Jalankan `npm run build` sebelum mengklaim sebuah perubahan selesai.

---

## Panel admin: multibahasa & pengguna

Panel admin (`/admin`, `/admin/login`, `/admin/update`) berbahasa **Indonesia,
Inggris, dan Mandarin**. Bahasa Indonesia tetap bawaan.

### Aturan yang tidak boleh dilanggar

**Setiap kali menambah atau mengubah teks apa pun di panel admin — halaman
baru, tombol baru, label field, pesan toast, pesan galat API, judul dialog —
teks itu WAJIB:**

1. punya kunci di **ketiga** kamus: `src/lib/i18n/id.js`, `en.js`, `zh.js`;
2. dipanggil lewat `t("kunci")`, bukan ditulis langsung di kode;
3. lolos `npm run i18n:check`.

`npm run build` menjalankan pemeriksaan itu lebih dulu, jadi build akan **gagal**
kalau ada terjemahan yang tertinggal. Jangan mencoba menyiasatinya.

Ini berlaku dua arah: menambah fitur baru berarti menambah tiga terjemahan;
menghapus fitur berarti menghapus kuncinya dari ketiga kamus.

### Cara kerjanya

- Kamus adalah objek datar `kunci → teks`. Placeholder ditulis `{nama}` dan
  diisi lewat argumen kedua: `t("toast.deleted", { name: judul })`.
- `src/lib/i18n/index.js` berisi `makeT()`, format tanggal/angka per bahasa, dan
  daftar bahasa. Berkas ini JavaScript polos supaya bisa dipakai **dua tempat**:
  frontmatter `.astro` (dirender server) dan `src/scripts/admin.js` (browser).
- Teks yang dirender server diberi atribut `data-i18n="kunci"` (atau
  `data-i18n-ph`, `data-i18n-title`, `data-i18n-aria`). `applyStaticI18n()` di
  `admin.js` memakai atribut itu untuk mengganti bahasa **tanpa memuat ulang
  halaman**. Kalau menambah markup statis, jangan lupa atributnya.
- Daftar yang mengandung teks (label field, filter, urutan) ditulis sebagai
  **fungsi**, bukan konstanta — supaya dibaca ulang setiap render.
- Pesan galat dari API dikirim sebagai **kunci** (`errorKey`), bukan kalimat
  jadi, lalu diterjemahkan klien lewat `apiMessage()`.

### Yang TIDAK diterjemahkan

Nilai yang tersimpan di `data/content.json` dan ikut tampil di situs publik yang
berbahasa Indonesia: tipe bodi (`Hatchback`, `Skuter`), standar pengujian, nama
merek, dan label preset spesifikasi. Menerjemahkannya akan mengubah isi
database. Pola `match` di halaman Pembaruan juga tidak diterjemahkan — ia
dicocokkan ke keluaran `deploy.sh` yang selalu Bahasa Indonesia.

### Menu Tampilan

Seluruh setelan tampilan situs publik — preset, warna, gradien, pola latar,
huruf, sudut membulat, bayangan, gaya kartu, header, tombol, hero, efek, dan
CSS kustom — bermuara ke **`src/lib/theme.js`**, dan hanya ke sana.

- Nilai bawaannya ada di `APPEARANCE_DEFAULTS` / `APPEARANCE_FLAGS` di berkas
  itu; `store.ts` cuma menyebarkannya ke `SITE_DEFAULTS`. Jangan menyalin nilai
  bawaan ke tempat kedua — tombol "Kembalikan ke Bawaan" membacanya dari sana.
- Angka dikirim ke halaman sebagai variabel CSS di atribut `style` `<body>`;
  pilihan yang berupa gaya dikirim sebagai kelas `ui-*`. Aturannya ditulis di
  blok **MENU TAMPILAN** di akhir `global.css`.
- Setiap nilai baru WAJIB lewat penyaring `hex()` / `num()` / `pick()` di
  `theme.js`. Nilainya datang dari panel dan langsung jadi CSS.
- Kotak pratinjau di panel memakai variabel dan kelas yang sama persis. Kalau
  menambah setelan, pastikan pratinjaunya ikut — pratinjau yang berbohong lebih
  buruk daripada tidak ada pratinjau.

### Pengguna & peran

- Akun panel disimpan di **`data/users.json`** (kata sandi ter-hash `scrypt`),
  bukan lagi di `.env`. Pemasangan lama dipindahkan otomatis sekali jalan dari
  `ADMIN_USERNAME`/`ADMIN_PASSWORD`; setelah `data/users.json` ada, isi `.env`
  diabaikan. Berkas ini ikut dicadangkan `deploy.sh`, jadi selamat melewati
  pembaruan versi.
- Tiga peran: **Pemilik** → **Admin** → **Editor**. Editor hanya boleh mengurus
  konten dan pengaturan situs; halaman Pengguna, Cadangan, dan Pembaruan
  tertutup untuknya **di server**, bukan cuma disembunyikan di antarmuka.
  Menambah endpoint baru yang sensitif berarti menambah `can(me, ...)` di sana.
- Token sesi membawa id pengguna (`<userId>.<acak>.<tanda tangan>`), jadi panel
  tahu siapa yang login. Log aktivitas ada di `data/activity.json`.
