/**
 * Klien DeepSeek.
 *
 * Ini SATU-SATUNYA berkas yang tahu bentuk API DeepSeek. Sisa panel bicara
 * dengan tipe yang didefinisikan di sini, jadi kalau suatu hari penyedianya
 * berganti — atau DeepSeek mengganti nama modelnya lagi, yang sudah terjadi
 * sekali pada Juli 2026 — hanya berkas ini yang perlu disentuh.
 *
 * Isinya untuk sekarang baru satu hal: memeriksa apakah sebuah kunci API
 * benar-benar sah, dan berapa saldonya. Itu yang dibutuhkan halaman Pengaturan
 * AI, dan urutannya penting — kunci yang salah ketik harus gagal pada detik ia
 * disimpan, bukan berhari-hari kemudian di tengah pekerjaan orang lain.
 *
 * Kuncinya tidak pernah ditulis ke log mana pun di berkas ini. Kalau ada
 * `console.log` baru ditambahkan di sini suatu hari, periksa dua kali apa yang
 * ikut tercetak.
 */

import { createSseParser, jsonData } from "./sse.js";

const BASE_URL = "https://api.deepseek.com";

/**
 * Batas tunggu satu permintaan. Sengaja pendek: satu-satunya panggilan di
 * berkas ini adalah pembacaan saldo, yang tidak melakukan inferensi apa pun,
 * jadi jawaban yang lambat berarti ada yang salah — bukan model yang berpikir.
 */
const TIMEOUT_MS = 15_000;

/**
 * Bentuk kunci DeepSeek: awalan `sk-` diikuti huruf, angka, garis bawah, atau
 * strip. Pemeriksaan ini TIDAK menggantikan uji ke server; ia hanya menolak
 * salah tempel yang sudah jelas — spasi yang ikut tersalin, kunci milik
 * penyedia lain — tanpa perlu menunggu jaringan lebih dulu.
 */
const KEY_RE = /^sk-[A-Za-z0-9_-]{16,120}$/;

export function keyLooksValid(key: string): boolean {
  return KEY_RE.test(String(key || "").trim());
}

/**
 * Empat karakter terakhir kunci, untuk ditampilkan di panel.
 *
 * Tidak pernah lebih dari empat, dan tidak pernah dari depan: yang dibutuhkan
 * pembaca hanya "apakah ini kunci yang saya kira", dan empat karakter sudah
 * menjawabnya. Awalan `sk-` sama di semua kunci, jadi menampilkannya tidak
 * memberi tahu apa pun sambil membocorkan lebih banyak.
 */
export function keyTail(key: string): string {
  const s = String(key || "").trim();
  return s.length >= 4 ? s.slice(-4) : "";
}

export interface BalanceInfo {
  /** "CNY" atau "USD". */
  currency: string;
  total: string;
  granted: string;
  toppedUp: string;
}

/**
 * Hasil pembacaan saldo.
 *
 * Ditulis sebagai satu bentuk dengan seluruh field selalu ada, bukan sebagai
 * gabungan dua bentuk. `tsconfig` proyek ini memakai setelan bawaan Astro yang
 * tidak ketat, dan di sana penyempitan tipe lewat pembeda boolean tidak
 * bekerja — jadi bentuk gabungan hanya menghasilkan galat yang menyesatkan di
 * setiap pemakainya.
 */
export interface BalanceResult {
  ok: boolean;
  /** Apakah saldonya cukup untuk memanggil API. Berarti kalau `ok`. */
  available: boolean;
  balances: BalanceInfo[];
  /** Kunci terjemahan penyebab gagal. Kosong kalau `ok`. */
  errorKey: string;
}

function gagalSaldo(errorKey: string): BalanceResult {
  return { ok: false, available: false, balances: [], errorKey };
}

/**
 * Kode HTTP DeepSeek → kunci terjemahan panel.
 *
 * Dikembalikan sebagai KUNCI, bukan kalimat: panel bisa berbahasa Indonesia,
 * Inggris, atau Mandarin, dan berkas ini tidak tahu yang mana. Pola yang sama
 * dipakai seluruh endpoint panel (lihat `src/lib/api.ts`).
 *
 * Daftar kodenya dari api-docs.deepseek.com/quick_start/error_codes.
 */
