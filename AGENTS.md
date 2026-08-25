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
   - `npm run build`
   - `npm prune --omit=dev`
   - mengemas `dist/`, `node_modules/`, `package.json`, `ecosystem.config.cjs`,
     `deploy.sh`, `install.sh`, `.env.example`, dan `data/content.json` menjadi **`evkita.zip`**
   - membuat tag `vX.Y.Z` dan **GitHub Release** berisi zip tadi

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

6. **Beri tahu cara memasangnya di server.** Halaman Pembaruan saat ini hanya
   *menampilkan* rilis — belum bisa memasang sendiri. Pemasangan dijalankan
   di server lewat SSH:
   ```bash
   cd /home/evkita.com/evkita
   bash deploy.sh          # pasang rilis terbaru
   bash deploy.sh 1.2.3    # pasang versi tertentu
   ```
   `deploy.sh` mem-backup `data/` dan `.env` dulu, jadi konten CMS dan
   kredensial admin tidak hilang.

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
