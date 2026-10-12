/**
 * Edisi regional (Indonesia + Amerika, menyusul China dan Eropa).
 *
 * Satu database (`data/content.json`), tiap item membawa `wilayah`. Nilai yang
 * belum diisi berarti Indonesia — seluruh isi lama otomatis menjadi edisi
 * Indonesia tanpa migrasi. Berkas ini murni (tanpa Node) supaya aturan yang
 * sama persis dipakai server dan diuji di `tests/region.test.ts`.
 *
 * Keputusan "boleh dilihat edisi mana?" hanya ada di sini. Jangan menulis
 * ulang perbandingan `wilayah` di halaman.
 */

/** Wilayah yang dikenal. `slug` adalah alamat edisinya di situs. */
export const REGIONS = [
  { id: "id", slug: "", eyebrow: "EVKita di Indonesia" },
  { id: "us", slug: "amerika", eyebrow: "EVKita di Amerika" },
];

/** Bahasa bawaan tiap edisi saat pengunjung belum memilih bahasa. */
export const REGION_LANG = { amerika: "en" };

/**
 * Membakukan nilai `wilayah` dari dokumen. Yang tidak dikenal jatuh ke
 * Indonesia — lebih aman menampilkan daripada menyembunyikan.
 */
export function normalizeWilayah(v) {
  const s = String(v === null || v === undefined ? "" : v).trim().toLowerCase();
  return s === "us" ? "us" : "id";
}

/** Apakah item ini milik edisi yang diminta? */
export function isWilayah(item, wilayah) {
  return normalizeWilayah(item && item.wilayah) === normalizeWilayah(wilayah);
}

/** Saring daftar ke satu edisi. Bukan larik berarti daftar kosong. */
export function filterWilayah(list, wilayah) {
  const w = normalizeWilayah(wilayah);
  if (!Array.isArray(list)) return [];
  return list.filter((item) => normalizeWilayah(item && item.wilayah) === w);
}

/** Edisi dari alamat yang dibuka (`/amerika` → `us`, selainnya `id`). */
export function wilayahDariPath(pathname) {
  const path = String(pathname || "");
  if (path === "/amerika" || path.startsWith("/amerika/")) return "us";
  return "id";
}
