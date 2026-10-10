import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import maxmind from "maxmind";
import { getEnv } from "./env";

/**
 * Pencari negara/kota/jaringan dari alamat IP — khusus untuk Analitik.
 *
 * Tiga keputusan menentukan seluruh isi berkas ini:
 *
 *   1. **Pencarian lokal, tidak pernah ke luar.** Basis DB-IP Lite (format
 *      MMDB, dibaca pustaka `maxmind`) tinggal di `data/geo/` dan dibaca dari
 *      disk. Mengirim IP pembaca ke layanan pencarian daring akan mengkhianati
 *      janji privasi pencatatan (`trafik-rekam.ts`): IP tidak pernah menyentuh
 *      disk dan tidak pernah keluar dari server ini.
 *   2. **Yang disimpan tetap angka.** Hasil pencarian (`"ID"`, `"Jakarta"`,
 *      `"Telkomsel"`) dijumlahkan per hari seperti halaman dan rujukan — tidak
 *      ada satu pun sidik, IP, atau identitas yang ikut tersimpan karenanya.
 *   3. **Tidak ada basis berarti tidak ada data, bukan galat.** Tanpa berkas
 *      `.mmdb`, `cari()` mengembalikan null dan panel menampilkan statusnya
 *      apa adanya. Halaman pembaca tidak boleh gagal hanya karena berkas data
 *      belum diunduh.
 *
 * Basis diunduh bebas dari DB-IP (tanpa akun, tanpa kunci) dan disegarkan
 * otomatis tiap bulan lewat `jadwalkanGeoip()`. Syarat lisensinya satu:
 * atribusi "IP Geolocation by DB-IP" di panel (lihat `analitik.atribusi`).
 */

const DIR = () => path.resolve(process.cwd(), "data", "geo");

const BERKAS = {
  country: () => path.join(DIR(), "dbip-country-lite.mmdb"),
  city: () => path.join(DIR(), "dbip-city-lite.mmdb"),
  asn: () => path.join(DIR(), "dbip-asn-lite.mmdb"),
} as const;

type KunciDb = keyof typeof BERKAS;

/** Nama edisi DB-IP Lite — tanpa akun, tanpa kunci, gratis dengan atribusi. */
const EDISI: Record<KunciDb, string> = {
  country: "dbip-country-lite",
  city: "dbip-city-lite",
  asn: "dbip-asn-lite",
};

/** Jarak minimum dua pengunduhan (30 hari — ritme rilis DB-IP). */
const JEDA_UNDUH_MS = 30 * 24 * 3600 * 1000;
/** Mundur sesudah gagal (1 jam — jangan menunda sebulan karena sesaat). */
const JEDA_GAGAL_MS = 3600 * 1000;

export interface HasilGeo {
  /** Kode negara dua huruf ("ID"), atau "" kalau tidak diketahui. */
  negara: string;
  /** Provinsi ("West Java"), atau "" kalau tidak diketahui. */
  provinsi: string;
  /** Kota ("Jakarta"), atau "" kalau tidak diketahui. */
  kota: string;
  /** Nama jaringan ("Telkomsel"), atau "" kalau tidak diketahui. */
  jaringan: string;
}

const KOSONG: HasilGeo = { negara: "", provinsi: "", kota: "", jaringan: "" };

function ipPribadi(ip: string): boolean {
  const v = String(ip || "").trim();
  if (!v) return true;
  if (v === "::1" || v.toLowerCase() === "localhost") return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^127\./.test(v)) return true;
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(v)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(v)) return true;
  return false;
}

const pembaca = new Map<KunciDb, { mtime: number; baca: any }>();
let terakhirCekBerkas = 0;

function mtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

