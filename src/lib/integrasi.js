/**
 * Integrasi Google — Analytics, AdSense, Search Console.
 *
 * Berkas ini bagian yang MURNI: bentuk pengaturannya, penyaringnya, dan
 * potongan kode yang disisipkan ke halaman. Tidak ada berkas dan tidak ada
 * jaringan di sini, sehingga aturan mainnya bisa diuji sendiri dan dipakai
 * sama persis oleh panel (yang memvalidasi sebelum menyimpan) dan situs publik
 * (yang menyisipkan tagnya).
 *
 * ATURAN YANG MEMEGANG SELURUH FITUR INI:
 *
 *   Nilai yang masuk dari panel LANGSUNG menjadi bagian dari `<script>` di
 *   setiap halaman publik. Karena itu tidak ada satu pun nilai yang disimpan
 *   apa adanya: semuanya harus lolos pola di `POLA` di bawah, yang seluruhnya
 *   daftar-putih karakter. Sebuah id pengukuran yang mengandung kutip atau
 *   tanda kurang-dari tidak "dibersihkan", melainkan DITOLAK.
 */

/** Bentuk lengkap pengaturan integrasi, sekaligus nilai bawaannya. */
export const BAWAAN = {
  // Google Analytics 4
  gaAktif: false,
  gaId: "",
  /** Jangan kirim kunjungan orang yang sedang masuk ke panel. */
  gaAbaikanAdmin: true,

  // Google AdSense
  adsenseAktif: false,
  adsenseId: "",
  /** Iklan otomatis: Google yang memilih sendiri posisinya di halaman. */
  adsenseAuto: true,
  /** Isi ads.txt. Kosong berarti dirakit dari id penayang. */
  adsTxt: "",

  // Google Search Console
  gscAktif: false,
  gscToken: "",
};

export const KUNCI_TEKS = ["gaId", "adsenseId", "adsTxt", "gscToken"];
export const KUNCI_SAKLAR = ["gaAktif", "gaAbaikanAdmin", "adsenseAktif", "adsenseAuto", "gscAktif"];

/**
 * Pola yang harus dipenuhi tiap nilai. Seluruhnya daftar-putih.
 *
 * `gaId` menerima tiga bentuk yang semuanya masih beredar: `G-` (GA4, yang
 * dipakai pemasangan baru), `UA-` (Universal Analytics, sudah dimatikan tapi
 * masih tertulis di banyak catatan), dan `GT-` (tag Google umum). Menolak dua
 * yang terakhir berarti memaksa orang menebak kenapa idnya "tidak sah".
 */
export const POLA = {
  gaId: /^(G-[A-Z0-9]{4,20}|UA-\d{4,12}-\d{1,4}|GT-[A-Z0-9]{4,20})$/,
  adsenseId: /^ca-pub-\d{10,20}$/,
  gscToken: /^[A-Za-z0-9_-]{20,100}$/,
};

/** Membaca berkas pengaturan apa adanya jadi bentuk yang lengkap dan aman. */
export function normalisasi(raw) {
  const out = { ...BAWAAN };
  const src = raw && typeof raw === "object" ? raw : {};
  for (const k of KUNCI_TEKS) out[k] = typeof src[k] === "string" ? src[k].trim() : "";
  for (const k of KUNCI_SAKLAR) out[k] = src[k] === undefined ? BAWAAN[k] : !!src[k];

  /*
   * Nilai yang tidak lolos pola dianggap tidak ada, dan saklarnya ikut mati.
   * Berkas ini bisa saja disunting tangan lewat SSH; halaman publik tidak boleh
   * menyisipkan apa pun yang berasal dari sana tanpa diperiksa ulang.
   */
  if (!POLA.gaId.test(out.gaId)) { out.gaId = ""; out.gaAktif = false; }
  if (!POLA.adsenseId.test(out.adsenseId)) { out.adsenseId = ""; out.adsenseAktif = false; }
  if (!POLA.gscToken.test(out.gscToken)) { out.gscToken = ""; out.gscAktif = false; }
  out.adsTxt = bersihkanAdsTxt(out.adsTxt);
  return out;
}

/**
 * Memeriksa apa yang dikirim panel. Mengembalikan daftar kunci galat
 * terjemahan, bukan kalimat jadi — panel berbahasa tiga.
 */
