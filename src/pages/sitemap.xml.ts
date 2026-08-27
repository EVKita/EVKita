import type { APIRoute } from "astro";
import { readContent } from "../lib/store";
import { siteOrigin } from "../lib/site-url";

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
  ];

  for (const car of (content.cars || []).filter(isLive)) {
    entries.push({
      loc: `${origin}/mobil/${encodeURIComponent(car.id)}`,
      lastmod: car.updatedAt || undefined,
      priority: "0.8",
    });
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
