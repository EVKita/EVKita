import type { APIRoute } from "astro";
import { json } from "../../lib/api";
import { checkLimit, recordFailure, clientKey } from "../../lib/ratelimit";
import { readContent } from "../../lib/store";
import { simpanVote } from "../../lib/vote-store.js";

/**
 * Menerima satu suara VoteKita dari pengunjung situs publik.
 *
 * Isi: `{ kind: "mobil" | "motor", id, stars: 1–5, prev: 0–5 }`. `prev`
 * adalah bintang yang dulu diberikan pengunjung ini (0 = belum pernah),
 * dibaca browser dari `localStorage` — yang sudah pernah voting hanya
 * menggeser jumlahnya, bukan menambah suara baru. Lihat `vote-store.js`.
 *
 * Pembatas laju yang sama dengan pintu masuk dipakai di sini: endpoint publik
 * tanpa gembok adalah undangan bagi pemborong suara. Kegagalan TIDAK membuat
 * hitungan hangus — hanya permintaan yang tidak sah yang dicatat.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* abaikan */
  }
  const kind = String(body?.kind || "");
  const id = String(body?.id || "");
  const stars = Number(body?.stars);
  const prev = Number(body?.prev);

  const keys = [clientKey(request, clientAddress), "vote"];
  const limit = checkLimit(keys);
  if (limit.blocked) return json({ ok: false }, 429, { "Retry-After": String(limit.retryAfter) });

  const bentukSah =
    (kind === "mobil" || kind === "motor") &&
    id.length > 0 &&
    id.length <= 200 &&
    Number.isInteger(stars) &&
    stars >= 1 &&
    stars <= 5 &&
    Number.isInteger(prev) &&
    prev >= 0 &&
    prev <= 5;
  if (!bentukSah) {
    recordFailure(keys);
    return json({ ok: false }, 400);
  }

  /* Id-nya harus benar-benar ada di katalog — suara untuk hantu ditolak. */
  const content = readContent();
  const daftar = kind === "motor" ? content.motors : content.cars;
  const ada = Array.isArray(daftar) && daftar.some((v: any) => v && v.id === id);
  if (!ada) {
    recordFailure(keys);
    return json({ ok: false }, 400);
  }

  let hasil;
  try {
    hasil = simpanVote(kind, id, stars, prev);
  } catch {
    recordFailure(keys);
    return json({ ok: false }, 400);
  }

  return json({ ok: true, avg: hasil.avg, votes: hasil.votes });
};
