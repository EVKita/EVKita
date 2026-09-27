import dns from "node:dns/promises";
import {
  urlAmanUntukAmbil,
  ipTerlarang,
  BATAS_WAKTU_MS,
  MAKS_ALIHAN,
  MAKS_AMBIL_BYTES,
} from "./gambar-url.js";
import { ekstrakMedia } from "./media-ambil.js";
import { sniffImage, type ImageMime } from "./imagefile";

/**
 * Pengambil media resmi untuk auto-update katalog.
 *
 * Memakai aturan yang PERSIS sama dengan `/api/gambar-url` dan
 * `/api/media-halaman` (lihat `src/lib/gambar-url.js`): bentuk alamat
 * diperiksa dulu, hasil DNS diperiksa di setiap pengalihan, pengalihan diikuti
 * sendiri, dan badan jawaban dibatasi ukurannya. Bedanya, berkas ini bukan
 * endpoint — ia dipanggil langsung oleh mesin pembaruan (`pembaruan-kendaraan.ts`)
 * supaya pengambilan media bisa berjalan otomatis tanpa menunggu peramban.
 *
 * Gambar disimpan APA ADANYA (format aslinya), tanpa dikecilkan: mengecilkan di
 * server butuh `sharp` (±20 MB) yang memang sengaja tidak dibawa ke dalam paket
 * rilis. Ukuran tetap dibatasi `MAKS_AMBIL_BYTES` supaya satu foto pers raksasa
 * tidak menghabiskan disk.
 */

const AGEN = "EVKita/1.0 (auto-update media; +https://evkita.com)";
const MAKS_HALAMAN_BYTES = 2 * 1024 * 1024;

/** Nama yang menunjuk ke alamat privat ditolak, termasuk di setiap pengalihan. */
async function hostMenunjukKeluar(host: string): Promise<boolean> {
  let alamat: Array<{ address: string }>;
  try {
    alamat = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return false;
  }
  return alamat.length > 0 && !alamat.some((a) => ipTerlarang(a.address));
}

async function bacaTerbatas(res: Response, maks: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const potongan: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maks) {
      await reader.cancel().catch(() => {});
      return null;
    }
    potongan.push(value);
  }
  return Buffer.concat(potongan);
}

/**
 * Mengambil sebuah alamat mengikuti pengalihan, sambil memeriksa ulang setiap
 * loncatan. Mengembalikan respons terakhir, atau null kalau gagal/ditolak.
 */
async function ambilAman(mentah: string, terima: string): Promise<Response | null> {
  let target = mentah;
  for (let loncat = 0; loncat <= MAKS_ALIHAN; loncat++) {
    const cek = urlAmanUntukAmbil(target);
    if (!cek.ok) return null;
    const url = new URL(cek.url);
    if (!(await hostMenunjukKeluar(url.hostname))) return null;

    let res: Response;
    try {
      res = await fetch(cek.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
        headers: { accept: terima, "user-agent": AGEN },
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const tujuan = res.headers.get("location");
      if (!tujuan) return null;
      try {
        target = new URL(tujuan, cek.url).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    return res;
  }
  return null;
}

/** Membaca satu halaman resmi lalu mengembalikan daftar gambar dan videonya. */
export async function ambilMediaResmi(mentah: string): Promise<{ gambar: string[]; video: string[] }> {
  const res = await ambilAman(mentah, "text/html,application/xhtml+xml,*/*;q=0.8");
  if (!res) return { gambar: [], video: [] };

  const disebut = Number(res.headers.get("content-length") || 0);
  if (Number.isFinite(disebut) && disebut > MAKS_HALAMAN_BYTES) return { gambar: [], video: [] };

  const html = await bacaTerbatas(res, MAKS_HALAMAN_BYTES);
  if (!html) return { gambar: [], video: [] };

  return ekstrakMedia(html.toString("utf8"), res.url);
}

/** Mengunduh satu gambar resmi. Mengembalikan isi + tipe, atau null kalau gagal. */
export async function unduhGambarResmi(
  mentah: string
): Promise<{ buffer: Buffer; mime: ImageMime } | null> {
  const res = await ambilAman(mentah, "image/*,*/*;q=0.8");
  if (!res) return null;

  const disebut = Number(res.headers.get("content-length") || 0);
  if (Number.isFinite(disebut) && disebut > MAKS_AMBIL_BYTES) return null;

  const buf = await bacaTerbatas(res, MAKS_AMBIL_BYTES);
  if (!buf || !buf.length) return null;

  // Tipe ditentukan isinya, bukan Content-Type dari situs orang.
  const mime = sniffImage(buf);
  if (!mime) return null;

  return { buffer: buf, mime };
}
