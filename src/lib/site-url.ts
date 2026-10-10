import { normalizeLangParam } from "./i18n/pub.js";

/**
 * URL kanonis situs.
 *
 * Situs ini dipasang sendiri di domain mana pun, jadi alamatnya tidak bisa
 * ditentukan saat build — ia harus dibaca dari permintaan yang sedang berjalan.
 * `astro.config.mjs` sudah mempercayai header Host yang diteruskan reverse
 * proxy (lihat catatan `allowedDomains` di sana), jadi `Astro.url` sudah berisi
 * skema dan domain yang sebenarnya.
 *
 * Dua aturan query string:
 *
 *   - Filter katalog (`?merek=`, `?urut=`, `?banding=`) tetap dibuang: tanpa
 *     kanonis, beranda yang sama bisa terindeks dalam puluhan varian yang
 *     saling mengencerkan peringkatnya sendiri.
 *   - `?lang=en` / `?lang=zh` DIPERTAHANKAN: itulah URL bahasa yang diumumkan
 *     ke Google/Baidu lewat `hreflang` dan peta situs. Versi bahasa yang
 *     kanonisnya dibuang tidak akan pernah terindeks sebagai halaman sendiri.
 */

/** `https://evkita.com` — tanpa garis miring di akhir. */
export function siteOrigin(url: URL): string {
  return url.origin;
}

/** `https://evkita.com/mobil/byd-seal` — tanpa query, kecuali `?lang=`. */
export function canonicalUrl(url: URL): string {
  const dasar = `${url.origin}${url.pathname}`;
  const lang = normalizeLangParam(url.searchParams.get("lang"));
  if (lang && lang !== "id") return `${dasar}?lang=${lang}`;
  return dasar;
}

/**
 * Tiga URL absolut untuk tag `hreflang`. Indonesia adalah bawaan tanpa
 * parameter; Inggris dan Mandarin punya parameternya masing-masing.
 */
export function alternateLangUrls(url: URL): { id: string; en: string; zh: string } {
  const dasar = `${url.origin}${url.pathname}`;
  return { id: dasar, en: `${dasar}?lang=en`, zh: `${dasar}?lang=zh` };
}

/** Menyusun URL absolut dari path relatif. */
export function absoluteUrl(url: URL, path: string): string {
  return new URL(path, url.origin).href;
}
