import path from "node:path";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { normalkanPengaturan } from "./pembaruan.js";
import { hariWib } from "./trafik.js";

/**
 * Penjualan bulanan otomatis — umpan panel "Laris Mobil Kita" di beranda.
 *
 * Panel-panel Kita dirender LANGSUNG dari `content.json` di setiap permintaan,
 * jadi "otomatis" bagi mereka berarti DATANYA yang harus bergerak sendiri.
 * Untuk "Terbaru" tidak ada yang perlu dikerjakan (urut tahun model + model
 * baru otomatis tiap hari lewat `model-baru.ts`). Untuk "Laris" angkanya
 * adalah rilis bulanan Gaikindo — dan sebelum modul ini ada, tidak satu pun
 * jalur yang menjamin angka itu ditengok tiap bulan: `pilihKendaraan()` hanya
 * mengambil yang bertanda `stale`/`perluCek`, dan mobil yang spesifikasinya
 * segar tapi angkanya dua bulan lama tidak pernah masuk antrean.
 *
 * Cara kerjanya, meniru `pemantau.ts`:
 *
 *   1. Sehari sekali, hitung bulan Gaikindo terbaru yang datanya SUDAH keluar
 *      (rilis sekitar pertengahan bulan berikutnya).
 *   2. Tandai paling banyak BATAS_TANDAI_SEHARI kendaraan yang bulannya lebih
 *      tua sebagai `perluCek` — tanda yang sama dipakai pemantau, dan putaran
 *      auto-update harian (yang riset SKEMA PENUH termasuk penjualan2026 dan
 *      penjualanBulan) mengambilnya dengan prioritas basi.
 *   3. Catat siapa yang sudah ditandai bulan ini di
 *      `data/penjualan-bulanan.json`: riset yang tidak menghasilkan perubahan
 *      TIDAK memajukan bulan kendaraannya (patch hanya berisi yang berbeda),
 *      dan tanpa catatan ini kendaraan yang sama ditandai ulang setiap hari
 *      selamanya sambil membakar kuota.
 *
 * Yang TIDAK dilakukan modul ini, dengan sengaja:
 *
 *   - Tidak meriset sendiri — riset tetap lewat satu pintu
 *     (`pembaruan-kendaraan.ts`) dengan pagar keyakinannya.
 *   - Tidak jalan kalau saklar auto-update mati — menandai tanpa ada yang
 *     menindaklanjuti hanya membanjiri "Perlu ditinjau" di panel.
 *   - Tidak pernah menggagalkan permintaan (`jadwalkanPenjualan()`).
 */

const BERKAS = () => path.resolve(process.cwd(), "data", "penjualan-bulanan.json");
const BERKAS_PENGATURAN = () => path.resolve(process.cwd(), "data", "pembaruan-kendaraan.json");

/**
 * Tanggal rilis wholesales Gaikindo di bulan berikutnya. Konservatif dengan
 * sengaja: menandai SEBELUM angkanya keluar berarti membayar riset untuk
 * jawaban null (tidak merusak apa pun, tapi membuang kuota).
 */
export const HARI_RILIS_GAIKINDO = 12;

/** Berapa kendaraan paling banyak ditandai per hari — seirama batasHarian bawaan. */
export const BATAS_TANDAI_SEHARI = 5;

/**
 * Jeda sebelum kendaraan yang sudah ditandai boleh ditandai lagi. Menutup
 * lubang "riset tidak pernah jalan" (mis. kunci AI belum dipasang sebulan):
 * tanpa ini, bulan itu selesai tanpa satu pun riset; dengan ini, yang
 * tertinggal dicoba lagi paling cepat 25 hari kemudian.
 */
export const JEDA_ULANG_HARI = 25;

/** Umur maksimum catatan penandaan — yang lebih tua dibuang saat menyimpan. */
const UMUR_INGAT_HARI = 60;

