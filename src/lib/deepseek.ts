/**
 * Klien DeepSeek.
 *
 * Ini SATU-SATUNYA berkas yang tahu bentuk API DeepSeek. Sisa panel bicara
 * dengan tipe yang didefinisikan di sini, jadi kalau suatu hari penyedianya
 * berganti — atau DeepSeek mengganti nama modelnya lagi, yang sudah terjadi
 * sekali pada Juli 2026 — hanya berkas ini yang perlu disentuh.
 *
 * Isinya untuk sekarang baru satu hal: memeriksa apakah sebuah kunci API
 * benar-benar sah, dan berapa saldonya. Itu yang dibutuhkan halaman Pengaturan
 * AI, dan urutannya penting — kunci yang salah ketik harus gagal pada detik ia
 * disimpan, bukan berhari-hari kemudian di tengah pekerjaan orang lain.
 *
 * Kuncinya tidak pernah ditulis ke log mana pun di berkas ini. Kalau ada
 * `console.log` baru ditambahkan di sini suatu hari, periksa dua kali apa yang
 * ikut tercetak.
 */

const BASE_URL = "https://api.deepseek.com";

/**
 * Batas tunggu satu permintaan. Sengaja pendek: satu-satunya panggilan di
 * berkas ini adalah pembacaan saldo, yang tidak melakukan inferensi apa pun,
 * jadi jawaban yang lambat berarti ada yang salah — bukan model yang berpikir.
 */
const TIMEOUT_MS = 15_000;

/**
 * Bentuk kunci DeepSeek: awalan `sk-` diikuti huruf, angka, garis bawah, atau
 * strip. Pemeriksaan ini TIDAK menggantikan uji ke server; ia hanya menolak
 * salah tempel yang sudah jelas — spasi yang ikut tersalin, kunci milik
 * penyedia lain — tanpa perlu menunggu jaringan lebih dulu.
 */
const KEY_RE = /^sk-[A-Za-z0-9_-]{16,120}$/;

export function keyLooksValid(key: string): boolean {
  return KEY_RE.test(String(key || "").trim());
}

/**
 * Empat karakter terakhir kunci, untuk ditampilkan di panel.
 *
 * Tidak pernah lebih dari empat, dan tidak pernah dari depan: yang dibutuhkan
 * pembaca hanya "apakah ini kunci yang saya kira", dan empat karakter sudah
 * menjawabnya. Awalan `sk-` sama di semua kunci, jadi menampilkannya tidak
 * memberi tahu apa pun sambil membocorkan lebih banyak.
 */
export function keyTail(key: string): string {
  const s = String(key || "").trim();
  return s.length >= 4 ? s.slice(-4) : "";
}

export interface BalanceInfo {
  /** "CNY" atau "USD". */
  currency: string;
  total: string;
  granted: string;
  toppedUp: string;
}

export interface BalanceOk {
  ok: true;
  /** Apakah saldonya cukup untuk memanggil API. */
  available: boolean;
  balances: BalanceInfo[];
}

export interface BalanceFail {
  ok: false;
  errorKey: string;
}

export type BalanceResult = BalanceOk | BalanceFail;

/**
 * Kode HTTP DeepSeek → kunci terjemahan panel.
 *
 * Dikembalikan sebagai KUNCI, bukan kalimat: panel bisa berbahasa Indonesia,
 * Inggris, atau Mandarin, dan berkas ini tidak tahu yang mana. Pola yang sama
 * dipakai seluruh endpoint panel (lihat `src/lib/api.ts`).
 *
 * Daftar kodenya dari api-docs.deepseek.com/quick_start/error_codes.
 */
export function errorKeyForStatus(status: number): string {
  if (status === 401) return "err.ai.kunciSalah";
  if (status === 402) return "err.ai.saldoHabis";
  if (status === 429) return "err.ai.sibuk";
  if (status >= 500) return "err.ai.deepseekBermasalah";
  return "err.ai.ditolak";
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Membaca saldo akun DeepSeek — sekaligus cara termurah membuktikan sebuah
 * kunci sah. Endpoint ini tidak menjalankan model, jadi memanggilnya tidak
 * memotong saldo sepeser pun.
 */
export async function fetchBalance(key: string): Promise<BalanceResult> {
  const trimmed = String(key || "").trim();
  if (!trimmed) return { ok: false, errorKey: "err.ai.belumAdaKunci" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/user/balance`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${trimmed}` },
      signal: ac.signal,
    });
  } catch {
    // Jaringan mati, DNS gagal, atau batas waktu tercapai. Ketiganya berarti
    // hal yang sama bagi pembaca panel: kita tidak berhasil menghubunginya.
    return { ok: false, errorKey: "err.ai.tidakTerhubung" };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return { ok: false, errorKey: errorKeyForStatus(res.status) };

  /*
   * Dibaca sebagai teks lalu di-parse sendiri, bukan lewat `res.json()`.
   * DeepSeek memakai mekanisme keep-alive yang menyisipkan baris kosong ke
   * dalam jawaban selama server masih menyiapkan balasannya, dan badan yang
   * benar-benar kosong bukan hal mustahil. Keduanya harus jadi galat yang
   * bisa dibaca orang, bukan pengecualian mentah dari parser.
   */
  let data: any;
  try {
    const raw = (await res.text()).trim();
    if (!raw) return { ok: false, errorKey: "err.ai.jawabanTidakTerbaca" };
    data = JSON.parse(raw);
  } catch {
    return { ok: false, errorKey: "err.ai.jawabanTidakTerbaca" };
  }

  const list = Array.isArray(data?.balance_infos) ? data.balance_infos : [];
  return {
    ok: true,
    available: !!data?.is_available,
    balances: list.map((b: any) => ({
      currency: str(b?.currency) || "USD",
      total: str(b?.total_balance),
      granted: str(b?.granted_balance),
      toppedUp: str(b?.topped_up_balance),
    })),
  };
}
