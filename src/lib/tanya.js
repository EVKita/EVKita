/**
 * Kuota Tanya EVKita: berapa kali satu anggota boleh bertanya per hari.
 *
 * Chatbot publik dibayar per pertanyaan dari kantong pemilik situs, jadi tanpa
 * rem satu orang bisa menghabiskan saldo. Remnya di sini ada dua lapis:
 * pembatasan laju sesaat di endpoint (lihat `ratelimit.ts`) dan kuota harian
 * per anggota di berkas ini.
 *
 * Sengaja JavaScript polos tanpa API Node: aturannya diuji langsung di
 * `tests/tanya-gemini.test.ts` terhadap kode yang sama persis dengan yang
 * dipakai server. Aplikasi berjalan satu proses (lihat `ratelimit.ts`),
 * jadi peta di memori sudah cukup.
 */

/** Pertanyaan per anggota per hari kalender WIB. */
export const TANYA_KUOTA_HARIAN = 20;

/** Panjang pertanyaan yang diterima, dalam karakter. */
export const TANYA_MIN = 2;
export const TANYA_MAKS = 500;

/** Pagar terakhir supaya peta tidak bisa dijadikan alat menghabiskan memori. */
const MAKS_KUNCI = 5000;

const hitungan = new Map();

/**
 * Tanggal kalender WIB (`YYYY-MM-DD`) — hari dan jam memakai WIB yang
 * dipatok, bukan zona waktu server (yang di produksi UTC). Tanpa ini kuota
 * berganti pukul tujuh pagi.
 */
export function tanggalWib(sekarang) {
  const geser = new Date(nowMs(sekarang) + 7 * 3600 * 1000);
  return geser.toISOString().slice(0, 10);
}

function nowMs(sekarang) {
  return sekarang instanceof Date ? sekarang.getTime() : Date.now();
}

function kunciUntuk(anggotaId, sekarang) {
  return `${String(anggotaId || "")}|${tanggalWib(sekarang)}`;
}

function pangkas() {
  if (hitungan.size > MAKS_KUNCI) hitungan.clear();
}

/** Sisa kuota hari ini untuk anggota ini. */
export function sisaKuota(anggotaId, sekarang) {
  const dipakai = hitungan.get(kunciUntuk(anggotaId, sekarang)) || 0;
  return Math.max(0, TANYA_KUOTA_HARIAN - dipakai);
}

/**
 * Mencatat satu pertanyaan. Mengembalikan `{ boleh, sisa }`: `boleh` false
 * kalau kuota hari ini sudah habis (dan tidak dicatat dua kali).
 */
export function catatPertanyaan(anggotaId, sekarang) {
  pangkas();
  const kunci = kunciUntuk(anggotaId, sekarang);
  const dipakai = hitungan.get(kunci) || 0;
  if (dipakai >= TANYA_KUOTA_HARIAN) return { boleh: false, sisa: 0 };
  hitungan.set(kunci, dipakai + 1);
  return { boleh: true, sisa: TANYA_KUOTA_HARIAN - dipakai - 1 };
}

/** Validasi panjang pertanyaan. Mengembalikan kunci galat atau string kosong. */
export function galatPertanyaan(pertanyaan) {
  const s = String(pertanyaan || "").trim();
  if (!s) return "err.tanya.kosong";
  if (s.length < TANYA_MIN) return "err.tanya.pendek";
  if (s.length > TANYA_MAKS) return "err.tanya.panjang";
  return "";
}
