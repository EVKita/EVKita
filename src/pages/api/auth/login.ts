import type { APIRoute } from "astro";
import { makeSession, authenticate, SESSION_COOKIE, LOCALE_COOKIE } from "../../../lib/auth";
import { touchLogin, saveUser, normalizeLocale } from "../../../lib/users";
import { logActivity } from "../../../lib/activity";
import { json, apiError } from "../../../lib/api";

export const POST: APIRoute = async ({ request, cookies, url }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  const user = authenticate(body?.username, body?.password);
  if (!user) return apiError("login.wrong", 401);

  /* Bahasa yang dipilih di halaman masuk adalah pilihan yang paling baru
     dinyatakan orangnya, jadi ia menang atas isi profil — kalau tidak, memilih
     "English" sebelum masuk terasa diabaikan begitu dasbor terbuka. */
  const picked = normalizeLocale(cookies.get(LOCALE_COOKIE)?.value);
  if (cookies.get(LOCALE_COOKIE)?.value && picked !== user.locale) {
    user.locale = picked;
    saveUser(user);
  }

  touchLogin(user.id);
  logActivity(user, "login");

  const secure = url.protocol === "https:";
  cookies.set(SESSION_COOKIE, makeSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Di belakang reverse proxy, url.protocol sudah mencerminkan skema asli
    // selama proxy meneruskan X-Forwarded-Proto.
    secure,
    maxAge: 60 * 60 * 24 * 7,
  });

  // Bahasa pilihan pengguna dicerminkan ke cookie biasa supaya halaman yang
  // dirender server (login, pembaruan, kerangka /admin) tahu bahasa mana yang
  // harus dipakai sejak permintaan pertama, tanpa menunggu JavaScript.
  cookies.set(LOCALE_COOKIE, user.locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 365,
  });

  return json({ ok: true, locale: user.locale });
};
