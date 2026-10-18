import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    return new Response(JSON.stringify({ ok: false, error: "kosong" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  // Koordinat langsung: "lat,lng"
  const parts = q.split(",").map((x) => Number(x.trim()));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return new Response(JSON.stringify({ ok: true, lat: parts[0], lng: parts[1], label: q }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  try {
    const endpoint = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
    const r = await fetch(endpoint, {
      headers: {
        "User-Agent": "EVKita/1.0 (https://www.evkita.com)",
        "Accept-Language": "id,en",
      },
    });
    if (!r.ok) throw new Error("nominatim");
    const data = (await r.json()) as any[];
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit || !hit.lat || !hit.lon) {
      return new Response(JSON.stringify({ ok: false, error: "tidakDitemukan" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        label: hit.display_name || q,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "gagal" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
};
