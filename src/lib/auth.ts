import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Maryamazkadynarachmat";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Nurrachmat1";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function sign(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

export function makeSession(): string {
  const value = crypto.randomBytes(24).toString("hex");
  return `${value}.${sign(value)}`;
}

export function isValidSession(token?: string | null): boolean {
  if (!token) return false;
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
  if (!safeEqual(username || "", ADMIN_USERNAME)) return false;
  if (!safeEqual(password || "", ADMIN_PASSWORD)) return false;
  return true;
}

interface CookieJar {
  get(name: string): { value?: string } | undefined;
}

export const SESSION_COOKIE = "admin_session";

export function isAuthed(cookies: CookieJar): boolean {
  return isValidSession(cookies.get(SESSION_COOKIE)?.value);
}
