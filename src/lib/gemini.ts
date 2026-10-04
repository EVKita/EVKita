/**
 * Klien Gemini (Google AI Studio, paket gratis).
 *
 * Ini SATU-SATUNYA berkas yang tahu bentuk API Gemini — pasangan dari
 * `src/lib/deepseek.ts`, yang memegang prinsip yang sama untuk DeepSeek.
 * Sisa sistem bicara dengan `src/lib/ai-mesin.ts`, yang memilih penyedia
 * aktif dan meneruskan panggilan ke sini atau ke DeepSeek.
 *
 * Dua hal dari dokumentasi Gemini yang membentuknya:
 *
 *   1. Pencarian web lewat `tools: [{ google_search: {} }]` dijalankan di
 *      server Google. Kombinasi pencarian + keluaran JSON terstruktur tidak
 *      dipakai di sini: seperti pengalaman DeepSeek (`web_search` + skema
 *      tidak akur), jalur riset berjalan DUA langkah — mencari dulu sebagai
 *      teks, lalu merapikan jadi JSON tanpa alat apa pun.
 *   2. Kunci API gratis dibuat di AI Studio tanpa kartu kredit, dan dipakai
 *      sebagai parameter `?key=`, bukan header `Authorization`.
 *
 * Kunci tidak pernah ditulis ke log mana pun di berkas ini.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

import { getEnv } from "./env";
/** Model bawaan: varian hemat yang masuk paket gratis. */
export const GEMINI_MODEL_BAWAAN = "gemini-2.5-flash";

/**
 * Bentuk kunci Gemini: kunci lama berawalan `AIza`, kunci otorisasi baru
 * (sejak 28 Mei 2026) berawalan `AQ.` — diikuti huruf, angka, garis bawah,
 * strip, atau titik. Seperti `keyLooksValid()` DeepSeek, ini hanya menolak
 * salah tempel yang sudah jelas — uji sesungguhnya tetap ke server saat
 * disimpan.
 */
const KEY_RE = /^(AIza[A-Za-z0-9_-]{20,80}|AQ\.[A-Za-z0-9._-]{10,200})$/;

export function keyLooksValid(key: string): boolean {
  return KEY_RE.test(String(key || "").trim());
}

/** Empat karakter terakhir, sama aturannya dengan DeepSeek. */
export function keyTail(key: string): string {
  const s = String(key || "").trim();
  return s.length >= 4 ? s.slice(-4) : "";
}

/**
 * Kode HTTP Gemini → kunci terjemahan panel.
 *
 * Kunci API yang salah dijawab 400 ("API key not valid"), bukan 401 — jadi
 * ketiganya (400/401/403) berarti "kuncinya yang salah". Kunci sendiri
 * (bukan pesan panel) memang milik Gemini; kalimat Bahasa Indonesia-nya ada
 * di kamus `err.ai.gemini*`.
 */
export function errorKeyForStatus(status: number): string {
  if (status === 400 || status === 401 || status === 403) return "err.ai.geminiKunciSalah";
  if (status === 429) return "err.ai.geminiSibuk";
  if (status >= 500) return "err.ai.geminiBermasalah";
  return "err.ai.geminiDitolak";
}

