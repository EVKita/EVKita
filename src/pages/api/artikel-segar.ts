import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";
import { readContent } from "../../lib/store";
import { artikelTayang } from "../../lib/artikel.js";
import {
  bacaSegar,
  jalankanSegar,
  simpanPengaturanSegar,
} from "../../lib/artikel-segar";
import { siapRiset, modelBawaan } from "../../lib/ai-jobs";

/**
 * Pengaturan & kendali penyegar artikel tayang harian.
 *
 * Pola yang sama dengan `/api/artikel-auto`: `GET` untuk menggambar panel,
 * `PUT` menyimpan saklar, `POST` memaksa satu putaran sekarang di latar
 * belakang. Tertutup untuk Editor lewat `can(me, "ai")` — penyegaran memakai
 * kuota/uang AI sekaligus mengubah konten tayang, jadi keputusannya milik
 * pemilik/admin.
 */
function muatan() {
  const status = bacaSegar();
  return {
    ok: true,
    siap: siapRiset(),
    modelBawaan: modelBawaan(),
    pengaturan: status.pengaturan,
    jalan: status.jalan,
    tayang: artikelTayang(readContent().artikel).length,
    terakhir: status.hasil,
  };
}

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();
  return json(muatan());
};

export const POST: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();

  const status = bacaSegar();
  if (status.jalan) return apiError("err.segar.sedangJalan", 409);

  // Tidak di-await: penyegaran berjalan di latar belakang, panel memantau lewat GET.
  void jalankanSegar({ paksa: true }).catch(() => {});
  return json({ ok: true, mulai: true });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson", 400);
  }

  simpanPengaturanSegar(body);
  return json(muatan());
};
