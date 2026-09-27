import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";
import { readContent } from "../../lib/store";
import {
  bacaPembaruan,
  jalankanPembaruan,
  simpanPengaturan,
} from "../../lib/pembaruan-kendaraan";
import { pilihKendaraan } from "../../lib/pembaruan.js";
import { siapRiset, modelBawaan } from "../../lib/ai-jobs";

/**
 * Pengaturan & kendali auto-update katalog.
 *
 * `GET` mengembalikan pengaturan, status putaran terakhir, dan berapa
 * kendaraan yang akan diriset hari ini — cukup untuk menggambar panel tanpa
 * memuat seluruh CMS. `PUT` menyimpan pengaturan. `POST` memaksa satu putaran
 * berjalan sekarang (dipakai tombol "Jalankan sekarang"), dan menjawab SEKETIKA
 * sementara risetnya berjalan di latar belakang — pola yang sama dengan
 * `/api/ai/riset`.
 *
 * Seluruhnya tertutup untuk Editor lewat `can(me, "ai")`: fitur ini memakai
 * kuota riset dan uang, jadi pengaturannya keputusan pemilik/admin.
 */

function muatan() {
  const status = bacaPembaruan();
  const kandidat = pilihKendaraan(readContent(), status.pengaturan).length;
  return {
    ok: true,
    siap: siapRiset(),
    modelBawaan: modelBawaan(),
    pengaturan: status.pengaturan,
    jalan: status.jalan,
    kandidat,
    terakhir: status.terakhir,
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

  const status = bacaPembaruan();
  if (status.jalan) return apiError("err.pembaruan.sedangJalan", 409);

  logActivity(me, "ai.autoUpdateRun");
  // Tidak di-await: riset berjalan di latar belakang, panel memantau lewat GET.
  void jalankanPembaruan({ paksa: true }).catch(() => {});
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

  simpanPengaturan(body);
  logActivity(me, "ai.autoUpdateConfig");
  return json(muatan());
};