export function errorKeyForStatus(status: number): string {
  if (status === 401) return "err.ai.kunciSalah";
  if (status === 402) return "err.ai.saldoHabis";
  if (status === 429) return "err.ai.sibuk";
  if (status >= 500) return "err.ai.deepseekBermasalah";
  return "err.ai.ditolak";
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Membaca saldo akun DeepSeek — sekaligus cara termurah membuktikan sebuah
 * kunci sah. Endpoint ini tidak menjalankan model, jadi memanggilnya tidak
 * memotong saldo sepeser pun.
 */
export async function fetchBalance(key: string): Promise<BalanceResult> {
  const trimmed = String(key || "").trim();
  if (!trimmed) return gagalSaldo("err.ai.belumAdaKunci");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/user/balance`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${trimmed}` },
      signal: ac.signal,
    });
  } catch {
    // Jaringan mati, DNS gagal, atau batas waktu tercapai. Ketiganya berarti
    // hal yang sama bagi pembaca panel: kita tidak berhasil menghubunginya.
    return gagalSaldo("err.ai.tidakTerhubung");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return gagalSaldo(errorKeyForStatus(res.status));

  /*
   * Dibaca sebagai teks lalu di-parse sendiri, bukan lewat `res.json()`.
   * DeepSeek memakai mekanisme keep-alive yang menyisipkan baris kosong ke
   * dalam jawaban selama server masih menyiapkan balasannya, dan badan yang
   * benar-benar kosong bukan hal mustahil. Keduanya harus jadi galat yang
   * bisa dibaca orang, bukan pengecualian mentah dari parser.
   */
  let data: any;
  try {
    const raw = (await res.text()).trim();
    if (!raw) return gagalSaldo("err.ai.jawabanTidakTerbaca");
    data = JSON.parse(raw);
  } catch {
    return gagalSaldo("err.ai.jawabanTidakTerbaca");
  }

  const list = Array.isArray(data?.balance_infos) ? data.balance_infos : [];
  return {
    ok: true,
    errorKey: "",
    available: !!data?.is_available,
    balances: list.map((b: any) => ({
      currency: str(b?.currency) || "USD",
      total: str(b?.total_balance),
      granted: str(b?.granted_balance),
      toppedUp: str(b?.topped_up_balance),
    })),
  };
}

/* ==========================================================================
 * Riset kendaraan lewat Responses API
 *
 * Bagian ini yang benar-benar menjalankan risetnya. Tiga hal dari
 * dokumentasi DeepSeek yang membentuknya, dan ketiganya tidak umum:
 *
 *   1. `tools: [{ type: "web_search" }]` dijalankan DI SERVER DEEPSEEK, sampai
 *      sepuluh putaran otomatis. Kita tidak punya infrastruktur pencarian
 *      sendiri dan memang tidak membutuhkannya.
 *   2. `text.format` bertipe `json_schema` mengikat bentuk jawabannya, jadi
 *      field yang tidak ada di skema tidak punya tempat untuk ditulis.
 *   3. Alirannya memakai peristiwa BERNAMA, bukan potongan teks anonim.
 *      Itulah yang membuat panel bisa menampilkan apa yang sedang dicari,
 *      bukan sekadar lingkaran berputar.
 * ========================================================================== */


/** Satu baris di linimasa yang dibaca penyunting. */
export interface Langkah {
  id: string;
  jenis: "mulai" | "pikir" | "cari" | "buka" | "susun";
  teks: string;
  status: "jalan" | "selesai";
}

/** Sepanjang apa kutipan pemikiran yang ditampilkan. Bukan transkrip. */
const MAX_PIKIR = 400;
/** Sepanjang apa teks pencarian dan alamat halaman yang ditampilkan. */
const MAX_LANGKAH = 160;

function potong(v: unknown, batas: number): string {
  const s = String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim();
  return s.length > batas ? s.slice(0, batas - 1) + "…" : s;
}

/**
 * Menerjemahkan peristiwa DeepSeek jadi linimasa.
 *
 * Terpisah dari pemanggilan jaringan dengan sengaja: seluruh logika di sini
 * bisa diuji dengan aliran peristiwa buatan, tanpa kunci API dan tanpa
 * menunggu satu menit tiap kali.
 *
 * CATATAN KEAMANAN: `teks` di tiap langkah berasal dari model dan dari halaman
 * web yang ia buka — keduanya konten tak tepercaya. Ia hanya pernah
 * ditampilkan sebagai TEKS (lewat `esc()` di panel), tidak pernah jadi tautan
 * yang bisa diklik, dan panjangnya selalu dipotong di sini.
 */
export class PembacaRiset {
  langkah: Langkah[] = [];
  hasil: any = null;
  usage: any = null;
  errorKey = "";
  selesai = false;

  /** Jawaban mentah yang gagal diurai. Satu-satunya bahan untuk menelusurinya. */
  mentah = "";
  /** Nama peristiwa yang pernah datang, untuk kasus "tidak ada jawaban sama sekali". */
  jejak: string[] = [];

