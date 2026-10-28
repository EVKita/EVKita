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
  lines.push("# EVKita (versi lengkap)");
  lines.push("");
  lines.push("> Basis data kendaraan listrik yang dijual di Indonesia.");
  lines.push("");

  lines.push("## Kendaraan");
  for (const v of [...cars, ...motors]) {
    const bits = [v.brand, v.name];
    if (v.price) bits.push(`harga ${v.price}`);
    if (v.range) bits.push(`jarak ${v.range} km`);
    if (v.battery) bits.push(`baterai ${v.battery} kWh`);
    if (v.power) bits.push(`tenaga ${v.power} kW`);
    lines.push(`- [${v.brand} ${v.name}](${origin}${vehicleHref(v)}) — ${bits.slice(2).join(", ")}`);
  }

  lines.push("");
  lines.push("## Artikel");
  for (const a of artikel) {
    const h = hrefArtikel(a);
    if (!h) continue;
    lines.push(`### ${a.title}`);
    lines.push(`URL: ${origin}${h}`);
    if (a.summary) lines.push(a.summary);
    if (a.body) lines.push(String(a.body).slice(0, 1500));
    const srcs = Array.isArray(a.sources) ? a.sources : [];
    if (srcs.length) {
      lines.push("Sumber:");
      for (const s of srcs) lines.push(`- ${s.label}: ${s.url}`);
    }
    lines.push("");
  }

  lines.push("## Halaman");
  for (const h of laman) {
    const href = hrefLaman(h);
    if (!href) continue;
    lines.push(`- [${h.title}](${origin}${href})`);
  }

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
