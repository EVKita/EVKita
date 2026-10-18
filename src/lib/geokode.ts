/**
 * Pencarian koordinat dari teks — dipakai `/api/geocode` dan
 * `/api/lokasi-saya`. Berkas ini satu-satunya yang tahu bentuk layanan
 * geokode pihak ketiga (Nominatim lalu Photon sebagai cadangan).
 */

const UA = "EVKita/1.0 (https://www.evkita.com)";

export interface Koord {
  lat: number;
  lng: number;
}

export interface Titik extends Koord {
  label: string;
}

function masukAkal(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Ambil lat,lng dari koordinat polos ATAU dari URL Google Maps yang ditempel.
 * Pola: "@lat,lng", "!3dlat!4dlng", "?q=lat,lng", "&ll=lat,lng",
 * "&center=lat,lng", "&daddr=lat,lng". Dikembalikan null kalau tidak ada.
 */
export function dariTeks(teks: string): Koord | null {
  const t = String(teks || "").trim();
  if (!t) return null;
  const polos = t.split(",").map((x) => Number(x.trim()));
  if (polos.length === 2 && masukAkal(polos[0], polos[1])) return { lat: polos[0], lng: polos[1] };
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
      if (masukAkal(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

async function nominatim(q: string): Promise<Titik | null> {
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

/** Photon (komoot) lebih pintar untuk POI/nama tempat yang gagal di Nominatim. */
async function photon(q: string): Promise<Titik | null> {
  const r = await fetch("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(q), {
    headers: { "User-Agent": UA, "Accept-Language": "id,en" },
  });
  if (!r.ok) return null;
  const data = await r.json();
  const f = data && Array.isArray(data.features) ? data.features[0] : null;
  const c = f && f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
  if (!c || !Number.isFinite(c[1]) || !Number.isFinite(c[0])) return null;
  const p = (f.properties || {}) as any;
  const bag = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
  return { lat: Number(c[1]), lng: Number(c[0]), label: bag || q };
}

/**
 * Koordinat untuk sebuah teks: koordinat/tautan langsung dipakai, sisanya
 * dicari ke Nominatim lalu Photon. null kalau tidak ada yang menemukan.
 */
export async function cariLokasi(q: string): Promise<Titik | null> {
  const langsung = dariTeks(q);
  if (langsung) return { ...langsung, label: String(q).trim() };
  return (await nominatim(q)) || (await photon(q));
}
