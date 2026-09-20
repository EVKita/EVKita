/**
 * Pemantau peluncuran: model yang halaman katalognya ramai.
 *
 * Idenya sederhana dan tidak memakai AI sama sekali. Statistik situs ini sudah
 * menyimpan jumlah tampilan per halaman per hari (lihat `trafik.js`). Kalau
 * satu halaman kendaraan melewati ambang dalam sehari, model itu hampir pasti
 * sedang jadi perhatian — entah karena baru diluncurkan atau sedang dibicarakan.
 * Yang perlu dilakukan saat itu bukan menulis data baru secara membabi buta,
 * melainkan menandainya supaya penyunting memeriksa dan melengkapinya.
 *
 * Berkas ini murni supaya aturannya bisa diuji tanpa menyentuh disk, sama
 * seperti `trafik.js` dan `berita-rss.js`.
 */

/** Jumlah tampilan satu halaman dalam sehari yang dianggap "viral". */
export const AMBANG_VIRAL = 1000;

/**
 * Alamat halaman kendaraan → `{ kind, slug }`.
 *
 * Hanya rute detail yang dikenali; `/katalog` dan `/mobil` (tanpa slug) bukan
 * satu model, jadi tidak bisa dipetakan ke entri mana pun.
 */
export function pathKendaraan(path) {
  const m = String(path || "").match(/^\/(mobil|motor)\/([^/]+)$/);
  if (!m) return null;
  let slug = m[2];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* biarkan apa adanya kalau bukan percent-encoding yang sah */
  }
  return { kind: m[1] === "motor" ? "motor" : "mobil", slug };
}

/**
 * Daftar halaman kendaraan yang melewati ambang.
 *
 * @param halaman Peta `{ "/mobil/slug": jumlah }`.
 * @param ambang Batas tampilan; bawaannya `AMBANG_VIRAL`.
 */
export function kandidatViral(halaman, ambang = AMBANG_VIRAL) {
  const out = [];
  for (const [path, n] of Object.entries(halaman || {})) {
    const k = pathKendaraan(path);
    if (!k) continue;
    const jumlah = Number(n) || 0;
    if (jumlah < ambang) continue;
    out.push({ ...k, jumlah, path });
  }
  return out.sort((a, b) => b.jumlah - a.jumlah || a.path.localeCompare(b.path));
}
