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

### Footer

Isi footer diatur dari **Pengaturan Situs → Footer**, dan bermuara ke dua
tempat: `src/lib/footer.js` (daftar ikon sosial, baris kontak, batas jumlah,
dan normalisasi menu) serta `src/components/SiteFooter.astro` (yang
menggambarnya).

- Menambah jejaring sosial atau baris kontak = satu baris di `SOCIAL_NETWORKS` /
  `CONTACT_ROWS`, satu nilai bawaan di `SITE_DEFAULTS`, satu input di panel,
  dan tiga terjemahan. Ikonnya ditulis sebagai isi `<svg>` tanpa pembungkusnya.
- `site.footerMenus` dan `site.footerLegal` adalah **satu-satunya** field `site`
  yang berupa larik. Keduanya dinormalkan `normalizeMenus()` / `normalizeLinks()`
  di `footer.js` — fungsi yang sama dipakai `store.ts` (server) dan `admin.js`
  (panel), jadi batas jumlah dan bentuk barisnya tidak bisa berbeda di antara
  keduanya. Ujinya ada di `tests/footer.test.ts`.
- Alamat tautan disimpan apa adanya; penyaring skema `safeUrl()` dipasang di
  titik render, bukan saat menyimpan. Jangan menyaring dua kali.
- Tiap blok footer punya saklar `show*` sendiri. Blok yang datanya kosong tidak
  pernah tampil, jadi footer situs yang baru dipasang tetap rapi.

### Halaman statis (Tentang, Kebijakan Privasi, Disclaimer)

Koleksi keenam, `content.halaman`, disunting lewat **Admin → Halaman**. Semua
aturannya bermuara ke **`src/lib/laman.js`** — normalisasi, slug, letak footer,
penanda `{brand}`/`{tahun}`, dan templat bawaan.

- **Satu halaman = satu alamat di AKAR situs** (`/kebijakan-privasi`), dilayani
  `src/pages/[slug].astro`. Rute itu sekaligus yang menjawab setiap alamat yang
  tidak dikenali rute lain, jadi 404 di akar situs kini punya header dan footer.
- **`SLUG_TERPAKAI` wajib ikut tumbuh setiap kali ada rute baru di akar
  `src/pages/`.** Rute statis memang menang atas `[slug].astro`, jadi halaman
  berslug `katalog` tidak bisa menimpa katalog yang asli — ia cuma tidak akan
  pernah terbuka, tanpa satu pun pesan galat. Panel menolaknya saat disimpan;
  daftar itulah yang dipakai.
- **Slug adalah ALAMAT, jadi ia diperiksa, bukan diam-diam dibetulkan.** Kosong,
  bentrok dengan rute, atau kembar dengan halaman lain: ketiganya menolak simpan
  dengan pesan sendiri. `ensureSlugs()` di `store.ts` hanya jaring pengaman untuk
  berkas yang disunting tangan lewat SSH.
- **Isinya Markdown**, dirender `src/lib/markdown.ts` — berkas yang sama dengan
  catatan rilis. Penyunting HTML utuh berarti menerima HTML sembarang dari peran
  Editor, dan itu tidak sepadan dengan apa pun yang didapat.
- **Footer diputuskan `tautanFooter()`, bukan di panel.** `SiteFooter.astro`
  memanggilnya langsung (dan membaca `content` sendiri, bukan lewat prop —
  footernya dipasang di tujuh tempat, dua di antaranya komponen yang tidak
  pernah menyentuh `content`). Tiap halaman punya saklar `showInFooter`
  (bawaannya **menyala**) dan pilihan letak `footerSlot`: `legal` untuk bilah
  bawah, `menu` untuk kolom Jelajahi.
