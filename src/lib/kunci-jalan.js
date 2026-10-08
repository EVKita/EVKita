/**
 * Penanda "sedang jalan" untuk mesin otomatis harian.
 *
 * Mesin katalog, model baru, artikel harian, dan penyegar artikel menyimpan
 * `jalan: true` di berkas statusnya supaya panel bisa menampilkan "sedang
 * berjalan". Berkas itu TIDAK boleh menjadi satu-satunya kebenaran: kalau
 * aplikasi mati di tengah putaran — dan memperbarui lewat Admin → Pembaruan
 * memang memulai ulang aplikasi — `jalan: true` tertinggal di disk selamanya.
 * Sebelum berkas ini ada, mesinnya lalu melewati setiap putaran sebagai
 * "sedangJalan" dan tombol "Jalankan sekarang" ditolak 409, tanpa jalan keluar
 * selain menyunting berkas JSON di server.
 *
 * Aturannya: `jalan` di disk hanya dipercaya kalau proses INI benar-benar
 * sedang menjalankannya (aplikasi berjalan satu proses, lihat
 * `ecosystem.config.cjs`), dan belum melewati batas waktunya. Putaran yang
 * menggantung melewati batas dianggap mati, sehingga putaran berikutnya
 * boleh mulai.
 *
 * Disimpan di `globalThis` supaya muat ulang modul saat `astro dev` (HMR)
 * tidak melupakan putaran yang masih berjalan.
 */

function peta() {
  const g = globalThis;
  if (!g.__evkitaKunciJalan) g.__evkitaKunciJalan = new Map();
  return g.__evkitaKunciJalan;
}

/** Menandai mesin `nama` mulai berjalan di proses ini. */
export function mulaiJalan(nama, sekarang = Date.now()) {
  peta().set(String(nama), sekarang);
}

/** Menandai mesin `nama` selesai (berhasil ataupun gagal). */
export function selesaiJalan(nama) {
  peta().delete(String(nama));
}

/**
 * Apakah mesin `nama` benar-benar sedang berjalan di proses ini dan belum
 * melewati `batasMs`?
 */
export function sedangJalan(nama, batasMs, sekarang = Date.now()) {
  const mulai = peta().get(String(nama));
  if (typeof mulai !== "number") return false;
  return sekarang - mulai < batasMs;
}
