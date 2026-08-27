/**
 * Penyaring skema URL bersama.
 *
 * Nilai seperti `website`, `mapUrl`, dan `url` berita adalah teks bebas yang
 * diketik dari panel — termasuk oleh peran Editor. Pengubah HTML (`esc`) hanya
 * mengurus tanda kutip; ia tidak tahu apa-apa soal skema, jadi
 * `javascript:alert(1)` lolos utuh ke dalam atribut `href` dan berjalan saat
 * ditekan. Berkas ini yang menutupnya, di satu tempat.
 *
 * Sengaja JavaScript polos tanpa API khusus Node, supaya berkas yang sama bisa
 * dipakai empat tempat: frontmatter `.astro` (dirender server), `markdown.ts`,
 * serta `app.js` dan `admin.js` yang berjalan di browser.
 */

/**
 * Skema yang boleh lewat. `\/(?!\/)` menerima tautan internal (`/mobil/x`)
 * tapi menolak bentuk protokol-relatif (`//situs-lain.com`), yang terlihat
 * seperti tautan internal padahal membawa pembaca keluar situs.
 */
const ALLOWED = /^(?:https?:|mailto:|tel:|data:image\/|\/(?!\/)|\.\/|#)/i;

/**
 * Mengembalikan URL-nya kalau skemanya aman, atau string kosong kalau tidak.
 * Pemanggil yang menyusun HTML sebagai teks tetap wajib mengubahnya lewat
 * `esc()` setelah ini — dua hal yang berbeda, keduanya perlu.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeUrl(value) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) return "";

  // Peramban mengabaikan karakter kendali yang disisipkan di tengah skema, jadi
  // `java\tscript:` tetap dieksekusi. Buang dulu sebelum memeriksa — dan
  // kembalikan versi yang sudah bersih, bukan aslinya.
  const clean = raw.replace(/[\u0000-\u0020\u007F]/g, "");
  if (!clean) return "";

  return ALLOWED.test(clean) ? clean : "";
}
