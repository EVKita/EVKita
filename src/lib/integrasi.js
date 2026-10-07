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
  /**
   * Cara situs ini diverifikasi di Search Console. Hanya "tag" yang butuh
   * penanda dari kita; "analytics" menumpang tag Google Analytics (Search
   * Console mendeteksinya sendiri saat properti ditambahkan), dan "dns"
   * tinggal di pengaturan domain. Dua yang terakhir tidak bisa ditanyakan ke
   * Google tanpa OAuth, jadi statusnya diturunkan dari pilihan ini.
   */
  gscMetode: "tag",

  /*
   * Login Google pengunjung (opsional, tanpa saklar sendiri).
   *
   * Client ID OAuth dari Google Cloud Console; tombol "Google" di pintu masuk
   * pengunjung hanya dirender bila nilainya sah. Disimpan di berkas yang sama
   * karena sifatnya sama: id publik yang tampil di HTML, bukan rahasia.
   * Rahasianya (client secret) tidak pernah dibutuhkan — token ID
   * diverifikasi server lewat kunci publik Google.
   */
  googleClientId: "",

  /*
   * Akun pengunjung lewat Clerk (clerk.com): daftar, masuk, dan Google.
   *
   * Yang disimpan hanya kunci PUBLISHABLE (`pk_live_…`/`pk_test_…`) — kunci itu
   * memang tercetak di HTML setiap halaman. Kunci rahasianya (`sk_…`) tidak
   * pernah dibutuhkan: data akun tinggal di Clerk, dan situs ini cuma
   * menampilkan tombol dan popupnya. Begitu kunci ini terisi, pintu masuk
   * pengunjung yang lama (email di peramban + Client ID Google) digantikan.
   */
  clerkKey: "",
};

export const KUNCI_TEKS = ["gaId", "adsenseId", "adsTxt", "gscToken", "googleClientId", "clerkKey"];
export const KUNCI_SAKLAR = ["gaAktif", "gaAbaikanAdmin", "adsenseAktif", "adsenseAuto", "gscAktif"];

/** Cara verifikasi Search Console yang dikenal. Yang pertama adalah bawaan. */
export const METODE_GSC = ["tag", "analytics", "dns"];
const metodeGsc = (v) => (METODE_GSC.includes(v) ? v : METODE_GSC[0]);

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
  googleClientId: /^\d{6,30}-[A-Za-z0-9_-]{8,80}\.apps\.googleusercontent\.com$/,
  clerkKey: /^pk_(test|live)_[A-Za-z0-9+/=_-]{12,200}$/,
};

/** Nama host yang sah: huruf kecil, angka, tanda hubung, minimal dua label. */
const POLA_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Host Frontend API Clerk, diturunkan dari kunci publishable.
 *
 * Kuncinya berbentuk `pk_<jenis>_<base64("host$")>` — begitulah clerk-js
 * sendiri menemukan servernya. Host hasil uraian langsung masuk ke atribut
 * `src` skrip dan ke header CSP, jadi ia ikut diperiksa daftar-putih: kunci
 * yang lolos pola tapi isinya bukan nama host dianggap TIDAK SAH, bukan
 * dibersihkan. Mengembalikan "" bila tidak sah.
 */
export function hostClerk(kunci) {
  const k = String(kunci || "");
  if (!POLA.clerkKey.test(k)) return "";
  let teks = "";
  try {
    const isi = k.replace(/^pk_(test|live)_/, "").replace(/-/g, "+").replace(/_/g, "/");
    teks = atob(isi);
  } catch {
    return "";
  }
  if (!teks.endsWith("$")) return "";
  const host = teks.slice(0, -1);
  return host.length <= 253 && POLA_HOST.test(host) ? host : "";
}