async function buka(kunci: KunciDb): Promise<any | null> {
  const berkas = BERKAS[kunci]();
  const umur = mtime(berkas);
  if (!umur) {
    pembaca.delete(kunci);
    return null;
  }
  const simpan = pembaca.get(kunci);
  // Berkas diganti (unduhan baru) → buka ulang. Dicek paling cepat semenit
  // sekali supaya tiap kunjungan tidak membayar satu stat.
  if (simpan && (Date.now() - terakhirCekBerkas < 60 * 1000 || simpan.mtime === umur)) {
    return simpan.baca;
  }
  try {
    const baca = await maxmind.open(berkas);
    pembaca.set(kunci, { mtime: umur, baca });
    terakhirCekBerkas = Date.now();
    return baca;
  } catch {
    pembaca.delete(kunci);
    return null;
  }
}

function potong(teks: unknown, maks = 80): string {
  return String(teks || "").trim().slice(0, maks);
}

/**
 * Negara, provinsi, kota, dan jaringan sebuah IP — atau semuanya kosong.
 *
 * Tidak pernah melempar: IP sampah, basis hilang, dan basis rusak semuanya
 * berarti "tidak diketahui", bukan galat. Kota diambil dari basis City kalau
 * ada; negara jatuh ke basis Country kalau City tidak ada.
 */
export async function cari(ip: string): Promise<HasilGeo> {
  const alamat = String(ip || "").trim();
  if (!alamat || ipPribadi(alamat)) return { ...KOSONG };
  try {
    if (!maxmind.validate(alamat)) return { ...KOSONG };
  } catch {
    return { ...KOSONG };
  }

  const hasil: HasilGeo = { ...KOSONG };
  try {
    const city = await buka("city");
    const catatanCity = city ? city.get(alamat) : null;
    if (catatanCity) {
      hasil.negara = potong(catatanCity?.country?.iso_code, 2).toUpperCase();
      hasil.provinsi = potong(catatanCity?.subdivisions?.[0]?.names?.en);
      hasil.kota = potong(catatanCity?.city?.names?.en);
    }
    if (!hasil.negara) {
      const country = await buka("country");
      const catatanCountry = country ? country.get(alamat) : null;
      if (catatanCountry) hasil.negara = potong(catatanCountry?.country?.iso_code, 2).toUpperCase();
    }
    const asn = await buka("asn");
    const catatanAsn = asn ? asn.get(alamat) : null;
    if (catatanAsn) hasil.jaringan = potong(catatanAsn?.autonomous_system_organization);
  } catch {
    /* kegagalan di tengah jalan: pakai yang sempat ketemu */
  }
  // Basis belum siap → minta unduhan. Dijaga di dalamnya (tidak beruntun,
  // tidak menahan), jadi aman dipanggil setiap ada IP publik.
  jadwalkanGeoip();
  return hasil;
}

/** Versi sinkron untuk pemanggil yang sudah tahu basisnya siap. */
export function siap(): boolean {
  return mtime(BERKAS.country()) > 0 || mtime(BERKAS.city()) > 0 || mtime(BERKAS.asn()) > 0;
}

export interface StatusGeo {
  country: { ada: boolean; umurHari: number | null };
  city: { ada: boolean; umurHari: number | null };
  asn: { ada: boolean; umurHari: number | null };
}

function statusBerkas(kunci: KunciDb) {
  const umur = mtime(BERKAS[kunci]());
  if (!umur) return { ada: false, umurHari: null as number | null };
  return { ada: true, umurHari: Math.floor((Date.now() - umur) / (24 * 3600 * 1000)) };
}

/** Keadaan basis untuk panel: ada atau tidak, dan umur tiap berkasnya. */
export function status(): StatusGeo {
  return {
    country: statusBerkas("country"),
    city: statusBerkas("city"),
    asn: statusBerkas("asn"),
  };
}

/* ------------------------------------------------------------------ *
 * Pengunduhan otomatis
 * ------------------------------------------------------------------ */

let sedangUnduh = false;
let terakhirUnduh = 0;
let terakhirGagal = 0;

/**
 * Alamat unduhan satu edisi untuk bulan tertentu — fungsi murni supaya bisa
 * diuji tanpa menyentuh jaringan.
 */
