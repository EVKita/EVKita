import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "content.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 20;

/**
 * Skema `site` sengaja datar (satu level, semua string) supaya form admin bisa
 * memetakan satu field = satu input tanpa logika khusus, dan supaya konten lama
 * yang belum punya field baru tetap terbaca — nilai bawaan di bawah ini yang
 * mengisinya.
 */
const SITE_DEFAULTS: Record<string, string> = {
  // Identitas
  brandText: "ReferensiID",
  brandSuffix: ".com",
  logoMark: "EV",
  logoImage: "",

  // Tema
  themePrimary: "#37e0a6",
  themeSecondary: "#3aa0ff",
  themeRadius: "16",
  themeFont: "Inter",
  themeMode: "auto",

  // Hero
  heroEyebrow: "",
  heroTitle: "",
  heroSub: "",
  heroImage: "",
  heroCtaText: "",
  heroCtaUrl: "",
  heroCtaAltText: "",
  heroCtaAltUrl: "",

  // Tentang
  aboutTitle: "",
  aboutText: "",

  // SEO
  seoTitle: "",
  seoDescription: "",
  seoKeywords: "",
  seoOgImage: "",

  // Kontak
  contactEmail: "",
  contactPhone: "",
  contactAddress: "",

  // Sosial
  socialInstagram: "",
  socialYoutube: "",
  socialTiktok: "",
  socialFacebook: "",
  socialX: "",
  socialWhatsapp: "",

  // Judul & catatan tiap seksi di beranda
  katalogTitle: "Katalog Kendaraan Listrik",
  katalogNote: "Bandingkan spesifikasi dan harga",
  spkluTitle: "SPKLU Indonesia",
  spkluNote: "Jaringan pengisian daya publik",
  bengkelTitle: "Bengkel & Servis EV",
  bengkelNote: "Mobil & motor listrik",
  beritaTitle: "Berita Terkini",
  beritaNote: "Mobil & motor listrik",

  // Footer
  footerTitle: "",
  footerDesc: "",
  footerSourceText: "",
  footerSourceUrl: "",
  footerNote: "",
};

/** Field `site` bertipe boolean — saklar tampil/sembunyi seksi beranda. */
const SITE_FLAG_DEFAULTS: Record<string, boolean> = {
  showMotor: true,
  showSpklu: true,
  showBengkel: true,
  showBerita: true,
  showAbout: true,
  showHeroStats: true,
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asList(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && Array.isArray((v as any).value)) {
    return (v as any).value;
  }
  return [];
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return !!v;
}

function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Baris spesifikasi bebas: [{ label, value }] — dipakai untuk data yang tidak tercakup field baku. */
function specRows(v: unknown): { label: string; value: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r: any) => ({ label: str(r?.label).trim(), value: str(r?.value).trim() }))
    .filter((r) => r.label || r.value);
}

function normalizeCar(c: any): any {
  const variantNames = strArr(c?.variantNames);
  const status = str(c?.status) === "draft" ? "draft" : "published";
  return {
    id: str(c?.id),
    brand: str(c?.brand),
    name: str(c?.name),
    bodyType: str(c?.bodyType) || "Hatchback",
    tagline: str(c?.tagline),
    description: str(c?.description),
    highlights: strArr(c?.highlights),
    rangeKm: numOrNull(c?.rangeKm),
    rangeStandard: c?.rangeStandard ? str(c.rangeStandard) : null,
    batteryKwh: numOrNull(c?.batteryKwh),
    powerHp: numOrNull(c?.powerHp),
    torqueNm: numOrNull(c?.torqueNm),
    topSpeedKph: numOrNull(c?.topSpeedKph),
    accelSec: numOrNull(c?.accelSec),
    seats: numOrNull(c?.seats),
    year: numOrNull(c?.year),
    driveType: str(c?.driveType),
    chargeDcKw: numOrNull(c?.chargeDcKw),
    chargeAcKw: numOrNull(c?.chargeAcKw),
    chargeTime: str(c?.chargeTime),
    warranty: str(c?.warranty),
    variants: variantNames.length,
    variantNames,
    price: numOrNull(c?.price),
    priceText: str(c?.priceText),
    stale: !!c?.stale,
    featured: !!c?.featured,
    status,
    tags: strArr(c?.tags),
    specs: specRows(c?.specs),
    colors: strArr(c?.colors),
    image: str(c?.image),
    gallery: strArr(c?.gallery),
    video: str(c?.video),
    updatedAt: str(c?.updatedAt),
  };
}

