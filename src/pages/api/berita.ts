import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { json, unauthorized } from "../../lib/api";
import { perbaruiBerita } from "../../lib/berita-harian";

/**
 * Memicu penarikan berita lebih awal.
 *
 * Penarikan otomatis berjalan sekali sehari lewat middleware; endpoint ini
 * hanya untuk tombol "Perbarui Berita" di dasbor. Isi Berita sama-sama
 * pekerjaan penyunting, jadi tidak ada kemampuan khusus di sini — cukup sudah
 * masuk, sama seperti menambah berita lewat formulir.
 */
export const POST: APIRoute = async ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  const hasil = await perbaruiBerita({ paksa: true });
  /* Gagal total (tak satu pun sumber terbaca) dilaporkan sebagai galat
     supaya panel menampilkan "gagal", bukan "tidak ada berita baru". */
  if (!hasil.dilewati && (hasil as any).error && !(hasil as any).ditambah) {
    return json({ ok: false, ...hasil }, 502);
  }
  return json({ ok: true, ...hasil });
};
