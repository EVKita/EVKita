import type { APIRoute } from "astro";
import { siteOrigin } from "../lib/site-url";

/**
 * Dirakit saat diminta, bukan berkas statis, karena satu baris di dalamnya —
 * alamat peta situs — bergantung pada domain tempat situs ini dipasang.
 */
export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);

  /*
   * Perayap China disebut eksplisit satu per satu. `User-agent: *` sebenarnya
   * sudah mencakup mereka, tapi dokumentasi Baidu/360/Sogou meminta blok
   * bernama — dan tanpa blok bernama, verifikasi kepemilikan di Baidu Webmaster
   * kadang menolak sebelum sitemap sempat dibaca. Aturannya sama untuk semua:
   * panel, wizard, dan API tertutup; gambar unggahan tetap terbuka (dipakai
   * kartu berita); peta situs diumumkan di setiap blok supaya dibaca dari
   * mana pun perayap masuk.
   */
  const perayap = [
    "*",
    // Mesin pencari tradisional
    "Googlebot",
    "Bingbot",
    "Baiduspider",
    "Baiduspider-render",
    "360Spider",
    "Sogou",
    "Yisouspider",
    // AI / Generative Engine crawlers (GEO): 10+ mesin AI favorit per regional
    "GPTBot",
    "ChatGPT-User",
    "OAI-SearchBot",
    "ClaudeBot",
    "Claude-Web",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Gemini",
    "Copilot",
    "BingPreview",
    "YouBot",
    "Meta-ExternalAgent",
    "FacebookBot",
    "Applebot-Extended",
    "Amazonbot",
    "cohere-ai",
    "Diffbot",
    "DuckAssistBot",
    "MistralAI-User",
    "Bytespider",
  ];

  const blok = perayap
    .map((agen) =>
      [
        `User-agent: ${agen}`,
        // Panel dan wizard tidak punya alasan untuk diindeks, dan mengindeksnya
        // justru mengundang persis lalu lintas otomatis yang paling tidak
        // diinginkan di halaman masuk.
        "Disallow: /admin",
        "Disallow: /install",
        "Disallow: /api/",
        "Allow: /api/uploads/",
        "",
      ].join("\n")
    )
    .join("\n");

  const body = `${blok}# GEO: ringkasan untuk mesin AI generatif\n# LLMs-Txt: ${origin}/llms.txt\nSitemap: ${origin}/sitemap.xml\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
