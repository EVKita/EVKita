import crypto from "node:crypto";
import { signWithSecret } from "./auth";

/**
 * Tautan pratinjau untuk isi yang belum tayang — kendaraan maupun halaman
 * statis.
 *
 * Sebelum berkas ini ada, penyunting tidak punya cara apa pun melihat hasil
 * kerjanya sebelum menayangkannya: halaman detail menyaring `status === "draft"`
 * dan menjawab 404, jadi satu-satunya jalan menuju "seperti apa nanti
 * tampilannya" adalah menekan Terbitkan. Kebiasaan yang lahir dari situ —
 * tayangkan dulu, rapikan sambil dilihat orang — persis yang seharusnya
 * dicegah status draf.
 *
 * Tiga hal yang menentukan bentuk tokennya:
 *
 *   1. **Terikat ke satu item.** Bukan saklar "tampilkan semua draf".
 *      Tautan yang bocor hanya membuka satu halaman, bukan seluruh isi yang
 *      belum siap.
 *   2. **Kedaluwarsa.** Tautan dibagikan lewat WhatsApp dan surel, dan di sana
 *      ia hidup selamanya. Waktu kedaluwarsa ikut ditandatangani, jadi ia tidak
 *      bisa dimundurkan dari luar.
 *   3. **Tanpa penyimpanan.** Tidak ada daftar token di disk yang perlu
 *      dibersihkan. Yang membuat sebuah token sah hanyalah tanda tangan HMAC
 *      dengan `SESSION_SECRET` — sehingga mengganti rahasia itu sekaligus
 *      mematikan seluruh tautan pratinjau yang pernah dibuat.
 */

/**
 * Umur satu tautan pratinjau.
 *
 * Dua jam: cukup untuk mengirimkannya ke pemilik situs dan menunggu
 * jawabannya, terlalu pendek untuk berguna bagi siapa pun yang menemukannya
 * berbulan-bulan kemudian di riwayat percakapan.
 */
export const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

/** Koleksi yang punya halaman detail, beserta awalan alamatnya. */
export const PREVIEW_PATHS = {
  cars: "/mobil/",
  motors: "/motor/",
  /* Halaman statis tinggal di akar situs — lihat src/lib/laman.js. */
  halaman: "/",
} as const;

export type PreviewCollection = keyof typeof PREVIEW_PATHS;

export function isPreviewCollection(v: unknown): v is PreviewCollection {
  return v === "cars" || v === "motors" || v === "halaman";
}

/**
 * Bahan yang ditandatangani.
 *
 * Pemisahnya baris baru, bukan titik: id kendaraan datang dari `slugify()` dan
 * saat ini tidak mungkin memuat baris baru, tapi pemisah yang tidak bisa muncul
 * di dalam bagiannya sendiri berarti tidak ada pasangan (koleksi, id) berbeda
 * yang bisa menghasilkan bahan yang sama. Dengan pemisah titik, id yang
 * mengandung titik cukup untuk membuatnya ambigu.
 */
function payload(col: PreviewCollection, id: string, expBase36: string): string {
  return `pratinjau\n${col}\n${id}\n${expBase36}`;
}

/**
 * Tanda tangan dipotong ke 32 karakter heks (128 bit).
 *
 * Alasannya bukan keamanan melainkan panjang: token ini muncul di alamat yang
 * disalin-tempel orang, dan 128 bit sudah jauh di luar jangkauan tebakan untuk
 * sesuatu yang hanya hidup dua jam.
 */
const SIG_LEN = 32;

/**
 * Menerbitkan token untuk satu kendaraan. Mengembalikan null kalau
 * `SESSION_SECRET` belum dipasang — pemasangan yang belum dikonfigurasi tidak
 * boleh mengeluarkan token yang tanda tangannya bisa ditebak.
 */
export function makePreviewToken(col: PreviewCollection, id: string, now = Date.now()): string | null {
  const expBase36 = (now + PREVIEW_TTL_MS).toString(36);
  const sig = signWithSecret(payload(col, id, expBase36));
  if (!sig) return null;
  return `${expBase36}.${sig.slice(0, SIG_LEN)}`;
}

/** Apakah token ini sah untuk kendaraan ini, dan belum kedaluwarsa? */
export function verifyPreviewToken(
  token: unknown,
  col: PreviewCollection,
  id: string,
  now = Date.now()
): boolean {
  if (typeof token !== "string" || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expBase36, sig] = parts;
  if (!expBase36 || !sig || sig.length !== SIG_LEN) return false;

  const exp = Number.parseInt(expBase36, 36);
  if (!Number.isFinite(exp) || exp <= now) return false;

  /**
   * Batas atas juga diperiksa. Tanpa ini sebuah token dengan waktu
   * kedaluwarsa yang jauh di masa depan tetap ditolak oleh tanda tangannya —
   * tapi hanya kalau tanda tangannya memang tidak cocok. Memeriksanya di sini
   * membuat "umur maksimum" jadi aturan yang berlaku bahkan seandainya rahasia
   * penandatangan pernah bocor dan token lama masih beredar.
   */
  if (exp - now > PREVIEW_TTL_MS) return false;

  const want = signWithSecret(payload(col, id, expBase36));
  if (!want) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(want.slice(0, SIG_LEN), "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    // timingSafeEqual melempar kalau panjangnya berbeda — itu juga berarti tidak cocok.
    return false;
  }
}

/**
 * Alamat lengkap halaman pratinjau, atau null kalau token tidak bisa dibuat.
 *
 * @param segment Bagian alamat sesudah awalan koleksinya. Untuk kendaraan ia
 *   memang id-nya, tapi halaman statis dialamati lewat SLUG sementara tokennya
 *   tetap menandatangani id — slug bisa diganti, id tidak, dan tautan
 *   pratinjau yang sudah dikirim tidak boleh berubah artinya karena
 *   penyuntingnya merapikan alamat halaman.
 */
export function previewPath(
  col: PreviewCollection,
  id: string,
  segment: string = id,
  now = Date.now()
): string | null {
  const token = makePreviewToken(col, id, now);
  if (!token) return null;
  return `${PREVIEW_PATHS[col]}${encodeURIComponent(segment)}?pratinjau=${encodeURIComponent(token)}`;
}
