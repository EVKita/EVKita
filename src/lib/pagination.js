/**
 * Pembagian halaman katalog.
 *
 * Beranda merender 12 kartu pertama lalu menyerahkan sisanya ke `app.js` —
 * bagus untuk pembaca yang menjalankan JavaScript, tapi artinya 16 mobil
 * berikutnya tidak punya satu pun alamat yang bisa didatangi perayap, dan
 * pembaca tanpa JavaScript berhenti di kartu kedua belas.
 *
 * `/katalog` dan `/katalog/2` menutup keduanya: seluruh katalog terjangkau,
 * dirender server, tanpa mengubah apa pun di beranda.
 *
 * Sengaja JavaScript polos tanpa API khusus Node — dipakai frontmatter
 * `.astro` maupun rute peta situs.
 */

/** Kartu per halaman. Beranda memakai angka yang sama untuk 12 kartu SSR-nya. */
export const PER_PAGE = 12;

/** Jumlah halaman; katalog kosong tetap punya satu halaman (yang kosong). */
export function pageCount(total, perPage = PER_PAGE) {
  const n = Number(total);
  const per = Number(perPage);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(per) || per <= 0) return 1;
  return Math.ceil(n / per);
}

/** Potongan daftar untuk satu halaman. Halaman di luar rentang jadi kosong. */
export function pageSlice(list, page, perPage = PER_PAGE) {
  const p = Number(page);
  if (!Array.isArray(list) || !Number.isFinite(p) || p < 1) return [];
  const start = (Math.floor(p) - 1) * perPage;
  return list.slice(start, start + perPage);
}

/**
 * Alamat sebuah halaman katalog.
 *
 * Halaman pertama TIDAK memakai "/1": satu halaman hanya boleh punya satu
 * alamat, dan "/katalog" adalah alamat itu. `[...hal].astro` mengalihkan
 * "/katalog/1" ke sini secara permanen.
 */
export function pageHref(page) {
  const p = Math.floor(Number(page));
  return p <= 1 ? "/katalog" : `/katalog/${p}`;
}

/**
 * Nomor halaman yang layak ditampilkan, dengan "…" untuk yang dilompati.
 *
 * Halaman pertama dan terakhir selalu ikut supaya ujung katalog tidak pernah
 * lebih dari satu klik jauhnya. Nilai kembalinya campuran angka dan string
 * "…" — pemanggil merender angka sebagai tautan, "…" sebagai teks biasa.
 *
 * @returns {(number|"…")[]}
 */
export function pageWindow(current, count, span = 1) {
  const total = Math.max(1, Math.floor(Number(count) || 1));
  const now = Math.min(total, Math.max(1, Math.floor(Number(current) || 1)));

  const wanted = new Set([1, total]);
  for (let i = now - span; i <= now + span; i++) {
    if (i >= 1 && i <= total) wanted.add(i);
  }

  const nomor = [...wanted].sort((a, b) => a - b);
  const out = [];
  let sebelumnya = 0;
  for (const n of nomor) {
    // Celah selebar satu halaman tidak pantas jadi "…" — angkanya lebih pendek
    // daripada elipsisnya, dan lebih berguna.
    if (sebelumnya && n - sebelumnya === 2) out.push(sebelumnya + 1);
    else if (sebelumnya && n - sebelumnya > 2) out.push("…");
    out.push(n);
    sebelumnya = n;
  }
  return out;
}
