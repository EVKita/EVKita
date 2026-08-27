import crypto from "node:crypto";
import { getEnv } from "./env";
import { findById, findByUsername, verifyPassword, type User } from "./users";

const PLACEHOLDER_SECRETS = new Set([
  "ubah-dengan-string-acak-yang-panjang-dan-rahasia",
  "dev-secret-change-me",
]);

/**
 * Kunci sesi TIDAK punya nilai bawaan: selama wizard di /install belum
 * dijalankan, login admin harus selalu ditolak. Nilai bawaan yang di-hardcode
 * di sini akan ikut terpublikasi bersama kode sumber.
 */
function configured(key: string): string {
  const v = getEnv(key, "");
  return PLACEHOLDER_SECRETS.has(v) ? "" : v;
}

const secret = () => configured("SESSION_SECRET");

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

/**
 * Umur maksimum satu sesi. Angkanya sama dengan `maxAge` cookie, tapi yang ini
 * yang benar-benar mengikat: `maxAge` hanya instruksi untuk peramban, dan
 * peramban bukan pihak yang bisa dipercaya menegakkannya. Token yang tersalin
 * keluar — dari log, dari perangkat yang hilang — dulu sah selamanya.
 */
export const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Token sesi: `<userId>.<waktuTerbit>.<acak>.<tanda tangan>`.
 *
 * Sebelum panel mengenal banyak akun, token hanya berisi nilai acak — server
 * tahu "ada yang sudah login" tapi tidak tahu siapa. Sapaan di dasbor, log
 * aktivitas, dan preferensi per pengguna semuanya butuh identitas itu, jadi
 * id ikut ditandatangani bersama nilai acaknya.
 *
 * Waktu terbit ditambahkan belakangan, dan ia yang membuat dua hal jadi
 * mungkin: sesi yang benar-benar kedaluwarsa, dan pencabutan sesi lama tanpa
 * mengganti SESSION_SECRET (lihat `sessionsValidFrom` di users.ts).
 *
 * Konsekuensi yang disengaja: token berbentuk lama tidak lagi sah, jadi semua
 * orang login sekali lagi setelah pembaruan ini.
 */
export function makeSession(userId: string): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  const payload = `${userId}.${Date.now().toString(36)}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export interface SessionInfo {
  userId: string;
  /** Waktu token diterbitkan, dalam milidetik epoch. */
  issuedAt: number;
}

/**
 * Membaca token dan memverifikasi tanda tangannya. Belum memeriksa apakah
 * penggunanya masih ada — itu tugas `currentUser()`.
 */
export function readSession(token?: string | null): SessionInfo | null {
  if (!token) return null;
  if (!secret()) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [userId, issuedRaw, nonce, sig] = parts;
  if (!userId || !issuedRaw || !nonce || !sig) return null;

  const payload = `${userId}.${issuedRaw}.${nonce}`;
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sign(payload), "utf8"), Buffer.from(sig, "utf8"));
    if (!ok) return null;
  } catch {
    // timingSafeEqual melempar kalau panjangnya berbeda — itu juga berarti tidak cocok.
    return null;
  }

  const issuedAt = Number.parseInt(issuedRaw, 36);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
  if (Date.now() - issuedAt > MAX_SESSION_MS) return null;

  return { userId, issuedAt };
}

export function sessionUserId(token?: string | null): string | null {
  return readSession(token)?.userId ?? null;
}

/**
 * Apakah token ini masih diakui oleh akunnya?
 *
 * `sessionsValidFrom` dinaikkan setiap kali kata sandi berubah atau pemiliknya
 * menekan "keluar dari semua perangkat". Token yang terbit sebelum saat itu
 * langsung mati — tanpa perlu mengganti SESSION_SECRET, yang akan mengeluarkan
 * semua orang sekaligus.
 */
export function stillAccepted(user: Pick<User, "sessionsValidFrom">, session: SessionInfo): boolean {
  if (!user.sessionsValidFrom) return true;
  const cutoff = Date.parse(user.sessionsValidFrom);
  if (!Number.isFinite(cutoff)) return true;
  // TANPA toleransi. Sempat ada kelonggaran satu detik di sini untuk berjaga
  // kalau token dan `sessionsValidFrom` ditulis di permintaan yang sama, dan
  // akibatnya sesi lain yang terbit sedetik sebelum pencabutan ikut selamat —
  // persis sesi yang sedang ingin diputus orangnya. Kelonggaran itu tidak
  // pernah dibutuhkan: pemanggil selalu mencabut LEBIH DULU lalu menerbitkan
  // token baru, jadi token barunya dijamin tidak lebih tua dari batasnya.
  return session.issuedAt >= cutoff;
}

export function isValidSession(token?: string | null): boolean {
  const session = readSession(token);
  if (!session) return false;
  const user = findById(session.userId);
  return !!user && stillAccepted(user, session);
}

/** Memeriksa kredensial login. Mengembalikan akunnya kalau cocok. */
export function authenticate(username?: string | null, password?: string | null): User | null {
  if (!secret()) return null;
  const user = findByUsername(String(username || ""));
  if (!user) return null;
  if (!verifyPassword(String(password || ""), user.password)) return null;
  return user;
}

interface CookieJar {
  get(name: string): { value?: string } | undefined;
}

export const SESSION_COOKIE = "admin_session";
export const LOCALE_COOKIE = "evkita_lang";

/** Pengguna yang sedang login, atau null kalau sesinya tidak sah. */
export function currentUser(cookies: CookieJar): User | null {
  const session = readSession(cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = findById(session.userId);
  if (!user) return null;
  return stillAccepted(user, session) ? user : null;
}

export function isAuthed(cookies: CookieJar): boolean {
  return !!currentUser(cookies);
}
