import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { json } from "../../lib/api";
import { currentUser } from "../../lib/auth";
import { checkLimit, recordFailure, clientKey } from "../../lib/ratelimit";
import { readContent } from "../../lib/store";
import {
  bacaDokumen,
  simpanFavorit,
  simpanVote,
  sahVid,
  totalSuara,
  VOTER_COOKIE,
} from "../../lib/vote-store.js";
import { avgOf } from "../../lib/vote-html.js";

function vidBaru() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Hasil vote untuk pemilik situs.
 *
 * Publik (`GET /api/vote`): agregat per kendaraan + total suara mobil/motor —
 * cukup untuk tahu berapa banyak yang memilih apa. Tanpa login tidak ada
 * rincian pemilih: cookie acak bukan data pribadi, tapi peta pemilih tetap
 * hanya untuk admin.
 *
 * Admin (sudah masuk panel, `?rincian=1`): peringkat lengkap berisi nama
 * merek + model, rata-rata, dan jumlah suara — siap disalin ke lembar kerja.
 * `?format=csv` mengunduhnya sebagai CSV.
 */
export const GET: APIRoute = async ({ url, cookies }) => {
  const dok = bacaDokumen();
  const content = readContent();
  const namaUntuk = (kind: string, id: string) => {
    const daftar = kind === "motor" ? content.motors : content.cars;
    const v = Array.isArray(daftar) ? daftar.find((x: any) => x && x.id === id) : null;
    return {
      brand: (v && v.brand) || "",
      name: (v && v.name) || "",
      image: (v && v.image) || "",
    };
  };
  const peringkat = (kind: "mobil" | "motor") => {
    const ember = kind === "motor" ? dok.motors : dok.cars;
    return Object.entries(ember)
      .map(([id, stat]: any) => ({
        id,
        ...namaUntuk(kind, id),
        votes: Number(stat.v) || 0,
        avg: avgOf(stat),
      }))
      .sort((a, b) => b.votes - a.votes || b.avg - a.avg);
  };

  const dasar = {
    ok: true as const,
    cars: dok.cars,
    motors: dok.motors,
    totalMobil: totalSuara(dok.cars),
    totalMotor: totalSuara(dok.motors),
  };

  const me = currentUser(cookies as any);
  const mauRincian = url.searchParams.get("rincian") === "1" || url.searchParams.get("format") === "csv";
  if (mauRincian && !me) return json({ ok: false }, 401);
  if (url.searchParams.get("format") === "csv") {
    const baris = ["jenis,id,merek,model,suara,rata_rata"];
    for (const kind of ["mobil", "motor"] as const) {
      for (const r of peringkat(kind)) {
        const sel = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
        baris.push(
          `${kind},${sel(r.id)},${sel(r.brand)},${sel(r.name)},${r.votes},${(Math.round(r.avg * 10) / 10).toFixed(1)}`
        );
      }
    }
    return new Response(baris.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vote-kita.csv"',
      },
    });
  }
  if (mauRincian) {
    return json({ ...dasar, mobil: peringkat("mobil"), motor: peringkat("motor") });
  }
  return json(dasar);
};

/**
 * Menerima satu suara VoteKita dari pengunjung situs publik.
 *
 * Isi: `{ kind: "mobil" | "motor", id, stars: 1–5, prev: 0–5 }`. Satu
 * pengunjung satu favorit per jenis: server mengenali pemilih lewat cookie
 * `evkita_vid` (dibuatkan bila belum ada) dan mencatat pilihannya di
 * `voters`. Memilih kendaraan lain dalam jenis yang sama memindahkan
 * suaranya — suara lama dicabut, suara baru masuk.
 *
 * `prev` lama tetap diterima untuk klien lawas, tapi keputusan memindah
 * memakai catatan server, bukan angka dari browser.
 *
 * Pembatas laju yang sama dengan pintu masuk dipakai di sini: endpoint publik
 * tanpa gembok adalah undangan bagi pemborong suara. Kegagalan TIDAK membuat
 * hitungan hangus — hanya permintaan yang tidak sah yang dicatat.
 */
export const POST: APIRoute = async ({ request, cookies, url, clientAddress }) => {
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

  /* Identitas pemilih dari cookie; buatkan bila belum ada. */
  let vid = cookies.get(VOTER_COOKIE)?.value || "";
  let vidBaruBuat = false;
  if (!sahVid(vid)) {
    vid = vidBaru();
    vidBaruBuat = true;
  }

  let hasil: any;
  try {
    hasil = simpanFavorit(kind, id, stars, vid);
  } catch {
    /* Jatuh kembali ke jalur lama bila identitas bermasalah. */
    try {
      const leg = simpanVote(kind, id, stars, prev);
      hasil = { hasil: leg, lama: null, favorit: null };
    } catch {
      recordFailure(keys);
      return json({ ok: false }, 400);
    }
  }

  if (vidBaruBuat) {
    const secure = url.protocol === "https:";
    cookies.set(VOTER_COOKIE, vid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return json({
    ok: true,
    avg: hasil.hasil.avg,
    votes: hasil.hasil.votes,
    lama: hasil.lama,
    favorit: hasil.favorit,
  });
};
