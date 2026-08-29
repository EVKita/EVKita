/**
 * Statistik kunjungan situs — bagian yang murni, tanpa berkas dan tanpa Node.
 *
 * Dipisah dari `trafik-rekam.ts` dengan alasan yang sama seperti `ai-biaya.js`
 * dipisah dari `ai-jobs.ts`: aturan main statistiknya (mana yang dihitung
 * pengunjung, mana yang robot, bagaimana sehari diringkas) harus bisa diuji
 * tanpa menyentuh disk, dan harus sama persis di sisi yang menulis maupun
 * sisi yang membaca.
 *
 * KEPUTUSAN DASAR: pencatatan ini milik sendiri, bukan tempelan Google.
 * Panel Analitik menghitung dari berkas di server ini — tidak ada satu pun
 * permintaan ke luar, tidak ada cookie yang ditanam ke pembaca, dan tidak ada
 * alamat IP yang tersimpan. Yang disimpan cuma angka. Google Analytics tetap
 * bisa dipasang lewat halaman Integrasi, dan keduanya memang menjawab
 * pertanyaan yang berbeda: yang ini selalu ada meski pembaca memblokir skrip
 * pihak ketiga, yang itu membawa laporan Google yang jauh lebih dalam.
 */

/**
 * Zona waktu laporan: WIB (UTC+7), dipatok, bukan zona waktu server.
 *
 * Server produksi berjalan di UTC. Tanpa pematokan ini, "hari ini" di panel
 * berganti pukul tujuh pagi WIB — persis di tengah jam sibuk situs — dan grafik
 * per jam akan menggeser seluruh puncaknya tujuh jam dari kenyataan.
 */
export const OFFSET_WIB_MENIT = 7 * 60;

/** Berapa halaman dan rujukan teratas yang disimpan per hari. */
export const BATAS_HALAMAN = 300;
export const BATAS_RUJUKAN = 150;

/** Panjang sidik pengunjung yang disimpan sementara. Lihat catatan di `sidik()`. */
export const PANJANG_SIDIK = 12;

/** Rujukan kosong disimpan sebagai kunci ini, dan diterjemahkan di panel. */
export const RUJUKAN_LANGSUNG = "";

export const PERANGKAT = ["ponsel", "tablet", "desktop"];

const POLA_BOT =
  /bot|crawler|crawling|spider|slurp|mediapartners|adsbot|feedfetcher|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|embedly|quora link preview|pinterest|redditbot|applebot|petalbot|yandex|baiduspider|sogou|semrush|ahrefs|mj12|dotbot|dataforseo|serpstat|screaming frog|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|python-requests|scrapy|curl\/|wget\/|go-http-client|okhttp|java\/|libwww|httpclient|axios\/|node-fetch|uptime|pingdom|monitoring|statuscake|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic-ai|perplexitybot|ccbot|bytespider|amazonbot|google-extended/i;

/**
 * Apakah kunjungan ini datang dari robot?
 *
 * Sengaja longgar sebelah: yang keliru ditandai robot cuma hilang dari angka,
 * sedangkan robot yang lolos IKUT menaikkan angka dan membuat seluruh laporan
 * berbohong ke arah yang menyenangkan. Dari dua kesalahan itu, yang kedua jauh
 * lebih mahal — karena tidak ada yang mempertanyakan angka yang naik.
 *
 * Robot tetap dihitung, hanya di ember sendiri (`bot`), supaya lonjakan
 * perayapan tetap kelihatan sebagai lonjakan perayapan.
 */
export function apakahBot(userAgent) {
  const ua = String(userAgent || "");
  if (!ua.trim()) return true; // Peramban sungguhan selalu mengirim User-Agent.
  return POLA_BOT.test(ua);
}

/** Golongan perangkat, dibaca dari User-Agent. Tiga golongan saja — cukup untuk keputusan tata letak. */
export function jenisPerangkat(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "ponsel";
  return "desktop";
}

