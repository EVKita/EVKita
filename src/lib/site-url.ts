/**
 * URL kanonis situs.
 *
 * Situs ini dipasang sendiri di domain mana pun, jadi alamatnya tidak bisa
 * ditentukan saat build — ia harus dibaca dari permintaan yang sedang berjalan.
 * `astro.config.mjs` sudah mempercayai header Host yang diteruskan reverse
 * proxy (lihat catatan `allowedDomains` di sana), jadi `Astro.url` sudah berisi
 * skema dan domain yang sebenarnya.
 *
 * Yang dibuang di sini adalah query string, dan itu yang penting: `app.js`
 * menulis status filter ke URL (`?merek=`, `?urut=`, `?banding=`), sehingga
 * tanpa kanonis, beranda yang sama bisa terindeks dalam puluhan varian yang
 * saling mengencerkan peringkatnya sendiri.
 */

/** `https://evkita.com` — tanpa garis miring di akhir. */
export function siteOrigin(url: URL): string {
  return url.origin;
}

/** `https://evkita.com/mobil/byd-seal` — tanpa query, tanpa fragmen. */
export function canonicalUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

/** Menyusun URL absolut dari path relatif. */
export function absoluteUrl(url: URL, path: string): string {
  return new URL(path, url.origin).href;
}
