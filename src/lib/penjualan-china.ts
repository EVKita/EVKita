import path from "node:path";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { normalkanPengaturan } from "./pembaruan.js";
import { pilihJualan, BATAS_TANDAI_SEHARI } from "./penjualan-bulanan";
import { hariWib } from "./trafik.js";

/**
 * Penjualan China bulanan — padanan Gaikindo untuk edisi China.
 *
 * Angka penjualan ritel NEV China keluar BULANAN lewat CPCA (Asosiasi Mobil
 * Penumpang China), biasanya tanggal 8–12 bulan berikutnya — jadi mesin ini
 * berjalan dengan irama bulan seperti Gaikindo, bukan kuartal seperti Cox:
 *
 *   1. Sehari sekali, hitung bulan terakhir yang datanya SUDAH keluar
 *      (konservatif: dianggap keluar tanggal 12).
 *   2. Tandai kendaraan China yang bulannya lebih tua sebagai `perluCek` —
 *      tanda yang sama dipakai pemantau, dan putaran auto-update harian
 *      (yang riset SKEMA PENUH termasuk penjualan2026 dan penjualanBulan
 *      dengan prompt pasar China) mengambilnya dengan prioritas basi.
 *   3. Catat siapa yang sudah ditandai di `data/penjualan-china.json`
 *      (pola yang sama dengan `penjualan-bulanan.json` versi Indonesia).
 *
 * Yang TIDAK dilakukan modul ini, dengan sengaja (sama seperti versi
 * Indonesia dan Amerika): tidak meriset sendiri, tidak jalan kalau saklar
 * auto-update mati, tidak pernah menggagalkan permintaan
 * (`jadwalkanPenjualanChina()`).
 */

const BERKAS = () => path.resolve(process.cwd(), "data", "penjualan-china.json");
const BERKAS_PENGATURAN = () => path.resolve(process.cwd(), "data", "pembaruan-kendaraan.json");

/**
 * Tanggal data penjualan bulanan CPCA dianggap tersedia. Konservatif
 * dengan sengaja: menandai SEBELUM angkanya keluar berarti membayar
 * riset untuk jawaban null.
 */
export const HARI_RILIS_CPCA = 12;

/** Berapa kendaraan paling banyak ditandai per hari — seirama versi Indonesia. */
export const BATAS_TANDAI_SEHARI_CN = BATAS_TANDAI_SEHARI;

/** Jeda sebelum kendaraan yang sudah ditandai boleh ditandai lagi. */
export const JEDA_ULANG_HARI_CN = 25;

/** Umur maksimum catatan penandaan. */
const UMUR_INGAT_HARI = 60;

function keHari(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Bulan terakhir yang datanya CPCA sudah keluar (YYYY-MM).
 *
 * Murni: tanggalnya disuntik pemanggil supaya bisa diuji.
 */
export function bulanCpcaTerbaru(hari: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hari || ""));
  if (!m) return "";
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return "";

  let mundur = d >= HARI_RILIS_CPCA ? 1 : 2;
  mo -= mundur;
  while (mo < 1) {
    mo += 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

export interface HasilJualanCn {
  dilewati: boolean;
  bulan: string;
  ditandai: { col: string; id: string; brand: string; name: string }[];
}

function bacaState(): { terakhir: string; tandai: Record<string, string> } {
  const res = readJson<any>(BERKAS());
  const data = res.status === "ok" && res.data && typeof res.data === "object" ? res.data : {};
  const tandai: Record<string, string> = {};
  const src = data.tandai && typeof data.tandai === "object" ? data.tandai : {};
  for (const k of Object.keys(src)) {
    if (typeof src[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(src[k])) tandai[k] = src[k];
  }
  return { terakhir: typeof data.terakhir === "string" ? data.terakhir : "", tandai };
}

function tulisState(state: { terakhir: string; tandai: Record<string, string> }): void {
  try {
    const batas = Date.now() - UMUR_INGAT_HARI * 86400000;
    const tandai: Record<string, string> = {};
    for (const k of Object.keys(state.tandai || {})) {
      const t = keHari(state.tandai[k]);
      if (Number.isFinite(t) && t >= batas) tandai[k] = state.tandai[k];
    }
    writeJsonAtomic(BERKAS(), { terakhir: state.terakhir, tandai });
  } catch {
    /* state boleh hilang — besok dihitung ulang dari content.json */
  }
}

function bacaAktif(): boolean {
  try {
    const res = readJson<any>(BERKAS_PENGATURAN());
    return normalkanPengaturan(res.status === "ok" ? res.data?.pengaturan : undefined).aktif;
  } catch {
    return true;
  }
}

/**
 * Satu putaran penandaan harian untuk edisi China. Menulis `content.json`
 * HANYA kalau ada yang benar-benar ditandai.
 */
export function tandaiJualanChina({ paksa = false }: { paksa?: boolean } = {}): HasilJualanCn {
  const hari = hariWib();
  const kosong: HasilJualanCn = { dilewati: true, bulan: "", ditandai: [] };
  try {
    if (!bacaAktif() && !paksa) return kosong;
    const target = bulanCpcaTerbaru(hari);
    if (!target) return kosong;

    const state = bacaState();
    if (!paksa && state.terakhir === hari) return { ...kosong, bulan: target };

    const content = readContent();
    /* Hanya armada China — edisi lain ikut putarannya sendiri. */
    const armadaCn = {
      cars: ((content as any).cars || []).filter((v: any) => v && String(v.wilayah || "").toLowerCase() === "cn"),
      motors: ((content as any).motors || []).filter((v: any) => v && String(v.wilayah || "").toLowerCase() === "cn"),
    };
    const dipilih = pilihJualan(armadaCn, target, BATAS_TANDAI_SEHARI_CN, state.tandai, hari);
    if (!dipilih.length) {
      tulisState({ ...state, terakhir: hari });
      return { dilewati: true, bulan: target, ditandai: [] };
    }

    let berubah = false;
    for (const k of dipilih) {
      const daftar = (content as any)[k.col] || [];
      const item = (daftar || []).find((v: any) => v && v.id === k.id);
      if (item && !item.stale && !item.perluCek) {
        item.perluCek = true;
        berubah = true;
        state.tandai[k.id] = hari;
      }
    }
    if (berubah) writeContent(content);
    tulisState({ terakhir: hari, tandai: state.tandai });
    return { dilewati: false, bulan: target, ditandai: dipilih };
  } catch {
    return kosong;
  }
}

let hariJalan = "";

/** Dipanggil middleware; paling cepat sehari sekali, tidak ditunggu, tidak pernah melempar. */
export function jadwalkanPenjualanChina(): void {
  try {
    const hari = hariWib();
    if (hariJalan === hari) return;
    hariJalan = hari;
    void Promise.resolve()
      .then(() => tandaiJualanChina())
      .catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
