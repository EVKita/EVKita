import type { APIRoute } from "astro";
import { cari } from "../../lib/geoip";
import { cariLokasi } from "../../lib/geokode";

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Perkiraan lokasi pengunjung dari ALAMAT IP — cadangan ketika GPS peramban
 * tidak tersedia atau izinnya ditolak.
 *
 * Privasi (sama seperti Analitik): IP dipakai sekejap untuk pencarian DB-IP
 * LOKAL, tidak pernah dikirim ke layanan pihak ketiga. Yang keluar dari server
 * hanyalah NAMA KOTA untuk dicari koordinatnya — tanpa IP, tanpa identitas.
 * Presisinya tingkat kota, dan itu memang disebut di label.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  let ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!ip) {
    try {
      ip = clientAddress || "";
    } catch {
      ip = "";
    }
  }
  try {
    const geo = await cari(ip);
    const kota = [geo.kota, geo.provinsi, geo.negara].filter(Boolean).join(", ");
    if (!kota) return json({ ok: false, error: "tidakAdaPerkiraan" }, 200);
    const hit = await cariLokasi(kota);
    if (!hit) return json({ ok: false, error: "tidakDitemukan" }, 200);
    return json({ ok: true, lat: hit.lat, lng: hit.lng, label: kota }, 200);
  } catch {
    return json({ ok: false, error: "gagal" }, 200);
  }
};
