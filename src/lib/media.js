/**
 * Metadata gambar — satu sumber untuk panel admin, penyimpan, dan situs publik.
 *
 * Sampai sebelum ini "Media" hanyalah tampilan turunan: daftar alamat gambar
 * yang dikumpulkan ulang dari kendaraan, berita, dan pengaturan situs setiap
 * kali halamannya dibuka. Tidak ada tempat menyimpan apa pun TENTANG sebuah
 * gambar — termasuk teks alternatifnya, satu-satunya cara pembaca dengan
 * pembaca layar tahu isi gambar itu apa.
 *
 * Karena itu metadatanya disimpan terpisah dari pemakaiannya, berkunci alamat
 * gambar: satu foto yang dipakai di tiga tempat cukup ditulis alt-nya sekali,
 * dan metadatanya tidak ikut hilang saat kendaraan yang memakainya dihapus.
 */

/** Batas panjang tiap field. Alt yang lebih panjang dari ini bukan alt lagi. */
export const MEDIA_LIMITS = { title: 120, alt: 300, note: 500 };

const FIELDS = ["title", "alt", "note"];

function clean(v, max) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Merapikan peta metadata dari dokumen konten.
 *
 * Entri yang seluruh field-nya kosong dibuang, bukan disimpan sebagai objek
 * kosong: tanpa itu setiap gambar yang pernah dibuka di panel akan menambah
 * satu baris permanen di content.json meski tidak ada yang pernah diisi.
 */
export function normalizeMediaMap(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;

  for (const [rawUrl, rawEntry] of Object.entries(value)) {
    const url = String(rawUrl || "").trim();
    if (!url) continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;

    const entry = {};
    for (const f of FIELDS) entry[f] = clean(rawEntry[f], MEDIA_LIMITS[f]);
    if (FIELDS.every((f) => !entry[f])) continue;
    out[url] = entry;
  }
  return out;
}

/** Metadata satu gambar, selalu berbentuk lengkap supaya pemanggil tidak perlu menjaga null. */
export function mediaEntry(map, url) {
  const e = map && url ? map[String(url)] : null;
  return {
    title: (e && e.title) || "",
    alt: (e && e.alt) || "",
    note: (e && e.note) || "",
  };
}

/**
 * Teks alternatif sebuah gambar, dengan cadangan.
 *
 * `fallback` adalah yang dipakai halaman sebelum metadata ini ada — biasanya
 * "Merek Model". Alt yang ditulis manusia menang, tapi kalau belum ada,
 * cadangan itu tetap lebih baik daripada alt kosong.
 */
export function mediaAlt(map, url, fallback = "") {
  const e = map && url ? map[String(url)] : null;
  return (e && e.alt) || fallback;
}

/**
 * Peta ringkas `alamat → alt` untuk disuntikkan ke browser.
 *
 * Halaman beranda menggambar ulang kartunya di sisi klien saat pembaca
 * memfilter, jadi alt harus ikut ke sana — tapi hanya alt, dan hanya untuk
 * gambar yang benar-benar ada di muatan itu.
 */
export function altMapFor(map, urls) {
  const out = {};
  for (const url of urls) {
    const alt = mediaAlt(map, url, "");
    if (alt) out[String(url)] = alt;
  }
  return out;
}