  private teksAkhir = "";
  private urut = 0;

  private cari(id: string): Langkah | undefined {
    return this.langkah.find((l) => l.id === id);
  }

  private tambah(id: string, jenis: Langkah["jenis"], teks: string): Langkah {
    const ada = this.cari(id);
    if (ada) return ada;
    const baru: Langkah = { id: id || `l${++this.urut}`, jenis, teks, status: "jalan" };
    this.langkah.push(baru);
    return baru;
  }

  /** Deskripsi satu aksi pencarian, dari objek `action` milik web_search_call. */
  private static deskripsiAksi(action: any): { jenis: Langkah["jenis"]; teks: string } {
    const tipe = String(action?.type || "");
    if (tipe === "open_page") return { jenis: "buka", teks: potong(action?.url, MAX_LANGKAH) };
    if (tipe === "find_in_page") {
      return { jenis: "buka", teks: potong(action?.pattern || action?.url, MAX_LANGKAH) };
    }
    return { jenis: "cari", teks: potong(action?.query, MAX_LANGKAH) };
  }

  terima(nama: string, data: any): void {
    if (!this.jejak.includes(nama)) this.jejak.push(nama);
    switch (nama) {
      case "response.created":
        this.tambah("mulai", "mulai", "").status = "selesai";
        break;

      case "response.output_item.added": {
        const item = data?.item;
        const id = String(item?.id || "");
        if (item?.type === "web_search_call") this.tambah(id, "cari", "");
        else if (item?.type === "reasoning") this.tambah(id, "pikir", "");
        else if (item?.type === "message") this.tambah(id, "susun", "");
        break;
      }

      case "response.reasoning_text.delta": {
        const l = this.tambah(String(data?.item_id || "pikir"), "pikir", "");
        // Kutipan pemikiran hanya tampil sepotong. Yang menarik bagi pembaca
        // adalah apa yang sedang dipikirkan SEKARANG, bukan seluruh riwayatnya.
        l.teks = potong(l.teks + String(data?.delta || ""), MAX_PIKIR);
        break;
      }

      case "response.reasoning_text.done": {
        const l = this.cari(String(data?.item_id || "pikir"));
        if (l) l.status = "selesai";
        break;
      }

      case "response.web_search_call.in_progress":
      case "response.web_search_call.searching": {
        const l = this.tambah(String(data?.item_id || ""), "cari", "");
        l.status = "jalan";
        break;
      }

      case "response.web_search_call.completed": {
        const l = this.cari(String(data?.item_id || ""));
        if (l) l.status = "selesai";
        break;
      }

      case "response.output_item.done": {
        const item = data?.item;
        const l = this.cari(String(item?.id || ""));
        if (!l) break;
        l.status = "selesai";
        if (item?.type === "web_search_call" && item?.action) {
          const { jenis, teks } = PembacaRiset.deskripsiAksi(item.action);
          l.jenis = jenis;
          if (teks) l.teks = teks;
        }
        break;
      }

      case "response.output_text.delta": {
        const l = this.tambah(String(data?.item_id || "susun"), "susun", "");
        l.status = "jalan";
        this.teksAkhir += String(data?.delta || "");
        break;
      }

      case "response.output_text.done": {
        // Sebagian aliran mengirim teks akhirnya sekaligus di sini, bukan
        // sepotong-sepotong lewat delta. Yang lebih panjang yang dipakai.
        const penuh = String(data?.text || "");
        if (penuh.length > this.teksAkhir.length) this.teksAkhir = penuh;
        break;
      }

      case "response.completed": {
        this.selesai = true;
        for (const l of this.langkah) l.status = "selesai";
        this.usage = data?.response?.usage || null;
        const teks = this.teksAkhir || teksPesan(data?.response);
        this.hasil = uraiJson(teks);
        if (!this.hasil) {
          this.mentah = String(teks || "").trim();
          /*
           * Dua kegagalan yang sangat berbeda, dan dulu keduanya dilaporkan
           * dengan kalimat yang sama:
           *
           *   - Model MENJAWAB, tapi bukan JSON. Isinya biasanya temuan riset
           *     dalam kalimat biasa — sayang sekali dibuang, dan bisa
           *     dirapikan panggilan kedua yang murah.
           *   - Model tidak menjawab apa-apa. Tidak ada yang bisa diselamatkan.
           */
          this.errorKey = this.mentah ? "err.ai.jawabanTidakTerbaca" : "err.ai.tanpaJawaban";
        }
        break;
      }

      case "response.incomplete": {
        this.selesai = true;
        this.usage = data?.response?.usage || null;

        /*
         * Jawaban yang terpotong tidak diterima apa adanya — sebagiannya bisa
         * saja terbaca sebagai JSON yang sah dan tetap kehilangan separuh
         * field, dan itu lebih berbahaya daripada gagal.
         *
         * Tapi ia juga tidak DIBUANG. Riset yang berhenti di sini sudah membuka
         * belasan halaman dan menemukan angka-angkanya; yang habis hanya jatah
         * token untuk menuliskannya. Teks yang sempat keluar diserahkan ke
         * panggilan perapian, yang menyusunnya jadi bentuk yang benar tanpa
         * mencari apa pun lagi.
         */
        const potongan = this.teksAkhir || teksPesan(data?.response);
        this.mentah = String(potongan || "").trim();
        this.errorKey =
          data?.response?.incomplete_details?.reason === "content_filter"
            ? "err.ai.ditolak"
            : "err.ai.jawabanTerpotong";
        break;
      }

      case "response.failed":
        this.selesai = true;
        this.errorKey = "err.ai.deepseekBermasalah";
        break;
    }
  }
}

