/**
 * Pengenalan tipe gambar dari isinya, bukan dari klaim pengunggah.
 *
 * `file.type` pada FormData datang dari browser — artinya dari klien, artinya
 * bisa ditulis apa saja. Tanpa pemeriksaan ini, satu berkas HTML bisa tersimpan
 * bernama `.png` dan disajikan kembali dari domain yang sama dengan panel.
 * Header `nosniff` di `/api/uploads` sudah meredamnya, tapi menolak berkasnya
 * sejak awal jauh lebih baik daripada menyimpan sesuatu yang bukan gambar.
 */

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

export const IMAGE_EXT: Record<ImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

/** Ukuran maksimum satu berkas unggahan. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Apakah tipe yang DIKLAIM pengunggah termasuk yang kita dukung? */
export function isSupportedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_EXT, String(mime).toLowerCase());
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/**
 * Mengembalikan tipe gambar yang benar-benar terbaca dari beberapa byte
 * pertama, atau null kalau isinya bukan gambar yang didukung.
 */
export function sniffImage(buf: Buffer): ImageMime | null {
  // JPEG: FF D8 FF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 "PNG" CR LF 1A LF
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // GIF: "GIF87a" / "GIF89a"
  if (buf.length >= 6 && buf.subarray(0, 6).toString("latin1").match(/^GIF8[79]a$/)) return "image/gif";
  // WebP: "RIFF" ???? "WEBP"
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (isAvif(buf)) return "image/avif";
  return null;
}

/**
 * AVIF: kotak ISO-BMFF `ftyp` yang salah satu mereknya `avif`/`avis`.
 *
 * Bukan sekadar memeriksa merek utama di offset 8. Berkas AVIF yang ditulis
 * peramban dan sebagian besar perkakas memakai merek utama `avif`, tapi yang
 * ditulis kamera dan beberapa pustaka memakai `mif1` dengan `avif` di daftar
 * merek yang KOMPATIBEL — bentuk yang sah dan yang akan ditolak kalau hanya
 * offset 8 yang dibaca.
 *
 * Yang tidak ikut lolos, dan memang tidak boleh: `heic`/`heix`. Wadahnya
 * serumpun, isinya HEVC, dan tidak ada peramban yang menampilkannya.
 */
function isAvif(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString("latin1") !== "ftyp") return false;

  // Panjang kotak ftyp ada di empat byte pertama. Merek kompatibel mulai di
  // offset 16, empat byte sekali, sampai kotaknya habis.
  const panjang = buf.readUInt32BE(0);
  const akhir = Math.min(buf.length, panjang > 0 ? panjang : buf.length);

  if (["avif", "avis"].includes(buf.subarray(8, 12).toString("latin1"))) return true;
  for (let i = 16; i + 4 <= akhir; i += 4) {
    if (["avif", "avis"].includes(buf.subarray(i, i + 4).toString("latin1"))) return true;
  }
  return false;
}