async function bacaJson(res: Response): Promise<any | null> {
  try {
    const raw = (await res.text()).trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Kalimat galat apa adanya dari badan jawaban, maksimal 400 karakter. */
function detailGalat(data: any): string {
  const pesan = data?.error?.message || data?.message || "";
  return String(pesan || "").slice(0, 400);
}

export interface ModelInfo {
  nama: string;
  tampil: string;
}

/**
 * Mendaftar model yang bisa dipakai kunci ini — sekaligus cara termurah
 * membuktikan kunci sah (tidak menjalankan inferensi apa pun).
 */
export async function daftarModel(key: string): Promise<{
  ok: boolean;
  model: ModelInfo[];
  errorKey: string;
  detail?: string;
}> {
  const kunci = String(key || "").trim();
  if (!kunci) return { ok: false, model: [], errorKey: "err.ai.geminiBelumAdaKunci" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(kunci)}`, {
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
  } catch {
    return { ok: false, model: [], errorKey: "err.ai.geminiTidakTerhubung" };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const data = await bacaJson(res);
    return { ok: false, model: [], errorKey: errorKeyForStatus(res.status), detail: detailGalat(data) };
  }
  const data = await bacaJson(res);
  if (!data) return { ok: false, model: [], errorKey: "err.ai.geminiJawabanBuruk" };
  const daftar = Array.isArray(data?.models) ? data.models : [];
  return {
    ok: true,
    errorKey: "",
    model: daftar
      .map((m: any) => ({
        nama: String(m?.name || "").replace(/^models\//, ""),
        tampil: String(m?.displayName || m?.name || ""),
      }))
      .filter((m: ModelInfo) => m.nama),
  };
}

/**
 * Memilih model riset dari daftar, tanpa perlu tahu nama model 2026 apa pun.
 *
 * Nama model pensiun berkala (DeepSeek mengalaminya Juli 2026); daripada
 * mematok satu nama yang bisa mati diam-diam, pilih yang mengandung "flash"
 * (varian hemat yang masuk paket gratis), bukan gambar/suara/embedding.
 */
export function pilihModelFlash(daftar: string[]): string | null {
  const list = (Array.isArray(daftar) ? daftar : []).map((n) => String(n || "")).filter(Boolean);
  const flash = list.filter((n) => /flash/i.test(n) && !/image|tts|embed|aqa|robotics/i.test(n));
  if (!flash.length) return null;
  const skor = (n: string) => (/2\.5/i.test(n) ? 0 : /3(\.|$)/i.test(n) ? 1 : 2);
  flash.sort((a, b) => skor(a) - skor(b) || a.localeCompare(b));
  return flash[0];
}

/* ------------------------------------------------------------------ *
 * Riset kendaraan, dua langkah
 * ------------------------------------------------------------------ */

export interface Langkah {
  id: string;
  jenis: "mulai" | "pikir" | "cari" | "buka" | "susun";
  teks: string;
  status: "jalan" | "selesai";
}

export interface RisetOpts {
  apiKey: string;
  model: string;
  effort: "low" | "high" | "max";
  instructions: string;
  input: string;
  schema: any;
  maxOutputTokens?: number;
  userId?: string;
  signal?: AbortSignal;
  onLangkah?: (langkah: Langkah[]) => void;
}

export interface RisetHasil {
  ok: boolean;
  errorKey?: string;
  detail?: string;
  mentah?: string;
  hasil?: any;
  usage?: any;
  langkah: Langkah[];
}

function potong(v: unknown, batas: number): string {
  const s = String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim();
  return s.length > batas ? s.slice(0, batas - 1) + "…" : s;
}

/** Seluruh teks dari kandidat pertama, apa pun jumlah potongannya. */
function teksKandidat(data: any): string {
  const kandidat = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = kandidat?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p: any) => String(p?.text || ""))
    .filter(Boolean)
    .join("");
}

/** `usageMetadata` Gemini → bentuk `usage` yang dipakai `ai-biaya.js`. */
function usageDari(data: any): any {
  const u = data?.usageMetadata;
  if (!u || typeof u !== "object") return null;
  return {
    input_tokens: Number(u.promptTokenCount || 0),
    output_tokens: Number(u.candidatesTokenCount || 0),
    input_tokens_details: { cached_tokens: Number(u.cachedContentTokenCount || 0) },
  };
}

function uraiJson(teks: string): any {
  const bersih = String(teks || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!bersih) return null;
  try {
    return JSON.parse(bersih);
  } catch {
    return null;
  }
}

interface PanggilHasil {
  ok: boolean;
  errorKey: string;
  detail: string;
  teks: string;
  usage: any;
}

/** Satu panggilan generateContent. `alat` kosong berarti tanpa pencarian. */
async function panggil(
  apiKey: string,
  model: string,
  sistem: string,
  pengguna: string,
  alat: any[],
  json: boolean,
  maxOutputTokens: number,
  signal?: AbortSignal
): Promise<PanggilHasil> {
  const kosong: PanggilHasil = { ok: false, errorKey: "", detail: "", teks: "", usage: null };
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sistem }] },
        contents: [{ role: "user", parts: [{ text: pengguna }] }],
        ...(alat.length ? { tools: alat } : {}),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (err: any) {
    kosong.errorKey = err?.name === "AbortError" ? "err.ai.dibatalkan" : "err.ai.geminiTidakTerhubung";
    return kosong;
  }

  const data = await bacaJson(res);
  if (!res.ok || !data) {
    kosong.errorKey = !data ? "err.ai.geminiJawabanBuruk" : errorKeyForStatus(res.status);
    kosong.detail = detailGalat(data);
    return kosong;
  }
  kosong.ok = true;
  kosong.teks = teksKandidat(data);
  kosong.usage = usageDari(data);
  if (!kosong.teks) {
    kosong.ok = false;
    kosong.errorKey = "err.ai.tanpaJawaban";
  }
  return kosong;
}

/** Menjalankan satu riset sampai selesai (tanpa streaming). */
export async function jalankanRiset(opts: RisetOpts): Promise<RisetHasil> {
  const langkah: Langkah[] = [{ id: "mulai", jenis: "mulai", teks: "", status: "selesai" }];
  const lapor = () => {
    if (opts.onLangkah) opts.onLangkah(langkah);
  };

  // Langkah 1: mencari lewat Google, jawabannya teks bebas.
  const cari: Langkah = { id: "cari", jenis: "cari", teks: potong(opts.input, 160), status: "jalan" };
  langkah.push(cari);
  lapor();
  const temuan = await panggil(
    opts.apiKey,
    opts.model,
    opts.instructions,
    `${opts.input}\n\nJawab dengan temuan lengkap dalam kalimat biasa (bukan JSON): angka, sumber, dan keyakinan tiap fakta.`,
    [{ google_search: {} }],
    false,
    32_768,
    opts.signal
  );
  cari.status = "selesai";
  lapor();

  if (!temuan.ok) {
    return { ok: false, errorKey: temuan.errorKey, detail: temuan.detail, usage: temuan.usage, langkah };
  }

  // Langkah 2: menyusun temuan jadi JSON sesuai skema, tanpa mencari lagi.
  const susun: Langkah = { id: "susun", jenis: "susun", teks: "", status: "jalan" };
  langkah.push(susun);
  lapor();
  const rapi = await rapikanJadiJson({
    apiKey: opts.apiKey,
    model: opts.model,
    schema: opts.schema,
    mentah: temuan.teks,
    signal: opts.signal,
  });
  susun.status = "selesai";
  lapor();

  // Dua pemakaian digabung supaya panel menampilkan biaya (nol) yang jujur.
  const usage = gabungUsage(temuan.usage, rapi.usage);
  if (!rapi.ok) {
    return {
      ok: false,
      errorKey: rapi.errorKey,
      detail: "",
      mentah: temuan.teks.trim(),
      usage,
      langkah,
    };
  }
  return { ok: true, hasil: rapi.hasil, usage, langkah };
}

function gabungUsage(a: any, b: any): any {
  if (!a) return b;
  if (!b) return a;
  return {
    input_tokens: Number(a.input_tokens || 0) + Number(b.input_tokens || 0),
    output_tokens: Number(a.output_tokens || 0) + Number(b.output_tokens || 0),
    input_tokens_details: {
      cached_tokens:
        Number(a.input_tokens_details?.cached_tokens || 0) + Number(b.input_tokens_details?.cached_tokens || 0),
    },
  };
}

/**
 * Panggilan kedua: mengubah temuan yang sudah didapat jadi JSON.
 *
 * Pasangan `rapikanJadiJson()` DeepSeek: skema dititipkan di teks perintah,
 * `responseMimeType: "application/json"` meminta bentuknya, dan hasilnya
 * tetap disaring `ai-usulan.js` sesudahnya.
 */
export async function rapikanJadiJson(opts: {
  apiKey: string;
  model?: string;
  schema: any;
  mentah: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; hasil?: any; errorKey?: string; usage?: any }> {
  const perintah = [
    "Ubah catatan riset berikut menjadi satu objek JSON yang sesuai skema di bawah.",
    "JANGAN menambah, menebak, atau mengubah satu pun nilai — salin apa adanya dari catatan.",
    'Nilai yang tidak disebut di catatan diisi null dengan keyakinan "rendah".',
    "Jawab HANYA dengan JSON, tanpa penjelasan dan tanpa pembungkus markdown.",
    "",
    "SKEMA JSON:",
    JSON.stringify(opts.schema),
  ].join("\n");

  const p = await panggil(
    opts.apiKey,
    opts.model || GEMINI_MODEL_BAWAAN,
    perintah,
    String(opts.mentah || ""),
    [],
    true,
    16_000,
    opts.signal
  );
  if (!p.ok) return { ok: false, errorKey: p.errorKey, usage: p.usage };
  const hasil = uraiJson(p.teks);
  if (!hasil) return { ok: false, errorKey: "err.ai.geminiJawabanBuruk", usage: p.usage };
  return { ok: true, hasil, usage: p.usage };
}

/* ------------------------------------------------------------------ *
 * Penerjemahan massal (situs publik berbahasa Inggris dan Mandarin)
 *
 * Batas tanggung jawabnya sama persis dengan DeepSeek: larik sepanjang dan
 * seurutan masukannya, atau melempar `GalatTerjemahan`. Pemanggil
 * (`terjemahan.js`) tidak tahu penyedia mana yang dipakai.
 * ------------------------------------------------------------------ */

export class GalatTerjemahan extends Error {
  errorKey: string;

  constructor(errorKey: string, pesan?: string) {
    super(pesan || errorKey);
    this.name = "GalatTerjemahan";
    this.errorKey = errorKey;
  }
}

export interface BahasaTerjemahan {
  dari: string;
  ke: string;
}

export interface OpsiTerjemah {
  apiKey?: string;
}

const TERJEMAH_TIMEOUT_MS = 90_000;

function ambilLarikTerjemahan(hasil: any, panjang: number): string[] | null {
  const kandidat: any[] = [hasil];
  if (hasil && typeof hasil === "object" && !Array.isArray(hasil)) {
    kandidat.push(...Object.values(hasil));
  }
  for (const k of kandidat) {
    if (Array.isArray(k) && k.length === panjang && k.every((x) => typeof x === "string")) {
      return k as string[];
    }
  }
  return null;
}

export async function terjemahkanBerteks(
  teks: string[],
  bahasa: BahasaTerjemahan,
  opsi: OpsiTerjemah = {}
): Promise<string[]> {
  if (!Array.isArray(teks)) {
    throw new GalatTerjemahan("err.ai.geminiJawabanBuruk", "Bukan larik teks.");
  }
  if (!teks.length) return [];
  for (const t of teks) {
    if (typeof t !== "string") {
      throw new GalatTerjemahan("err.ai.geminiJawabanBuruk", "Ada elemen yang bukan teks.");
    }
  }

  const kunci = String(opsi.apiKey ?? getEnv("GEMINI_API_KEY", "")).trim();
  if (!kunci) {
    throw new GalatTerjemahan("err.ai.geminiBelumAdaKunci", "Kunci API Gemini belum dipasang.");
  }

  const dari = String(bahasa?.dari || "id");
  const ke = String(bahasa?.ke || "en");

  const NAMA_BAHASA: Record<string, string> = { id: "Indonesia", en: "Inggris", zh: "Mandarin" };
  const namaDari = NAMA_BAHASA[dari] || dari;
  const namaKe = NAMA_BAHASA[ke] || ke;
  const gaya =
    ke === "zh"
      ? "用自然、地道的简体中文书写，不要逐字翻译。"
      : ke === "en"
        ? "Tulis Bahasa Inggris yang alami, bukan terjemahan kata per kata."
        : "Tulis Bahasa Indonesia yang alami, bukan terjemahan kata per kata.";

  const perintah = [
    `Anda menerjemahkan teks dari Bahasa ${namaDari} ke Bahasa ${namaKe} untuk sebuah situs web.`,
    "Pesan pengguna adalah larik JSON berisi string. Terjemahkan SETIAP elemennya.",
    'Jawab HANYA dengan satu objek JSON berbentuk {"terjemahan": [...]} — tanpa penjelasan, tanpa komentar, dan tanpa pembungkus markdown.',
    `Larik "terjemahan" harus berisi tepat ${teks.length} string, urutannya sama persis dengan larik masukan.`,
    "Aturan tiap elemen:",
    "- Token placeholder dalam kurung kurawal — misalnya {brand}, {tahun}, {count} — ditulis persis seperti aslinya, termasuk kurungnya.",
    "- Struktur Markdown dipertahankan: judul, daftar, kutipan, dan penekanan tetap ada. Pada tautan [teks](/alamat) hanya teks yang diterjemahkan; alamatnya tidak diubah.",
    "- Angka, satuan, singkatan teknis, nama merek, nama model, serta nama orang dan tempat ditulis apa adanya.",
    "- Jangan menambah, menghapus, menggabung, atau membelah elemen.",
    `- ${gaya}`,
  ].join("\n");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TERJEMAH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `${BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL_BAWAAN)}:generateContent?key=${encodeURIComponent(kunci)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: perintah }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(teks) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: Math.min(16_000, 4_000 + teks.reduce((n, t) => n + t.length, 0)),
            responseMimeType: "application/json",
          },
        }),
      }
    );
  } catch {
    throw new GalatTerjemahan("err.ai.geminiTidakTerhubung");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new GalatTerjemahan(errorKeyForStatus(res.status));
  const data = await bacaJson(res);
  const larik = ambilLarikTerjemahan(data ? uraiJson(teksKandidat(data)) : null, teks.length);
  if (!larik) {
    throw new GalatTerjemahan("err.ai.geminiJawabanBuruk", "Jawaban model bukan larik terjemahan.");
  }

  for (let i = 0; i < teks.length; i++) {
    if (typeof larik[i] !== "string") {
      throw new GalatTerjemahan("err.ai.geminiJawabanBuruk", "Ada elemen jawaban yang bukan teks.");
    }
    if (teks[i].length > 0 && larik[i].trim() === "") {
      throw new GalatTerjemahan("err.ai.geminiJawabanBuruk", "Ada terjemahan yang kosong.");
    }
  }

  return larik;
}
