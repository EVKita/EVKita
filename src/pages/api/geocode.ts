import type { APIRoute } from "astro";
import { cariLokasi } from "../../lib/geokode";

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ ok: false, error: "kosong" }, 400);
  try {
    const hit = await cariLokasi(q);
    if (!hit) return json({ ok: false, error: "tidakDitemukan" }, 404);
    return json({ ok: true, lat: hit.lat, lng: hit.lng, label: hit.label }, 200);
  } catch {
    return json({ ok: false, error: "gagal" }, 502);
  }
};