- **Aturan tayang sama dengan koleksi lain** (`tayang.js`): halaman draf dan
  yang belum tiba jadwalnya tidak tampil di footer, tidak masuk peta situs, dan
  menjawab 404 — kecuali lewat tautan pratinjau. Untuk halaman, tokennya
  menandatangani `id` sementara alamatnya memakai `slug`, supaya mengganti
  alamat tidak mematikan tautan yang sudah dikirim.
- **Templat bawaan hanya disemai kalau kunci `halaman` BELUM PERNAH ADA** di
  dokumen, bukan kalau daftarnya kosong. Pemilik situs yang sengaja menghapus
  semua halamannya tidak akan menemukannya tumbuh kembali. Isinya templat, bukan
  nasihat hukum, dan panel mengatakan itu di subjudul halamannya.

### Fitur AI (DeepSeek)

Rancangan lengkapnya ada di **`RENCANA-AI-DEEPSEEK.md`**. Yang sudah berjalan
baru Tahap 0a: halaman **Admin → AI** untuk memasang kunci API DeepSeek.

- **Kunci API tidak pernah dimasukkan dengan menyunting `.env` lewat SSH.** Ia
  masuk lewat panel, dan `/api/ai/pengaturan` **menguji kunci itu ke DeepSeek
  lebih dulu** (`GET /user/balance`) sebelum menyimpannya. Kunci yang salah
  ketik harus gagal di detik itu, bukan berhari-hari kemudian.
- **Endpoint itu tidak pernah mengembalikan kuncinya.** Yang keluar hanya
  `terpasang`, empat karakter terakhir, dan saldo. Menambahkan field baru yang
  memuat kuncinya akan membuat ia sampai ke DOM — jangan.
- `writeEnvFile()` sekarang meng-`chmod 0600` `.env` setiap kali menulis, dan
  nilai `null` menghapus barisnya, bukan menuliskannya sebagai nilai kosong.
- `src/lib/deepseek.ts` adalah **satu-satunya** berkas yang tahu bentuk API
  DeepSeek. Nama model dan bentuk permintaan berubah cukup sering — pada Juli
  2026 `deepseek-chat` dan `deepseek-reasoner` dimatikan seluruhnya. Sisa
  sistem bicara dengan tipe di berkas itu, bukan dengan DeepSeek langsung.
- Dua kemampuan terpisah di `CAPABILITY_ROLES`: `ai` (memasang kunci dan
  mengatur model bawaan) untuk pemilik + admin, dan `ai.run` (menjalankan riset)
  untuk ketiga peran. Yang menahan pengeluaran adalah kuota harian, bukan peran.

**Riset kendaraan (Tahap 1).** Tombol "Riset dengan AI" di editor kendaraan.

- **Keluaran AI tidak pernah disimpan.** Ia jadi usulan yang ditampilkan
  berdampingan dengan nilai sekarang, dan "Terapkan" hanya MENGISI FORMULIR.
  Jalur simpan yang sudah ada tetap satu-satunya jalan ke `content.json`.
- **Field yang tidak boleh diisi AI tidak ada di dalam skema JSON**, bukan
  sekadar dilarang lewat kalimat prompt. Daftarnya di `NEVER_RESEARCHED`
  (`src/lib/vehicle-spec.js`), dan `tests/ai-skema.test.ts` membuktikan tak satu
  pun bocor. Deskripsi, tagline, dan sorotan termasuk di dalamnya — itu suara
  situs, ditulis manusia.
- **Hasil pencarian web adalah konten tak tepercaya.** `src/lib/ai-usulan.js`
  membuang nilai di luar batas wajar, membakukan ejaan pilihan ke daftar kita
  sendiri, menyaring alamat sumber lewat `safeUrl()`, dan membuang kunci asing
  tanpa jejak. Kalau dua pembacaan angka sama-sama masuk akal, nilainya dibuang
  — tidak ditebak.
