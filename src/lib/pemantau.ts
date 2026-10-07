/**
 * Pemantau sinyal otomotif per jam — TANPA AI, TANPA kuota.
 *
 * Jawaban atas dua kendala auto-update:
 *
 *   1. Riset AI (DeepSeek) berbayar per panggilan dan data penjualan resmi
 *      terbit bulanan — memanggilnya per jam hanya membakar kuota untuk angka
 *      yang sama. Jadi yang berjalan per jam hanyalah yang GRATIS: membaca
 *      ulang RSS penerbit yang sama dengan penarik berita harian, mencari
 *      sinyal penjualan/peluncuran, dan menandai kendaraan yang cocok sebagai
 *      `stale` supaya muncul di "Perlu ditinjau" pada dasbor panel.
 *   2. Tanpa kunci DeepSeek, mesin riset harian memang diam — tapi pemantau
 *      ini, penarik berita, dan pendeteksi viral tetap jalan penuh. Otomatisasi
 *      turun tingkat dengan sendirinya ke "bantu-manual": yang tinggal untuk
 *      manusia hanyalah meninjau antrean dan menekan Simpan.
 *
 * Yang TIDAK dilakukan pemantau ini, dengan sengaja: membuat entri katalog
 * baru dan mengubah angka. Model baru tetap butuh satu klik di panel, dan
 * angka tetap hanya dari riset AI atau tangan penyunting. Sinyal berarti
 * "periksa ini", bukan "tulis itu" — prinsip yang sama dengan pendeteksi
 * viral di `peluncuran-rekam.ts`.
 *
 * Dua jaring pengaman, meniru `berita-harian.ts`:
 *
 *   1. **Paling cepat sejam sekali.** Stempel terakhir disimpan di
 *      `data/pantauan.json`; muat ulang server tidak memicu pemindaian kedua.
 *   2. **Tidak pernah menggagalkan permintaan.** `jadwalkanPantauan()`
 *      dipanggil middleware tanpa `await`.
 */

import fs from "node:fs";
import path from "node:path";
import { readContent, writeContent } from "./store";
import { SUMBER_BERITA, relevanBerita, judulBersih } from "./berita-sumber.js";
import { parseFeed } from "./berita-rss.js";

const BERKAS = () => path.resolve(process.cwd(), "data/pantauan.json");
const UA = "Mozilla/5.0 (compatible; EVKitaBot/1.0; +https://evkita.com)";
/** Jarak minimum dua pemindaian (55 menit — "setiap jam" dengan toleransi). */
const JEDA_MS = 55 * 60 * 1000;
/** Tautan yang diingat supaya tiap berita hanya dinilai sekali. */
const MAKS_INGAT = 400;

/** Kata yang menandai kabar penjualan — Gaikindo, peringkat, unit terjual. */
export const SINYAL_PENJUALAN = [
  "penjualan",
  "gaikindo",
  "wholesales",
  "retail sales",
  "terlaris",
  "paling laris",
  "laris manis",
  "terjual",
  "distribusi",
  "ekspor",
];

/** Kata yang menandai model baru, facelift, atau harga baru. */
export const SINYAL_MODEL = [
  "meluncur",
  "diluncurkan",
  "resmi hadir",
  "diperkenalkan",
  "generasi baru",
  "facelift",
  "all new",
  "harga resmi",
  "harga mulai",
  "buka keran",
  "pre-booking",
];

