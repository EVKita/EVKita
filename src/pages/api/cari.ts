import type { APIRoute } from "astro";
import { readContent } from "../../lib/store";
import { terjemahContent } from "../../lib/terjemahan.js";
import { vehicleHref, priceLabel } from "../../lib/card-html.js";
import { groupByField, summarize, countPhrase } from "../../lib/taxonomy.js";
import { hanyaTayang } from "../../lib/tayang.js";
import { hrefLaman, labelFooter } from "../../lib/laman.js";
import { artikelTayang, hrefArtikel } from "../../lib/artikel.js";
import { makePubT, normalizePubLocale, cmsSite } from "../../lib/i18n/pub.js";

/**
 * Indeks pencarian situs untuk kotak cari di header.
 *
 * Satu unduhan kecil (± belasan KB) berisi semua yang bisa dicari —
 * kendaraan, merek, halaman statis, artikel, dan menu utama — lalu
 * penyaringannya jalan di peramban setiap kali pengunjung mengetik. Tanpa
 * perjalanan jaringan per ketikan: hasilnya seketika di HP mana pun, dan
 * server tidak dibanjiri permintaan autocomplete.
 *
 * `?lang=` melokalkan labelnya (bagian situs mengikuti bahasa yang dipilih
 * pembaca). Isinya selalu segar dari `content.json`, jadi model yang baru
 * ditambahkan lewat panel langsung bisa ditemukan tanpa build ulang.
 *
 * Sengaja TANPA autentikasi — isinya memang semua halaman publik. Yang
 * diikutkan hanya yang tayang (aturan yang sama dengan peta situs): draf dan
 * yang `noindex` tidak ikut.
 */
export const GET: APIRoute = async ({ url }) => {
  const lang = normalizePubLocale(url.searchParams.get("lang"));
  const t = makePubT(lang);

  const content = await terjemahContent(readContent(), lang);
  const site = cmsSite(content.site, lang);

  const cars = (content.cars || []).filter(hanyaTayang());
  const motors = site.showMotor ? (content.motors || []).filter(hanyaTayang()) : [];
  const semua = [...cars, ...motors];

  const kendaraan = semua.map((v: any) => ({
    brand: v.brand || "",
    name: v.name || "",
    body: v.bodyType || "",
    meta: [v.rangeKm != null ? `${v.rangeKm} km` : "", priceLabel(v, lang)].filter(Boolean).join(" · "),
    image: v.image || "",
    url: vehicleHref(v),
  }));

  const merek = groupByField(semua, "brand").map((g) => ({
    label: g.label,
    meta: countPhrase(summarize(g.items), t),
    url: `/merek/${encodeURIComponent(g.slug)}`,
  }));

  /* Menu dan halaman: labelnya mengikuti bahasa, kata kuncinya dua bahasa
     (Indonesia + label itu sendiri) supaya tetap ketemu disilang bahasa. */
  const bagian: { label: string; kunci: string; meta: string; url: string }[] = [
    { label: t("pub.katalog"), kunci: "katalog mobil", meta: "", url: "/katalog" },
  ];
  if (site.showMotor) {
    bagian.push({ label: t("pub.katalogMotor.judul"), kunci: "katalog motor", meta: "", url: "/katalog-motor" });
  }
  if (site.showSpklu) {
    bagian.push({ label: t("pub.nav.spklu"), kunci: "spklu cas charger stasiun pengisian", meta: "", url: "/spklu" });
  }
  if (site.showBengkel) {
    bagian.push({ label: t("pub.nav.bengkel"), kunci: "bengkel servis service perawatan", meta: "", url: "/bengkel" });
  }
  if (site.showBerita) {
    bagian.push({ label: t("pub.nav.berita"), kunci: "berita komunitas kabar", meta: "", url: "/berita" });
  }
  if (artikelTayang(content.artikel).length) {
    bagian.push({ label: t("pub.nav.artikel"), kunci: "artikel panduan edukasi", meta: "", url: "/artikel" });
  }
  bagian.push(
    { label: t("pub.kalk.titleHemat"), kunci: "kalkulator hemat bensin bbm hitung", meta: "", url: "/kalkulator/hemat-listrik-vs-bensin" },
    { label: t("pub.kalk.titleBiaya"), kunci: "kalkulator biaya pengisian cas hitung", meta: "", url: "/kalkulator/biaya-pengisian" },
  );

  /* Halaman statis (Tentang, Kebijakan Privasi, …) dan artikel orisinal. */
  const halaman = [
    ...bagian,
    ...(content.halaman || [])
      .filter(hanyaTayang())
      .filter((l: any) => !l.noindex && hrefLaman(l) && labelFooter(l))
      .map((l: any) => ({ label: labelFooter(l), kunci: "", meta: "", url: hrefLaman(l) })),
    ...(artikelTayang(content.artikel) || [])
      .filter((a: any) => !a.noindex && hrefArtikel(a) && a.title)
      .map((a: any) => ({ label: String(a.title), kunci: "", meta: "", url: hrefArtikel(a) })),
  ];

  return new Response(JSON.stringify({ kendaraan, merek, halaman }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Lima menit: cukup untuk meredam unduhan berulang, cukup singkat
      // supaya model yang baru ditambahkan tidak menunggu lama untuk dicari.
      "Cache-Control": "public, max-age=300",
    },
  });
};