- **Riset berjalan dua langkah kalau perlu.** `web_search` dan
  `text.format: json_schema` ternyata TIDAK akur — dokumentasi DeepSeek
  menyatakan keduanya didukung, tapi ketika dipakai bersamaan model menjawab
  dengan kalimat biasa, bukan JSON. Jawaban mentah itu tidak dibuang: ia
  dikirim ke `rapikanJadiJson()`, yang menyusunnya jadi bentuk yang benar
  tanpa mencari apa pun lagi. Jawaban yang TERPOTONG karena kehabisan token
  juga lewat jalur yang sama — potongannya disimpan, bukan dibuang.
  **`rapikanJadiJson()` sengaja memakai Chat Completions dengan
  `response_format: json_object`, bukan Responses API dengan `json_schema`.**
  `json_object` satu-satunya bentuk keluaran terstruktur yang punya contoh
  berjalan di dokumentasi DeepSeek; `json_schema` sudah terbukti tidak
  ditegakkan di jalur ini, dan jalur cadangan yang memakai mekanisme yang baru
  saja gagal bukan jalur cadangan. Jangan menyatukan keduanya.
- **Job hidup di server, bukan di dalam kotak dialog.** Menutup kotak riset,
  berpindah halaman, atau memuat ulang panel tidak membuang apa pun:
  `GET /api/ai/riset` tanpa id mengembalikan `terakhir`, dan panel menyambung
  ulang ke riset yang sedang berjalan atau yang hasilnya belum sempat dilihat —
  untuk kendaraan yang sama saja.
- **`pollAiRiset()` dibungkus try/catch sampai ke ujungnya.** Ia dipanggil
  `setInterval`, jadi pengecualian apa pun di dalamnya jadi penolakan janji yang
  tidak tertangkap: tidak muncul di mana pun, tidak menghentikan apa pun, dan
  meninggalkan kotak riset membeku selamanya di layar progres. Itu pernah
  terjadi sungguhan, karena satu baris membaca `hasil.usulan` pada `hasil` yang
  kosong.
- **Panel menanya-kabar berulang (polling), bukan SSE.** Reverse proxy
  OpenLiteSpeed mem-buffer aliran peristiwa; server yang membaca SSE dari
  DeepSeek dan mengubahnya jadi linimasa yang bisa dibaca ulang.
- **Kuota dikembalikan kalau tidak ada token yang terpakai** — kunci ditolak,
  DeepSeek tumbang, jaringan putus. Riset yang dibatalkan setelah sempat
  memakai token tetap dihitung.
- Tarif dan jam sibuk DeepSeek ada di `src/lib/ai-biaya.js`, dan **hanya di
  sana**. Jam sibuknya jatuh persis di jam kerja WIB, jadi angka biaya yang
  ditampilkan selalu menghitung tarif yang berlaku saat itu.

### Yang tidak boleh dilanggar di subsistem baru

Semuanya lahir dari sesi ini dan punya satu sifat yang sama: keputusannya ada
di SERVER, bukan di panel.

- **Pratinjau draf** (`src/lib/pratinjau.ts`). Token ditandatangani
  `SESSION_SECRET`, berlaku untuk satu kendaraan, dan mati dalam dua jam.
  Diterbitkan `/api/pratinjau`, tidak pernah di browser — rahasianya tidak
  boleh sampai ke sana.
- **"Boleh dilihat pengunjung?"** hanya dijawab `src/lib/tayang.js`. Aturannya
  dulu ditulis ulang di sembilan halaman; jangan menambah yang kesepuluh.
- **Log perubahan** (`src/lib/perubahan.ts`) membandingkan dokumen di server.
  Panel tidak pernah melaporkan apa yang diubahnya sendiri. Penyimpanan
  beruntun digabung dan tindakan massal diringkas di `activity.ts` — dua aturan
  itu yang membuat log ini bisa dibaca sama sekali.
- **Stempel `updatedAt`/`updatedBy`** dipasang server, hanya pada item yang
  isinya benar-benar berbeda. Jangan menstempel di panel.