/** Huruf kecil, tanpa aksen — pencocokan tidak boleh rewel soal kapital. */
function baku(teks: string): string {
  return String(teks || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Apakah berita ini menyebut kendaraan tersebut? Syaratnya dua-duanya:
 * mereknya disebut DAN satu kata kuncinya namanya disebut. "Toyota Avanza
 * laris" menandai Avanza, bukan seluruh katalog Toyota.
 */
export function cocokModel(judul: string, brand: string, name: string): boolean {
  const t = baku(judul);
  const b = baku(brand).trim();
  if (!b || b.length < 3 || !t.includes(b)) return false;
  const kata = baku(name)
    .split(/[^a-z0-9]+/)
    .filter((k) => k.length >= 3);
  return kata.some((k) => t.includes(k));
}

/**
 * Jenis sinyal sebuah teks, atau null kalau bukan keduanya. Penjualan
 * diperiksa lebih dulu: "penjualan Avanza meluncur naik" adalah kabar
 * penjualan, bukan peluncuran.
 */
export function jenisSinyal(teks: string): "penjualan" | "model" | null {
  const t = baku(teks);
  if (SINYAL_PENJUALAN.some((k) => t.includes(k))) return "penjualan";
  if (SINYAL_MODEL.some((k) => t.includes(k))) return "model";
  return null;
}

/**
 * Dari daftar berita baru, pilih kendaraan yang pantas ditandai. Murni, tanpa
 * sentuhan disk — yang diuji di `tests/pemantau.test.ts`.
 *
 * @returns larik `{ col, id, jenis }` tanpa kembar.
 */
export function pilihDitandai(
  items: { title: string; excerpt?: string }[],
  vehicles: { col: string; id: string; brand: string; name: string }[]
): { col: string; id: string; jenis: "penjualan" | "model" }[] {
  const keluar: { col: string; id: string; jenis: "penjualan" | "model" }[] = [];
  const sudah = new Set<string>();
  for (const it of items || []) {
    const teks = `${(it && it.title) || ""} ${(it && it.excerpt) || ""}`;
    const jenis = jenisSinyal(teks);
    if (!jenis) continue;
    for (const v of vehicles || []) {
      if (!v || !v.id) continue;
      const kunci = `${v.col}:${v.id}`;
      if (sudah.has(kunci)) continue;
      if (cocokModel(it.title || "", v.brand, v.name)) {
        sudah.add(kunci);
        keluar.push({ col: v.col, id: v.id, jenis });
      }
    }
  }
  return keluar;
}

function bacaState(): any {
  try {
    return JSON.parse(fs.readFileSync(BERKAS(), "utf8"));
  } catch {
    return {};
  }
}

function tulisState(v: any): void {
  try {
    fs.mkdirSync(path.dirname(BERKAS()), { recursive: true });
    fs.writeFileSync(BERKAS(), JSON.stringify(v));
  } catch {
    /* best-effort */
  }
}

/** Mengambil satu feed menjadi daftar `{ title, excerpt, link }`. */
async function ambilSumber(sumber: { feed: string; stripJudul?: string }): Promise<any[]> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(sumber.feed, {
      headers: {
        "user-agent": UA,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: c.signal,
    });
    if (!r.ok) return [];
    return parseFeed(await r.text()).map((it: any) => ({
      title: judulBersih(sumber, it.title),
      excerpt: it.excerpt,
      link: it.link,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export interface HasilPantauan {
  dilewati: boolean;
  ditandai: { col: string; id: string; jenis: string }[];
  sinyal: number;
}

/**
 * Memindai RSS, menandai kendaraan yang tersangkut sinyal sebagai `stale`.
 *
 * @param paksa `true` untuk mengabaikan penjaga "sejam sekali".
 */
export async function pantauSinyal({ paksa = false }: { paksa?: boolean } = {}): Promise<HasilPantauan> {
  const sekarang = Date.now();
  const state = bacaState();
  if (!paksa && Number(state.terakhir) && sekarang - Number(state.terakhir) < JEDA_MS) {
    return { dilewati: true, ditandai: [], sinyal: 0 };
  }
  tulisState({ ...state, terakhir: sekarang });

  try {
    const hasil = await Promise.all(SUMBER_BERITA.map((s) => ambilSumber(s)));
    const semua = hasil.flat().filter((it) => it && it.title && it.link);
    const ingat: string[] = Array.isArray(state.lihat) ? state.lihat : [];
    const dikenal = new Set(ingat);
    const baru = semua.filter((it) => {
      if (dikenal.has(it.link)) return false;
      dikenal.add(it.link);
      return true;
    });
    const relevan = baru.filter((it) => relevanBerita(`${it.title} ${it.excerpt}`));

    const content = readContent();
    const armada: { col: string; id: string; brand: string; name: string }[] = [];
    for (const col of ["cars", "motors"]) {
      for (const v of (content && (content as any)[col]) || []) {
        if (!v || !v.id || !v.brand || !v.name) continue;
        if (v.status === "draft") continue;
        armada.push({ col, id: String(v.id), brand: String(v.brand), name: String(v.name) });
      }
    }

    const target = pilihDitandai(relevan, armada);
    let berubah = false;
    if (target.length) {
      for (const k of target) {
        const daftar = k.col === "motors" ? (content as any).motors : (content as any).cars;
        const item = (daftar || []).find((v: any) => v && v.id === k.id);
        if (item && !item.stale) {
          item.stale = true;
          berubah = true;
        }
      }
      if (berubah) writeContent(content);
    }

    tulisState({
      terakhir: sekarang,
      lihat: [...dikenal].slice(-MAKS_INGAT),
      hasil: {
        tanggal: new Date(sekarang).toISOString(),
        dipindai: semua.length,
        sinyal: relevan.length,
        ditandai: target,
      },
    });
    return { dilewati: false, ditandai: target, sinyal: relevan.length };
  } catch {
    return { dilewati: false, ditandai: [], sinyal: 0 };
  }
}

let terakhirJalan = 0;

/** Dipanggil middleware; paling cepat sejam sekali, tidak ditunggu, tidak pernah melempar. */
export function jadwalkanPantauan(): void {
  try {
    const sekarang = Date.now();
    if (sekarang - terakhirJalan < JEDA_MS) return;
    terakhirJalan = sekarang;
    void pantauSinyal().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
