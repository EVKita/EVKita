import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { getEnv } from "./env";
import {
  BATAS_HALAMAN,
  BATAS_RUJUKAN,
  PANJANG_SIDIK,
  apakahBot,
  asalRujukan,
  bacaHari,
  bulanDari,
  deretHari,
  hariKosong,
  hariWib,
  jamWib,
  jenisPerangkat,
  pangkas,
  rapikanPath,
  ringkas,
} from "./trafik.js";

/**
 * Pencatat kunjungan situs publik.
 *
 * Tiga hal yang menentukan seluruh bentuk berkas ini:
 *
 * 1. **Tidak ada satu baris log pun.** Yang ditulis hanya angka yang sudah
 *    dijumlahkan per hari. Alamat IP tidak pernah menyentuh disk, dan tidak ada
 *    berkas yang bisa dibongkar untuk merekonstruksi jejak satu orang.
 * 2. **Menulis tidak boleh menumpang di jalur permintaan.** Setiap kunjungan
 *    hanya menambah angka di memori; berkasnya ditulis paling cepat sepuluh
 *    detik sekali. Situs yang ramai tidak boleh membayar satu penulisan disk
 *    untuk setiap pembaca.
 * 3. **Mati mendadak tidak boleh merusak apa pun.** Yang belum sempat ditulis
 *    memang hilang — paling banyak sepuluh detik terakhir — tapi berkas yang
 *    sudah ada tidak pernah setengah tertulis (`writeJsonAtomic`).
 */

const DATA_DIR = () => path.resolve(process.cwd(), "data");
const DIR = () => path.join(DATA_DIR(), "trafik");
const berkasBulan = (bulan: string) => path.join(DIR(), `${bulan}.json`);

/** Jarak minimum antar penulisan berkas. */
const JEDA_TULIS_MS = 10 * 1000;

/** Berapa bulan riwayat yang disimpan. Selebihnya dihapus saat menulis. */
const SIMPAN_BULAN = 24;

type Hari = ReturnType<typeof hariKosong>;

/** Yang belum ditulis ke disk, berkunci tanggal WIB. */
const buffer = new Map<string, Hari>();
let timer: NodeJS.Timeout | null = null;
let terakhirTulis = 0;

function hariBuffer(tanggal: string): Hari {
  let h = buffer.get(tanggal);
  if (!h) {
    h = hariKosong();
    buffer.set(tanggal, h);
  }
  return h;
}

/* ------------------------------------------------------------------ *
 * Sidik pengunjung
 * ------------------------------------------------------------------ */

/**
 * Garam harian untuk sidik pengunjung.
 *
 * Sidiknya adalah HMAC dari alamat IP + User-Agent, dan garamnya BERGANTI
 * setiap hari. Artinya sidik yang sama tidak bisa dilacak melintasi hari, dan
 * sidik yang tersimpan tidak bisa dicocokkan balik ke alamat IP mana pun tanpa
 * garam hari itu — yang sendirinya tidak pernah disimpan.
 *
 * Kalau `SESSION_SECRET` belum ada (mis. sebelum wizard dijalankan), garam acak
 * per proses yang dipakai. Angkanya jadi kurang akurat setelah restart; itu
 * jauh lebih baik daripada garam tetap yang bisa ditebak.
 */
const garamProses = crypto.randomBytes(32).toString("hex");
function garamHari(tanggal: string): string {
  return `${getEnv("SESSION_SECRET", "") || garamProses}:${tanggal}`;
}

function sidik(tanggal: string, ip: string, userAgent: string): string {
  return crypto
    .createHmac("sha256", garamHari(tanggal))
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, PANJANG_SIDIK);
}

/* ------------------------------------------------------------------ *
 * Mencatat
 * ------------------------------------------------------------------ */

export interface Kunjungan {
  pathname: string;
  referrer?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  host?: string | null;
  waktu?: Date;
}

/**
 * Mencatat satu kunjungan halaman. Aman dipanggil untuk permintaan apa pun —
 * yang tidak layak dihitung disaring di dalam sini, bukan di pemanggilnya.
 */
