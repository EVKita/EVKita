import type { APIRoute } from "astro";
import { currentUser, makeSession, LOCALE_COOKIE, SESSION_COOKIE } from "../../lib/auth";
import {
  hashPassword,
  publicUser,
  saveUser,
  usernameTaken,
  verifyPassword,
  normalizeLocale,
  revokeSessions,
  PASSWORD_MIN,
  type User,
} from "../../lib/users";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized } from "../../lib/api";

const USERNAME_RE = /^[A-Za-z0-9._]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Menerbitkan ulang cookie sesi setelah pencabutan.
 *
 * Pencabutan mematikan SEMUA sesi milik akun ini, termasuk yang sedang dipakai
 * orang yang menekan tombolnya. Tanpa cookie baru, mengganti kata sandi sendiri
 * akan langsung melempar pelakunya ke halaman masuk — perilaku yang terasa
 * seperti kegagalan, bukan keberhasilan.
 */
function issueFreshCookie(cookies: any, userId: string, url: URL): void {
  cookies.set(SESSION_COOKIE, makeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/**
 * Pengaturan akun sendiri. Dipisah per `section` supaya satu formulir yang
 * gagal (mis. kata sandi lama salah) tidak ikut membatalkan perubahan nama
 * yang sebenarnya sudah benar.
 */
export const PUT: APIRoute = async ({ request, cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const section = String(body?.section || "identity");
  const next: User = { ...me };

  if (section === "identity") {
    const name = String(body?.name || "").trim();
    const username = String(body?.username || "").trim();
    const email = String(body?.email || "").trim();

    if (!name) return apiError("err.nameRequired");
    if (username.length < 3) return apiError("err.usernameShort");
    if (!USERNAME_RE.test(username)) return apiError("err.usernameFormat");
    if (usernameTaken(username, me.id)) return apiError("err.usernameTaken");
    if (email && !EMAIL_RE.test(email)) return apiError("err.emailInvalid");

    next.name = name;
    next.username = username;
    next.email = email;
    next.avatar = String(body?.avatar || "");
    saveUser(next);
    logActivity(next, "profile.update");
    return json({ ok: true, user: publicUser(next) });
  }

  if (section === "password") {
    const current = String(body?.currentPassword || "");
    const fresh = String(body?.newPassword || "");
    const repeat = String(body?.confirmPassword || "");

    if (!verifyPassword(current, me.password)) return apiError("err.passwordWrong");
    if (fresh.length < PASSWORD_MIN) return apiError("err.passwordShort", 400, { n: PASSWORD_MIN });
    if (fresh !== repeat) return apiError("err.passwordMismatch");

    next.password = hashPassword(fresh);
    saveUser(next);

    // Mengganti kata sandi kini benar-benar mengeluarkan sesi lain. Sebelum
    // ini, kata sandi yang bocor tetap memberi aksesnya kepada siapa pun yang
    // sudah terlanjur masuk — mengganti kata sandi tidak menutup apa pun.
    revokeSessions(next.id);
    issueFreshCookie(cookies, next.id, url);

    logActivity(next, "password.change");
    return json({ ok: true });
  }

  if (section === "signOutOthers") {
    revokeSessions(next.id);
    issueFreshCookie(cookies, next.id, url);
    logActivity(next, "sessions.revoke");
    return json({ ok: true });
  }

  if (section === "prefs") {
    next.locale = normalizeLocale(body?.locale);
    next.theme = body?.theme === "light" || body?.theme === "dark" ? body.theme : "auto";
    next.density = body?.density === "compact" ? "compact" : "comfortable";
    next.homeView = String(body?.homeView || "dashboard");
    saveUser(next);

    cookies.set(LOCALE_COOKIE, next.locale, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: url.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365,
    });

    return json({ ok: true, user: publicUser(next) });
  }

  return apiError("err.badJson");
};

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  return json({ ok: true, user: publicUser(me) });
};
