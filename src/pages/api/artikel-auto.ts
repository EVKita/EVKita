import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";
import { readContent } from "../../lib/store";
import {
  bacaArtikelHarian,
  jalankanArtikel,
  simpanPengaturanArtikel,
  drafTunggu,
} from "../../lib/artikel-harian";
import { siapRiset, modelBawaan } from "../../lib/ai-jobs";

/**
 * Pengaturan & kendali artikel otomatis harian.
 *
 * Pola yang sama dengan `/api/pembaruan`: `GET` untuk menggambar panel,
 * `PUT` menyimpan saklar, `POST` memaksa satu artikel ditulis dan diterbitkan
 * sekarang di latar belakang. Tertutup untuk Editor lewat `can(me, "ai")` —
 * penulisan memakai kuota/uang AI, jadi keputusannya milik pemilik/admin.
 */
function muatan() {
  const status = bacaArtikelHarian();
  return {
    ok: true,
    siap: siapRiset(),
    modelBawaan: modelBawaan(),
    pengaturan: status.pengaturan,
    jalan: status.jalan,
    tunggu: drafTunggu(readContent().artikel).length,
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

  const status = bacaArtikelHarian();
  if (status.jalan) return apiError("err.draf.sedangJalan", 409);

  // Tidak di-await: penulisan berjalan di latar belakang, panel memantau lewat GET.
  void jalankanArtikel({ paksa: true }).catch(() => {});
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

  simpanPengaturanArtikel(body);
  return json(muatan());
};
