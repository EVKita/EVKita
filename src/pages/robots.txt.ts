import type { APIRoute } from "astro";
import { siteOrigin } from "../lib/site-url";

/**
 * Dirakit saat diminta, bukan berkas statis, karena satu baris di dalamnya —
 * alamat peta situs — bergantung pada domain tempat situs ini dipasang.
 */
export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);

  const body = [
    "User-agent: *",
    // Panel dan wizard tidak punya alasan untuk diindeks, dan mengindeksnya
    // justru mengundang persis lalu lintas otomatis yang paling tidak
    // diinginkan di halaman masuk.
    "Disallow: /admin",
    "Disallow: /install",
    "Disallow: /api/",
    "Allow: /api/uploads/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