function normalizeSpklu(v: any): any {
  return {
    id: str(v?.id),
    name: str(v?.name),
    operator: str(v?.operator),
    area: str(v?.area),
    address: str(v?.address),
    power: str(v?.power),
    connector: str(v?.connector),
    count: numOrNull(v?.count),
    hours: str(v?.hours),
    price: str(v?.price),
    website: str(v?.website),
    mapUrl: str(v?.mapUrl),
    note: str(v?.note),
    featured: !!v?.featured,
  };
}

function normalizeBengkel(v: any): any {
  return {
    id: str(v?.id),
    name: str(v?.name),
    type: str(v?.type),
    brand: str(v?.brand),
    area: str(v?.area),
    address: str(v?.address),
    phone: str(v?.phone),
    hours: str(v?.hours),
    services: str(v?.services),
    website: str(v?.website),
    mapUrl: str(v?.mapUrl),
    note: str(v?.note),
    featured: !!v?.featured,
  };
}

function normalizeBerita(v: any): any {
  return {
    id: str(v?.id),
    title: str(v?.title),
    source: str(v?.source),
    url: str(v?.url),
    date: str(v?.date),
    image: str(v?.image),
    excerpt: str(v?.excerpt),
    featured: !!v?.featured,
  };
}

/**
 * Melengkapi `id` yang kosong pada koleksi direktori. Sebelum ini item
 * direktori hanya dikenali lewat indeks array, sehingga urutan tidak bisa
 * diubah dan aksi massal tidak punya pegangan yang stabil.
 */
function ensureIds(list: any[], prefix: string, key: string): any[] {
  const used = new Set<string>();
  return list.map((item, i) => {
    let id = str(item.id).trim();
    if (!id) id = slugify(str(item[key])) || `${prefix}-${i + 1}`;
    let unique = id;
    let n = 2;
    while (used.has(unique)) unique = `${id}-${n++}`;
    used.add(unique);
    return { ...item, id: unique };
  });
}

function normalize(content: any): any {
  const src = content?.site || {};
  const site: Record<string, any> = {};
  for (const [key, fallback] of Object.entries(SITE_DEFAULTS)) {
    site[key] = src[key] === undefined || src[key] === null ? fallback : String(src[key]);
  }
  for (const [key, fallback] of Object.entries(SITE_FLAG_DEFAULTS)) {
    site[key] = bool(src[key], fallback);
  }

  return {
    site,
    cars: ensureIds(asList(content?.cars).map(normalizeCar), "mobil", "name"),
    motors: ensureIds(asList(content?.motors).map(normalizeCar), "motor", "name"),
    spklu: ensureIds(asList(content?.spklu).map(normalizeSpklu), "spklu", "name"),
    bengkel: ensureIds(asList(content?.bengkel).map(normalizeBengkel), "bengkel", "name"),
    berita: ensureIds(asList(content?.berita).map(normalizeBerita), "berita", "title"),
  };
}

export function readContent(): any {
  try {
    let raw = fs.readFileSync(DATA_FILE, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return normalize(JSON.parse(raw));
  } catch {
    return normalize({});
  }
}

/**
 * Menyimpan salinan konten lama sebelum ditimpa. Panel admin sekarang bisa
 * mengubah banyak hal sekaligus, jadi satu kesalahan simpan tidak boleh
 * berarti kehilangan data permanen.
 */
function snapshot(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `content-${stamp}.json`));

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("content-") && f.endsWith(".json"))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch {
    // Cadangan bersifat best-effort — kegagalannya tidak boleh menggagalkan simpan.
  }
}

export function listBackups(): { name: string; size: number; time: string }[] {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("content-") && f.endsWith(".json"))
      .sort()
      .reverse()
      .map((name) => {
        const st = fs.statSync(path.join(BACKUP_DIR, name));
        return { name, size: st.size, time: st.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

export function readBackup(name: string): any | null {
  if (!/^content-[\w.-]+\.json$/.test(name)) return null;
  try {
    const raw = fs.readFileSync(path.join(BACKUP_DIR, name), "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeContent(content: any): any {
  const normalized = normalize(content);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  snapshot();
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
