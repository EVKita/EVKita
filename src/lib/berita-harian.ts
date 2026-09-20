import fs from "node:fs";
import path from "node:path";
import { readContent, writeContent } from "./store";
import { SUMBER_BERITA, relevanBerita } from "./berita-sumber.js";
import { gabungBerita, parseFeed } from "./berita-rss.js";

/**
 * Penarik berita harian.
 *
 * Berita Terkini diisi dari RSS resmi tiap penerbit sekali sehari. Yang
 * tersimpan hanyalah judul, ringkasan, tanggal, dan TAUTAN ke halaman
 * aslinya — tidak ada satu paragraf pun isi berita yang disalin, karena
 * gunanya justru mengantar pembaca ke sana.
 *
 * Dua hal yang membuat ini aman dijalankan sendiri:
 *
 *   1. **Sekali sehari.** Tanggal (WIB) terakhir dijalankan disimpan di
 *      `data/berita-jadwal.json`. Muat ulang server tidak memicu penarikan
 *      kedua, dan satu penarikan tidak pernah berjalan dua kali bersamaan.
 *   2. **Tidak pernah menggagalkan permintaan.** `jadwalkanBerita()` dipanggil
 *      middleware dan sengaja tidak ditunggu: kegagalan jaringan penerbit
 *      tidak boleh membuat halaman pembaca lambat atau error.
 */

const JADWAL = path.resolve(process.cwd(), "data/berita-jadwal.json");
/** Batas kewajaran jumlah kartu di Berita Terkini. */
const MAKS_BERITA = 30;
const UA = "Mozilla/5.0 (compatible; EVKitaBot/1.0; +https://evkita.com)";

/** Tanggal menurut WIB, bukan zona waktu server (produksi berjalan di UTC). */
export function tanggalWib(d: Date = new Date()): string {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function bacaJadwal(): any {
  try {
    return JSON.parse(fs.readFileSync(JADWAL, "utf8"));
  } catch {
    return {};
  }
}

function tulisJadwal(v: any): void {
  try {
    fs.mkdirSync(path.dirname(JADWAL), { recursive: true });
    fs.writeFileSync(JADWAL, JSON.stringify(v));
  } catch {
    /* Jadwal bersifat best-effort; kegagalan menulisnya tidak fatal. */
  }
}

/** Mengambil satu feed, menyaring yang relevan, memetakan ke bentuk berita. */
async function ambilSumber(sumber: { id: string; nama: string; feed: string }): Promise<any[]> {
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
    const xml = await r.text();
    return parseFeed(xml)
      .filter((it) => relevanBerita(`${it.title} ${it.excerpt}`))
      .map((it) => ({
        id: "",
        title: it.title,
        source: sumber.nama,
        url: it.link,
        date: it.date || tanggalWib(),
        image: "",
        excerpt: it.excerpt,
        featured: false,
        status: "published",
        publishAt: "",
        updatedAt: new Date().toISOString(),
        updatedBy: "",
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

let sedangJalan = false;

/**
 * Menarik seluruh sumber dan menggabungkannya ke `content.berita`.
 *
 * @param paksa `true` untuk mengabaikan penjaga "sekali sehari" (tombol panel).
 */
export async function perbaruiBerita({ paksa = false }: { paksa?: boolean } = {}) {
  const hariIni = tanggalWib();
  const jadwal = bacaJadwal();
  if (!paksa && jadwal.tanggal === hariIni) return { dilewati: true, tanggal: hariIni };
  if (sedangJalan) return { dilewati: true, tanggal: hariIni };

  sedangJalan = true;
  // Ditandai SEBELUM menarik: permintaan lain yang datang saat penarikan
  // berjalan tidak boleh memulai penarikan kedua.
  tulisJadwal({ ...jadwal, tanggal: hariIni });

  try {
    const hasil = await Promise.all(SUMBER_BERITA.map((s) => ambilSumber(s)));
    const baru = hasil.flat();
    const content = readContent();
    const { daftar, ditambah } = gabungBerita(content.berita || [], baru, MAKS_BERITA);
    if (ditambah > 0) writeContent({ ...content, berita: daftar });

    const ringkas = {
      dilewati: false,
      tanggal: hariIni,
      ditambah,
      total: daftar.length,
      sumber: SUMBER_BERITA.map((s) => s.nama),
    };
    tulisJadwal({ tanggal: hariIni, hasil: ringkas });
    return ringkas;
  } catch (e: any) {
    return { dilewati: false, tanggal: hariIni, ditambah: 0, error: String((e && e.message) || e) };
  } finally {
    sedangJalan = false;
  }
}

/**
 * Dipanggil middleware di setiap permintaan. Tidak ditunggu dan tidak pernah
 * melempar — lihat catatan di atas berkas ini.
 */
export function jadwalkanBerita(): void {
  try {
    const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
    // Sebelum pukul 04.00 WIB biarkan sepi; penarikan pertama hari itu terjadi
    // pada permintaan pertama setelahnya.
    if (jam < 4) return;
    void perbaruiBerita().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
