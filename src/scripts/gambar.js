/**
 * Mengecilkan dan mengubah format gambar SEBELUM diunggah.
 *
 * Sampai sekarang berkas yang dipilih orang dikirim apa adanya, sampai 8 MB,
 * lalu disajikan apa adanya ke pengunjung situs. Foto langsung dari kamera
 * ponsel berukuran 4000 piksel dan beberapa megabita; dipasang sebagai gambar
 * kendaraan, ia ditampilkan selebar sekitar 800 piksel. Selisihnya dibayar
 * setiap pengunjung, setiap kali.
 *
 * Dikerjakan di PERAMBAN, bukan di server, dan itu keputusan yang disengaja.
 * Cara biasa mengecilkan gambar di Node adalah `sharp`, yang membawa ±20 MB
 * beserta biner libvips — `astro.config.mjs` sudah menolaknya sekali untuk
 * alasan yang sama, dan paket rilis proyek ini seluruhnya cuma 2,8 MB. Canvas
 * sudah ada di setiap peramban, gratis, dan ia bekerja di mesin orang yang
 * mengunggah alih-alih di VPS yang melayani seluruh pengunjung.
 *
 * Yang TIDAK disentuh berkas ini: pemeriksaan di server. `api/upload.ts` tetap
 * membaca byte pertama tiap berkas dan menolak yang bukan gambar. Apa pun yang
 * dikerjakan di sini hanya boleh membuat berkasnya lebih kecil — bukan
 * membuatnya lebih dipercaya.
 */

/** Sisi terpanjang maksimum. Cukup untuk hero lebar dan layar Retina. */
export const MAX_SISI = 2000;

/** Mutu WebP. 0,82 adalah titik ketika mata berhenti melihat bedanya. */
export const MUTU = 0.82;

/**
 * Berkas di bawah ukuran ini dibiarkan apa adanya.
 *
 * Gambar kecil yang sudah dioptimalkan sering justru MEMBENGKAK setelah
 * dikodekan ulang, dan mengulang proses lossy pada berkas yang sudah lossy
 * tidak pernah menambah apa pun selain artefak.
 */
export const BATAS_LEWATI = 200 * 1024;

/**
 * Tipe yang boleh disentuh.
 *
 * GIF sengaja di luar daftar: canvas hanya menggambar bingkai pertamanya, jadi
 * "mengoptimalkan" GIF animasi berarti diam-diam mengubahnya jadi gambar diam.
 * SVG juga tidak — ia sudah ditolak di server, dan ia bukan gambar raster.
 */
const BISA_DIPROSES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Apakah peramban ini bisa mengeluarkan WebP dari canvas? */
function dukungWebp() {
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/**
 * Membaca berkas jadi gambar yang bisa digambar ke canvas.
 *
 * `createImageBitmap()`, BUKAN `<img src=URL.createObjectURL(file)>`.
 * Perbedaannya bukan gaya: CSP panel ini menetapkan
 * `img-src 'self' data: https:` — tanpa `blob:` — jadi setiap gambar yang
 * dimuat lewat alamat blob ditolak peramban sebelum sempat dibaca. Versi
 * pertama berkas ini memakai cara itu, dan akibatnya bukan galat yang
 * kelihatan melainkan sesuatu yang jauh lebih buruk: `optimalkanGambar()`
 * diam-diam mengembalikan berkas aslinya, setiap kali, dan tidak ada satu pun
 * gambar yang pernah dikecilkan.
 *
 * `createImageBitmap()` menerima Blob langsung. Tidak ada alamat yang dibuat,
 * jadi tidak ada yang bisa ditolak CSP.
 */
async function muatGambar(file) {
  if (typeof createImageBitmap !== "function") throw new Error("tidak didukung");
  return createImageBitmap(file);
}

function keBlob(canvas, tipe, mutu) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipe, mutu));
}

/**
 * Mengembalikan berkas yang sudah dikecilkan, atau berkas aslinya kalau tidak
 * ada yang bisa diperbaiki.
 *
 * TIDAK PERNAH melempar. Kegagalan apa pun — kanvas ternoda, memori habis,
 * format aneh — berakhir dengan mengembalikan berkas asli, karena tugas ini
 * adalah pengoptimalan dan pengoptimalan yang gagal tidak boleh menggagalkan
 * unggahan yang sebenarnya baik-baik saja.
 */
export async function optimalkanGambar(file) {
  try {
    if (!file || !BISA_DIPROSES.has(file.type)) return file;
    if (typeof document === "undefined") return file;

    const img = await muatGambar(file);
    const w = img.width;
    const h = img.height;
    if (!w || !h) { img.close?.(); return file; }

    const skala = Math.min(1, MAX_SISI / Math.max(w, h));
    const perluKecil = skala < 1;
    const webp = dukungWebp();

    /*
     * Berkas yang sudah cukup kecil DAN tidak kebesaran dimensinya dibiarkan
     * apa adanya, walau formatnya bukan WebP. Yang bisa dihemat di sana
     * hitungan kilobita, sementara yang dipertaruhkan adalah satu putaran
     * pengodean lossy di atas berkas yang sudah lossy. Berkas besar berdimensi
     * wajar (mis. PNG 1500 piksel tiga megabita) TETAP diproses — di sana
     * perpindahan ke WebP saja sudah memangkas sebagian besarnya.
     */
    if (!perluKecil && file.size <= BATAS_LEWATI) { img.close?.(); return file; }

    const lebar = Math.max(1, Math.round(w * skala));
    const tinggi = Math.max(1, Math.round(h * skala));

    const canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) { img.close?.(); return file; }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, lebar, tinggi);
    // ImageBitmap memegang memori di luar jangkauan pengumpul sampah biasa.
    // Mengunggah dua puluh foto tanpa melepasnya cukup untuk membuat tab
    // kehabisan memori di ponsel.
    img.close?.();

    const tipe = webp ? "image/webp" : file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await keBlob(canvas, tipe, MUTU);
    if (!blob) return file;

    // Kalau hasilnya tidak lebih kecil, tidak ada yang didapat — dan berkas
    // asli setidaknya belum pernah dikodekan ulang.
    if (blob.size >= file.size) return file;

    const nama = file.name.replace(/\.[^.]+$/, "") + (tipe === "image/webp" ? ".webp" : tipe === "image/png" ? ".png" : ".jpg");
    return new File([blob], nama, { type: tipe, lastModified: Date.now() });
  } catch {
    return file;
  }
}