function keHari(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Bulan Gaikindo terbaru yang datanya sudah keluar (YYYY-MM).
 *
 * Gaikindo merilis wholesales sekitar pertengahan bulan berikutnya, jadi pada
 * tanggal 11 Oktober yang terbaru adalah Agustus, dan pada tanggal 12 Oktober
 * adalah September. Murni: tanggalnya disuntik pemanggil supaya bisa diuji.
 */
export function bulanGaikindoTerbaru(hari: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hari || ""));
  if (!m) return "";
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return "";

  let mundur = d >= HARI_RILIS_GAIKINDO ? 1 : 2;
  while (mundur-- > 0) {
    mo -= 1;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

export interface KandidatJualan {
  col: string;
  id: string;
  brand: string;
  name: string;
}

/**
 * Kendaraan yang angka penjualannya basi untuk bulan target.
 *
 * Murni: tidak membaca berkas, tidak menulis apa pun. Aturannya berurutan:
 *
 *   - draf, tanpa merek/nama, dan yang sudah antre (`stale`/`perluCek`)
 *     dilewati — yang terakhir supaya tidak menumpuk tanda di atas tanda;
 *   - bulan yang sama/lebih baru dari target berarti segar (`YYYY-MM`
 *     bisa dibandingkan sebagai teks — leksikografisnya kronologis);
 *   - yang SUDAH ditandai bulan ini (catatan `ditandai`) dilewati, kecuali
 *     penandaannya lebih tua dari JEDA_ULANG_HARI (risetnya tidak pernah
 *     jalan, coba lagi);
 *   - urutan: yang BERANGKA dulu (penghuni panel Laris — ketepatannya yang
 *     paling terlihat), lalu bulan tertua (yang belum pernah berbulan paling
 *     tua), lalu yang paling lama tidak diperbarui.
 */
export function pilihJualan(
  content: any,
  bulanTarget: string,
  batas: number,
  ditandai: Record<string, string> = {},
  hariIni = ""
): KandidatJualan[] {
  if (!bulanTarget) return [];
  const n = Math.max(0, Math.floor(Number(batas) || 0));
  if (!n) return [];
  const hari = keHari(hariIni);

  const daftar: (KandidatJualan & { bulan: string; punyaAngka: boolean; updatedAt: string })[] = [];
  for (const col of ["cars", "motors"]) {
    for (const v of (content && (content as any)[col]) || []) {
      if (!v || !v.id || !v.brand || !v.name) continue;
      if (v.status === "draft") continue;
      if (v.stale || v.perluCek) continue;
      const bulan = typeof v.penjualanBulan === "string" ? v.penjualanBulan : "";
      if (bulan && bulan >= bulanTarget) continue;
      const id = String(v.id);
      const tandaiPada = ditandai[id];
      if (tandaiPada && Number.isFinite(hari)) {
        const umur = Math.floor((hari - keHari(tandaiPada)) / 86400000);
        if (Number.isFinite(umur) && umur < JEDA_ULANG_HARI) continue;
      }
      daftar.push({
        col,
        id,
        brand: String(v.brand),
        name: String(v.name),
        bulan,
        punyaAngka: Number(v.penjualan2026) > 0,
        updatedAt: String(v.updatedAt || ""),
      });
    }
  }

  daftar.sort((a, b) => {
    if (a.punyaAngka !== b.punyaAngka) return a.punyaAngka ? -1 : 1;
    if (a.bulan !== b.bulan) return a.bulan < b.bulan ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
    return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
  });

  return daftar.slice(0, n).map(({ col, id, brand, name }) => ({ col, id, brand, name }));
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
    // Catatan yang lebih tua dari dua bulan tidak akan dipakai lagi (batas
    // ulangnya 25 hari) — buang supaya berkasnya tidak tumbuh selamanya.
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

export interface HasilJualan {
  dilewati: boolean;
  bulan: string;
  ditandai: KandidatJualan[];
}

/**
 * Satu putaran penandaan harian. Menulis `content.json` HANYA kalau ada yang
 * benar-benar ditandai — putaran yang tidak menghasilkan apa-apa tidak
 * menyentuh revisi dokumen (panel yang sedang menyunting tidak perlu tahu).
 */
export function tandaiJualan({ paksa = false }: { paksa?: boolean } = {}): HasilJualan {
  const hari = hariWib();
  const kosong: HasilJualan = { dilewati: true, bulan: "", ditandai: [] };
  try {
    if (!bacaAktif() && !paksa) return kosong;
    const target = bulanGaikindoTerbaru(hari);
    if (!target) return kosong;

    const state = bacaState();
    if (!paksa && state.terakhir === hari) return { ...kosong, bulan: target };

    const content = readContent();
    const dipilih = pilihJualan(content, target, BATAS_TANDAI_SEHARI, state.tandai, hari);
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
export function jadwalkanPenjualan(): void {
  try {
    const hari = hariWib();
    if (hariJalan === hari) return;
    hariJalan = hari;
    void Promise.resolve()
      .then(() => tandaiJualan())
      .catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
