/**
 * Satu-satunya definisi "apakah ini boleh dilihat pengunjung?".
 *
 * Sebelum berkas ini ada, jawabannya ditulis ulang di SEMBILAN tempat sebagai
 * `const isLive = (v) => v && v.status !== "draft"` — sembilan salinan aturan
 * yang sama, dan sembilan tempat yang harus diingat setiap kali aturannya
 * bertambah. Penjadwalan tayang adalah pertambahan pertama itu, dan tanpa
 * penyatuan ini ia akan berlaku di beberapa halaman saja: sebuah berita
 * terjadwal tidak muncul di beranda tapi tetap terbuka lewat alamatnya
 * sendiri, dan itu bukan penjadwalan melainkan setengah penjadwalan.
 *
 * JavaScript polos, bukan TypeScript, karena dipakai dua sisi: frontmatter
 * `.astro` yang dirender server DAN `admin.js` yang berjalan di peramban.
 */

/**
 * Apakah entri ini tayang sekarang?
 *
 * Dua syarat, dan keduanya harus terpenuhi:
 *   1. Statusnya bukan draf.
 *   2. Kalau ada waktu tayang, waktu itu sudah lewat.
 *
 * Entri tanpa `status` dianggap tayang. Itu bukan kelalaian: koleksi direktori
 * baru mengenal status mulai versi ini, dan seluruh isi yang sudah ada di
 * server memang sedang tayang. Menganggap ketiadaan status sebagai draf akan
 * mengosongkan direktori setiap pemasangan yang ada begitu pembaruan dipasang.
 */
export function tayang(item, sekarang = Date.now()) {
  if (!item) return false;
  if (item.status === "draft") return false;
  const at = Date.parse(item.publishAt || "");
  if (Number.isFinite(at) && at > sekarang) return false;
  return true;
}

/** Sudah disetujui tayang, tapi waktunya belum tiba. Hanya berarti di panel. */
export function terjadwal(item, sekarang = Date.now()) {
  if (!item || item.status === "draft") return false;
  const at = Date.parse(item.publishAt || "");
  return Number.isFinite(at) && at > sekarang;
}

/** Penyaring siap pakai — `list.filter(hanyaTayang())`. */
export const hanyaTayang = (sekarang = Date.now()) => (item) => tayang(item, sekarang);

/**
 * Apakah lencana NEW masih boleh tampil?
 *
 * Bukan soal tayang (itu urusan `tayang()` di atas), melainkan soal pajangan:
 * entri direktori tidak punya tanggal pembuatan, jadi NEW dihitung dari
 * `baruSampai` yang diisi penyunting saat entri baru ditambahkan. Batasnya
 * akhir hari WIB pada tanggal itu — server berjalan di UTC, dan tanpa
 * pergeseran ini lencana mati tujuh jam lebih awal dari yang dimaksud.
 *
 * Format selain YYYY-MM-DD selalu berarti tidak baru: tanggal rusak tidak
 * boleh membuat seluruh direktori berlabel NEW selamanya.
 */
export function masihBaru(baruSampai, sekarang = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(baruSampai || "").trim());
  if (!m) return false;
  // Date.UTC meluapkan yang tidak ada ("bulan 13", "30 Februari") jadi
  // tanggal lain yang sah — cocokkan kembali komponennya.
  const batas = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 16, 59, 59);
  const cek = new Date(batas);
  if (
    cek.getUTCFullYear() !== Number(m[1]) ||
    cek.getUTCMonth() !== Number(m[2]) - 1 ||
    cek.getUTCDate() !== Number(m[3])
  ) {
    return false;
  }
  return Number(sekarang) <= batas;
}
