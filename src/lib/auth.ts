import crypto from "node:crypto";
import { getEnv } from "./env";

const PLACEHOLDER_SECRETS = new Set([
  "ubah-dengan-string-acak-yang-panjang-dan-rahasia",
  "dev-secret-change-me",
]);

/**
 * Kredensial dan kunci sesi TIDAK punya nilai bawaan: selama wizard di /install
 * belum dijalankan, login admin harus selalu ditolak. Nilai bawaan yang
 * di-hardcode di sini akan ikut terpublikasi bersama kode sumber.
 */
function configured(key: string): string {
  const v = getEnv(key, "");
  return PLACEHOLDER_SECRETS.has(v) ? "" : v;
}

const secret = () => configured("SESSION_SECRET");
const adminUser = () => configured("ADMIN_USERNAME");
const adminPass = () => configured("ADMIN_PASSWORD");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export function makeSession(): string {
  const value = crypto.randomBytes(24).toString("hex");
  return `${value}.${sign(value)}`;
}

export function isValidSession(token?: string | null): boolean {
  if (!token) return false;
  if (!secret()) return false;
  const i = token.lastIndexOf(".");
  if (i <= 0) return false;
  const value = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(value);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return false;
  }
}

export function checkCredentials(username?: string | null, password?: string | null): boolean {
  if (!adminUser() || !adminPass() || !secret()) return false;
  if (!safeEqual(username || "", adminUser())) return false;
  if (!safeEqual(password || "", adminPass())) return false;
  return true;
}

interface CookieJar {
  get(name: string): { value?: string } | undefined;
}

export const SESSION_COOKIE = "admin_session";

export function isAuthed(cookies: CookieJar): boolean {
  return isValidSession(cookies.get(SESSION_COOKIE)?.value);
}