/** Teks jawaban akhir dari objek `response` yang lengkap. */
function teksPesan(response: any): string {
  const output = Array.isArray(response?.output) ? response.output : [];
  const pesan = output.filter((o: any) => o?.type === "message");
  return pesan
    .flatMap((p: any) => (Array.isArray(p?.content) ? p.content : []))
    .filter((c: any) => c?.type === "output_text")
    .map((c: any) => String(c?.text || ""))
    .join("");
}

/**
 * `text.format` bertipe `json_schema` seharusnya membuat pembungkus markdown
 * tidak mungkin muncul. "Seharusnya" bukan jaminan, dan membuang tiga tanda
 * petik jauh lebih murah daripada satu riset yang gagal di ujung.
 */
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

export interface RisetOpts {
  apiKey: string;
  model: string;
  effort: "low" | "high" | "max";
  instructions: string;
  input: string;
  schema: any;
  maxOutputTokens?: number;
  /** Id pengguna panel — untuk isolasi KVCache. BUKAN nama atau email. */
  userId?: string;
  signal?: AbortSignal;
  /** Dipanggil tiap kali linimasa berubah, supaya panel bisa ikut bergerak. */
  onLangkah?: (langkah: Langkah[]) => void;
}

export interface RisetHasil {
  ok: boolean;
  errorKey?: string;
  /**
   * Pesan galat apa adanya dari DeepSeek.
   *
   * `errorKey` menerjemahkan kode HTTP jadi kalimat yang bisa dibaca siapa pun,
   * tapi untuk 400 kalimat itu selalu sama — "DeepSeek menolak permintaan ini"
   * — sementara badan jawabannya menyebut PERSIS apa yang ditolak. Membuangnya
   * berarti setiap penolakan terlihat identik dan tidak satu pun bisa
   * ditindaklanjuti.
   */
  detail?: string;
  /** Jawaban akhir apa adanya, saat ia gagal diurai jadi JSON. */
  mentah?: string;
  hasil?: any;
  usage?: any;
  langkah: Langkah[];
}

/** Mengambil kalimat galat dari badan jawaban, kalau ada. */
async function bacaDetailGalat(res: Response): Promise<string> {
  try {
    const raw = (await res.text()).trim();
    if (!raw) return "";
    try {
      const data = JSON.parse(raw);
      const pesan = data?.error?.message || data?.message || "";
      return String(pesan || raw).slice(0, 400);
    } catch {
      return raw.slice(0, 400);
    }
  } catch {
    return "";
  }
}

