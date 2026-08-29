import type { APIRoute } from "astro";
import { makeSession, authenticate, SESSION_COOKIE, LOCALE_COOKIE } from "../../../lib/auth";
import { touchLogin, saveUser, normalizeLocale, pakaiKodeCadangan } from "../../../lib/users";
import { periksaKode } from "../../../lib/totp";
import { logActivity } from "../../../lib/activity";
import { json, apiError } from "../../../lib/api";
import { checkLimit, recordFailure, clearLimit, clientKey, usernameKey } from "../../../lib/ratelimit";

export const POST: APIRoute = async ({ request, cookies, url, clientAddress }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  const username = String(body?.username || "");

  /* Dua kunci sekaligus, bukan salah satu: kunci alamat menahan satu penyerang
     yang mencoba banyak kata sandi, kunci nama pengguna menahan banyak alamat
     yang mengeroyok satu akun — dan membuat pemalsuan X-Forwarded-For tidak
     cukup untuk lolos. */
  const keys = [clientKey(request, clientAddress), usernameKey(username)];

  const limit = checkLimit(keys);
  if (limit.blocked) {
    // Dicatat sekali per pemblokiran, bukan per percobaan: yang ingin dilihat
    // pemilik adalah "ada yang menggedor", bukan ribuan baris identik.
    logActivity(null, "login.blocked", { username: username.slice(0, 40) });
    return json(
      {
        ok: false,
        errorKey: "login.tooMany",
        errorVars: { minutes: Math.ceil(limit.retryAfter / 60) },
        error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(limit.retryAfter / 60)} menit.`,
      },
      429,
      { "Retry-After": String(limit.retryAfter) }
    );
  }

  const user = authenticate(username, body?.password);
  if (!user) {
    recordFailure(keys);
    return apiError("login.wrong", 401);
  }

  /*
   * Faktor kedua.
   *
   * Diperiksa SETELAH kata sandi, dan kegagalannya dihitung oleh pembatas laju
   * yang sama. Enam digit bisa ditebak dalam sejuta percobaan kalau boleh
   * dicoba tanpa henti — dan penyerang yang sampai di sini sudah memegang kata
   * sandinya, jadi justru di titik inilah pembatasan itu paling dibutuhkan.
   *
   * Jawaban `perluKode` sengaja tidak menyebut apa pun yang belum diketahui
   * pengirimnya: ia baru dikirim setelah kata sandinya benar.
   */
  if (user.totpEnabled) {
    const kode = String(body?.code || "").trim();
    if (!kode) return json({ ok: false, perluKode: true }, 401);

    const cocok = periksaKode(user.totpSecret, kode) || pakaiKodeCadangan(user.id, kode);
    if (!cocok) {
      recordFailure(keys);
      return json({ ok: false, perluKode: true, errorKey: "login.wrongCode", errorVars: {}, error: "Kode tidak cocok." }, 401);
    }
  }

  // Masuk yang berhasil menghapus hitungannya: orang yang salah ketik tiga
  // kali lalu benar tidak boleh membawa beban itu ke sesi berikutnya.
  clearLimit(keys);

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
