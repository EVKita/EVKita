import type { APIRoute } from "astro";

const UA = "EVKita/1.0 (https://www.evkita.com)";

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Ambil lat,lng dari koordinat polos ATAU dari URL Google Maps yang ditempel.
 * Pola yang didukung: "@lat,lng", "!3dlat!4dlng", "?q=lat,lng", "&ll=lat,lng",
 * "&center=lat,lng", dan "/place/.../@lat,lng". Dikembalikan sebagai angka yang
 * sudah diperiksa batasnya, atau null.
 */
function dariTeks(teks: string): { lat: number; lng: number } | null {
  const t = String(teks || "").trim();
  if (!t) return null;
  const polos = t.split(",").map((x) => Number(x.trim()));
  if (polos.length === 2 && Number.isFinite(polos[0]) && Number.isFinite(polos[1]) && Math.abs(polos[0]) <= 90 && Math.abs(polos[1]) <= 180) {
    return { lat: polos[0], lng: polos[1] };
  }
  const pola = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|center|query|daddr|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const rx of pola) {
    const m = t.match(rx);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

async function nominatim(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const r = await fetch(
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q),
    { headers: { "User-Agent": UA, "Accept-Language": "id,en" } }
  );
  if (!r.ok) return null;
  const data = (await r.json()) as any[];
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit || !hit.lat || !hit.lon) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name || q };
}

/**
 * Photon (komoot) lebih pintar untuk nama tempat/POI seperti "Kempinski Private
 * Residences" yang sering gagal di Nominatim. Dipakai HANYA sebagai cadangan.
 */
async function photon(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const r = await fetch(
    "https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(q),
    { headers: { "User-Agent": UA, "Accept-Language": "id,en" } }
  );
  if (!r.ok) return null;
  const data = await r.json();
  const f = data && Array.isArray(data.features) ? data.features[0] : null;
  const c = f && f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
  if (!c || !Number.isFinite(c[1]) || !Number.isFinite(c[0])) return null;
  const p = (f.properties || {}) as any;
  const bag = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
  return { lat: Number(c[1]), lng: Number(c[0]), label: bag || q };
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ ok: false, error: "kosong" }, 400);

  const c = dariTeks(q);
  if (c) return json({ ok: true, lat: c.lat, lng: c.lng, label: q, sumber: "koordinat" }, 200);

  try {
    const hit = (await nominatim(q)) || (await photon(q));
    if (!hit) return json({ ok: false, error: "tidakDitemukan" }, 404);
    return json({ ok: true, lat: hit.lat, lng: hit.lng, label: hit.label }, 200);
  } catch {
    return json({ ok: false, error: "gagal" }, 502);
  }
};
