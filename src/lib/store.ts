import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readJson, writeJsonAtomic, readCached, invalidateCache } from "./jsonfile";
import { APPEARANCE_DEFAULTS, APPEARANCE_FLAGS } from "./theme.js";
import { MAX_LEGAL_LINKS, normalizeLinks, normalizeMenus } from "./footer.js";
import { normalizeMediaMap } from "./media.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "content.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

/**
 * Jarak minimum antar cadangan otomatis.
 *
 * Panel menyimpan otomatis 1,2 detik setelah ketikan berhenti, dan dulu SETIAP
 * penyimpanan membuat satu cadangan dengan batas 20 berkas. Akibatnya mengisi
 * 20 field pada satu mobil — pekerjaan lima menit — sudah cukup untuk menghapus
 * seluruh cadangan yang dibuat sebelum sesi itu dimulai. Jaring pengaman yang
 * dirancang menyelamatkan "satu kesalahan simpan" justru paling rapuh persis
 * ketika ia dibutuhkan: 20 cadangan tersisa berisi kesalahan yang sama.
 */
const SNAPSHOT_MIN_GAP_MS = 10 * 60 * 1000;

/** Berapa cadangan terbaru yang selalu disimpan, seberapa pun rapatnya. */
const KEEP_RECENT = 10;
/** Berapa hari ke belakang yang disimpan satu cadangan per harinya. */
const KEEP_DAYS = 14;

/**
 * Skema `site` sengaja datar (satu level, semua string) supaya form admin bisa
 * memetakan satu field = satu input tanpa logika khusus, dan supaya konten lama
 * yang belum punya field baru tetap terbaca — nilai bawaan di bawah ini yang
 * mengisinya.
 *
 * Dua pengecualian yang disengaja ada di `SITE_LISTS`: menu footer dan tautan
 * bilah bawah. Keduanya berjumlah bebas, jadi tidak ada jumlah field tetap yang
 * bisa menampungnya tanpa memaksa pemilik situs memilih "maksimal empat menu".
 */
const SITE_DEFAULTS: Record<string, string> = {
  // Identitas
  brandText: "ReferensiID",
  brandSuffix: ".com",
  logoMark: "EV",
  logoImage: "",

  // Tema & tampilan — nilai bawaannya ada di src/lib/theme.js
  ...APPEARANCE_DEFAULTS,

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
  contactWhatsapp: "",
  contactAddress: "",
  contactHours: "",
  contactMapUrl: "",
  contactWebsite: "",

  // Sosial
  socialInstagram: "",
  socialYoutube: "",
  socialTiktok: "",
  socialFacebook: "",
  socialX: "",
  socialWhatsapp: "",
  socialLinkedin: "",
  socialTelegram: "",

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
  footerMenuTitle: "Jelajahi",
  footerContactTitle: "Kontak",
  footerSourceTitle: "Sumber Data",
  footerSocialTitle: "Ikuti Kami",
  footerCopyright: "",
  footerBottomNote: "Harga & spesifikasi dapat berubah sewaktu-waktu.",
};

