import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getEnv } from "./env";
import { jalankanRiset, rapikanJadiJson, type Langkah } from "./deepseek";
import { buildInstructions, buildSchema, emptyFieldKeys, PRICE_FIELDS } from "./ai-prompt.js";
import { bersihkanUsulan } from "./ai-usulan.js";
import { biayaDari, MODEL_BAWAAN, MODEL_PILIHAN } from "./ai-biaya.js";
import { kindOfCollection } from "./vehicle-spec.js";

/**
 * Registri riset AI yang sedang berjalan.
 *
 * Job hidup DI MEMORI, bukan di berkas. Aplikasi ini satu proses di balik PM2
 * (`instances: 1`, `exec_mode: "fork"`), jadi peta di memori sudah cukup —
 * alasan yang sama dengan `ratelimit.ts`, dan ditulis di sana.
 *
 * Konsekuensinya: job yang sedang jalan hilang kalau PM2 memuat ulang. Itu
 * bisa diterima — satu job berumur di bawah dua menit, dan panel menampilkan
 * "riset terputus" alih-alih menunggu selamanya. Yang TIDAK boleh hilang
 * adalah hasil yang sudah jadi; itu diarsipkan ke berkas.
 *
 * Job juga sengaja TERLEPAS dari permintaan HTTP yang memulainya. Menutup tab
 * di tengah riset tidak membatalkan apa pun, dan panel yang dibuka lagi
 * menemukan job yang sama masih berjalan.
 */

const DATA_DIR = () => path.resolve(process.cwd(), "data");
const ARSIP_DIR = () => path.join(DATA_DIR(), "ai-jobs");

/** Berapa hasil riset terakhir yang disimpan sebagai jejak audit. */
const ARSIP_MAKS = 50;

/** Batas keras satu riset. Di atas ini pasti ada yang salah. */
const BATAS_MS = 5 * 60 * 1000;

/** Berapa lama job yang sudah selesai tetap bisa dibaca dari memori. */
const SIMPAN_MS = 30 * 60 * 1000;

/** Berapa riset per akun per hari. */
export const KUOTA_HARIAN = 30;

export type Mode = "lengkap" | "lengkapi" | "harga";

export interface Job {
  id: string;
  userId: string;
  userName: string;
  col: string;
  vehicleId: string | null;
  judul: string;
  mode: Mode;
  model: string;
  status: "jalan" | "selesai" | "gagal" | "batal";
  mulaiPada: number;
  selesaiPada: number;
  langkah: Langkah[];
  hasil: { ringkasan: string; peringatan: string[]; usulan: any[] } | null;
  usage: any;
  biaya: { usd: number; rupiah: number } | null;
  errorKey: string;
  /** Pesan asli dari DeepSeek saat gagal. Kosong kalau tidak ada. */
  detail: string;
  /** Hasilnya perlu dirapikan panggilan kedua. Lihat `rapikanJadiJson`. */
  duaLangkah: boolean;
  ac: AbortController;
}

const jobs = new Map<string, Job>();

/** Hitungan pemakaian harian: `"<userId>:<tanggal WIB>"` → jumlah. */
const pemakaian = new Map<string, number>();

/**
 * Tanggal menurut WIB, bukan UTC.
 *
 * Kuota harian yang direset pukul 07.00 pagi waktu Indonesia — yang terjadi
 * kalau tengah malam dihitung dalam UTC — adalah kuota yang habis di tengah
 * hari kerja tanpa alasan yang bisa dijelaskan ke siapa pun.
 */
/**
 * Model bawaan panel, dari `.env`.
 *
 * Disimpan di `.env` dan bukan di `content.json` karena ia menempel pada
 * pemasangan, bukan pada isi situs — sama seperti kuncinya. Nilai yang tidak
 * dikenali jatuh ke bawaan, bukan diteruskan ke DeepSeek: satu salah ketik di
 * berkas konfigurasi tidak boleh membuat setiap riset gagal.
 */
export function modelBawaan(): string {
  const dari = getEnv("DEEPSEEK_MODEL", "");
  return MODEL_PILIHAN.includes(dari) ? dari : MODEL_BAWAAN;
}

/** Apakah riset sudah bisa dijalankan sama sekali? */
export function siapRiset(): boolean {
  return !!getEnv("DEEPSEEK_API_KEY", "");
}