export function periksa(masuk) {
  const galat = [];
  const nilai = { ...BAWAAN };
  const src = masuk && typeof masuk === "object" ? masuk : {};

  for (const k of KUNCI_TEKS) nilai[k] = String(src[k] === undefined ? "" : src[k]).trim();
  for (const k of KUNCI_SAKLAR) nilai[k] = !!src[k];

  if (nilai.gaId && !POLA.gaId.test(nilai.gaId)) galat.push("err.integrasi.gaId");
  if (nilai.adsenseId && !POLA.adsenseId.test(nilai.adsenseId)) galat.push("err.integrasi.adsenseId");
  if (nilai.gscToken && !POLA.gscToken.test(nilai.gscToken)) galat.push("err.integrasi.gscToken");

  /*
   * Saklar yang menyala tanpa id adalah keadaan yang paling sering bikin orang
   * kehilangan sore: panel bilang "aktif", halaman tidak memuat apa pun, dan
   * tidak ada satu pun pesan yang menghubungkan keduanya. Jadi ditolak di sini.
   */
  if (nilai.gaAktif && !nilai.gaId) galat.push("err.integrasi.gaKosong");
  if (nilai.adsenseAktif && !nilai.adsenseId) galat.push("err.integrasi.adsenseKosong");
  if (nilai.gscAktif && !nilai.gscToken) galat.push("err.integrasi.gscKosong");

  if (nilai.adsTxt.length > 4000) galat.push("err.integrasi.adsTxtPanjang");
  nilai.adsTxt = bersihkanAdsTxt(nilai.adsTxt);

  return { nilai, galat };
}

/**
 * ads.txt hanya boleh berisi baris ads.txt.
 *
 * Isinya disajikan mentah di `/ads.txt`, jadi ia disaring per baris: karakter
 * di luar daftar-putih membuang barisnya, bukan cuma karakternya. Baris yang
 * separuh benar lebih berbahaya daripada baris yang hilang — Google membacanya
 * sebagai penayang lain.
 */
export function bersihkanAdsTxt(teks) {
  return String(teks || "")
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b && /^[A-Za-z0-9 ,.:;=_@#/+-]+$/.test(b))
    .slice(0, 100)
    .join("\n");
}

/** Isi ads.txt yang benar-benar disajikan: yang ditulis sendiri, atau baris bawaan Google. */
export function isiAdsTxt(cfg) {
  const s = normalisasi(cfg);
  if (!s.adsenseAktif || !s.adsenseId) return "";
  if (s.adsTxt) return `${s.adsTxt}\n`;
  // Bentuk baku dari Google: <domain>, <id penayang>, DIRECT, <id sertifikasi>.
  return `google.com, pub-${s.adsenseId.slice("ca-pub-".length)}, DIRECT, f08c47fec0942fa0\n`;
}

/* ------------------------------------------------------------------ *
 * Potongan kode yang disisipkan ke halaman
 * ------------------------------------------------------------------ */

/**
 * Domain yang harus dibuka di CSP kalau integrasinya menyala.
 *
 * Dipusatkan di sini, bukan di `middleware.ts`, karena inilah tempat yang tahu
 * skrip apa yang benar-benar disisipkan. CSP yang dilonggarkan untuk fitur
 * yang tidak dipakai adalah longgar tanpa alasan.
 */
export function hostCsp(cfg) {
  const s = normalisasi(cfg);
  /*
   * Tidak ada daftar `img`: `img-src` sudah memuat `https:` untuk gambar
   * kendaraan dari domain pabrikan, jadi piksel pelacak Google sudah lewat.
   * Menuliskannya lagi hanya memanjangkan header tanpa mengubah apa pun.
   */
  const out = { script: [], connect: [], frame: [] };

  if (s.gaAktif) {
    out.script.push("https://www.googletagmanager.com");
    out.connect.push("https://www.google-analytics.com", "https://analytics.google.com", "https://*.analytics.google.com", "https://*.google-analytics.com");
  }

  if (s.adsenseAktif) {
    out.script.push(
      "https://pagead2.googlesyndication.com",
      "https://partner.googleadservices.com",
      "https://tpc.googlesyndication.com",
      "https://www.googletagservices.com",
      "https://adservice.google.com"
    );
    out.connect.push("https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net", "https://ep1.adtrafficquality.google");
    out.frame.push(
      "https://googleads.g.doubleclick.net",
      "https://tpc.googlesyndication.com",
      "https://www.google.com",
      "https://ep2.adtrafficquality.google"
    );
  }

  return out;
}

/** Apakah ada satu pun tag yang perlu disisipkan? Dipakai untuk melewati kerja sia-sia. */
export function adaTag(cfg) {
  const s = normalisasi(cfg);
  return s.gaAktif || s.adsenseAktif || s.gscAktif;
}
