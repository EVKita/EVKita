import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { json, unauthorized } from "../../lib/api";
import { bacaPeluncuran, deteksiViral } from "../../lib/peluncuran-rekam";

/** Model yang halaman katalognya melewati ambang kunjungan harian. */
export const GET: APIRoute = ({ cookies }) => {
  if (!currentUser(cookies)) return unauthorized();
  return json({ ok: true, ...bacaPeluncuran() });
};

/** Menghitung ulang sekarang, tanpa menunggu jadwal harian. */
export const POST: APIRoute = ({ cookies }) => {
  if (!currentUser(cookies)) return unauthorized();
  return json({ ok: true, ...deteksiViral() });
};