/** Membaca berkas pengaturan apa adanya jadi bentuk yang lengkap dan aman. */
export function normalisasi(raw) {
  const out = { ...BAWAAN };
  const src = raw && typeof raw === "object" ? raw : {};
  for (const k of KUNCI_TEKS) out[k] = typeof src[k] === "string" ? src[k].trim() : "";
  for (const k of KUNCI_SAKLAR) out[k] = src[k] === undefined ? BAWAAN[k] : !!src[k];
  out.gscMetode = metodeGsc(src.gscMetode);

  /*
   * Nilai yang tidak lolos pola dianggap tidak ada, dan saklarnya ikut mati.
   * Berkas ini bisa saja disunting tangan lewat SSH; halaman publik tidak boleh
   * menyisipkan apa pun yang berasal dari sana tanpa diperiksa ulang.
   */
  if (!POLA.gaId.test(out.gaId)) { out.gaId = ""; out.gaAktif = false; }
  if (!POLA.adsenseId.test(out.adsenseId)) { out.adsenseId = ""; out.adsenseAktif = false; }
  if (!POLA.gscToken.test(out.gscToken)) { out.gscToken = ""; out.gscAktif = false; }
  /* Client ID yang tidak sah dianggap tidak ada: tombol Google-nya yang
     hilang, bukan halaman yang rusak. */
  if (!POLA.googleClientId.test(out.googleClientId)) out.googleClientId = "";
  if (!hostClerk(out.clerkKey)) out.clerkKey = "";
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
  nilai.gscMetode = metodeGsc(src.gscMetode);

  if (nilai.gaId && !POLA.gaId.test(nilai.gaId)) galat.push("err.integrasi.gaId");
  if (nilai.adsenseId && !POLA.adsenseId.test(nilai.adsenseId)) galat.push("err.integrasi.adsenseId");
  if (nilai.gscToken && !POLA.gscToken.test(nilai.gscToken)) galat.push("err.integrasi.gscToken");
  /* Client ID yang bentuknya salah langsung ditolak di sini, supaya panel
     tidak melaporkan "tersimpan" sementara tombol Google-nya tetap hilang
     (normalisasi akan membuangnya saat dibaca). */
  if (nilai.googleClientId && !POLA.googleClientId.test(nilai.googleClientId)) galat.push("err.integrasi.googleClientId");
  if (nilai.clerkKey && !hostClerk(nilai.clerkKey)) {
    /* Kunci rahasia yang tertempel di sini adalah salah tempel paling mahal:
       ia akan tercetak di setiap halaman publik. Diberi pesan sendiri. */
    galat.push(/^sk_/.test(nilai.clerkKey) ? "err.integrasi.clerkRahasia" : "err.integrasi.clerkKey");
  }

  /*
   * Saklar yang menyala tanpa id adalah keadaan yang paling sering bikin orang
   * kehilangan sore: panel bilang "aktif", halaman tidak memuat apa pun, dan
   * tidak ada satu pun pesan yang menghubungkan keduanya. Jadi ditolak di sini.
   */
  if (nilai.gaAktif && !nilai.gaId) galat.push("err.integrasi.gaKosong");
  if (nilai.adsenseAktif && !nilai.adsenseId) galat.push("err.integrasi.adsenseKosong");
  if (nilai.gscMetode === "tag" && nilai.gscAktif && !nilai.gscToken) galat.push("err.integrasi.gscKosong");
  /* Verifikasi lewat Analytics hidup selama tag Analytics-nya hidup. Mematikan
     Analytics diam-diam mencabut kepemilikan di Search Console beberapa hari
     kemudian, jadi kombinasi itu ditolak di sini, bukan dibiarkan. */
  if (nilai.gscMetode === "analytics" && !(nilai.gaAktif && nilai.gaId)) galat.push("err.integrasi.gscButuhGa");

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
  const out = { script: [], connect: [], frame: [], worker: [] };

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

  /* Tombol login Google memuat pustakanya dari akun Google. */
  if (s.googleClientId) {
    out.script.push("https://accounts.google.com");
    out.frame.push("https://accounts.google.com");
    out.connect.push("https://accounts.google.com");
  }

  /*
   * Clerk: server Frontend API-nya sendiri, Cloudflare Turnstile (perlindungan
   * robot di formulir daftar), dan host anti-penipuan Clerk. Daftarnya
   * mengikuti https://clerk.com/docs/security/clerk-csp. Foto profil dari
   * img.clerk.com sudah tertutup `img-src https:`, dan gaya sebaris yang
   * dipakai komponennya sudah tertutup `style-src 'unsafe-inline'`.
   */
  const clerk = hostClerk(s.clerkKey);
  if (clerk) {
    out.script.push(`https://${clerk}`, "https://challenges.cloudflare.com", "https://*.protect.clerk.com");
    out.connect.push(`https://${clerk}`, "https://*.protect.clerk.com");
    out.frame.push("https://challenges.cloudflare.com", "https://*.protect.clerk.com");
    out.worker.push("'self'", "blob:");
  }

  return out;
}

/** Apakah penanda `google-site-verification` perlu disisipkan? */
export function pakaiTagGsc(cfg) {
  const s = normalisasi(cfg);
  return s.gscMetode === "tag" && s.gscAktif && !!s.gscToken;
}

/**
 * Status Search Console untuk panel: `{ aktif, lewat }`.
 *
 * Untuk "tag" artinya penandanya terpasang; untuk "analytics" artinya tag
 * Analytics — yang dibaca Google sebagai bukti kepemilikan — terpasang; untuk
 * "dns" verifikasinya tidak bergantung pada situs sama sekali.
 */
export function statusGsc(cfg) {
  const s = normalisasi(cfg);
  if (s.gscMetode === "analytics") return { aktif: s.gaAktif && !!s.gaId, lewat: "analytics" };
  if (s.gscMetode === "dns") return { aktif: true, lewat: "dns" };
  return { aktif: pakaiTagGsc(s), lewat: "tag" };
}

/** Apakah ada satu pun tag yang perlu disisipkan? Dipakai untuk melewati kerja sia-sia. */
export function adaTag(cfg) {
  const s = normalisasi(cfg);
  return s.gaAktif || s.adsenseAktif || pakaiTagGsc(s);
}