/** Field `site` bertipe boolean — saklar tampil/sembunyi seksi beranda. */
const SITE_FLAG_DEFAULTS: Record<string, boolean> = {
  showMotor: true,
  showSpklu: true,
  showBengkel: true,
  showBerita: true,
  showAbout: true,
  showHeroStats: true,
  showFooterMenu: true,
  showFooterContact: true,
  showFooterSocial: true,
  showFooterSource: true,
  showBackToTop: true,
  ...APPEARANCE_FLAGS,
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

/**
 * Daftar `site` yang berupa larik, bukan string. Lihat catatan di SITE_DEFAULTS.
 * Isinya dinormalkan `src/lib/footer.js` — berkas yang sama dipakai panel admin,
 * jadi batas jumlah dan bentuk barisnya tidak bisa berbeda antara keduanya.
 */
const SITE_LISTS: Record<string, (v: unknown) => any[]> = {
  footerMenus: normalizeMenus,
  footerLegal: (v) => normalizeLinks(v, MAX_LEGAL_LINKS),
};

/**
 * @param kind Mobil atau motor. Bentuk objek keduanya identik, jadi tanpa
 *   penanda ini tidak ada satu pun cara membedakannya di hilir — dan
 *   `vehicleHref()` di `card-html.js` harus tahu, karena alamat halaman
 *   detailnya berbeda. Nilainya selalu dihitung ulang dari koleksi asalnya,
 *   jadi entri yang dipindahkan antar koleksi tidak bisa membawa nilai basi.
 */
function normalizeCar(c: any, kind: "mobil" | "motor"): any {
  const variantNames = strArr(c?.variantNames);
  const status = str(c?.status) === "draft" ? "draft" : "published";
  return {
    id: str(c?.id),
    kind,
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
    updatedBy: str(c?.updatedBy),
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
    updatedAt: str(v?.updatedAt),
    updatedBy: str(v?.updatedBy),
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
    updatedAt: str(v?.updatedAt),
    updatedBy: str(v?.updatedBy),
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
    updatedAt: str(v?.updatedAt),
    updatedBy: str(v?.updatedBy),
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

/**
 * Penanda versi dokumen konten.
 *
 * Panel mengirim SELURUH dokumen setiap kali menyimpan, dan server dulu
 * menerimanya apa adanya. Kalau dua orang membuka panel bersamaan, autosave
 * orang pertama menghapus pekerjaan orang kedua yang sudah tersimpan — dan
 * keduanya melihat status "Tersimpan". Sejak panel jadi multi-pengguna dengan
 * tiga peran, itu bukan skenario teoretis lagi.
 *
 * Nilainya cukup berupa penanda acak; yang dibutuhkan hanya "apakah ini masih
 * dokumen yang sama dengan yang kamu muat?", bukan urutan.
 */
function newRevision(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Bentuk baku sebuah dokumen konten.
 *
 * Diekspor supaya pemanggil bisa MEMBANDINGKAN dokumen yang masuk dengan yang
 * tersimpan sebelum menuliskannya (lihat `perubahan.ts`). Keduanya harus lewat
 * normalisasi yang sama persis: membandingkan dokumen mentah dengan dokumen
 * yang sudah dinormalkan akan melaporkan setiap field bawaan sebagai perubahan
 * pada penyimpanan pertama.
 *
 * Idempoten — menjalankannya dua kali menghasilkan yang sama, jadi aman
 * dipanggil di luar `writeContent()` lalu dipanggil lagi di dalamnya.
 */
export function normalizeContent(content: any): any {
  return normalize(content);
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
  for (const [key, normalizeList] of Object.entries(SITE_LISTS)) {
    site[key] = normalizeList(src[key]);
  }

  return {
    revision: str(content?.revision),
    site,
    cars: ensureIds(asList(content?.cars).map((c: any) => normalizeCar(c, "mobil")), "mobil", "name"),
    motors: ensureIds(asList(content?.motors).map((c: any) => normalizeCar(c, "motor")), "motor", "name"),
    spklu: ensureIds(asList(content?.spklu).map(normalizeSpklu), "spklu", "name"),
    bengkel: ensureIds(asList(content?.bengkel).map(normalizeBengkel), "bengkel", "name"),
    berita: ensureIds(asList(content?.berita).map(normalizeBerita), "berita", "title"),

    /*
     * Metadata gambar (judul, teks alternatif, catatan), berkunci alamat
     * gambar. Sengaja BUKAN bagian dari tiap kendaraan: satu foto bisa dipakai
     * di beberapa tempat, dan alt-nya tidak boleh ikut hilang ketika salah satu
     * pemakainya dihapus. Lihat src/lib/media.js.
     */
    media: normalizeMediaMap(content?.media),
  };
}

export function readContent(): any {
  // Hasil NORMALISASI yang dicache, bukan cuma hasil parse: normalisasi itu
  // sendiri yang memutari 85 entri di setiap permintaan halaman publik.
  return readCached(DATA_FILE, (res) => {
    if (res.status === "ok") return normalize(res.data);
    if (res.status === "corrupt") {
      console.error(
        `[evkita] data/content.json ada tapi tidak bisa dibaca (${res.error}). ` +
          `Situs tampil kosong sampai berkasnya dipulihkan dari data/backups/.`
      );
    }
    return normalize({});
  });
}

function backupNames(): string[] {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("content-") && f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Menyisakan cadangan yang benar-benar berguna, bukan sekadar yang terbaru.
 *
 * Dua lapis: sepuluh cadangan terakhir (untuk membatalkan kesalahan yang baru
 * saja terjadi), ditambah satu cadangan per hari selama dua minggu (untuk
 * pertanyaan "seperti apa isinya Selasa lalu?"). Tanpa lapis kedua, satu sesi
 * penyuntingan panjang tetap akan mengubur seluruh riwayat.
 */
function prune(): void {
  const files = backupNames();
  const keep = new Set<string>();

  const newestFirst = [...files].reverse();
  for (const f of newestFirst.slice(0, KEEP_RECENT)) keep.add(f);

  const days = new Set<string>();
  for (const f of newestFirst) {
    // "content-2026-08-27T06-02-52-293Z.json" -> "2026-08-27"
    const day = f.slice(8, 18);
    if (days.has(day)) continue;
    if (days.size >= KEEP_DAYS) break;
    days.add(day);
    keep.add(f);
  }

  for (const f of files) {
    if (keep.has(f)) continue;
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch {
      /* sudah hilang duluan */
    }
  }
}

/**
 * Menyimpan salinan konten lama sebelum ditimpa.
 *
 * `force` dipakai jalur pemulihan cadangan: memulihkan harus SELALU menyisakan
 * jejak isi sebelumnya, berapa pun jaraknya dari cadangan terakhir — kalau
 * tidak, pemulihan yang salah sasaran tidak bisa dibatalkan.
 */
function snapshot(force = false): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    if (!force) {
      const latest = backupNames().pop();
      if (latest) {
        const age = Date.now() - fs.statSync(path.join(BACKUP_DIR, latest)).mtimeMs;
        // Autosave beruntun tidak menghasilkan cadangan baru. Isi terakhir
        // tetap aman: content.json sendiri yang menyimpannya.
        if (age < SNAPSHOT_MIN_GAP_MS) return;
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `content-${stamp}.json`));
    prune();
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
  const res = readJson<any>(path.join(BACKUP_DIR, name));
  return res.status === "ok" ? normalize(res.data) : null;
}

export function writeContent(content: any, options: { snapshotAlways?: boolean } = {}): any {
  const normalized = normalize(content);
  // Setiap penulisan menghasilkan revisi baru, termasuk pemulihan cadangan:
  // panel lain yang sedang terbuka harus tahu bahwa dokumennya sudah berganti.
  normalized.revision = newRevision();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  snapshot(options.snapshotAlways === true);
  writeJsonAtomic(DATA_FILE, normalized);
  // mtime yang baru sudah cukup membatalkan cache, tapi menulis dan membaca
  // dalam milidetik yang sama bisa menghasilkan mtime yang identik di sebagian
  // sistem berkas. Membuangnya di sini menutup celah itu.
  invalidateCache(DATA_FILE);
  return normalized;
}
