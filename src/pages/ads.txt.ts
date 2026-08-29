import type { APIRoute } from "astro";
import { bacaIntegrasi } from "../lib/integrasi-simpan";
import { isiAdsTxt } from "../lib/integrasi.js";

/**
 * `/ads.txt` — daftar penayang iklan yang berhak menjual inventaris situs ini.
 *
 * Tanpa berkas ini AdSense menandai situs sebagai "membutuhkan perhatian" dan
 * sebagian pengiklan berhenti menawar, jadi ia bagian dari memasang AdSense,
 * bukan tambahan opsional. Dirakit saat diminta supaya mengganti id penayang
 * di panel langsung berlaku — tidak ada berkas statis yang harus diingat
 * seseorang untuk ikut diperbarui.
 *
 * Saat AdSense mati, jawabannya 404: berkas ads.txt kosong punya arti sendiri
 * di mata perayap Google ("tidak ada yang boleh menjual"), dan itu bukan yang
 * dimaksud oleh situs yang memang belum memasang iklan.
 */
export const GET: APIRoute = () => {
  const isi = isiAdsTxt(bacaIntegrasi());
  if (!isi) return new Response("Not found", { status: 404 });

  return new Response(isi, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
