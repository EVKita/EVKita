import type { APIRoute } from "astro";
import { json } from "../../lib/api";
import { checkLimit, recordFailure, clearLimit, clientKey } from "../../lib/ratelimit";
import { makeSession } from "../../lib/auth";
import { verifikasiTokenGoogle, simpanAnggota, MEMBER_COOKIE } from "../../lib/member.js";
import { bacaIntegrasi } from "../../lib/integrasi-simpan";

/**
 * Masuk pengunjung lewat Google (token ID dari Google Identity Services).
 *
 * Tokennya diverifikasi ke kunci publik Google di `lib/member.js` — BUKAN
 * dipercaya begitu saja. Yang lolos dicatat ke `data/members.json` dan diberi
 * cookie sesi bertanda tangan 30 hari. Pembatas laju yang sama dengan login
 * panel dipakai di sini: endpoint publik tanpa gembok adalah undangan.
 */
export const POST: APIRoute = async ({ request, cookies, url, clientAddress }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* abaikan */
  }
  const credential = String(body?.credential || "");

  // Hanya per alamat: kunci bersama "member-google" dulu membuat 8 token buruk
  // dari SIAPA PUN mengunci login Google untuk SEMUA pengunjung 15 menit.
  const keys = [clientKey(request, clientAddress)];
  const limit = checkLimit(keys);
  if (limit.blocked) return json({ ok: false }, 429, { "Retry-After": String(limit.retryAfter) });

  const cfg = bacaIntegrasi();
  if (!cfg.googleClientId) return json({ ok: false }, 404);

  if (!credential || credential.length > 8000) {
    recordFailure(keys);
    return json({ ok: false }, 400);
  }

  let klaim;
  try {
    klaim = await verifikasiTokenGoogle(credential, cfg.googleClientId);
  } catch {
    recordFailure(keys);
    return json({ ok: false }, 401);
  }
  clearLimit(keys);

  const anggota = simpanAnggota(klaim);
  const secure = url.protocol === "https:";
  cookies.set(MEMBER_COOKIE, makeSession(anggota.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 60 * 60 * 24 * 30,
  });

  return json({ ok: true, email: anggota.email });
};
