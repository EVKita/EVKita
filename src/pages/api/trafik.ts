import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { json } from "../../lib/api";
import { unauthorized } from "../../lib/api";
import { bacaBulan, bacaRentang, daftarBulan } from "../../lib/trafik-rekam";
import { hariWib, selisihPersen } from "../../lib/trafik.js";

/**
 * Statistik kunjungan untuk panel Analitik.
 *
 * Terbuka untuk semua yang sudah masuk, termasuk Editor. Ini bukan alat audit
 * seperti log aktivitas — tidak ada nama, tidak ada alamat IP, tidak ada satu
 * pun jejak per orang di dalamnya. Yang ada cuma "halaman mana yang dibaca",
 * dan justru penyunting yang paling bisa berbuat sesuatu dengan jawaban itu.
 */

/** Rentang yang boleh diminta. Angka bebas dari klien berarti pembacaan berkas tanpa batas. */
const RENTANG = [7, 14, 30, 90];

export const GET: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  const bulan = String(url.searchParams.get("bulan") || "");
  const bulanTersedia = daftarBulan();

  if (bulan) {
    if (!/^\d{4}-\d{2}$/.test(bulan)) return json({ ok: false, errorKey: "err.badJson" }, 400);
    return json({
      ok: true,
      mode: "bulan",
      bulan,
      bulanTersedia,
      hariIni: hariWib(),
      sekarang: bacaBulan(bulan),
      // Satu bulan tidak dibandingkan dengan apa pun: perbandingan yang jujur
      // butuh dua rentang sama panjang, dan Februari bukan Maret.
      beda: null,
    });
  }

  const minta = Number(url.searchParams.get("hari"));
  const hari = RENTANG.includes(minta) ? minta : 30;
  const { sekarang, sebelum } = bacaRentang(hari);

  return json({
    ok: true,
    mode: "rentang",
    hari,
    pilihanHari: RENTANG,
    bulanTersedia,
    hariIni: hariWib(),
    sekarang,
    beda: {
      tampilan: selisihPersen(sekarang.total.tampilan, sebelum.total.tampilan),
      pengunjung: selisihPersen(sekarang.total.pengunjung, sebelum.total.pengunjung),
      sebelum: sebelum.total,
    },
  });
};
