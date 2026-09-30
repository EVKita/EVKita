/**
 * Dispatcher mesin AI: DeepSeek (berbayar) atau Gemini (gratis).
 *
 * Seluruh pemanggil — riset manual (`ai-jobs.ts`), auto-update harian
 * (`pembaruan-kendaraan.ts`), penerjemahan situs (`terjemahan.js`), dan
 * halaman pengaturan — bicara dengan berkas ini, bukan langsung ke penyedia.
 * Bentuk API tiap penyedia tetap hanya diketahui berkasnya masing-masing
 * (`deepseek.ts`, `gemini.ts`); di sini hanya pemilihan dan penerusan.
 *
 * Aturan pemilihan (`mesinAktif()`): pilihan eksplisit `AI_MESIN` menang
 * selama kuncinya terpasang; kalau tidak, pakai penyedia mana pun yang
 * kuncinya ada (DeepSeek dulu, supaya pemasangan lama tidak berubah perilaku
 * begitu berkas ini tiba); kalau tidak ada kunci sama sekali, jawabannya
 * DeepSeek — hanya sebagai nama untuk pesan galat.
 */

import { getEnv } from "./env";
import {
  jalankanRiset as risetDeepseek,
  rapikanJadiJson as rapikanDeepseek,
  terjemahkanBerteks as terjemahDeepseek,
  type RisetOpts,
  type RisetHasil,
} from "./deepseek";
import {
  jalankanRiset as risetGemini,
  rapikanJadiJson as rapikanGemini,
  terjemahkanBerteks as terjemahGemini,
  GEMINI_MODEL_BAWAAN,
  type BahasaTerjemahan,
} from "./gemini";
import { biayaDari as biayaDeepseek, perkiraanBiaya, MODEL_PILIHAN, MODEL_BAWAAN } from "./ai-biaya.js";

export type Mesin = "deepseek" | "gemini";

export const MESIN_PILIHAN: Mesin[] = ["deepseek", "gemini"];

const KUNCI_ENV: Record<Mesin, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const MODEL_ENV: Record<Mesin, string> = {
  deepseek: "DEEPSEEK_MODEL",
  gemini: "GEMINI_MODEL",
};

function bacaMesinDiminta(): Mesin {
  const v = String(getEnv("AI_MESIN", "") || "").trim().toLowerCase();
  return v === "gemini" || v === "deepseek" ? v : "deepseek";
}

/** Kunci penyedia ini, atau "" kalau belum dipasang. */
export function kunciMesin(mesin: Mesin): string {
  return String(getEnv(KUNCI_ENV[mesin], "") || "").trim();
}

/** Mesin yang benar-benar dipakai untuk riset berikutnya. */
export function mesinAktif(): Mesin {
  const diminta = bacaMesinDiminta();
  if (diminta === "gemini" && kunciMesin("gemini")) return "gemini";
  if (diminta === "deepseek" && kunciMesin("deepseek")) return "deepseek";
  if (kunciMesin("deepseek")) return "deepseek";
  if (kunciMesin("gemini")) return "gemini";
  return diminta;
}

/** Apakah riset sudah bisa dijalankan sama sekali (dengan mesin aktifnya)? */
export function siapRiset(): boolean {
  return !!kunciMesin(mesinAktif());
}

/** Model bawaan mesin aktif, dari `.env`. */
export function modelBawaan(): string {
  const mesin = mesinAktif();
  if (mesin === "gemini") {
    const dari = String(getEnv(MODEL_ENV.gemini, "") || "").trim();
    return dari || GEMINI_MODEL_BAWAAN;
  }
  const dari = String(getEnv(MODEL_ENV.deepseek, "") || "").trim();
  return MODEL_PILIHAN.includes(dari) ? dari : MODEL_BAWAAN;
}

/** Model yang boleh dipilih dari panel untuk mesin aktif. */
export function modelPilihan(): string[] {
  return mesinAktif() === "gemini" ? [modelBawaan()] : [...MODEL_PILIHAN];
}

/** Model untuk satu riset: pilihan panel kalau sah, kalau tidak yang bawaan. */
export function modelUntuk(diminta: string): string {
  const mesin = mesinAktif();
  const nama = String(diminta || "").trim();
  if (mesin === "gemini") return nama || modelBawaan();
  return MODEL_PILIHAN.includes(nama) ? nama : modelBawaan();
}

/** Apakah model ini milik Gemini (tarif gratis)? Nama DeepSeek tidak pernah berawalan itu. */
export function modelGratis(model: string): boolean {
  return /^gemini-/i.test(String(model || "").trim());
}

