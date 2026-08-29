import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";
import { bacaIntegrasi, tulisIntegrasi } from "../../lib/integrasi-simpan";
import { isiAdsTxt, periksa } from "../../lib/integrasi.js";
import { siteOrigin } from "../../lib/site-url";

/**
 * Pengaturan integrasi Google.
 *
 * Berbeda dari kunci API DeepSeek, nilai-nilai di sini memang PUBLIK — id
 * pengukuran GA dan id penayang AdSense tercetak di setiap halaman situs, dan
 * token Search Console memang dipasang supaya bisa dibaca Google. Jadi
 * endpoint ini boleh mengembalikannya apa adanya; yang dijaga adalah siapa yang
 * boleh MENGUBAHnya, dan apakah bentuk nilainya sah.
 */

function muatan(url: URL) {
  const cfg = bacaIntegrasi();
  return {
    ok: true,
    integrasi: cfg,
    /** Alamat yang perlu ditempelkan orang ke Search Console dan AdSense. */
    situs: {
      asal: siteOrigin(url),
      petaSitus: `${siteOrigin(url)}/sitemap.xml`,
      adsTxt: `${siteOrigin(url)}/ads.txt`,
    },
    adsTxtIsi: isiAdsTxt(cfg),
  };
}

export const GET: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "integrasi")) return forbidden();
  return json(muatan(url));
};

export const PUT: APIRoute = async ({ request, cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "integrasi")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson", 400);
  }

  const { nilai, galat } = periksa(body);
  // Galat pertama saja yang dikirim: formulirnya pendek, dan daftar galat
  // beruntun di satu toast lebih sulit dibaca daripada satu kalimat.
  if (galat.length) return apiError(galat[0], 400);

  const sebelum = bacaIntegrasi();
  const sesudah = tulisIntegrasi(nilai);

  /*
   * Yang dicatat hanya LAYANAN MANA yang berubah keadaannya, bukan nilainya.
   * Log aktivitas dibaca sebagai riwayat keputusan ("kapan AdSense
   * dinyalakan?"), dan menuliskan id penayang di sana tidak menambah jawaban
   * apa pun.
   */
  const berubah: string[] = [];
  for (const [kunci, nama] of [["ga", "Analytics"], ["adsense", "AdSense"], ["gsc", "Search Console"]] as const) {
    const aktifSebelum = (sebelum as any)[`${kunci}Aktif`];
    const aktifSesudah = (sesudah as any)[`${kunci}Aktif`];
    const idSebelum = (sebelum as any)[kunci === "gsc" ? "gscToken" : `${kunci}Id`];
    const idSesudah = (sesudah as any)[kunci === "gsc" ? "gscToken" : `${kunci}Id`];
    if (aktifSebelum !== aktifSesudah || idSebelum !== idSesudah) berubah.push(nama);
  }
  if (berubah.length) logActivity(me, "integrasi.update", { layanan: berubah.join(", ") });

  return json(muatan(url));
};
