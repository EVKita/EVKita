/**
 * Rute jalan — jarak dan waktu tempuh yang sebenarnya, bukan garis lurus.
 *
 * Satu-satunya berkas yang tahu bentuk layanan rute pihak ketiga. Halaman tidak
 * pernah memanggilnya langsung: permintaan lewat `/api/rute` supaya kuncinya
 * (kalau nanti dipakai untuk China), batas waktunya, dan penyaring koordinatnya
 * ada di server.
 *
 * Penyedia hari ini OSRM (data OpenStreetMap). Edisi China tetap memakai Amap
 * untuk NAVIGASI (tautan keluar), karena itulah peta yang dipakai orang di
 * sana; OSRM hanya memberi perkiraan jarak di sini. Kalau nanti ada kunci Amap,
 * cukup `ruteJalan()` yang diganti — halaman dan endpoint tidak ikut berubah.
 *
 * Kalau penyedia gagal, lambat, atau menjawab dengan angka yang tidak masuk
 * akal, hasilnya JATUH ke perkiraan garis lurus — halaman tetap menjawab,
 * dengan label bahwa angkanya perkiraan.
 */

export interface Koord {
  lat: number;
  lng: number;
}

export interface HasilRute {
  jarakKm: number;
  menit: number;
  /** "rute" = jarak jalan sungguhan, "perkiraan" = cadangan garis lurus. */
  sumber: "rute" | "perkiraan";
}

const OSRM_BAWAAN = "https://router.project-osrm.org";
const UA = "EVKita/1.0 (https://www.evkita.com)";
const BATAS_MS = 6000;

export function masukAkal(k: Koord): boolean {
  return (
    Number.isFinite(k.lat) &&
    Number.isFinite(k.lng) &&
    Math.abs(k.lat) <= 90 &&
    Math.abs(k.lng) <= 180
  );
}

/** Jarak bulat bumi dalam km. Sama dengan rumus yang dipakai halaman rute. */
export function jarakLurusKm(a: Koord, b: Koord): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Jalan raya tidak pernah lurus. Faktor ini perkiraan kasar yang dipakai
 * sumber mana pun: 1,3 untuk jalan biasa, 1,35 untuk China (jaringan jalan
 * bebas hambatan lebih jarang di rute antarkota yang dipakai pengunjung).
 */
export function faktorJalan(region: string): number {
  return region === "cn" ? 1.35 : 1.3;
}

/** Kecepatan rata-rata untuk cadangan, km/jam — berbeda menurut edisi. */
export function kecepatanPerkiraan(region: string): number {
  if (region === "us") return 75;
  if (region === "cn") return 55;
  return 45;
}

/** Cadangan: garis lurus × faktor jalan, dibagi kecepatan rata-rata. */
export function rutePerkiraan(a: Koord, b: Koord, region = "id"): HasilRute {
  const lurus = jarakLurusKm(a, b);
  const jarakKm = lurus * faktorJalan(region);
  const menit = (jarakKm / kecepatanPerkiraan(region)) * 60;
  return { jarakKm, menit, sumber: "perkiraan" };
}

/**
 * Angka dari penyedia hanya dipakai kalau masuk akal. Tanpa pemeriksaan ini,
 * jawaban galat yang berbentuk "0 km" akan tampil sebagai rute yang sah.
 */
function angkaMasukAkal(hasil: { jarakKm: number; menit: number }, lurus: number): boolean {
  if (!Number.isFinite(hasil.jarakKm) || !Number.isFinite(hasil.menit)) return false;
  if (hasil.jarakKm <= 0 || hasil.menit <= 0) return false;
  // Rute jalan tidak mungkin lebih pendek dari garis lurus, dan 8× garis lurus
  // sudah pasti salah data (bukan jalan memutar).
  if (hasil.jarakKm < lurus * 0.8 || hasil.jarakKm > lurus * 8) return false;
  const kmJam = (hasil.jarakKm / hasil.menit) * 60;
  return kmJam >= 3 && kmJam <= 200;
}

/** Bentuk jawaban OSRM yang dipakai — hanya yang dibaca, bukan seluruhnya. */
interface OsrmJawab {
  code?: string;
  routes?: Array<{ distance?: number; duration?: number }>;
}

/**
 * Rute jalan dari penyedia, dengan cadangan yang selalu tersedia.
 *
 * `fetchImpl` bisa diganti di uji; `url` bisa dioverride lewat env
 * `RUTE_OSRM_URL` kalau nanti dipasang OSRM sendiri (server demo publik tidak
 * punya jaminan ketersediaan).
 */
export async function ruteJalan(
  a: Koord,
  b: Koord,
  opsi: { region?: string; fetchImpl?: typeof fetch; url?: string } = {}
): Promise<HasilRute> {
  const region = opsi.region || "id";
  const cadangan = rutePerkiraan(a, b, region);
  if (!masukAkal(a) || !masukAkal(b)) return cadangan;

  const dasar =
    opsi.url || (typeof process !== "undefined" && process.env?.RUTE_OSRM_URL) || OSRM_BAWAAN;
  const alamat =
    `${dasar.replace(/\/$/, "")}/route/v1/driving/` +
    `${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=false&steps=false`;
  const lurus = jarakLurusKm(a, b);

  const kontrol = new AbortController();
  const jam = setTimeout(() => kontrol.abort(), BATAS_MS);
  try {
    const muat = opsi.fetchImpl || fetch;
    const r = await muat(alamat, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: kontrol.signal,
    });
    if (!r.ok) return cadangan;
    const data = (await r.json()) as OsrmJawab;
    const rute = data && data.code === "Ok" && Array.isArray(data.routes) ? data.routes[0] : null;
    if (!rute) return cadangan;
    const hasil = {
      jarakKm: Number(rute.distance) / 1000,
      menit: Number(rute.duration) / 60,
    };
    if (!angkaMasukAkal(hasil, lurus)) return cadangan;
    return { ...hasil, sumber: "rute" };
  } catch {
    return cadangan;
  } finally {
    clearTimeout(jam);
  }
}
