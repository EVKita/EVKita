/**
 * Pembatasan laju sederhana untuk halaman masuk.
 *
 * Sebelum ini tidak ada pembatasan sama sekali, dan itu membuka dua hal
 * berbeda sekaligus:
 *
 *   1. Tebakan kata sandi bisa dijalankan tanpa henti.
 *   2. Yang lebih halus: parameter scrypt yang kuat (N=16384) justru menjadi
 *      senjata. Setiap percobaan memaksa server menghabiskan sekitar 100 ms
 *      CPU dan 64 MB memori, jadi beberapa ratus permintaan per detik cukup
 *      untuk membuat situs publik ikut tidak responsif — tanpa perlu satu pun
 *      tebakan yang benar.
 *
 * Aplikasi ini satu proses di balik PM2, jadi peta di memori sudah cukup;
 * tidak perlu Redis. Konsekuensinya: hitungannya kembali nol setiap kali
 * aplikasi dimuat ulang. Itu bisa diterima — pembaruan tidak sering, dan
 * penyerang tidak bisa memicunya.
 */

export interface Bucket {
  /** Cap waktu percobaan gagal yang masih dalam jendela. */
  hits: number[];
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
/** Pagar terakhir supaya peta tidak bisa dijadikan alat menghabiskan memori. */
const MAX_KEYS = 5000;

const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
    if (!bucket.hits.length) buckets.delete(key);
  }
}

export interface LimitState {
  blocked: boolean;
  /** Detik sampai percobaan berikutnya diizinkan. 0 kalau tidak diblokir. */
  retryAfter: number;
  remaining: number;
}

/** Memeriksa TANPA menghitung — dipanggil sebelum kata sandi diverifikasi. */
export function checkLimit(keys: string[]): LimitState {
  const now = Date.now();
  prune(now);

  let worst: LimitState = { blocked: false, retryAfter: 0, remaining: MAX_ATTEMPTS };
  for (const key of keys) {
    const hits = buckets.get(key)?.hits ?? [];
    const remaining = Math.max(0, MAX_ATTEMPTS - hits.length);
    if (hits.length < MAX_ATTEMPTS) {
      if (remaining < worst.remaining) worst = { blocked: false, retryAfter: 0, remaining };
      continue;
    }
    const oldest = hits[0];
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    if (!worst.blocked || retryAfter > worst.retryAfter) {
      worst = { blocked: true, retryAfter, remaining: 0 };
    }
  }
  return worst;
}

/** Mencatat satu percobaan GAGAL. Percobaan yang berhasil tidak dihitung. */
export function recordFailure(keys: string[]): void {
  const now = Date.now();
  prune(now);
  if (buckets.size >= MAX_KEYS) {
    // Jendela yang penuh berarti sedang ada serangan luas. Membuang isinya
    // lebih baik daripada membiarkan peta tumbuh tanpa batas.
    buckets.clear();
  }
  for (const key of keys) {
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits.push(now);
    buckets.set(key, bucket);
  }
}

/** Menghapus hitungan setelah masuk berhasil. */
export function clearLimit(keys: string[]): void {
  for (const key of keys) buckets.delete(key);
}

/**
 * Alamat klien di balik reverse proxy.
 *
 * Aplikasi hanya mendengarkan di 127.0.0.1, jadi `clientAddress` selalu
 * localhost dan `X-Forwarded-For` disetel oleh OpenLiteSpeed — bukan klien.
 * Meski begitu nilainya TIDAK dipercaya sendirian: pembatasan selalu dipasang
 * pada dua kunci sekaligus, alamat DAN nama pengguna, supaya memalsukan
 * alamat tetap tidak bisa melewati kunci nama pengguna.
 */
export function clientKey(request: Request, fallback: string | undefined): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return `ip:${first || fallback || "tidak-diketahui"}`;
}

export function usernameKey(username: string): string {
  return `user:${String(username || "").trim().toLowerCase()}`;
}
