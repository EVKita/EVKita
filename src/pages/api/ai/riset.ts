import type { APIRoute } from "astro";
import { currentUser } from "../../../lib/auth";
import { can } from "../../../lib/users";
import { readContent } from "../../../lib/store";
import { logActivity } from "../../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../../lib/api";
import {
  batalkanRiset,
  jobMilik,
  jobPublik,
  KUOTA_HARIAN,
  modelBawaan,
  mulaiRiset,
  pemakaianHariIni,
  siapRiset,
  type Mode,
} from "../../../lib/ai-jobs";

/**
 * Menjalankan dan memantau riset AI.
 *
 * `POST` menjawab SEKETIKA dengan id job-nya; risetnya sendiri berjalan di
 * latar dan berumur sampai dua menit. Panel menanyakan kemajuannya lewat `GET`
 * berulang, bukan lewat SSE: produksi ada di balik reverse proxy OpenLiteSpeed,
 * dan buffering proxy adalah penyebab klasik aliran peristiwa yang diam lalu
 * muncul sekaligus di akhir — yang justru mematikan seluruh nilai panel
 * progres ini. Halaman Pembaruan memakai pola yang sama dan sudah terbukti
 * jalan di server itu.
 *
 * Yang TIDAK dilakukan endpoint ini: menyimpan apa pun ke `content.json`.
 * Hasilnya adalah usulan, dan usulan hanya masuk ke formulir setelah seseorang
 * mencentangnya di panel. Jalur simpan tetap satu-satunya yang sudah ada.
 */

const MODES: Mode[] = ["lengkap", "lengkapi", "harga"];

function asMode(v: unknown): Mode {
  const s = String(v || "");
  return (MODES as string[]).includes(s) ? (s as Mode) : "lengkap";
}

export const GET: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai.run")) return forbidden();

  const id = url.searchParams.get("id") || "";
  if (!id) {
    // Tanpa id: hanya keadaan kuota, dipakai panel untuk menyalakan atau
    // mematikan tombol Riset sebelum ada yang ditekan.
    return json({
      ok: true,
      siap: siapRiset(),
      modelBawaan: modelBawaan(),
      kuota: { batas: KUOTA_HARIAN, terpakai: pemakaianHariIni(me.id) },
    });
  }

  const job = jobMilik(id, me.id);
  if (!job) return apiError("err.ai.jobHilang", 404);

  return json({
    ok: true,
    job: jobPublik(job),
    kuota: { batas: KUOTA_HARIAN, terpakai: pemakaianHariIni(me.id) },
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai.run")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const col = body?.col === "motors" ? "motors" : "cars";
  const vehicleId = body?.vehicleId ? String(body.vehicleId) : null;
  const mode = asMode(body?.mode);

  /*
   * Isi kendaraan dibaca dari DISK, bukan dari yang dikirim panel.
   *
   * Panel memang punya salinannya, tapi menerimanya berarti membiarkan klien
   * menentukan field mana yang "sudah terisi" — dan itu yang memutuskan field
   * mana yang boleh ditimpa usulan pada mode "lengkapi yang kosong".
   * Merek dan nama untuk kendaraan BARU tetap datang dari panel, karena
   * memang belum ada di disk.
   */
  let vehicle: any = null;
  if (vehicleId) {
    const content = readContent();
    vehicle = (content[col] || []).find((v: any) => v.id === vehicleId) || null;
    if (!vehicle) return apiError("err.ai.jobHilang", 404);
  } else {
    vehicle = { brand: String(body?.brand || "").trim(), name: String(body?.name || "").trim() };
  }

  const hasil = mulaiRiset({
    me,
    col,
    vehicleId,
    vehicle,
    mode,
    model: String(body?.model || ""),
    hint: String(body?.hint || "").trim().slice(0, 300),
  });

  if (!hasil.ok) {
    const status = hasil.errorKey === "err.ai.kuotaHabis" ? 429 : 400;
    return apiError(hasil.errorKey, status, hasil.vars);
  }

  const job = hasil.job!;
  logActivity(me, "ai.run", { judul: job.judul, model: job.model });

  return json({
    ok: true,
    job: jobPublik(job),
    kuota: { batas: KUOTA_HARIAN, terpakai: pemakaianHariIni(me.id) },
  });
};

export const DELETE: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai.run")) return forbidden();

  const id = url.searchParams.get("id") || "";
  if (!batalkanRiset(id, me.id)) return apiError("err.ai.jobHilang", 404);
  return json({ ok: true });
};
