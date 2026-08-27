import type { APIRoute } from "astro";
import { readContent } from "../lib/store";
import { siteOrigin } from "../lib/site-url";
import { comparePairs } from "../lib/compare-pairs.js";
import { PER_PAGE, pageCount, pageHref } from "../lib/pagination.js";
import { groupByField } from "../lib/taxonomy.js";
import { vehicleHref } from "../lib/card-html.js";

/**
 * Peta situs yang dirakit saat diminta, bukan saat build.
 *
 * Konten situs ini hidup di `data/content.json` dan berubah lewat panel admin,
 * tanpa build ulang. Peta situs statis akan basi begitu satu mobil ditambahkan.
 *
 * Kendaraan berstatus draft sengaja tidak masuk — sama seperti di halaman
 * publik. Mengumumkan URL yang menjawab 404 lebih buruk daripada tidak
 * mengumumkannya sama sekali.
 */
export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);
  const content = readContent();
  const isLive = (v: any) => v && v.status !== "draft";

  const entries: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/kalkulator/hemat-listrik-vs-bensin`, priority: "0.7" },
  ];

  const liveCars = (content.cars || []).filter(isLive);
  /* Saklar "tampilkan motor" mematikan seluruh sisi publik motor. Peta situs
     harus ikut diam, bukan mengumumkan alamat yang menjawab 404. */
  const liveMotors = content.site.showMotor ? (content.motors || []).filter(isLive) : [];
  const semua = [...liveCars, ...liveMotors];

  // Setiap halaman katalog diumumkan sendiri-sendiri: itulah satu-satunya cara
  // perayap sampai ke mobil ke-13 dan seterusnya tanpa menjalankan JavaScript.
  for (let hal = 1; hal <= pageCount(liveCars.length, PER_PAGE); hal++) {
    entries.push({ loc: `${origin}${pageHref(hal)}`, priority: hal === 1 ? "0.9" : "0.6" });
  }

  // Alamat halaman detail berasal dari `vehicleHref()`, satu-satunya tempat
  // yang tahu bahwa motor tinggal di `/motor/`. Menyusunnya sendiri di sini
  // berarti peta situs bisa berselisih dengan tautan di halamannya.
  for (const v of semua) {
    entries.push({
      loc: `${origin}${vehicleHref(v)}`,
      lastmod: v.updatedAt || undefined,
      priority: "0.8",
    });
  }

  /*
   * Halaman merek dan tipe bodi.
   *
   * Inilah yang menjawab "mobil listrik BYD" dan "SUV listrik" — pertanyaan
   * yang bentuknya jauh lebih sering diketik daripada nama satu model. Daftar
   * kelompoknya diturunkan dari datanya sendiri, jadi merek yang baru
   * ditambahkan lewat panel langsung ikut diumumkan tanpa ada yang perlu
   * ingat memperbarui berkas ini.
   */
  for (const [basis, field] of [["merek", "brand"], ["tipe", "bodyType"]] as const) {
    entries.push({ loc: `${origin}/${basis}`, priority: "0.7" });
    for (const g of groupByField(semua, field)) {
      entries.push({ loc: `${origin}/${basis}/${encodeURIComponent(g.slug)}`, priority: "0.7" });
    }
  }

  /*
   * Halaman perbandingan.
   *
   * Sengaja BUKAN semua pasangan yang mungkin: 28 mobil berarti 378 halaman,
   * dan hampir semuanya menyandingkan kendaraan yang tidak pernah ditimbang
   * bersamaan oleh siapa pun. Yang diumumkan hanya beberapa lawan terdekat
   * tiap mobil — bentuk bodi yang sama, harga yang berdekatan — karena itulah
   * perbandingan yang benar-benar dicari orang.
   *
   * Motor kini ikut: sebelumnya ia sengaja dilewati karena halaman detailnya
   * belum ada, sehingga setiap tautan perbandingan berujung di pengalihan.
   * Alasan itu hilang begitu `/motor/<slug>` lahir.
   *
   * Mobil dan motor dipasangkan TERPISAH. Menyandingkan mobil dengan skuter
   * memang menghasilkan halaman yang sah, tapi bukan perbandingan yang pernah
   * ditimbang siapa pun — dan mengumumkannya hanya menghabiskan jatah
   * perayapan.
   */
  for (const pool of [liveCars, liveMotors]) {
    for (const pair of comparePairs(pool, 3)) {
      entries.push({ loc: `${origin}/bandingkan/${encodeURIComponent(pair.slug)}`, priority: "0.6" });
    }
  }

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) => {
        const lastmod = e.lastmod ? `\n    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : "";
        return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n    <priority>${e.priority}</priority>\n  </url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Satu jam: cukup untuk meredam perayapan berulang, cukup singkat supaya
      // mobil yang baru ditambahkan tidak menunggu lama untuk ditemukan.
      "Cache-Control": "public, max-age=3600",
    },
  });
};