export function urlDbip(edition: string, tahun: number, bulan: number): string {
  const bb = String(bulan).padStart(2, "0");
  return `https://download.db-ip.com/free/${edition}-${tahun}-${bb}.mmdb.gz`;
}

function bulanIni(offsetBulan: number): { tahun: number; bulan: number } {
  const kini = new Date();
  const d = new Date(Date.UTC(kini.getUTCFullYear(), kini.getUTCMonth() - offsetBulan, 1));
  return { tahun: d.getUTCFullYear(), bulan: d.getUTCMonth() + 1 };
}

/** Mengunduh satu edisi, mencoba bulan ini lalu dua bulan sebelumnya. */
function unduhEdisi(edition: string, tujuan: string): Promise<void> {
  const percobaan = [0, 1, 2].map((n) => {
    const { tahun, bulan } = bulanIni(n);
    return urlDbip(edition, tahun, bulan);
  });
  return (async () => {
    let galat: unknown = new Error("tanpa-cobaan");
    for (const alamat of percobaan) {
      try {
        await unduhSatu(alamat, tujuan);
        return;
      } catch (e) {
        galat = e;
      }
    }
    throw galat instanceof Error ? galat : new Error(String(galat));
  })();
}

function unduhSatu(alamat: string, tujuan: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const batas = setTimeout(() => ac.abort(), 300 * 1000);
    fetch(alamat, { signal: ac.signal, headers: { "user-agent": "EVKita/1.0 (geoip-update; +https://evkita.com)" } }).then(
      async (res) => {
        clearTimeout(batas);
        if (!res.ok && res.status !== 200) {
          reject(new Error(`http${res.status}`));
          return;
        }
        try {
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length) {
            reject(new Error("kosong"));
            return;
          }
          const mmdb = await gunzip(buf);
          if (!mmdb.length || mmdb.subarray(0, 2).toString("utf8", 0, 2) === "<!") {
            reject(new Error("bukan-mmdb"));
            return;
          }
          fs.mkdirSync(path.dirname(tujuan), { recursive: true });
          const sementara = `${tujuan}.baru`;
          fs.writeFileSync(sementara, mmdb);
          fs.renameSync(sementara, tujuan);
          resolve();
        } catch (e: any) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
      (e) => {
        clearTimeout(batas);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}

function gunzip(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (galat, hasil) => {
      if (galat) reject(galat);
      else resolve(hasil);
    });
  });
}

/**
 * Dipanggil penjadwal tiap 10 menit — dan sekali di tiap pencarian yang
 * basisnya belum siap, supaya pemasangan baru mengunduh tanpa menunggu
 * jadwal. Mengunduh kalau ada yang hilang atau lebih tua dari sebulan.
 * Berjalan di latar, tidak pernah melempar, tidak pernah menahan permintaan.
 */
export function jadwalkanGeoip(): void {
  try {
    // Saklar darurat untuk server luring dan untuk pengujian: tanpa unduhan
    // sama sekali, pencarian tetap jalan (dan tetap "tidak diketahui").
    if (getEnv("EVKITA_TANPA_GEO", "")) return;
    if (sedangUnduh) return;
    if (Date.now() - terakhirUnduh < JEDA_UNDUH_MS) return;
    if (Date.now() - terakhirGagal < JEDA_GAGAL_MS) return;
    const perlu = (Object.keys(BERKAS) as KunciDb[]).some((k) => {
      const umur = mtime(BERKAS[k]());
      return !umur || Date.now() - umur > JEDA_UNDUH_MS;
    });
    if (!perlu) return;
    sedangUnduh = true;
    void (async () => {
      try {
        for (const k of Object.keys(BERKAS) as KunciDb[]) {
          try {
            await unduhEdisi(EDISI[k], BERKAS[k]());
          } catch {
            /* satu edisi gagal tidak menggagalkan yang lain */
          }
        }
        terakhirUnduh = Date.now();
      } catch {
        terakhirGagal = Date.now();
      } finally {
        sedangUnduh = false;
      }
    })();
  } catch {
    /* tidak ada yang boleh menjatuhkan penjadwal */
  }
}