export function catatKunjungan(k: Kunjungan): void {
  try {
    const jalan = rapikanPath(k.pathname);
    if (!jalan) return;

    const waktu = k.waktu || new Date();
    const tanggal = hariWib(waktu);
    const h = hariBuffer(tanggal);
    const ua = String(k.userAgent || "");

    if (apakahBot(ua)) {
      h.bot += 1;
      jadwalTulis();
      return;
    }

    h.tampilan += 1;
    h.jam[jamWib(waktu)] += 1;
    h.halaman[jalan] = (h.halaman[jalan] || 0) + 1;
    const asal = asalRujukan(k.referrer, k.host);
    h.rujukan[asal] = (h.rujukan[asal] || 0) + 1;
    const perangkat = jenisPerangkat(ua);
    h.perangkat[perangkat] = (h.perangkat[perangkat] || 0) + 1;

    /*
     * Pengunjung dihitung lewat sidik harian, bukan cookie. Konsekuensinya
     * disengaja: tidak ada apa pun yang ditanam di peramban pembaca, jadi
     * halaman ini tidak pernah membutuhkan izin cookie untuk statistiknya
     * sendiri.
     */
    const tanda = sidik(tanggal, String(k.ip || ""), ua);
    if (!h.sidik.includes(tanda)) {
      h.sidik.push(tanda);
      h.pengunjung += 1;
    }

    jadwalTulis();
  } catch {
    // Statistik tidak pernah boleh menjatuhkan permintaan halaman.
  }
}

function jadwalTulis(): void {
  if (timer) return;
  const sisa = Math.max(0, JEDA_TULIS_MS - (Date.now() - terakhirTulis));
  timer = setTimeout(() => {
    timer = null;
    simpanSekarang();
  }, sisa);
  // Timer statistik tidak boleh menahan proses tetap hidup saat mau berhenti.
  if (typeof timer.unref === "function") timer.unref();
}

/* ------------------------------------------------------------------ *
 * Menulis
 * ------------------------------------------------------------------ */

function gabungKe(tujuan: any, tambahan: Hari): Hari {
  const h = bacaHari(tujuan);
  h.tampilan += tambahan.tampilan;
  h.bot += tambahan.bot;
  for (let i = 0; i < 24; i++) h.jam[i] += tambahan.jam[i];
  for (const [k, v] of Object.entries(tambahan.halaman)) h.halaman[k] = (h.halaman[k] || 0) + v;
  for (const [k, v] of Object.entries(tambahan.rujukan)) h.rujukan[k] = (h.rujukan[k] || 0) + v;
  for (const [k, v] of Object.entries(tambahan.perangkat)) h.perangkat[k] = (h.perangkat[k] || 0) + v;

  /*
   * Pengunjung TIDAK dijumlahkan, melainkan dihitung ulang dari gabungan
   * sidiknya. Menjumlahkan akan menghitung ganda setiap orang yang datang lagi
   * setelah penulisan terakhir — yaitu hampir semua orang, di situs mana pun.
   */
  const semua = new Set([...h.sidik, ...tambahan.sidik]);
  h.sidik = [...semua];
  /*
   * Kecuali kalau sidik hari itu sudah dibuang (lihat `buangSidikLama`). Di
   * situ tidak ada lagi yang bisa dibandingkan, jadi penjumlahan biasa yang
   * dipakai — sedikit terlalu tinggi, tapi jauh lebih baik daripada menimpa
   * jumlah sehari penuh dengan hitungan sepuluh detik terakhir.
   */
  h.pengunjung = Array.isArray(tujuan?.sidik) ? semua.size : h.pengunjung + tambahan.pengunjung;
  return h;
}

/**
 * Sidik hanya berguna selama harinya masih berjalan.
 *
 * Begitu hari berganti, yang dibutuhkan cuma jumlahnya — dan menyimpan
 * sidiknya terus berarti berkas bulanan tumbuh sebesar jumlah pengunjung
 * setahun. Membuangnya juga menutup satu-satunya sisa data yang, meski tanpa
 * garamnya, masih berbentuk "satu baris per orang".
 */