- **Berkas unggahan tidak ikut dicadangkan.** `data/backups/` cuma menyimpan
  `content.json`, jadi penghapusan berkas tidak punya tombol urung. Yang
  menentukan sebuah berkas yatim adalah `src/lib/uploads.ts` di server — dan ia
  wajib ikut memeriksa foto profil di `data/users.json`, yang tidak ada di
  `content.json` sama sekali.
- **Gambar dikecilkan di peramban** (`src/scripts/gambar.js`), memakai
  `createImageBitmap()`. JANGAN kembali ke `<img src=URL.createObjectURL()>`:
  CSP panel ini tidak mengizinkan `blob:` di `img-src`, dan kegagalannya tidak
  terlihat di mana pun karena pengoptimalan yang gagal memang mengembalikan
  berkas aslinya. Format keluarannya AVIF kalau peramban bisa menulisnya, WebP
  kalau tidak — keduanya benar-benar dicoba lalu yang berkasnya paling kecil
  yang dipakai. `toBlob()` untuk tipe yang tidak didukung mengembalikan PNG,
  bukan null, jadi tipe blob hasilnya WAJIB diperiksa: tanpa itu PNG raksasa
  bisa tersimpan dengan akhiran `.avif`.
- **Gambar dari situs lain diambil server, lalu jadi berkas kita**
  (`src/pages/api/gambar-url.ts` + `src/lib/gambar-url.js`). Endpoint itu tidak
  menulis apa pun ke disk: ia mengembalikan byte-nya ke panel, panel
  mengubahnya ke AVIF/WebP, dan `/api/upload` tetap satu-satunya pintu ke
  `data/uploads/`. Yang menembus batas domain memang harus server — peramban
  dihalang CORS dan `connect-src 'self'` — dan karena itu penyaring alamatnya
  tidak boleh dilonggarkan: hanya http/https, hanya port 80/443, tanpa
  kredensial, hanya nama domain (BUKAN alamat IP, dalam bentuk apa pun), dan
  setiap loncatan pengalihan diperiksa ulang termasuk hasil penerjemahan DNS-nya.
  Melewatkan satu saja membuat server ini bisa disuruh membaca
  `http://169.254.169.254/` atau `/api/users`-nya sendiri. Ujinya di
  `tests/gambar-url.test.ts`.
- **Kotak konfirmasi** selalu `src/scripts/konfirmasi.js`, tidak pernah
  `window.confirm()`. Ia membangun DOM-nya sendiri supaya halaman Pembaruan
  bisa memakainya tanpa memuat seluruh CMS.
- **Dua faktor** (`src/lib/totp.ts`). `totpSecret` dan `backupCodes` TIDAK
  BOLEH keluar lewat `publicUser()` — memeriksanya adalah hal pertama yang
  dilakukan kalau bentuk `User` berubah. Kode cadangan disimpan ter-hash dan
  dihapus begitu dipakai. Ujinya memakai vektor resmi RFC 6238, bukan keluaran
  implementasinya sendiri.
- **Impor CSV** membaca berkas dengan `readAsText(file, "utf-8")` yang
  eksplisit. Lihat DATA-9: satu nama merek di `content.json` sudah pernah rusak
  karena UTF-8 dibaca sebagai Latin-1, dan jalur impor adalah tempat kesalahan
  seperti itu masuk.
- **`renderAll()` hanya menggambar tampilan yang terlihat.** Yang dilewati
  ditandai basi lewat `perluGambar` dan digambar saat dibuka. Menambah tampilan
  baru berarti menambahnya ke daftar itu.

### Analitik & Integrasi Google

Dua halaman yang lahir bersamaan dan saling menunjuk. Yang satu menghitung
sendiri, yang lain memasang alat ukur Google — dan keduanya sengaja tidak
saling menggantikan.

**Analitik** (`/admin#/analitik`) membaca pencatatan server ini sendiri.

