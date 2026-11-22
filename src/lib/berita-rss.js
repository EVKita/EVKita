/**
 * Pembaca RSS/Atom dan penggabung berita.
 *
 * Sengaja tanpa dependensi parser XML: feed yang dipakai (WordPress dan
 * penyedia berita besar) berbentuk sederhana dan seragam — `<item>` untuk RSS,
 * `<entry>` untuk Atom — sehingga penguraian dengan pola sudah cukup. Menarik
 * satu pustaka XML berarti menambah satu dependensi runtime yang ikut ke dalam
 * paket rilis hanya untuk membaca dua bentuk yang sama.
 *
 * JavaScript polos supaya aturannya bisa diuji langsung, sama seperti
 * `trafik.js` dan `footer.js`.
 */

/**
 * Isi CDATA dibuka, entitas HTML dibereskan, tag dibuang.
 *
 * Urutannya disengaja: entitas DULU, tag belakangan. Umpan Google News
 * menulis deskripsinya lolos-ganda (`&lt;a href=…&gt;`) — kalau tag dibuang
 * lebih dulu tidak ada yang terbuang, lalu `&lt;` dibuka menjadi teks
 * `<a href=…>` yang ikut tampil di kartu berita. Kasus nyata: 20 dari 30
 * ringkasan berisi potongan tautan mentah (Okt 2026).
 */