function buangSidikLama(peta: Record<string, any>, hariIni: string): void {
  for (const [tgl, h] of Object.entries(peta)) {
    if (tgl !== hariIni && h && Array.isArray(h.sidik)) delete h.sidik;
  }
}

function bacaBerkas(bulan: string): Record<string, any> {
  const res = readJson<any>(berkasBulan(bulan));
  if (res.status !== "ok") return {};
  return res.data && typeof res.data.hari === "object" && res.data.hari ? res.data.hari : {};
}

/** Menulis seluruh isi buffer ke berkas bulanan. Dipanggil timer dan pembacaan. */
export function simpanSekarang(): void {
  if (!buffer.size) return;
  const antre = [...buffer.entries()];
  buffer.clear();
  terakhirTulis = Date.now();

  try {
    fs.mkdirSync(DIR(), { recursive: true });
    const hariIni = hariWib();

    // Dikelompokkan per bulan supaya satu bulan cukup dibaca-tulis sekali,
    // meski buffernya kebetulan melintasi pergantian bulan.
    const perBulan = new Map<string, [string, Hari][]>();
    for (const [tgl, h] of antre) {
      const bulan = bulanDari(tgl);
      if (!perBulan.has(bulan)) perBulan.set(bulan, []);
      perBulan.get(bulan)!.push([tgl, h]);
    }

    for (const [bulan, daftar] of perBulan) {
      const peta = bacaBerkas(bulan);
      for (const [tgl, h] of daftar) {
        const gabung = gabungKe(peta[tgl], h);
        gabung.halaman = pangkas(gabung.halaman, BATAS_HALAMAN);
        gabung.rujukan = pangkas(gabung.rujukan, BATAS_RUJUKAN);
        peta[tgl] = gabung;
      }
      buangSidikLama(peta, hariIni);
      writeJsonAtomic(berkasBulan(bulan), { version: 1, bulan, hari: peta });
    }

    bersihkanArsip();
  } catch {
    // Kegagalan menulis statistik tidak pernah boleh terlihat oleh pembaca situs.
  }
}

function bersihkanArsip(): void {
  try {
    const berkas = fs
      .readdirSync(DIR())
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();
    for (const f of berkas.slice(SIMPAN_BULAN)) {
      fs.unlinkSync(path.join(DIR(), f));
    }
  } catch {
    /* direktori belum ada */
  }
}

/* ------------------------------------------------------------------ *
 * Membaca
 * ------------------------------------------------------------------ */

/** Bulan yang punya catatan, terbaru lebih dulu. */
export function daftarBulan(): string[] {
  try {
    return fs
      .readdirSync(DIR())
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Ringkasan `jumlah` hari terakhir sampai `sampai`, plus periode sebanding
 * sebelumnya untuk pembanding.
 *
 * Buffer disimpan lebih dulu supaya kunjungan beberapa detik terakhir ikut
 * terhitung: panel yang tidak menampilkan kunjungan sendiri barusan akan
 * dianggap rusak, dan orang akan berhenti mempercayai seluruh angkanya.
 */
export function bacaRentang(jumlah: number, sampai = hariWib()) {
  simpanSekarang();

  const hariIni = deretHari(sampai, jumlah);
  const hariSebelum = deretHari(mundur(hariIni[0], 1), jumlah);
  const peta = petaUntuk([...hariSebelum, ...hariIni]);

  return {
    sekarang: ringkas(peta, hariIni),
    sebelum: ringkas(peta, hariSebelum),
  };
}

/** Ringkasan satu bulan penuh. */
export function bacaBulan(bulan: string) {
  simpanSekarang();
  const peta = bacaBerkas(bulan);
  const tanggal = Object.keys(peta).sort();
  return ringkas(peta, tanggal);
}

function mundur(hari: string, n: number): string {
  const d = new Date(`${hari}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Menggabungkan berkas bulanan yang dibutuhkan sederet tanggal jadi satu peta. */
function petaUntuk(tanggal: string[]): Record<string, any> {
  const bulan = [...new Set(tanggal.map(bulanDari))];
  const peta: Record<string, any> = {};
  for (const b of bulan) Object.assign(peta, bacaBerkas(b));
  return peta;
}
