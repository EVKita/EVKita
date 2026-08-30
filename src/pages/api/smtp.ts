import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { writeEnvFile } from "../../lib/env";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";
import { checkLimit, clearLimit, clientKey, recordFailure } from "../../lib/ratelimit";
import { bacaSmtp, kirimEmail, smtpState } from "../../lib/smtp";

/**
 * Pengaturan SMTP untuk formulir kontak.
 *
 * Aturan yang memegang seluruh berkas ini, sama seperti kunci API DeepSeek:
 *
 *   Kata sandi masuk lewat sini, dan TIDAK PERNAH keluar lagi.
 *
 * `GET` mengembalikan pengaturan tanpa kata sandinya; `PUT` menyimpan dan hanya
 * menulis kata sandi kalau field-nya diisi (kosong berarti "pertahankan");
 * `DELETE` menghapus seluruh pengaturan; `POST` mengirim email uji supaya orang
 * yang baru memasang tahu sekarang juga kalau kredensialnya salah.
 */

const KEY = {
  host: "SMTP_HOST",
  port: "SMTP_PORT",
  user: "SMTP_USER",
  pass: "SMTP_PASS",
  from: "SMTP_FROM",
  secure: "SMTP_SECURE",
} as const;

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "kontak")) return forbidden();
  return json(smtpState());
};

export const PUT: APIRoute = async ({ request, cookies, clientAddress }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "kontak")) return forbidden();

  const limitKeys = [clientKey(request, clientAddress), `smtp:${me.id}`];
  const limit = checkLimit(limitKeys);
  if (limit.blocked) {
    return apiError("err.ai.terlaluSering", 429, { detik: limit.retryAfter });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const vars: Record<string, string> = {};

  if (typeof body?.host === "string") vars[KEY.host] = body.host.trim();
  if (typeof body?.user === "string") vars[KEY.user] = body.user.trim();
  if (typeof body?.from === "string") vars[KEY.from] = body.from.trim();

  const portRaw = String(body?.port ?? "").trim();
  if (portRaw) {
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return apiError("err.kontak.port", 400);
    }
    vars[KEY.port] = String(port);
  }

  vars[KEY.secure] = body?.secure ? "true" : "false";

  /*
   * Kata sandi kosong berarti "jangan ubah yang sudah tersimpan" — menulis
   * ulang dengan nilai kosong akan memutuskan pemasangan yang sudah bekerja
   * hanya karena orang menyimpan ulang formulir tanpa mengetik ulang
   * kata sandinya (yang memang tidak pernah ditampilkan kembali).
   */
  const pass = typeof body?.pass === "string" ? body.pass.trim() : "";
  if (pass) vars[KEY.pass] = pass;

  writeEnvFile(vars);
  logActivity(me, "kontak.smtpSet");

  return json(smtpState());
};

export const DELETE: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "kontak")) return forbidden();

  writeEnvFile({
    [KEY.host]: null,
    [KEY.port]: null,
    [KEY.user]: null,
    [KEY.pass]: null,
    [KEY.from]: null,
    [KEY.secure]: null,
  });
  logActivity(me, "kontak.smtpRemoved");

  return json(smtpState());
};

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "kontak")) return forbidden();

  const limitKeys = [clientKey(request, clientAddress), `smtp-uji:${me.id}`];
  const limit = checkLimit(limitKeys);
  if (limit.blocked) {
    return apiError("err.ai.terlaluSering", 429, { detik: limit.retryAfter });
  }

  const cfg = bacaSmtp();
  if (!cfg) return apiError("err.kontak.belumDiatur");

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ke = String(body?.ke || "").trim() || cfg.from;
  if (!ke.includes("@")) return apiError("err.kontak.emailUji");

  try {
    await kirimEmail({
      ke,
      subjek: "Email uji dari EVKita",
      teks: "Ini email uji. Kalau pesan ini sampai, pengaturan SMTP-nya sudah benar dan formulir kontak siap dipakai.\n\n— EVKita",
    });
  } catch (err) {
    recordFailure(limitKeys);
    const pesan = err instanceof Error ? err.message : String(err);
    return apiError("err.kontak.gagalKirim", 502, { pesan: pesan.slice(0, 300) });
  }

  clearLimit(limitKeys);
  return json({ ok: true });
};
