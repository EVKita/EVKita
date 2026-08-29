/**
 * Menyusun riwayat sebuah item dari tumpukan cadangan.
 *
 * Jaring pengaman panel ini bekerja di dua ukuran ekstrem: batal-ketik empat
 * puluh langkah yang hilang saat halaman dimuat ulang, dan pemulihan cadangan
 * yang mengganti SELURUH `content.json` sekaligus. Di antara keduanya tidak
 * ada apa-apa. Artinya memulihkan satu mobil yang tidak sengaja dikosongkan
 * berarti ikut membuang setiap perubahan yang dilakukan orang lain sejak
 * cadangan itu dibuat — dan panel ini punya banyak pengguna.
 *
 * Fungsi di sini murni: ia menerima daftar versi yang sudah dibaca dari disk
 * dan merapikannya. Yang membaca berkas adalah `api/backups.ts`.
 */

/**
 * Membuang versi yang isinya sama dengan versi SESUDAHNYA (yang lebih baru).
 *
 * Cadangan dibuat menurut waktu, bukan menurut perubahan: dua puluh cadangan
 * berturut-turut bisa memuat mobil yang sama persis karena yang berubah di
 * antaranya adalah mobil lain. Menampilkan kedua puluhnya sebagai "riwayat"
 * membuat orang menelusuri daftar panjang yang seluruh isinya identik.
 *
 * Urutan masukan: TERBARU lebih dulu. Yang disimpan adalah versi paling tua
 * dari setiap rangkaian yang sama — yaitu cadangan tempat nilai itu MULAI
 * berlaku, bukan tempat ia kebetulan masih ada.
 *
 * @param {{name: string, time: string, item: any}[]} versi
 */
export function ringkasRiwayat(versi) {
  const daftar = (Array.isArray(versi) ? versi : []).filter((v) => v && v.item);
  return daftar.filter((v, i) => {
    const lebihTua = daftar[i + 1];
    // Versi paling tua selalu disimpan: ia awal dari segalanya, dan tidak ada
    // apa pun di belakangnya untuk dibandingkan.
    return !lebihTua || !samaIsi(v.item, lebihTua.item);
  });
}

function samaIsi(a, b) {
  try {
    return JSON.stringify(bersih(a)) === JSON.stringify(bersih(b));
  } catch {
    return false;
  }
}

/**
 * Stempel waktu dan pengubah dibuang sebelum dibandingkan.
 *
 * Keduanya berubah pada setiap penyimpanan yang menyentuh item ini, jadi
 * membiarkannya ikut berarti setiap cadangan tampak berbeda dan peringkasan di
 * atas tidak pernah membuang apa pun.
 */
function bersih(item) {
  const salinan = Object.assign({}, item);
  delete salinan.updatedAt;
  delete salinan.updatedBy;
  return salinan;
}
