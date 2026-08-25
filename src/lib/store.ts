import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.resolve(process.cwd(), "data", "content.json");

const SITE_DEFAULTS = {
  brandText: "ReferensiID",
  themePrimary: "#37e0a6",
  themeSecondary: "#3aa0ff",
  heroEyebrow: "",
  heroTitle: "",
  heroSub: "",
  aboutTitle: "",
  aboutText: "",
  footerTitle: "",
  footerDesc: "",
  footerSourceText: "",
  footerSourceUrl: "",
  footerNote: "",
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

function normalizeCar(c: any): any {
  const variantNames = strArr(c?.variantNames);
  return {
    id: String(c?.id || ""),
    brand: String(c?.brand || ""),
    name: String(c?.name || ""),
    bodyType: String(c?.bodyType || "Hatchback"),
    tagline: String(c?.tagline || ""),
    description: String(c?.description || ""),
    highlights: strArr(c?.highlights),
    rangeKm: numOrNull(c?.rangeKm),
    rangeStandard: c?.rangeStandard ? String(c.rangeStandard) : null,
    batteryKwh: numOrNull(c?.batteryKwh),
    powerHp: numOrNull(c?.powerHp),
    variants: variantNames.length,
    variantNames,
    price: numOrNull(c?.price),
    priceText: String(c?.priceText || ""),
    stale: !!c?.stale,
    colors: strArr(c?.colors),
    image: String(c?.image || ""),
    gallery: strArr(c?.gallery),
    video: String(c?.video || ""),
  };
}

function normalizeSpklu(v: any): any {
  return {
    name: String(v?.name || ""),
    operator: String(v?.operator || ""),
    area: String(v?.area || ""),
    power: String(v?.power || ""),
    website: String(v?.website || ""),
  };
}

function normalizeBengkel(v: any): any {
  return {
    name: String(v?.name || ""),
    type: String(v?.type || ""),
    brand: String(v?.brand || ""),
    area: String(v?.area || ""),
    website: String(v?.website || ""),
  };
}

function normalizeBerita(v: any): any {
  return {
    title: String(v?.title || ""),
    source: String(v?.source || ""),
    url: String(v?.url || ""),
    date: String(v?.date || ""),
  };
}

function normalize(content: any): any {
  const site = content?.site || {};
  return {
    site: {
      brandText: String(site.brandText ?? SITE_DEFAULTS.brandText),
      themePrimary: String(site.themePrimary ?? SITE_DEFAULTS.themePrimary),
      themeSecondary: String(site.themeSecondary ?? SITE_DEFAULTS.themeSecondary),
      heroEyebrow: String(site.heroEyebrow ?? SITE_DEFAULTS.heroEyebrow),
      heroTitle: String(site.heroTitle ?? SITE_DEFAULTS.heroTitle),
      heroSub: String(site.heroSub ?? SITE_DEFAULTS.heroSub),
      aboutTitle: String(site.aboutTitle ?? SITE_DEFAULTS.aboutTitle),
      aboutText: String(site.aboutText ?? SITE_DEFAULTS.aboutText),
      footerTitle: String(site.footerTitle ?? SITE_DEFAULTS.footerTitle),
      footerDesc: String(site.footerDesc ?? SITE_DEFAULTS.footerDesc),
      footerSourceText: String(site.footerSourceText ?? SITE_DEFAULTS.footerSourceText),
      footerSourceUrl: String(site.footerSourceUrl ?? SITE_DEFAULTS.footerSourceUrl),
      footerNote: String(site.footerNote ?? SITE_DEFAULTS.footerNote),
    },
    cars: asList(content?.cars).map(normalizeCar),
    motors: asList(content?.motors).map(normalizeCar),
    spklu: asList(content?.spklu).map(normalizeSpklu),
    bengkel: asList(content?.bengkel).map(normalizeBengkel),
    berita: asList(content?.berita).map(normalizeBerita),
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

export function writeContent(content: any): any {
  const normalized = normalize(content);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
