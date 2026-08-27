import { compareSlug } from "./compare-html.js";

/**
 * Memilih lawan tanding sebuah kendaraan.
 *
 * Halaman perbandingan hanya berguna kalau yang disandingkan memang masuk akal
 * disandingkan. Orang tidak mengetik "BYD Seal vs Fox 200" — mereka mengetik
 * nama dua kendaraan yang sedang mereka pertimbangkan bersamaan, dan itu
 * hampir selalu berarti bentuk yang sama dengan harga yang berdekatan.
 *
 * Fungsi ini juga yang menentukan pasangan mana yang diumumkan di peta situs.
 * Semua pasangan yang mungkin ada ratusan; sebagian besar tidak pernah dicari
 * siapa pun, dan mengumumkannya hanya menyuruh perayap menghabiskan waktu di
 * halaman yang tidak menjawab pertanyaan siapa-siapa.
 */

/** Selisih harga dalam juta rupiah; tidak diketahui dianggap jauh. */
const PRICE_GAP_UNKNOWN = 500;

function priceGap(a, b) {
  if (a.price == null || b.price == null) return PRICE_GAP_UNKNOWN;
  return Math.abs(a.price - b.price) / 1_000_000;
}

/**
 * Skor kecil = lawan yang lebih pas.
 *
 * Bentuk bodi mengalahkan segalanya: SUV dibandingkan dengan SUV. Satu merek
 * yang sama diberi penalti ringan — "Atto 3 vs Dolphin" memang dicari orang,
 * tapi jauh lebih jarang daripada membandingkan dua merek berbeda, dan tanpa
 * penalti ini daftar lawan sebuah BYD akan berisi BYD semua.
 */
function rivalScore(v, other) {
  let score = priceGap(v, other);
  if (v.bodyType && other.bodyType && v.bodyType === other.bodyType) score -= 1000;
  if (v.brand && other.brand && v.brand === other.brand) score += 200;
  return score;
}

/**
 * @param {any} v kendaraan yang dicarikan lawan
 * @param {any[]} pool kendaraan sejenis (mobil dengan mobil, motor dengan motor)
 * @param {number} [limit]
 * @returns {any[]}
 */
export function rivalsFor(v, pool, limit = 4) {
  return pool
    .filter((o) => o && o.id !== v.id)
    .map((o) => ({ o, score: rivalScore(v, o) }))
    // Urutan id sebagai pemutus seri: peta situs harus stabil antar permintaan,
    // kalau tidak setiap perayapan melihat daftar yang seolah-olah berubah.
    .sort((a, b) => a.score - b.score || a.o.id.localeCompare(b.o.id))
    .slice(0, limit)
    .map((x) => x.o);
}

/**
 * Semua pasangan yang layak diumumkan, tanpa duplikat.
 *
 * "A lawan B" dan "B lawan A" adalah halaman yang sama — `compareSlug` sudah
 * membakukan urutannya, jadi cukup disaring lewat himpunan slug.
 *
 * @param {any[]} pool
 * @param {number} [perVehicle]
 * @returns {{ slug: string, ids: string[] }[]}
 */
export function comparePairs(pool, perVehicle = 3) {
  const seen = new Set();
  const pairs = [];
  for (const v of pool) {
    for (const rival of rivalsFor(v, pool, perVehicle)) {
      const slug = compareSlug([v.id, rival.id]);
      if (seen.has(slug)) continue;
      seen.add(slug);
      pairs.push({ slug, ids: slug.split("-vs-") });
    }
  }
  return pairs;
}