export function tanggalWib(now = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function pemakaianHariIni(userId: string, now = new Date()): number {
  return pemakaian.get(`${userId}:${tanggalWib(now)}`) || 0;
}

function catatPemakaian(userId: string, now = new Date()): void {
  const kunci = `${userId}:${tanggalWib(now)}`;
  pemakaian.set(kunci, (pemakaian.get(kunci) || 0) + 1);

  // Hitungan hari-hari lama tidak pernah dibaca lagi. Membiarkannya berarti
  // peta yang tumbuh selama proses hidup.
  const hariIni = tanggalWib(now);
  for (const k of pemakaian.keys()) {
    if (!k.endsWith(`:${hariIni}`)) pemakaian.delete(k);
  }
}

/**
 * Mengembalikan satu jatah kuota.
 *
 * Dipakai untuk riset yang berakhir TANPA memakai satu token pun: kunci yang
 * ditolak, DeepSeek yang sedang tumbang, jaringan yang putus. Tidak ada uang
 * yang keluar, jadi tidak ada jatah yang pantas hilang — dan kuota yang terkuras
 * oleh gangguan di pihak lain adalah kuota yang membuat orang berhenti memakai
 * fiturnya.
 *
 * Riset yang DIBATALKAN di tengah jalan sengaja TIDAK dikembalikan kalau
 * sempat memakai token: pencarian yang sudah berjalan tetap ditagih DeepSeek,
 * dan tanpa aturan itu membatalkan berulang kali jadi cara memakai fitur ini
 * tanpa batas.
 */
function kembalikanPemakaian(userId: string, now = new Date()): void {
  const kunci = `${userId}:${tanggalWib(now)}`;
  const ada = pemakaian.get(kunci) || 0;
  if (ada > 0) pemakaian.set(kunci, ada - 1);
}

/** Membuang job lama dari memori. Dipanggil tiap kali ada job baru. */
function bersihkan(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === "jalan") continue;
    if (now - job.selesaiPada > SIMPAN_MS) jobs.delete(id);
  }
}

export function jobMilik(id: string, userId: string): Job | null {
  const job = jobs.get(id);
  if (!job) return null;
  // Job satu orang tidak bisa dibaca atau dibatalkan orang lain — linimasanya
  // memuat isi halaman yang dibuka, dan pembatalannya membuang pekerjaan.
  return job.userId === userId ? job : null;
}

export function jobBerjalan(userId: string): Job | null {
  for (const job of jobs.values()) {
    if (job.userId === userId && job.status === "jalan") return job;
  }
  return null;
}

/** Bentuk job yang dikirim ke panel. `ac` tidak pernah ikut. */
export function jobPublik(job: Job) {
  return {
    id: job.id,
    col: job.col,
    vehicleId: job.vehicleId,
    judul: job.judul,
    mode: job.mode,
    model: job.model,
    status: job.status,
    mulaiPada: job.mulaiPada,
    langkah: job.langkah,
    hasil: job.hasil,
    biaya: job.biaya,
    errorKey: job.errorKey,
    detail: job.detail,
    duaLangkah: job.duaLangkah,
  };
}

function arsipkan(job: Job): void {
  try {
    fs.mkdirSync(ARSIP_DIR(), { recursive: true });
    fs.writeFileSync(
      path.join(ARSIP_DIR(), `${job.id}.json`),
      JSON.stringify(
        {
          ...jobPublik(job),
          userId: job.userId,
          userName: job.userName,
          selesaiPada: job.selesaiPada,
          usage: job.usage,
        },
        null,
        2
      ),
      "utf8"
    );

    const berkas = fs
      .readdirSync(ARSIP_DIR())
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const f of berkas.slice(0, Math.max(0, berkas.length - ARSIP_MAKS))) {
      fs.rmSync(path.join(ARSIP_DIR(), f), { force: true });
    }
  } catch {
    // Arsip bersifat best-effort — kegagalannya tidak boleh menggagalkan riset
    // yang sudah selesai dengan baik.
  }
}

export interface MulaiOpts {
  me: { id: string; name?: string; username: string };
  col: string;
  vehicleId: string | null;
  vehicle: any;
  mode: Mode;
  model: string;
  hint?: string;
}

/** Sama seperti `BalanceResult`: satu bentuk, bukan gabungan. Lihat catatan di deepseek.ts. */
export interface MulaiHasil {
  ok: boolean;
  job: Job | null;
  errorKey: string;
  vars?: Record<string, string | number>;
}

function gagalMulai(errorKey: string, vars?: Record<string, string | number>): MulaiHasil {
  return { ok: false, job: null, errorKey, vars };
}

