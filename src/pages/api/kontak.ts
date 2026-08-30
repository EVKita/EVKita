import type { APIRoute } from "astro";
import { json, apiError } from "../../lib/api";
import { readContent } from "../../lib/store";
import { smtpTerpasang, kirimEmail } from "../../lib/smtp";

/**
 * Titik masuk formulir kontak publik.
 *
 * Mengirim pesan pengunjung ke alamat `site.contactEmail` lewat SMTP yang
 * dipasang di panel. Bukan endpoint panel: tidak ada kuki sesi di sini, jadi
 * pertahanannya adalah batas laju per alamat dan honeypot, bukan peran.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_KIRIM = 5;
const MAX_KEYS = 2000;

const kiriman = new Map<string, number[]>();

function batasi(ip: string): boolean {
  const now = Date.now();
  for (const [k, hits] of kiriman) {
    const sisa = hits.filter((t) => now - t < WINDOW_MS);
    if (!sisa.length) kiriman.delete(k);
    else kiriman.set(k, sisa);
  }
  if (kiriman.size >= MAX_KEYS) kiriman.clear();

  const hits = kiriman.get(ip) ?? [];
  if (hits.length >= MAX_KIRIM) return true;
  hits.push(now);
  kiriman.set(ip, hits);
  return false;
}

function ip(request: Request, clientAddress?: string): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || clientAddress || "tidak-diketahui";
}

function teks(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!smtpTerpasang()) {
    // Belum dipasang: formulir footer juga sudah tidak memakai jalur ini,
    // jadi kalau sampai di sini berarti ada yang memanggilnya langsung.
    return apiError("err.kontak.belumDiatur", 503);
  }

  if (batasi(ip(request, clientAddress))) {
    return apiError("err.kontak.terlaluSering", 429);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  // Honeypot: field tersembunyi yang tidak pernah diisi manusia. Bot yang
  // mengisinya diberi jawaban sukses supaya tidak tahu bahwa isinya dibuang.
  if (String(body?.situs || "").trim() !== "") {
    return json({ ok: true });
  }

  const nama = teks(body?.nama, 200);
  const email = teks(body?.email, 200);
  const subjek = teks(body?.subjek, 200);
  const pesan = teks(body?.pesan, 5000);

  if (!nama || !subjek || !pesan) return apiError("err.kontak.kurang");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError("err.kontak.email");

  const site = readContent().site || {};
  const ke = teks(site.contactEmail, 200);
  if (!ke || !ke.includes("@")) return apiError("err.kontak.belumDiatur", 503);

  const teksEmail = [
    `Nama: ${nama}`,
    `Email: ${email}`,
    "",
    "Pesan:",
    pesan,
  ].join("\n");

  try {
    await kirimEmail({ ke, balasKe: email, subjek, teks: teksEmail });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    console.error(`[evkita] kirim formulir kontak gagal: ${pesan}`);
    return apiError("err.kontak.gagalKirim", 502);
  }

  return json({ ok: true });
};
