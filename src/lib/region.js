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
  { id: "cn", slug: "china", eyebrow: "EVKita di China" },
];

/** Bahasa bawaan tiap edisi saat pengunjung belum memilih bahasa. */
export const REGION_LANG = { amerika: "en", china: "zh" };

/**
 * Membakukan nilai `wilayah` dari dokumen. Yang tidak dikenal jatuh ke
 * Indonesia — lebih aman menampilkan daripada menyembunyikan.
 */
export function normalizeWilayah(v) {
  const s = String(v === null || v === undefined ? "" : v).trim().toLowerCase();
  if (s === "us") return "us";
  if (s === "cn") return "cn";
  return "id";
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

/** Edisi dari alamat yang dibuka (`/amerika` → `us`, `/china` → `cn`). */
export function wilayahDariPath(pathname) {
  const path = String(pathname || "");
  if (path === "/amerika" || path.startsWith("/amerika/")) return "us";
  if (path === "/china" || path.startsWith("/china/")) return "cn";
  return "id";
}

/**
 * Edisi dari parameter `?region=`. Menerima kode (`us`, `cn`) MAUPUN slug
 * alamat (`amerika`, `china`) — orang menulis yang satu atau yang lain, dan
 * `?region=amerika` yang jatuh ke Indonesia adalah kejutan yang diam. Selain
 * itu (termasuk `id`) berarti Indonesia.
 */
export function regionDariParam(value) {
  const s = String(value === null || value === undefined ? "" : value).trim().toLowerCase();
  if (s === "us" || s === "amerika") return "us";
  if (s === "cn" || s === "china" || s === "cina") return "cn";
  return "id";
}

/**
 * Istilah direktori pengisian per edisi — TETAPAN.
 *
 * Edisi regional memakai istilah TETAPnya sendiri dalam SEMUA bahasa, bukan
 * terjemahan "SPKLU": Amerika selalu "Charging...", China selalu "充电站...".
 * Auto-update (berita, artikel, riset, penjualan) hanya menulis
 * `data/content.json` dan tidak pernah menyentuh kamus, jadi tetapan ini tidak
 * bisa dibalikkan mesin. `tests/region-istilah.test.ts` menguncinya: nilai
 * kunci us/cn di ketiga bahasa tidak boleh mengandung "SPKLU".
 *
 * `bentuk`: "nav" (pil menu/header), "peta" (tautan lokasi kartu), atau
 * "semua" (tombol lihat-semua seksi).
 */
export const ISTILAH_CAS = {
  nav: { id: "pub.nav.spklu", us: "pub.region.usCharging", cn: "pub.region.cnBadge" },
  peta: { id: "pub.dir.lokasiSpklu", us: "pub.region.usChargingMap", cn: "pub.region.cnChargingMap" },
  semua: { id: "pub.dir.semuaSpklu", us: "pub.region.usSemuaCharging", cn: "pub.region.cnSemuaCharging" },
};

export function istilahCas(region, bentuk) {
  const daftar = ISTILAH_CAS[bentuk] || ISTILAH_CAS.nav;
  const w = normalizeWilayah(region);
  return daftar[w] || daftar.id;
}
