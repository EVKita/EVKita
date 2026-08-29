import type { APIRoute } from "astro";
import dns from "node:dns/promises";
import { isAuthed } from "../../lib/auth";
import { apiError, unauthorized } from "../../lib/api";
import { sniffImage } from "../../lib/imagefile";
import {
  urlAmanUntukAmbil,
  ipTerlarang,
  MAKS_AMBIL_BYTES,
  BATAS_WAKTU_MS,
  MAKS_ALIHAN,
} from "../../lib/gambar-url.js";

/**
 * Mengambil satu gambar dari situs lain, lalu MENGEMBALIKANNYA ke panel —
 * bukan menyimpannya.
 *
 * Kelihatannya memutar: berkasnya turun ke server, naik ke peramban, lalu
 * naik lagi ke `/api/upload`. Itu disengaja, dan alasannya sama dengan alasan
 * `src/scripts/gambar.js` mengerjakan pengecilan di peramban: yang bisa
 * mengubah JPEG 6 MB menjadi AVIF 120 KB di Node adalah `sharp`, yang membawa
 * ±20 MB beserta biner libvips ke dalam paket rilis yang seluruhnya 2,8 MB.
 * Peramban sudah punya pengodenya, gratis.
 *
 * Jadi pembagian tugasnya: SERVER yang menembus batas domain (peramban tidak
 * bisa — CORS, dan CSP panel mengunci `connect-src` ke 'self'), PERAMBAN yang
 * mengubah formatnya, dan `/api/upload` yang tetap menjadi satu-satunya pintu
 * masuk ke `data/uploads/` — dengan pemeriksaan isi berkas yang sama persis
 * seperti sebelumnya. Endpoint ini tidak pernah menulis apa pun ke disk.
 *
 * Yang dijaga di sini seluruhnya soal ke MANA server disuruh mengetuk; lihat
 * `src/lib/gambar-url.js`.
 */

/** Nama yang jujur, supaya pemilik situs sumber tahu siapa yang mengambil. */
const AGEN = "EVKita/1.0 (pengambil gambar panel; +https://evkita.com)";

/**
 * Menolak nama yang menunjuk ke jaringan dalam.
 *
 * SEMUA alamat hasil penerjemahan diperiksa, bukan yang pertama saja: satu
 * nama boleh punya beberapa A/AAAA, dan cukup satu di antaranya menunjuk ke
 * dalam untuk membuat pemeriksaan ini sia-sia.
 *
 * Yang tidak bisa ditutup dari sini: DNS rebinding — nama yang menjawab alamat
 * publik saat diperiksa lalu alamat privat sedetik kemudian saat dihubungi.
 * Menutupnya berarti membuka soket sendiri ke IP yang sudah diperiksa, alih-alih
 * memakai `fetch`. Selisihnya tidak sepadan di sini: pemanggilnya sudah masuk
 * panel, jawabannya cuma dipakai kalau isinya benar-benar gambar, dan tidak
 * ada satu pun header permintaan yang bisa ia atur.
 */
async function hostMenunjukKeluar(host: string): Promise<boolean> {
  let alamat: Array<{ address: string }>;
  try {
    alamat = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return false;
  }
  if (!alamat.length) return false;
  return !alamat.some((a) => ipTerlarang(a.address));
}

/**
 * Membaca badan jawaban dengan pagar ukuran.
 *
 * `res.arrayBuffer()` akan dengan patuh memuat berkas 2 GB ke memori sebelum
 * ada satu pun kesempatan memeriksanya. Content-Length juga tidak bisa
 * dipercaya sendirian — ia boleh berbohong, dan boleh tidak dikirim sama
 * sekali. Yang menghentikan adalah hitungan byte yang benar-benar tiba.
 */
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

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  let target = String(body?.url || "");
  const mb = Math.round(MAKS_AMBIL_BYTES / 1048576);

  for (let loncat = 0; loncat <= MAKS_ALIHAN; loncat++) {
    const cek = urlAmanUntukAmbil(target);
    if (!cek.ok) return apiError(cek.alasan);

    const url = new URL(cek.url);
    if (!(await hostMenunjukKeluar(url.hostname))) {
      return apiError("err.ambilUrlHost");
    }

    let res: Response;
    try {
      res = await fetch(cek.url, {
        // Pengalihan diikuti SENDIRI, bukan oleh fetch. Kalau fetch yang
        // mengikutinya, alamat tujuan akhir tidak pernah lewat pemeriksaan di
        // atas — dan "301 ke http://169.254.169.254/" adalah cara paling
        // ringkas melewati penyaring yang cuma memeriksa alamat pertama.
        redirect: "manual",
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
        headers: { accept: "image/*,*/*;q=0.8", "user-agent": AGEN },
      });
    } catch {
      return apiError("err.ambilGagal", 502);
    }

    if (res.status >= 300 && res.status < 400) {
      const tujuan = res.headers.get("location");
      if (!tujuan) return apiError("err.ambilGagal", 502);
      try {
        target = new URL(tujuan, cek.url).href;
      } catch {
        return apiError("err.ambilUrlSalah");
      }
      continue;
    }

    if (!res.ok) return apiError("err.ambilStatus", 502, { status: res.status });

    const disebut = Number(res.headers.get("content-length") || 0);
    if (Number.isFinite(disebut) && disebut > MAKS_AMBIL_BYTES) {
      return apiError("err.ambilTerlaluBesar", 413, { mb });
    }

    const buf = await bacaTerbatas(res, MAKS_AMBIL_BYTES);
    if (!buf) return apiError("err.ambilTerlaluBesar", 413, { mb });
    if (!buf.length) return apiError("err.ambilGagal", 502);

    // Tipe ditentukan isinya, bukan Content-Type dari situs orang. Halaman
    // HTML yang disajikan dengan `Content-Type: image/jpeg` bukan hal langka,
    // dan yang seperti itu tidak boleh sampai ke jalur unggah.
    const jenis = sniffImage(buf);
    if (!jenis) return apiError("err.ambilBukanGambar");

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": jenis,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  return apiError("err.ambilAlihan", 502);
};