/**
 * Biaya NYATA satu riset dari objek `usage` penyedianya.
 *
 * Gemini paket gratis: selalu nol — panel menampilkannya sebagai "Rp 0" dan
 * bagian saldo menjelaskan bahwa riset tidak memotong apa pun.
 */
export function biayaDariUsage(usage: any, model: string, sekarang: Date): { usd: number; rupiah: number } {
  if (modelGratis(model)) return { usd: 0, rupiah: 0 };
  return biayaDeepseek(usage, model, sekarang);
}

/** Perkiraan biaya SEBELUM riset, untuk ditampilkan di tombol. */
export function perkiraanBiayaMesin(mode: string, model: string, sekarang: Date): { usd: number; rupiah: number } {
  if (modelGratis(model)) return { usd: 0, rupiah: 0 };
  return perkiraanBiaya(mode, model, sekarang);
}

/**
 * Galat kunci-belum-dipasang menurut mesin aktif — supaya panel Gemini tidak
 * disuruh memasang kunci DeepSeek.
 */
export function galatBelumAdaKunci(): string {
  return mesinAktif() === "gemini" ? "err.ai.geminiBelumAdaKunci" : "err.ai.belumAdaKunci";
}

/** Galat generik "penyedia bermasalah" menurut mesin aktif. */
export function galatBermasalah(): string {
  return mesinAktif() === "gemini" ? "err.ai.geminiBermasalah" : "err.ai.deepseekBermasalah";
}

/** Galat "tidak terhubung" menurut mesin aktif. */
export function galatTidakTerhubung(): string {
  return mesinAktif() === "gemini" ? "err.ai.geminiTidakTerhubung" : "err.ai.tidakTerhubung";
}

/**
 * Kunci galat yang jawabannya boleh dirapikan panggilan kedua. Gabungan
 * kedua penyedia — dipakai `ai-jobs.ts` dan `pembaruan-kendaraan.ts` supaya
 * keduanya tidak perlu tahu mesin mana yang sedang jalan.
 */
export const BISA_DIRAPIKAN = new Set([
  "err.ai.jawabanTidakTerbaca",
  "err.ai.jawabanTerpotong",
  "err.ai.geminiJawabanBuruk",
]);

export function jalankanRiset(opts: RisetOpts): Promise<RisetHasil> {
  const mesin = mesinAktif();
  if (mesin === "gemini") {
    return risetGemini({ ...opts, model: modelUntuk(opts.model) });
  }
  return risetDeepseek(opts);
}

export function rapikanJadiJson(opts: {
  apiKey: string;
  schema: any;
  mentah: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; hasil?: any; errorKey?: string; usage?: any }> {
  const mesin = mesinAktif();
  if (mesin === "gemini") {
    return rapikanGemini({ ...opts, model: modelBawaan() });
  }
  return rapikanDeepseek(opts);
}

export function terjemahkanBerteks(
  teks: string[],
  bahasa: BahasaTerjemahan,
  opsi: { apiKey?: string } = {}
): Promise<string[]> {
  const mesin = mesinAktif();
  if (mesin === "gemini") {
    return terjemahGemini(teks, bahasa, opsi.apiKey ? { apiKey: opsi.apiKey } : {});
  }
  return terjemahDeepseek(teks, bahasa, opsi);
}

/**
 * Menguji kunci SEBELUM disimpan (dipakai halaman Pengaturan AI).
 *
 * DeepSeek diuji lewat saldo (gratis, tanpa inferensi); Gemini lewat daftar
 * model (gratis juga) — sekaligus mengambil nama model flash untuk disimpan
 * sebagai bawaan, supaya nama model yang pensiun tidak perlu dikenal panel.
 */
export async function periksaKunci(
  mesin: Mesin,
  key: string
): Promise<{ ok: boolean; errorKey: string; detail?: string; model?: string }> {
  if (mesin === "gemini") {
    const { daftarModel, pilihModelFlash } = await import("./gemini");
    const hasil = await daftarModel(key);
    if (!hasil.ok) return { ok: false, errorKey: hasil.errorKey, detail: hasil.detail };
    const model = pilihModelFlash(hasil.model.map((m) => m.nama)) || GEMINI_MODEL_BAWAAN;
    return { ok: true, errorKey: "", model };
  }
  const { fetchBalance } = await import("./deepseek");
  const hasil = await fetchBalance(key);
  if (!hasil.ok) return { ok: false, errorKey: hasil.errorKey };
  return { ok: true, errorKey: "" };
}