/**
 * Alamat halaman yang layak disimpan, atau null kalau kunjungan ini tidak
 * boleh masuk hitungan sama sekali.
 *
 * Yang dibuang: panel, wizard pemasangan, seluruh API, dan apa pun yang
 * berupa berkas (punya ekstensi). Halaman pratinjau draf juga dibuang — ia
 * hanya bisa dibuka penyunting yang membawa token, dan menghitung kunjungan
 * sendiri sebagai lalu lintas adalah cara tercepat membuat laporan ini tidak
 * bisa dipercaya.
 */
export function rapikanPath(pathname) {
  let p = String(pathname || "");
  if (!p.startsWith("/")) return null;
  // Query dan fragmen tidak ikut: `?merek=byd` di beranda bukan halaman lain.
  p = p.split("?")[0].split("#")[0];
  if (/^\/(admin|install|api)(\/|$)/.test(p)) return null;
  if (/^\/_/.test(p)) return null;
  const akhir = p.slice(p.lastIndexOf("/") + 1);
  if (akhir.includes(".")) return null;
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return p.length > 120 ? p.slice(0, 120) : p;
}

/**
 * Domain perujuk, atau `RUJUKAN_LANGSUNG` untuk kunjungan tanpa perujuk.
 *
 * Perujuk dari domain sendiri dibuang: berpindah halaman di dalam situs bukan
 * "sumber lalu lintas", dan kalau ikut dihitung ia akan selalu jadi nomor satu
 * di daftar — mengubur satu-satunya angka yang berguna di sana.
 */
export function asalRujukan(referrer, hostSendiri) {
  const raw = String(referrer || "").trim();
  if (!raw) return RUJUKAN_LANGSUNG;
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return RUJUKAN_LANGSUNG;
  }
  if (!host) return RUJUKAN_LANGSUNG;
  const sendiri = String(hostSendiri || "").toLowerCase().replace(/^www\./, "");
  if (sendiri && host.replace(/^www\./, "") === sendiri) return RUJUKAN_LANGSUNG;
  return host.replace(/^www\./, "").slice(0, 80);
}

/* ------------------------------------------------------------------ *
 * Waktu
 * ------------------------------------------------------------------ */

function geser(date) {
  return new Date(date.getTime() + OFFSET_WIB_MENIT * 60 * 1000);
}

/** "2026-08-29" menurut WIB. */
export function hariWib(date = new Date()) {
  return geser(date).toISOString().slice(0, 10);
}

/** Jam 0–23 menurut WIB. */
export function jamWib(date = new Date()) {
  return geser(date).getUTCHours();
}

/** "2026-08" dari sebuah tanggal WIB. */
export function bulanDari(hari) {
  return String(hari).slice(0, 7);
}