export function mulaiRiset(opts: MulaiOpts): MulaiHasil {
  const apiKey = getEnv("DEEPSEEK_API_KEY", "");
  if (!apiKey) return gagalMulai("err.ai.belumAdaKunci");

  const { me, col, vehicle, mode } = opts;
  const brand = String(vehicle?.brand || "").trim();
  const name = String(vehicle?.name || "").trim();
  if (!brand || !name) return gagalMulai("err.ai.perluMerekNama");

  if (jobBerjalan(me.id)) return gagalMulai("err.ai.sedangJalan");

  const terpakai = pemakaianHariIni(me.id);
  if (terpakai >= KUOTA_HARIAN) {
    return gagalMulai("err.ai.kuotaHabis", { n: KUOTA_HARIAN });
  }

  const model = MODEL_PILIHAN.includes(opts.model) ? opts.model : modelBawaan();
  const kind = kindOfCollection(col);

  let only: string[] | undefined;
  if (mode === "harga") only = PRICE_FIELDS;
  else if (mode === "lengkapi") {
    only = emptyFieldKeys(kind, vehicle);
    if (!only.length) return gagalMulai("err.ai.tidakAdaYangKosong");
  }

  const schema = buildSchema(kind, only);
  const instructions = buildInstructions({
    kind,
    brand,
    name,
    hint: opts.hint,
    only,
    today: new Date().toISOString().slice(0, 10),
  });

  const job: Job = {
    id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    userId: me.id,
    userName: me.name || me.username,
    col,
    vehicleId: opts.vehicleId,
    judul: `${brand} ${name}`,
    mode,
    model,
    status: "jalan",
    mulaiPada: Date.now(),
    selesaiPada: 0,
    langkah: [],
    hasil: null,
    usage: null,
    biaya: null,
    errorKey: "",
    detail: "",
    duaLangkah: false,
    ac: new AbortController(),
  };

  bersihkan();
  jobs.set(job.id, job);
  catatPemakaian(me.id);

  const batas = setTimeout(() => job.ac.abort(), BATAS_MS);

  // TIDAK di-await. Permintaan HTTP yang memulai riset menjawab seketika
  // dengan id job-nya; panel menanyakan kemajuannya lewat permintaan
  // berikutnya. Lihat catatan tentang polling di RENCANA-AI-DEEPSEEK.md.
  jalankanRiset({
    apiKey,
    model,
    effort: mode === "harga" ? "low" : "high",
    // Cek harga hanya mengisi tiga field dan berpikir seperlunya; riset penuh
    // butuh ruang untuk penalaran sepanjang sepuluh putaran pencarian.
    maxOutputTokens: mode === "harga" ? 8_000 : 64_000,
    instructions,
    input: `Riset ${brand} ${name}. Jawab hanya dengan JSON sesuai skema.`,
    schema,
    userId: me.id,
    signal: job.ac.signal,
    onLangkah: (langkah) => {
      job.langkah = langkah;
    },
  })
    .then(async (res) => {
      job.langkah = res.langkah;
      job.usage = res.usage || null;
      if (res.usage) job.biaya = biayaDari(res.usage, model, new Date());

      /*
       * Model menjawab, tapi bukan JSON — dan jawabannya memuat temuan yang
       * sudah dibayar sepuluh putaran pencarian. Jangan dibuang: kirim ke
       * panggilan kedua yang murah untuk dirapikan bentuknya.
       */
      if (!res.ok && res.errorKey === "err.ai.jawabanTidakTerbaca" && res.mentah) {
        const rapi = await rapikanJadiJson({
          apiKey,
          schema,
          mentah: res.mentah,
          signal: job.ac.signal,
        });
        if (rapi.ok) {
          job.duaLangkah = true;
          if (rapi.usage) {
            job.biaya = {
              usd: (job.biaya?.usd || 0) + biayaDari(rapi.usage, "deepseek-v4-flash", new Date()).usd,
              rupiah:
                (job.biaya?.rupiah || 0) +
                biayaDari(rapi.usage, "deepseek-v4-flash", new Date()).rupiah,
            };
          }
          job.status = "selesai";
          job.hasil = bersihkanUsulan(rapi.hasil, { kind, vehicle, only });
          return;
        }
      }

      if (!res.ok) {
        job.status = res.errorKey === "err.ai.dibatalkan" ? "batal" : "gagal";
        job.errorKey = res.errorKey || "err.ai.deepseekBermasalah";
        job.detail = res.detail || "";
        // Nol token terpakai berarti nol biaya. Lihat `kembalikanPemakaian`.
        if (!res.usage) kembalikanPemakaian(job.userId);
      } else {
        job.status = "selesai";
        job.hasil = bersihkanUsulan(res.hasil, { kind, vehicle, only });
      }
    })
    .catch(() => {
      job.status = "gagal";
      job.errorKey = "err.ai.deepseekBermasalah";
      kembalikanPemakaian(job.userId);
    })
    .finally(() => {
      clearTimeout(batas);
      job.selesaiPada = Date.now();
      /*
       * Job yang GAGAL ikut diarsipkan, bukan hanya yang berhasil.
       *
       * Versi pertama hanya menyimpan yang berhasil — dan itu justru membuang
       * satu-satunya jejak dari kejadian yang paling perlu ditelusuri. Riset
       * yang gagal hidup di memori tiga puluh menit lalu hilang bersama
       * alasannya.
       */
      if (job.status !== "batal") arsipkan(job);
    });

  return { ok: true, job, errorKey: "" };
}

export function batalkanRiset(id: string, userId: string): boolean {
  const job = jobMilik(id, userId);
  if (!job || job.status !== "jalan") return false;
  job.ac.abort();
  return true;
}
