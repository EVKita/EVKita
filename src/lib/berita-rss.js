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

/** Isi CDATA dibuka, entitas dasar HTML dibereskan, tag dibuang. */
function teks(v) {
  return String(v || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#8216;|&#8217;/gi, "'")
    .replace(/&#8211;|&#8212;|&mdash;|&ndash;/gi, "-")
    .replace(/&#8230;|&hellip;/gi, "…")
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
      atribut(blok, "media:thumbnail", "url");

    out.push({
      title,
      link,
      date: tanggalIso(rawDate),
      excerpt: teks(rawDesk).slice(0, 200),
      image: image ? teks(image) : "",
    });
  }
  return out;
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
 * Menggabungkan berita baru ke daftar lama.
 *
 * Berita dianggap sama kalau alamatnya sama, bukan kalau judulnya sama: satu
 * penerbit bisa memakai judul yang persis sama dua kali, dan dua penerbit bisa
 * menulis judul yang nyaris sama untuk peristiwa yang berbeda. Yang tersisa
 * diurutkan dari yang terbaru dan dipotong pada `maks`.
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

  let ditambah = 0;
  for (const b of Array.isArray(baru) ? baru : []) {
    const k = urlKunci(b && b.url);
    if (!k || ada.has(k)) continue;
    ada.add(k);
    daftar.push(b);
    ditambah++;
  }

  daftar.sort((a, b) => String((b && b.date) || "").localeCompare(String((a && a.date) || "")));
  const dijaga = daftar.filter(beritaDijaga).length;
  let jatah = Math.max(maks - dijaga, Math.ceil(maks / 2));
  const hasil = daftar.filter((b) => beritaDijaga(b) || jatah-- > 0);
  return { daftar: hasil, ditambah };
}