- **Aturan pencatatannya ada di `src/lib/trafik.js`, dan hanya di sana** —
  mana yang robot, golongan perangkat, alamat halaman yang layak dihitung, dan
  domain perujuk. Berkas itu murni (tanpa Node), jadi ujinya di
  `tests/trafik.test.ts` menyentuh aturan yang sama persis dengan yang dipakai
  server.
- **Tidak ada satu baris log pun.** `src/lib/trafik-rekam.ts` cuma menambah
  angka di memori dan menuliskannya paling cepat sepuluh detik sekali ke
  `data/trafik/<bulan>.json`. Alamat IP tidak pernah menyentuh disk: ia dipakai
  sekejap untuk sidik ber-garam HARIAN, dan sidik itu pun dibuang begitu
  harinya berganti — yang tersisa hanya jumlahnya. Jangan menambahkan field
  yang menyimpan IP, User-Agent, atau apa pun yang berbentuk "satu baris per
  orang".
- **Hari dan jam memakai WIB yang dipatok**, bukan zona waktu server (yang di
  produksi UTC). Tanpa itu "hari ini" berganti pukul tujuh pagi dan grafik per
  jam bergeser tujuh jam dari kenyataan.
- **Kunjungan yang tidak dihitung**: robot (masuk ember `bot` sendiri),
  pratinjau draf, dan siapa pun yang membawa cookie sesi panel. Saringannya di
  `layakDicatat()` di `middleware.ts`; `rapikanPath()` yang membuang `/admin`,
  `/api`, dan berkas.
- Angka `pengunjung` adalah pengunjung HARIAN yang dijumlahkan, bukan orang
  unik sepanjang rentang. Labelnya di panel menyebut itu; jangan mengubah
  labelnya tanpa mengubah cara menghitungnya.

**Integrasi** (`/admin/integrasi`) memasang tag Google.

- **Halaman sendiri, bukan tampilan di dalam `/admin`** — sama alasannya dengan
  halaman Pembaruan: isinya tidak menyentuh `content.json`, jadi tidak ada
  gunanya memuat seluruh CMS untuk formulir berisi tiga id. Ia memakai
  `admin-shell.js` dan menerima teks lewat `define:vars`, jadi namanya WAJIB
  ada di `PANEL_FILES` di `tools/i18n-check.mjs`.
- Pengaturannya tinggal di `data/integrasi.json`, bukan di `content.json`:
  dibaca di setiap permintaan halaman publik dan di middleware, dan tidak punya
  urusan dengan nomor revisi dokumen konten.
- **Nilainya langsung menjadi bagian dari `<script>` di halaman publik.** Karena
  itu `POLA` di `src/lib/integrasi.js` seluruhnya daftar-putih, dan nilai yang
  tidak berbentuk id sah DITOLAK — bukan dibersihkan lalu dipakai.
  `normalisasi()` memeriksa ulang saat MEMBACA berkas, karena berkas itu bisa
  disunting tangan lewat SSH.
- **CSP mengikuti integrasi yang menyala.** `hostCsp()` yang menentukan domain
  mana yang dibuka, dan `cspUntuk()` di `middleware.ts` hanya melonggarkannya
  untuk halaman publik. Menambah layanan baru berarti menambah domainnya di
  situ juga — kalau tidak, tagnya "tersimpan" lalu diblokir peramban tanpa satu
  pun pesan di panel.
- Tag tidak pernah dimuat di halaman panel (`Base.astro` menyalakannya hanya
  saat ada `site` tanpa `accentOnly`), dan Analytics juga dilewati untuk orang
  yang sedang masuk ke panel. Karena itu tombol "Periksa pemasangan" memakai
  `credentials: "omit"` — memeriksa sambil membawa cookie sesi berarti
  memeriksa halaman versi admin, yang memang tidak punya tagnya.
- `/ads.txt` dirakit saat diminta dan menjawab 404 saat AdSense mati: berkas
  ads.txt kosong punya arti sendiri di mata perayap Google.

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
