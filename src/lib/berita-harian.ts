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
async function ambilSumber(sumber: { id: string; nama: string; feed: string }): Promise<{ items: any[]; error: string }> {
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
    if (!r.ok) return { items: [], error: `http${r.status}` };
    const xml = await r.text();
    const items = parseFeed(xml)
      .filter((it) => relevanBerita(`${it.title} ${it.excerpt}`))
      .map((it) => ({
        id: "",
        title: it.title,
        source: sumber.nama,
        url: it.link,
        date: it.date || tanggalWib(),
        /* Foto bawaan feed (enclosure/media:content) dipakai langsung kalau
           berupa http(s) — kalau feed tidak membawanya, thumbnail dilengkapi
           saat render lewat cache og:image di `berita-gambar.ts`. */
        image: /^https?:\/\//i.test(String(it.image || "").trim()) ? String(it.image).trim() : "",
        excerpt: it.excerpt,
        featured: false,
        status: "published",
        publishAt: "",
        updatedAt: new Date().toISOString(),
        updatedBy: "",
      }));
    return { items, error: "" };
  } catch {
    return { items: [], error: "jaringan" };
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
  /* Hari ini dilewati hanya bila putaran terakhir BERHASIL. Gagal — semua
     sumber mati atau tak ada yang bisa diambil — boleh dicoba lagi di
     kunjungan berikutnya, bukan hangus sehari penuh. Sebelumnya tanggal
     ditandai SEBELUM menarik, jadi satu kegagalan sesaat menghanguskan
     seluruh harinya tanpa jejak. */
  if (!paksa && jadwal.tanggal === hariIni && jadwal.hasil && jadwal.hasil.ok) {
    return { dilewati: true, tanggal: hariIni };
  }
  if (sedangJalan) return { dilewati: true, tanggal: hariIni };

  sedangJalan = true;

  try {
    const hasil = await Promise.all(SUMBER_BERITA.map((s) => ambilSumber(s)));
    const gagal = SUMBER_BERITA.filter((_, i) => hasil[i].error).map((s) => s.nama);
    const baru = hasil.map((h) => h.items).flat();
    const content = readContent();
    const { daftar, ditambah } = gabungBerita(content.berita || [], baru, MAKS_BERITA);
    if (ditambah > 0) {
      const segar = { ...content, berita: daftar };
      writeContent(segar);
      /* Sama seperti auto-update kendaraan: siapkan terjemahan EN/ZH sekarang
         supaya pembaca asing tidak menunggu batch pertama. Best-effort. */
      try {
        const { terjemahContent } = await import("./terjemahan.js");
        await terjemahContent(segar, "en");
        await terjemahContent(segar, "zh");
      } catch {
        /* abaikan */
      }
    }

    /* Berhasil bila ada yang ditambah, atau semua sumber terbaca (hanya
       memang tidak ada kabar EV baru). Gagal sebagian tapi ada hasil tetap
       dihitung selesai — sumber yang mati dicoba lagi besok. */
    const ok = ditambah > 0 || gagal.length === 0;
    const ringkas = {
      dilewati: false,
      tanggal: hariIni,
      ditambah,
      total: daftar.length,
      sumber: SUMBER_BERITA.map((s) => s.nama),
      gagal,
      ok,
      ...(gagal.length && ditambah === 0 ? { error: `sumber mati: ${gagal.join(", ")}` } : {}),
    };
    tulisJadwal({ tanggal: hariIni, hasil: ringkas });
    return ringkas;
  } catch (e: any) {
    const ringkas = { dilewati: false, tanggal: hariIni, ditambah: 0, ok: false, error: String((e && e.message) || e) };
    tulisJadwal({ tanggal: hariIni, hasil: ringkas });
    return ringkas;
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
