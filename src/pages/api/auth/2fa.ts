import type { APIRoute } from "astro";
import { currentUser } from "../../../lib/auth";
import { listUsers, saveUser, hashPassword, verifyPassword, revokeSessions } from "../../../lib/users";
import { buatRahasia, otpauthUri, rahasiaTerbaca, periksaKode, buatKodeCadangan } from "../../../lib/totp";
import { logActivity } from "../../../lib/activity";
import { json, apiError, unauthorized } from "../../../lib/api";

/**
 * Memasang dan mencabut dua faktor untuk akun SENDIRI.
 *
 * Selalu akun sendiri, tidak pernah akun orang lain — bahkan untuk pemilik.
 * Dua faktor adalah kesepakatan antara seseorang dan ponselnya; admin yang
 * bisa memasangnya untuk orang lain berarti admin yang bisa mengunci orang
 * lain keluar dari akunnya.
 *
 * Alurnya tiga langkah, dan pemisahannya penting:
 *   1. `mulai` — rahasia dibuat dan DISIMPAN, tapi belum berlaku.
 *   2. `aktifkan` — satu kode dari ponselnya membuktikan pemindaiannya benar.
 *      Baru di sini `totpEnabled` menyala.
 *   3. `matikan` — butuh kata sandi, bukan kode. Ponsel yang hilang adalah
 *      alasan paling umum orang mematikannya, dan meminta kode di situ berarti
 *      meminta hal yang justru sedang tidak ada.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const aksi = String(body?.aksi || "");

  if (aksi === "mulai") {
    if (me.totpEnabled) return apiError("err.2faAlready");
    const rahasia = buatRahasia();
    simpan(me.id, (u) => {
      u.totpSecret = rahasia;
      u.totpEnabled = false;
    });
    return json({
      ok: true,
      rahasia: rahasiaTerbaca(rahasia),
      uri: otpauthUri(rahasia, me.username),
    });
  }

  if (aksi === "aktifkan") {
    const segar = listUsers().find((u) => u.id === me.id);
    if (!segar || !segar.totpSecret) return apiError("err.2faNotStarted");
    if (segar.totpEnabled) return apiError("err.2faAlready");
    if (!periksaKode(segar.totpSecret, body?.kode)) return apiError("err.2faWrongCode");

    // Kode cadangan dibuat SEKALI, di sini, dan hanya di sini ia pernah
    // terbaca. Yang tersimpan cuma hash-nya.
    const kode = buatKodeCadangan();
    simpan(me.id, (u) => {
      u.totpEnabled = true;
      u.backupCodes = kode.map(hashPassword);
    });
    logActivity(me, "2fa.on");
    return json({ ok: true, kodeCadangan: kode });
  }

  if (aksi === "kodeBaru") {
    const segar = listUsers().find((u) => u.id === me.id);
    if (!segar || !segar.totpEnabled) return apiError("err.2faNotStarted");
    if (!verifyPassword(String(body?.password || ""), segar.password)) return apiError("err.passwordWrong");

    const kode = buatKodeCadangan();
    simpan(me.id, (u) => { u.backupCodes = kode.map(hashPassword); });
    logActivity(me, "2fa.codes");
    return json({ ok: true, kodeCadangan: kode });
  }

  if (aksi === "matikan") {
    const segar = listUsers().find((u) => u.id === me.id);
    if (!segar) return apiError("err.userNotFound", 404);
    if (!verifyPassword(String(body?.password || ""), segar.password)) return apiError("err.passwordWrong");

    simpan(me.id, (u) => {
      u.totpSecret = "";
      u.totpEnabled = false;
      u.backupCodes = [];
    });
    /*
     * Seluruh sesi lain ikut dicabut.
     *
     * Alasan orang mematikan dua faktor hampir selalu "ponselku hilang", dan
     * ponsel yang hilang mungkin masih memegang sesi yang terbuka. Membiarkan
     * sesi itu hidup berarti melepas lapisan keamanan sambil membiarkan pintu
     * yang mungkin sedang dipegang orang lain tetap terbuka.
     */
    revokeSessions(me.id);
    logActivity(me, "2fa.off");
    return json({ ok: true });
  }

  return apiError("err.badJson");
};

/** Menyunting satu akun di tempat, lewat jalur simpan yang sudah ada. */
function simpan(id: string, ubah: (u: any) => void): void {
  const u = listUsers().find((x) => x.id === id);
  if (!u) return;
  ubah(u);
  saveUser(u);
}
