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
 * Token sesi membawa id pengguna: `<userId>.<acak>.<tanda tangan>`.
 *
 * Sebelum panel mengenal banyak akun, token hanya berisi nilai acak — server
 * tahu "ada yang sudah login" tapi tidak tahu siapa. Sapaan di dasbor, log
 * aktivitas, dan preferensi per pengguna semuanya butuh identitas itu, jadi
 * id ikut ditandatangani bersama nilai acaknya.
 *
 * Konsekuensi yang disengaja: token lama (dua bagian) tidak lagi sah, jadi
 * semua orang login sekali lagi setelah pembaruan ini.
 */
export function makeSession(userId: string): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  const payload = `${userId}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionUserId(token?: string | null): string | null {
  if (!token) return null;
  if (!secret()) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (payload.indexOf(".") <= 0) return null;
  try {
    const ok = crypto.timingSafeEqual(
      Buffer.from(sign(payload), "utf8"),
      Buffer.from(sig, "utf8")
    );
    if (!ok) return null;
  } catch {
    return null;
  }
  return payload.slice(0, payload.indexOf("."));
}

export function isValidSession(token?: string | null): boolean {
  const id = sessionUserId(token);
  return !!id && !!findById(id);
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
  const id = sessionUserId(cookies.get(SESSION_COOKIE)?.value);
  return id ? findById(id) : null;
}

export function isAuthed(cookies: CookieJar): boolean {
  return !!currentUser(cookies);
}
