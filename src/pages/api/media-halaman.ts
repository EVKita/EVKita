import type { APIRoute } from "astro";
import dns from "node:dns/promises";
import { isAuthed } from "../../lib/auth";
import { apiError, json, unauthorized } from "../../lib/api";
import { urlAmanUntukAmbil, ipTerlarang, BATAS_WAKTU_MS, MAKS_ALIHAN } from "../../lib/gambar-url.js";
import { ekstrakMedia } from "../../lib/media-ambil.js";

/**
 * Membaca satu halaman resmi lalu mengembalikan daftar gambar dan videonya.
 *
 * Tidak menulis apa pun: yang keluar hanya daftar alamat. Unduhannya tetap
 * lewat `/api/gambar-url` → dikecilkan di peramban → `/api/upload`, jalur yang
 * sudah ada.
 *
 * Penjagaan ke mana server boleh mengetuk sama persis dengan `/api/gambar-url`
 * (lihat `src/lib/gambar-url.js`): bentuk alamat diperiksa sebelum dikirim,
 * hasil DNS diperiksa di setiap pengalihan, pengalihan diikuti sendiri, dan
 * badan jawaban dibatasi ukurannya. Hanya saja di sini yang diambil adalah
 * HTML, bukan gambar.
 */

const AGEN = "EVKita/1.0 (pembaca halaman panel; +https://evkita.com)";
/** Halaman model biasanya puluhan sampai ratusan KB; 2 MB sudah sangat longgar. */
const MAKS_HALAMAN_BYTES = 2 * 1024 * 1024;

async function hostMenunjukKeluar(host: string): Promise<boolean> {
  let alamat: Array<{ address: string }>;
  try {
    alamat = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return false;
  }
  return alamat.length > 0 && !alamat.some((a) => ipTerlarang(a.address));
}

async function bacaTerbatas(res: Response, maks: number): Promise<string | null> {
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
  return Buffer.concat(potongan).toString("utf8");
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

  for (let loncat = 0; loncat <= MAKS_ALIHAN; loncat++) {
    const cek = urlAmanUntukAmbil(target);
    if (!cek.ok) return apiError(cek.alasan);

    const url = new URL(cek.url);
    if (!(await hostMenunjukKeluar(url.hostname))) return apiError("err.ambilUrlHost");

    let res: Response;
    try {
      res = await fetch(cek.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
        headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8", "user-agent": AGEN },
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
    if (Number.isFinite(disebut) && disebut > MAKS_HALAMAN_BYTES) {
      return apiError("err.ambilTerlaluBesar", 413, { mb: Math.round(MAKS_HALAMAN_BYTES / 1048576) });
    }

    const html = await bacaTerbatas(res, MAKS_HALAMAN_BYTES);
    if (!html) return apiError("err.ambilTerlaluBesar", 413, { mb: Math.round(MAKS_HALAMAN_BYTES / 1048576) });

    return json({ ok: true, ...ekstrakMedia(html, cek.url) });
  }

  return apiError("err.ambilAlihan", 502);
};