function teks(v) {
  return String(v || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#8216;|&#8217;/gi, "'")
    .replace(/&#8211;|&#8212;|&mdash;|&ndash;/gi, "-")
    .replace(/&#8230;|&hellip;/gi, "…")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Isi sebuah tag, CDATA dibuka tetapi tag di dalamnya belum dibuang. */
function ambil(blok, tag) {
  const m = blok.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

/** Nilai atribut `attr` pada tag `tag`, untuk bentuk self-closing (Atom). */
function atribut(blok, tag, attr) {
  const m = blok.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}

/** Kata yang menandakan gambar hiasan — dibuang dari hasil. */
const HIASAN_RSS = /(logo|icon|favicon|placeholder|spacer|pixel|badge|avatar|1x1|blank|loading|arrow)/i;

/**
 * Mengambil gambar pertama yang layak dari HTML konten feed.
 * Banyak penerbit berita Indonesia tidak pakai media:content tapi menaruh
 * gambar di dalam deskripsi/content:encoded sebagai tag <img>.
 */
function gambarDariHtml(html) {
  const s = String(html || "");
  // Coba og:image dan twitter:image dulu (kadang ada di dalam konten)
  const metaM = s.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*?content=["']([^"']+)["']/i)
    || s.match(/<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']og:image["']/i);
  if (metaM) {
    const u = metaM[1].trim();
    if (/^https?:\/\//i.test(u) && !HIASAN_RSS.test(u)) return u;
  }
  // Cari <img src> pertama yang layak
  for (const m of s.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const u = m[1].trim();
    if (/^https?:\/\//i.test(u) && /\.(jpe?g|png|webp|avif|gif)(?:$|[?#])/i.test(u) && !HIASAN_RSS.test(u)) {
      return u;
    }
  }
  return "";
}

/**
 * Mengambil URL YouTube pertama dari HTML konten feed.
 * Beberapa penerbit menyematkan iframe YouTube di dalam content:encoded.
 */
function videoDariHtml(html) {
  const s = String(html || "");
  // Cari iframe YouTube
  for (const m of s.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const u = m[1].trim();
    if (/(youtube\.com\/embed|youtu\.be)/i.test(u)) return u;
  }
  // Cari tautan YouTube biasa
  for (const m of s.matchAll(/https?:\/\/(?:www\.)?(youtube\.com\/watch\?[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi)) {
    return m[0];
  }
  return "";
}

/** Tanggal apa pun dari feed diubah ke `YYYY-MM-DD`. Kosong kalau tak terbaca. */
export function tanggalIso(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Mengurai isi feed menjadi daftar berita.
 *
 * Setiap item menghasilkan `{ title, link, date, excerpt, image }`. Item tanpa
 * judul atau tautan dibuang — dua itu yang membuat kartu bisa diklik, dan
 * tautan yang tidak ada berarti kutipan yang tidak bisa ditelusuri asalnya.
 */
export function parseFeed(xml) {
  const out = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const blok = m[0];
    const title = teks(ambil(blok, "title"));
    const link = teks(ambil(blok, "link")) || atribut(blok, "link", "href");
    if (!title || !link) continue;

    const rawDate =
      ambil(blok, "pubDate") ||
      ambil(blok, "published") ||
      ambil(blok, "updated") ||
      ambil(blok, "dc:date");
    const rawDesk =
      ambil(blok, "description") ||
      ambil(blok, "summary") ||
      ambil(blok, "content:encoded") ||
      ambil(blok, "content");

    const image =
      atribut(blok, "enclosure", "url") ||
      atribut(blok, "media:content", "url") ||
      atribut(blok, "media:thumbnail", "url") ||
      gambarDariHtml(rawDesk);

    /* Video YouTube dari konten — dipakai artikel rangkuman otomatis. */
    const video = videoDariHtml(rawDesk);

    out.push({
      title,
      link,
      date: tanggalIso(rawDate),
      excerpt: teks(rawDesk).slice(0, 200),
      image: image ? teks(image) : "",
      video: video || "",
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Kembar lintas penerbit
 *
 * Satu peluncuran diliput lima penerbit dalam satu hari, dan kelimanya masuk
 * Berita Terkini sebagai lima kartu yang menceritakan hal yang sama. Judulnya
 * tidak pernah sama persis — karena itu pemeriksaan "judul sama" saja tidak
 * cukup, dan pemeriksaan "judul mirip" saja berbahaya: "Hyundai Neira Meluncur"
 * dan "BYD Ti7 Meluncur" sangat mirip kata demi kata padahal dua mobil
 * berbeda.
 *
 * Karena itu satu pasang baru dianggap kembar kalau SEMUANYA terpenuhi:
 *
 *   1. tanggalnya sama — peristiwa yang sama diberitakan pada hari yang sama;
 *   2. jenis peristiwanya sama (peluncuran/harga, penjualan, uji) — "harga
 *      turun" dan "penjualan naik" adalah dua kabar, bukan satu;
 *   3. mereknya sama — inilah yang memisahkan Neira dari Ti7;
 *   4. modelnya tidak bertentangan — "Ioniq 5" dan "Ioniq 6" dari merek yang
 *      sama tetap dua kabar;
 *   5. kata-katanya benar-benar bertumpang tindih, diukur dengan bobot IDF:
 *      kata yang muncul di banyak judul ("harga", "GAW", "2026") hampir tidak
 *      berbobot, kata yang khas ("neira", "j7", "parkir") berbobot besar.
 *
 * Berita yang dijaga redaksi tidak pernah dibuang oleh aturan ini.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Kata yang muncul di hampir semua judul berita — tidak membedakan apa pun. */
const KATA_UMUM = new Set(
  (
    "dan di ke dari ini itu untuk dengan pada akan bisa lebih mulai rp juta jutaan yang atau juga tak tidak " +
    "cuma hanya sudah bakal segera kini hari resmi jadi oleh dalam soal para bagi usai setelah sebelum karena " +
    "agar supaya saat ketika ada adalah akan bakal jadi kini masih belum sudah para sang si nya pun lah kah " +
    "the of to in on for and with from by a an as at is are was were be been its it this that these those " +
    "new now how why what when where who will can could would should may might"
  ).split(/\s+/)
);

/**
 * Merek yang dikenal. Daftar ini sengaja tidak harus lengkap: merek yang tidak
 * tercatat hanya berarti pasangannya tidak pernah dianggap kembar — arah
 * kesalahannya aman.
 */
const MEREK = [
  "mercedes-benz", "mitsubishi", "chevrolet", "fangchengbao", "volkswagen", "yamaha", "suzuki",
  "hyundai", "leapmotor", "polestar", "stellantis", "porsche", "ferrari", "baojun", "denza",
  "hongqi", "deepal", "avatr", "zeekr", "tesla", "toyota", "honda", "nissan", "renault", "peugeot",
  "citroen", "chery", "omoda", "jaecoo", "geely", "wuling", "vinfast", "xpeng", "changan", "aion",
  "polytron", "gesits", "smoot", "volta", "viar", "rakata", "united", "maxwell", "beijing", "baic",
  "dfac", "neta", "ora", "baw", "byd", "nio", "gac", "mg", "bmw", "audi", "mini", "lexus", "jeep",
  "ford", "rivian", "lucid", "xiaomi", "lixiang", "aito", "luxeed", "hiphi", "stelato", "isuzu",
  "daihatsu", "hyunda", "zero", "alva", "kawasaki", "vespa", "piaggio", "benelli", "qj",
].sort((a, b) => b.length - a.length);

/** Jenis peristiwa. Yang tidak masuk salah satunya tidak pernah digabung. */
const KELAS_PERISTIWA = [
  [
    "peluncuran",
    /(harga|juta|dijual|dipasarkan|meluncur|diluncurkan|hadir|diperkenalkan|debut|mengaspal|melantai|mejeng|tampil|booking|pemesanan|preorder|inden|spesifikasi|bocoran|varian|diumumkan|rilis|launch|\bjual\b|menanti|unveil|price|pricing)/,
  ],
  ["penjualan", /(penjualan|sales|laris|terjual|pangsa|produksi|pabrik|ekspor|impor|deliveries|delivery|produced|produces|production|millionth|rolls off|roll off|milestone)/],
  ["uji", /(testdrive|uji|tanjakan|konsumsi|review|ulasan|jarak|tempuh|range|efficiency)/],
];

/** Huruf kecil tanpa aksen — perbandingan tidak boleh rewel soal kapital. */
function bakuJudul(judul) {
  return String(judul || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Membuang akhiran nama penerbit yang masih menempel di judul (" - Oto",
 * " - gridoto.com"). Syaratnya ketat: paling banyak dua kata, tanpa angka,
 * dan hanya kalau masih ada judul yang tersisa. Judul asli yang memakai tanda
 * pisah secara wajar ("MG S6 EV - Harga dan Spesifikasi") tidak ikut terpotong
 * karena bagian kanannya lebih dari dua kata.
 */
function tanpaAkhiranPenerbit(teks) {
  const bagian = String(teks).split(/\s+[-\u2013\u2014|]\s+/);
  if (bagian.length < 2) return teks;
  const ekor = bagian[bagian.length - 1].trim();
  if (/^[a-z.\s]{2,24}$/i.test(ekor) && ekor.split(/\s+/).length <= 2 && !/\d/.test(ekor)) {
    return bagian.slice(0, -1).join(" ");
  }
  return teks;
}

/** Angka yang ditulis dengan kata disamakan dengan angkanya. */
const ANGKA_KATA = new Map([
  ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"],
  ["six", "6"], ["seven", "7"], ["eight", "8"], ["nine", "9"], ["ten", "10"],
  ["satu", "1"], ["dua", "2"], ["tiga", "3"], ["empat", "4"], ["lima", "5"],
  ["enam", "6"], ["tujuh", "7"], ["delapan", "8"], ["sembilan", "9"], ["sepuluh", "10"],
]);

/** Kata pembanding sebuah judul. */
function kataJudul(judul) {
  return new Set(
    tanpaAkhiranPenerbit(bakuJudul(judul))
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((k) => k && !KATA_UMUM.has(k))
      .filter((k) => !/^(19|20)\d\d$/.test(k))
      .map((k) => ANGKA_KATA.get(k) || k)
  );
}

/**
 * Penanda model: kata yang memuat angka (`s6`, `j7`, `i60`, `ehs4`) dan
 * gabungan kata+angka yang ditulis terpisah ("Titan 7", "MG S6").
 *
 * Inilah yang membuat "MG S6" dan "MGS6" bertemu, dan yang membuat "Ioniq 5"
 * tidak pernah disamakan dengan "Ioniq 6". Harga ("Rp 532 juta") dan tahun
 * bukan model — keduanya dibuang lebih dulu.
 */
const MATA_UANG = new Set([
  "rp", "idr", "rmb", "usd", "eur", "jpy", "dollar", "dollars", "yuan", "juta", "ribu",
  "million", "billion", "ribuan", "jutaan",
]);

/**
 * Kata yang angka di sebelahnya BUKAN penanda model: jumlah varian, jumlah
 * orang, satuan, dan kata kerja umum. Tanpa ini "Ada 3 Varian" menghasilkan
 * model "ada3" yang tidak berarti apa-apa.
 */
const BUKAN_MODEL = new Set([
  ...MATA_UANG,
  "varian", "orang", "unit", "bulan", "tahun", "hari", "jam", "menit", "detik", "persen",
  "km", "kwh", "kw", "liter", "kursi", "seat", "seater", "roda", "pintu", "airbag", "generasi",
  "ada", "dapat", "beri", "capai", "jadi", "punya", "hingga", "sampai", "lebih", "kurang",
  "hanya", "sekitar", "mulai", "tembus", "usung", "bawa", "pakai", "masuk", "keluar", "ke", "sudah",
  "reaches", "reached", "hits", "hit", "tops", "topped", "sells", "sold", "clocks", "clocked",
  "priced", "costs", "cost", "worth", "senilai", "seharga", "dibanderol", "berusia", "umur",
]);

function modelJudul(judul) {
  const kata = tanpaAkhiranPenerbit(bakuJudul(judul)).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
  const keluar = new Set();
  for (let i = 0; i < kata.length; i++) {
    const k = kata[i];
    if (/^(19|20)\d\d$/.test(k)) continue; // tahun
    if (/^(rp|idr|rmb|usd|eur|jpy)\d+$/.test(k)) continue; // "rp532"

    if (/[a-z]/.test(k) && /\d/.test(k)) {
      keluar.add(k);
      // "mgs6" juga menyimpan "s6" supaya bertemu dengan "MG S6".
      const ekor = k.match(/([a-z]\d{1,4})$/);
      if (ekor && ekor[1] !== k) keluar.add(ekor[1]);
      continue;
    }

    if (/^\d{1,3}$/.test(k)) {
      const sebelum = i > 0 ? kata[i - 1] : "";
      const sesudah = i + 1 < kata.length ? kata[i + 1] : "";
      // "Titan 7" / "7 DM" — angka melekat pada kata di sebelahnya.
      if (/^[a-z]{2,}$/.test(sebelum) && !BUKAN_MODEL.has(sebelum)) keluar.add(sebelum + k);
      if (/^[a-z]{2,}$/.test(sesudah) && !BUKAN_MODEL.has(sesudah)) keluar.add(k + sesudah);
    }
  }
  return keluar;
}

/** Apakah ada penanda model yang benar-benar khas (huruf+angka)? */
function modelKhas(model) {
  return [...model].some((m) => /[a-z]/.test(m) && /\d/.test(m) && m.length <= 12);
}

/** Merek yang disebut judul, dikenali juga saat menempel pada model ("mgs6"). */
function merekJudul(judul) {
  const kata = kataJudul(judul);
  const keluar = new Set();
  for (const k of kata) {
    for (const m of MEREK) {
      const rapat = m.replace(/-/g, "");
      // "mgs6" = merek "mg" + model "s6"; "bydtitan7" bukan merek "byd" + model.
      if (k === rapat || (k.startsWith(rapat) && /^[a-z]{0,3}\d/.test(k.slice(rapat.length)))) {
        keluar.add(m);
        break;
      }
    }
  }
  return keluar;
}

/** Jenis peristiwa sebuah judul, atau "" kalau tidak dikenali. */
function kelasJudul(judul) {
  const s = bakuJudul(judul);
  for (const [nama, pola] of KELAS_PERISTIWA) if (pola.test(s)) return nama;
  return "";
}

/**
 * Bobot tiap kata: makin khas sebuah kata, makin besar bobotnya. Dihitung
 * ulang pada tiap kumpulan berita, jadi tidak ada daftar kata yang perlu
 * dirawat seiring berita baru.
 */
function bobotIdf(daftar) {
  const df = new Map();
  for (const b of daftar) {
    for (const k of kataJudul(b && b.title)) df.set(k, (df.get(k) || 0) + 1);
  }
  const n = Math.max(1, daftar.length);
  return (kata) => Math.log(1 + n / (df.get(kata) || 1));
}

/** Apakah dua berita menceritakan peristiwa yang sama? */
export function peristiwaSama(a, b, bobot) {
  if (!a || !b) return false;
  if (String(a.date || "") !== String(b.date || "")) return false;
  if (String(a.wilayah || "") !== String(b.wilayah || "")) return false;

  const kelas = kelasJudul(a.title);
  if (!kelas || kelas !== kelasJudul(b.title)) return false;

  const merekA = merekJudul(a.title);
  const merekB = merekJudul(b.title);
  if (!merekA.size || !merekB.size || ![...merekA].some((m) => merekB.has(m))) return false;

  // Model yang jelas berbeda berarti peristiwa yang berbeda.
  const modelA = modelJudul(a.title);
  const modelB = modelJudul(b.title);
  const modelSama = modelA.size > 0 && modelB.size > 0 && [...modelA].some((m) => modelB.has(m));
  if (modelA.size && modelB.size && !modelSama) return false;

  /*
   * Satu model + satu hari + satu jenis kabar = satu peristiwa, sekalipun
   * kelima penerbit memilih kata yang berbeda-beda untuknya. Inilah yang
   * merapikan "Jaecoo J7" yang muncul lima kali.
   *
   * Kedua judul WAJIB menyebut model itu. Kabar "BYD punya rencana besar"
   * tidak boleh ikut dibuang hanya karena ada kabar "BYD TiTAN 7" di hari yang
   * sama — merek yang sama bukan peristiwa yang sama.
   */
  if (modelSama && (modelKhas(modelA) || modelKhas(modelB))) return true;

  /*
   * Tanpa penanda model (mis. "Hyundai Neira"), kata-katanya harus benar-benar
   * bertumpang tindih. Ambangnya lebih rendah daripada kemiripan biasa karena
   * merek dan jenis peristiwanya sudah dipastikan sama.
   */
  const kataA = kataJudul(a.title);
  const kataB = kataJudul(b.title);
  let bersama = 0;
  let bobotA = 0;
  for (const k of kataA) {
    bobotA += bobot(k);
    if (kataB.has(k)) bersama += bobot(k);
  }
  let bobotB = 0;
  for (const k of kataB) bobotB += bobot(k);
  if (bersama <= 0) return false;

  const tumpang = bersama / Math.min(bobotA, bobotB);
  const jumlah = [...kataA].filter((k) => kataB.has(k)).length;
  return jumlah >= 2 && tumpang >= 0.38;
}

/**
 * Membuang kartu kembar lintas penerbit. Yang dipertahankan adalah yang lebih
 * dulu hadir (berita redaksi selalu menang), supaya id dan fotonya tidak
 * berubah setiap kali tarikan berikutnya menemukan versi penerbit lain.
 */
export function buangKembarPeristiwa(daftar) {
  const isi = Array.isArray(daftar) ? daftar.filter(Boolean) : [];
  const bobot = bobotIdf(isi);
  const dijaga = isi.filter(beritaDijaga);
  const lain = isi.filter((b) => !beritaDijaga(b));

  const simpan = [...dijaga];
  let dibuang = 0;
  for (const b of lain) {
    if (simpan.some((x) => peristiwaSama(x, b, bobot))) {
      dibuang++;
      continue;
    }
    simpan.push(b);
  }
  if (!dibuang) return { daftar: isi, dibuang: 0 };
  // Urutan asli dipertahankan: pemanggil sudah mengurutkannya.
  return { daftar: isi.filter((b) => simpan.includes(b)), dibuang };
}

/** Kunci pembanding tautan: tanpa skema `www`, tanpa query, tanpa garis miring akhir. */
export function urlKunci(u) {
  return String(u || "")
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");
}

/**
 * Berita yang dijaga redaksi dan tidak boleh dibuang pemotongan otomatis:
 * ditambah/disunting lewat panel (`updatedBy` terisi — penarik RSS selalu
 * mengosongkannya), diunggulkan, masih draf, atau dijadwalkan tayang.
 */
export function beritaDijaga(b) {
  if (!b) return false;
  return !!(
    String(b.updatedBy || "").trim() ||
    b.featured ||
    b.status === "draft" ||
    String(b.publishAt || "").trim()
  );
}

/**
 * Umur maksimal berita hasil tarikan yang dipertahankan: dua bulan.
 *
 * Batas ini menjaga Berita Terkini tetap "terkini" — tanpa tanggal, daftar
 * yang penuh karena batas jumlah bisa menyimpan kabar berbulan-bulan lalu dan
 * mencampurnya dengan kabar hari ini. Berita yang ditambahkan/disunting
 * redaksi (`beritaDijaga`) tidak ikut dipangkas: itu tulisan manusia, bukan
 * hasil tarikan yang bisa diambil ulang besok.
 */
export const UMUR_BERITA_HARI = 60;

/** Satu hari dalam milidetik, dipakai perhitungan umur berita. */
const HARI_MS = 24 * 3600 * 1000;

/**
 * Membuang berita tarikan yang lebih tua dari `maksHari`.
 *
 * Tanggal yang tidak terbaca TIDAK dibuang: lebih aman menampilkan baris tanpa
 * tanggal daripada menghapus berita yang mungkin baru. Baris redaksi, draf,
 * jadwal tayang, dan unggulan selalu dipertahankan dengan alasan yang sama
 * seperti `gabungBerita()`.
 *
 * Murni (tanpa Node) supaya aturannya bisa diuji langsung.
 */
export function pangkasBeritaLama(daftar, sekarang = Date.now(), maksHari = UMUR_BERITA_HARI) {
  const batas = sekarang - Math.max(1, Number(maksHari) || UMUR_BERITA_HARI) * HARI_MS;
  const simpan = [];
  let dipangkas = 0;
  for (const b of Array.isArray(daftar) ? daftar : []) {
    if (!b) continue;
    if (beritaDijaga(b)) {
      simpan.push(b);
      continue;
    }
    const t = Date.parse(String(b.date || b.updatedAt || ""));
    if (Number.isFinite(t) && t < batas) {
      dipangkas++;
      continue;
    }
    simpan.push(b);
  }
  return { daftar: simpan, dipangkas };
}

/**
 * Menggabungkan berita baru ke daftar lama.
 *
 * Berita dianggap sama kalau alamatnya sama, bukan kalau judulnya sama: satu
 * penerbit bisa memakai judul yang persis sama dua kali, dan dua penerbit bisa
 * menulis judul yang nyaris sama untuk peristiwa yang berbeda. Yang tersisa
 * diurutkan dari yang terbaru dan dipotong pada `maks`.
 *
 * Satu kekecualian: judul yang sama PERSIS dari PENERBIT yang sama. Itu bukan
 * dua peristiwa, melainkan satu kisah yang masuk dua kali lewat dua alamat —
 * lazim terjadi pada feed pencarian Google News, yang kadang mengembalikan
 * artikel yang sama dengan URL berbeda. Membiarkannya berarti kartu kembar di
 * Berita Terkini dan satu jatah edisi terbuang.
 *
 * Pemotongan hanya mengenai berita hasil tarikan RSS. Berita yang dijaga
 * redaksi (`beritaDijaga`) selalu ikut — sebelumnya satu tarikan berisi 55
 * berita baru ikut membuang tulisan yang ditambahkan tangan. Berita RSS tetap
 * kebagian minimal separuh `maks`, supaya Berita Terkini tidak membeku hanya
 * karena redaksi menyimpan banyak tulisan.
 */
export function gabungBerita(lama, baru, maks = 30) {
  const daftar = Array.isArray(lama) ? [...lama] : [];
  const ada = new Set(daftar.map((b) => urlKunci(b && b.url)).filter(Boolean));
  /* Kunci kedua: penerbit + judul yang dinormalkan. Hanya dipakai untuk
     menolak judul yang sama persis dari penerbit yang sama (lihat catatan
     di atas fungsi). */
  const teksKunci = (b) => {
    const judul = String((b && b.title) || "")
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
      .trim();
    const penerbit = String((b && b.source) || "").toLowerCase().trim();
    return judul && penerbit ? `${penerbit}|${judul}` : "";
  };
  const judulAda = new Set(daftar.map(teksKunci).filter(Boolean));

  let ditambah = 0;
  for (const b of Array.isArray(baru) ? baru : []) {
    const k = urlKunci(b && b.url);
    if (!k || ada.has(k)) continue;
    const j = teksKunci(b);
    if (j && judulAda.has(j)) continue;
    ada.add(k);
    if (j) judulAda.add(j);
    daftar.push(b);
    ditambah++;
  }

  daftar.sort((a, b) => String((b && b.date) || "").localeCompare(String((a && a.date) || "")));
  /* Kembar lintas penerbit dibuang sebelum jatah dihitung: kalau tidak, lima
     kartu untuk satu peluncuran menghabiskan lima jatah dan menutupi berita
     lain. */
  const { daftar: bersih } = buangKembarPeristiwa(daftar);
  const dijaga = bersih.filter(beritaDijaga).length;
  let jatah = Math.max(maks - dijaga, Math.ceil(maks / 2));
  const hasil = bersih.filter((b) => beritaDijaga(b) || jatah-- > 0);
  return { daftar: hasil, ditambah };
}