/** Menjalankan satu riset sampai selesai. */
export async function jalankanRiset(opts: RisetOpts): Promise<RisetHasil> {
  const pembaca = new PembacaRiset();
  const lapor = () => {
    if (opts.onLangkah) opts.onLangkah(pembaca.langkah);
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.effort },
        tools: [{ type: "web_search" }],
        text: { format: { type: "json_schema", name: "usulan_kendaraan", schema: opts.schema } },
        /*
         * Batas ini mencakup token PENALARAN, bukan hanya jawaban yang
         * terlihat — dan itu yang membuat angka 16.000 di versi pertama terlalu
         * kecil. Dengan effort "high" dan sepuluh putaran pencarian, penalaran
         * sendiri bisa menghabiskan seluruh jatahnya, lalu jawabannya terpotong
         * di tengah JSON dan seluruh riset terbuang. Batas yang longgar tidak
         * menambah biaya: yang ditagih adalah token yang benar-benar dibuat.
         */
        max_output_tokens: opts.maxOutputTokens || 64_000,
        stream: true,
        ...(opts.userId ? { user: opts.userId } : {}),
      }),
    });
  } catch (err: any) {
    const dibatalkan = err?.name === "AbortError";
    return {
      ok: false,
      errorKey: dibatalkan ? "err.ai.dibatalkan" : "err.ai.tidakTerhubung",
      langkah: pembaca.langkah,
    };
  }

  if (!res.ok || !res.body) {
    return {
      ok: false,
      errorKey: errorKeyForStatus(res.status),
      detail: await bacaDetailGalat(res),
      langkah: pembaca.langkah,
    };
  }

  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const peristiwa = parser.feed(decoder.decode(value, { stream: true }));
      if (!peristiwa.length) continue;
      for (const p of peristiwa) pembaca.terima(p.event, jsonData(p));
      lapor();
      if (pembaca.selesai) break;
    }
    for (const p of parser.flush()) pembaca.terima(p.event, jsonData(p));
  } catch (err: any) {
    const dibatalkan = err?.name === "AbortError";
    return {
      ok: false,
      errorKey: dibatalkan ? "err.ai.dibatalkan" : "err.ai.tidakTerhubung",
      usage: pembaca.usage,
      langkah: pembaca.langkah,
    };
  } finally {
    // Membaca sisa aliran setelah kita berhenti tidak ada gunanya, dan
    // membiarkannya terbuka menahan satu koneksi sampai batas waktu server.
    try {
      await reader.cancel();
    } catch {
      /* sudah tertutup */
    }
  }

  lapor();

  if (pembaca.errorKey || !pembaca.hasil) {
    return {
      ok: false,
      errorKey: pembaca.errorKey || "err.ai.jawabanTidakTerbaca",
      // Kalau tidak ada jawaban sama sekali, yang berguna justru daftar
      // peristiwa yang sempat datang — ia menunjukkan di mana alirannya
      // berhenti.
      detail: pembaca.mentah || pembaca.jejak.join("\n"),
      mentah: pembaca.mentah,
      usage: pembaca.usage,
      langkah: pembaca.langkah,
    };
  }

  return { ok: true, hasil: pembaca.hasil, usage: pembaca.usage, langkah: pembaca.langkah };
}

/**
 * Panggilan kedua: mengubah temuan yang sudah didapat jadi JSON.
 *
 * Rencana cadangan dari RENCANA-AI-DEEPSEEK.md §7.1, dan ternyata memang
 * dibutuhkan: dipakai bersama `web_search`, `text.format: json_schema` tidak
 * ditegakkan — model menjawab dengan kalimat biasa. Riset yang jawabannya
 * terpotong kehabisan token juga berakhir di sini.
 *
 * Sengaja lewat **Chat Completions dengan `response_format: json_object`**,
 * bukan lewat Responses API dengan `json_schema`. Alasannya bukan selera:
 * `json_object` adalah satu-satunya bentuk keluaran terstruktur yang punya
 * contoh berjalan di dokumentasi DeepSeek, sementara `json_schema` sudah
 * terbukti tidak ditegakkan sekali di jalur ini. Jalur cadangan yang memakai
 * mekanisme yang sama dengan yang baru saja gagal bukan jalur cadangan.
 *
 * Skemanya karena itu dititipkan di dalam teks perintah, dan bentuk hasilnya
 * tetap disaring `ai-usulan.js` sesudahnya — lapisan yang memang sudah
 * dirancang untuk tidak memercayai apa pun yang datang dari model.
 */
export async function rapikanJadiJson(opts: {
  apiKey: string;
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

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: opts.signal,
      body: JSON.stringify({
        // Selalu model termurah: pekerjaannya menyalin, bukan menilai.
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: perintah },
          { role: "user", content: opts.mentah },
        ],
        response_format: { type: "json_object" },
        // Menyalin tidak butuh penalaran, dan penalaran di sini hanya memakan
        // jatah token yang dibutuhkan jawabannya sendiri.
        thinking: { type: "disabled" },
        max_tokens: 16_000,
      }),
    });
  } catch {
    return { ok: false, errorKey: "err.ai.tidakTerhubung" };
  }

  if (!res.ok) return { ok: false, errorKey: errorKeyForStatus(res.status) };

  let data: any;
  try {
    const raw = (await res.text()).trim();
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, errorKey: "err.ai.jawabanTidakTerbaca" };
  }

  const hasil = uraiJson(data?.choices?.[0]?.message?.content || "");
  if (!hasil) return { ok: false, errorKey: "err.ai.jawabanTidakTerbaca" };
  return { ok: true, hasil, usage: data?.usage };
}
