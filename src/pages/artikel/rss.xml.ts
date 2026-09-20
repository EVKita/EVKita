import type { APIRoute } from "astro";
import { readContent } from "../../lib/store";
import { siteOrigin } from "../../lib/site-url";
import { artikelTayang, hrefArtikel, ringkasArtikel, tanggalArtikel } from "../../lib/artikel.js";

/**
 * Umpan RSS artikel orisinal.
 *
 * Situs ini sudah punya peta situs, jadi mengapa RSS? Karena keduanya menjawab
 * pertanyaan yang berbeda: peta situs memberi tahu perayap APA yang ada, umpan
 * memberi tahu pembaca dan agregator apa yang BARU. Umpan juga satu-satunya
 * kanal yang bisa berlangganan tanpa akun dan tanpa algoritma.
 *
 * Yang masuk hanya `content.artikel` — koleksi `berita` sengaja tidak ikut:
 * isinya tautan ke penerbit lain, dan mengirimkan ulang tulisan orang lewat
 * umpan kami bukan hal yang pantas dilakukan.
 */
export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);
  const content = readContent();
  const site = content.site || {};
  const brand = site.brandText || "EVKita";
  const brandFull = `${brand}${site.brandSuffix || ""}`;

  const daftar = artikelTayang(content.artikel).slice(0, 30);

  const escapeXml = (s: unknown) =>
    String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  /** RFC 822, format tanggal yang diminta spesifikasi RSS 2.0. */
  const pubDate = (artikel: any) => {
    const tanggal = tanggalArtikel(artikel);
    if (!tanggal) return "";
    const d = new Date(`${tanggal}T07:00:00+07:00`);
    return Number.isNaN(d.getTime()) ? "" : d.toUTCString();
  };

  const items = daftar
    .map((a: any) => {
      const link = `${origin}${hrefArtikel(a)}`;
      return `  <item>
    <title>${escapeXml(a.title)}</title>
    <link>${escapeXml(link)}</link>
    <guid isPermaLink="true">${escapeXml(link)}</guid>
    ${pubDate(a) ? `<pubDate>${escapeXml(pubDate(a))}</pubDate>` : ""}
    ${a.author ? `<dc:creator>${escapeXml(a.author)}</dc:creator>` : ""}
    ${a.category ? `<category>${escapeXml(a.category)}</category>` : ""}
    <description>${escapeXml(ringkasArtikel(a))}</description>
  </item>`;
    })
    .join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `<channel>\n` +
    `  <title>Artikel ${escapeXml(brandFull)}</title>\n` +
    `  <link>${escapeXml(`${origin}/artikel`)}</link>\n` +
    `  <description>${escapeXml(
      `Artikel dan panduan kendaraan listrik di Indonesia dari ${brand}. Setiap klaim mencantumkan sumbernya.`
    )}</description>\n` +
    `  <language>id-ID</language>\n` +
    `  <atom:link href="${escapeXml(`${origin}/artikel/rss.xml`)}" rel="self" type="application/rss+xml" />\n` +
    (items ? `${items}\n` : "") +
    `</channel>\n</rss>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Sama dengan peta situs: cukup untuk meredam permintaan berulang, cukup
      // singkat supaya artikel yang baru terbit cepat muncul di pembaca.
      "Cache-Control": "public, max-age=1800",
    },
  });
};
