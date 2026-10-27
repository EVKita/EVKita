import type { APIRoute } from "astro";
import { readContent } from "../lib/store";
import { siteOrigin } from "../lib/site-url";
import { hanyaTayang } from "../lib/tayang.js";
import { hrefArtikel } from "../lib/artikel.js";
import { hrefLaman } from "../lib/laman.js";
import { vehicleHref } from "../lib/card-html.js";

export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);
  const content = readContent();
  const cars = (content.cars || []).filter(hanyaTayang());
  const motors = content.site?.showMotor ? (content.motors || []).filter(hanyaTayang()) : [];
  const artikel = (content.artikel || []).filter(hanyaTayang());
  const laman = (content.halaman || []).filter(hanyaTayang());

  const lines: string[] = [];
  lines.push("# EVKita");
  lines.push("");
  lines.push("> Basis data kendaraan listrik yang dijual di Indonesia: spesifikasi, jarak tempuh, baterai, tenaga, dan harga. Dilengkapi berita, artikel orisinal, perbandingan, kalkulator, dan direktori SPKLU/bengkel.");
  lines.push("");
  lines.push("## Situs");
  lines.push(`- [Beranda](${origin}/)`);
  lines.push(`- [Edisi Amerika](${origin}/amerika)`);
  lines.push(`- [Edisi China](${origin}/china)`);
  lines.push(`- [Katalog Mobil](${origin}/katalog)`);
  if (content.site?.showMotor) lines.push(`- [Katalog Motor](${origin}/katalog-motor)`);
  lines.push(`- [Berita](${origin}/berita)`);
  lines.push(`- [Artikel](${origin}/artikel)`);
  lines.push(`- [Perbandingan](${origin}/bandingkan)`);
  lines.push(`- [Kalkulator Hemat](${origin}/kalkulator/hemat-listrik-vs-bensin)`);
  lines.push(`- [Kalkulator Biaya Pengisian](${origin}/kalkulator/biaya-pengisian)`);
  lines.push(`- [SPKLU](${origin}/spklu)`);
  lines.push(`- [Bengkel](${origin}/bengkel)`);
  lines.push(`- [Komunitas](${origin}/komunitas)`);
  lines.push("");
  lines.push("## Kendaraan");
  for (const v of [...cars, ...motors].slice(0, 200)) {
    lines.push(`- [${v.brand} ${v.name}](${origin}${vehicleHref(v)})`);
  }
  lines.push("");
  lines.push("## Artikel");
  for (const a of artikel.slice(0, 100)) {
    const h = hrefArtikel(a);
    if (!h) continue;
    lines.push(`- [${a.title}](${origin}${h})`);
  }
  lines.push("");
  lines.push("## Halaman");
  for (const h of laman) {
    const href = hrefLaman(h);
    if (!href) continue;
    lines.push(`- [${h.title}](${origin}${href})`);
  }
  lines.push("");
  lines.push("## Sumber daya mesin");
  lines.push(`- [Peta situs](${origin}/sitemap.xml)`);
  lines.push(`- [robots.txt](${origin}/robots.txt)`);
  lines.push(`- [Versi lengkap](${origin}/llms-full.txt)`);

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