/** Hari ke-n sebelum `hari` ("2026-08-29" → "2026-08-22"), tetap dalam kalender WIB. */
export function mundurHari(hari, n) {
  const d = new Date(`${hari}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Daftar tanggal berurutan, dari yang paling lama ke `sampai`. */
export function deretHari(sampai, jumlah) {
  const out = [];
  for (let i = jumlah - 1; i >= 0; i--) out.push(mundurHari(sampai, i));
  return out;
}

/* ------------------------------------------------------------------ *
 * Bentuk data harian
 * ------------------------------------------------------------------ */

export function hariKosong() {
  return {
    tampilan: 0,
    pengunjung: 0,
    bot: 0,
    jam: new Array(24).fill(0),
    halaman: {},
    rujukan: {},
    perangkat: {},
    sidik: [],
  };
}

/** Membaca satu hari dari berkas, melengkapi bentuk yang belum lengkap. */
export function bacaHari(raw) {
  const h = hariKosong();
  if (!raw || typeof raw !== "object") return h;
  h.tampilan = Number(raw.tampilan) || 0;
  h.pengunjung = Number(raw.pengunjung) || 0;
  h.bot = Number(raw.bot) || 0;
  if (Array.isArray(raw.jam)) for (let i = 0; i < 24; i++) h.jam[i] = Number(raw.jam[i]) || 0;
  for (const [k, v] of Object.entries(raw.halaman || {})) h.halaman[k] = Number(v) || 0;
  for (const [k, v] of Object.entries(raw.rujukan || {})) h.rujukan[k] = Number(v) || 0;
  for (const [k, v] of Object.entries(raw.perangkat || {})) h.perangkat[k] = Number(v) || 0;
  h.sidik = Array.isArray(raw.sidik) ? raw.sidik.map(String) : [];
  return h;
}

/** Menyisakan `batas` kunci dengan angka terbesar. Dipakai saat menulis, bukan saat membaca. */
export function pangkas(peta, batas) {
  const kunci = Object.keys(peta);
  if (kunci.length <= batas) return peta;
  const urut = kunci.sort((a, b) => (peta[b] || 0) - (peta[a] || 0)).slice(0, batas);
  const out = {};
  for (const k of urut) out[k] = peta[k];
  return out;
}

function tambahPeta(tujuan, sumber) {
  for (const [k, v] of Object.entries(sumber || {})) tujuan[k] = (tujuan[k] || 0) + (Number(v) || 0);
}

function urutkan(peta, batas) {
  return Object.entries(peta)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, batas)
    .map(([label, n]) => ({ label, n }));
}

/**
 * Meringkas sekumpulan hari jadi satu jawaban yang siap digambar panel.
 *
 * `pengunjung` dijumlahkan per hari, dan itu memang bukan "pengunjung unik
 * sepanjang rentang": orang yang datang tiga hari berturut-turut terhitung
 * tiga kali. Alternatifnya menyimpan sidik seluruh pengunjung selamanya —
 * harga privasi yang tidak sepadan untuk satu angka. Panel menyebutnya
 * "pengunjung harian" supaya angkanya tidak dibaca sebagai sesuatu yang bukan.
 */
export function ringkas(peta, tanggalList) {
  const hari = [];
  const halaman = {};
  const rujukan = {};
  const perangkat = {};
  const jam = new Array(24).fill(0);
  let tampilan = 0;
  let pengunjung = 0;
  let bot = 0;

  for (const tgl of tanggalList) {
    const h = bacaHari(peta[tgl]);
    hari.push({ tanggal: tgl, tampilan: h.tampilan, pengunjung: h.pengunjung });
    tampilan += h.tampilan;
    pengunjung += h.pengunjung;
    bot += h.bot;
    for (let i = 0; i < 24; i++) jam[i] += h.jam[i];
    tambahPeta(halaman, h.halaman);
    tambahPeta(rujukan, h.rujukan);
    tambahPeta(perangkat, h.perangkat);
  }

  const puncak = hari.reduce((a, b) => (b.tampilan > (a ? a.tampilan : -1) ? b : a), null);

  return {
    hari,
    total: {
      tampilan,
      pengunjung,
      bot,
      // Dibulatkan dua angka: "1,8 halaman per pengunjung" adalah angka yang
      // dipakai untuk membandingkan, bukan untuk dijumlahkan lagi.
      perPengunjung: pengunjung ? Math.round((tampilan / pengunjung) * 100) / 100 : 0,
    },
    puncak: puncak && puncak.tampilan > 0 ? puncak : null,
    halaman: urutkan(halaman, 15),
    rujukan: urutkan(rujukan, 10),
    perangkat: PERANGKAT.map((k) => ({ label: k, n: perangkat[k] || 0 })).filter((x) => x.n > 0),
    jam,
  };
}

/**
 * Selisih dalam persen antara dua angka, dibulatkan.
 *
 * Mengembalikan null kalau pembandingnya nol: "naik tak terhingga persen"
 * bukan kalimat yang menolong siapa pun, dan menuliskannya sebagai +100%
 * adalah kebohongan kecil yang menetap di laporan.
 */
export function selisihPersen(sekarang, sebelum) {
  if (!sebelum) return null;
  return Math.round(((sekarang - sebelum) / sebelum) * 100);
}
