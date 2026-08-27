import type { MiddlewareHandler } from "astro";

/**
 * Header keamanan untuk seluruh jawaban.
 *
 * Sebelum ini tidak ada satu pun. Semuanya bersifat pertahanan berlapis: celah
 * yang sesungguhnya sudah ditutup di sumbernya (unggahan SVG, skema `javascript:`
 * di atribut href), tapi lapisan ini yang bekerja kalau suatu hari ada celah
 * baru yang belum ketahuan.
 *
 * Catatan soal `script-src`: nilainya memuat `'unsafe-inline'`, dan itu pilihan
 * yang disengaja, bukan kelalaian. Situs ini punya beberapa skrip sebaris yang
 * memang harus sebaris — penerap tema di `<head>` yang wajib berjalan sebelum
 * render supaya tema tidak berkedip, blok `define:vars` yang membawa teks
 * terjemahan dari server, dan JSON-LD. Memakai nonce berarti menandai semuanya
 * satu per satu, dan satu yang terlewat akan mematikan halamannya di produksi
 * tanpa terlihat saat pengembangan.
 *
 * Yang tetap didapat meski begitu, dan semuanya nyata: skrip dari domain lain
 * tidak bisa dimuat, halaman tidak bisa dibingkai situs lain, `<base>` tidak
 * bisa disisipkan untuk membelokkan seluruh tautan relatif, formulir tidak bisa
 * mengirim ke domain lain, dan `<object>`/`<embed>` mati sepenuhnya.
 */
const CSP = [
  "default-src 'self'",
  // Google Fonts dipakai Base.astro; berkas fontnya datang dari gstatic.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  // Gambar kendaraan saat ini di-hotlink dari domain pabrikan, jadi img-src
  // belum bisa dikunci ke 'self'. Kalau gambar sudah disimpan sendiri, baris
  // ini yang pertama harus diperketat.
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = await next();

  const h = response.headers;

  // JANGAN menimpa CSP yang sudah dipasang rute lain. `/api/uploads` menyajikan
  // SVG lama dengan `sandbox`, dan CSP umum di atas justru MENGIZINKAN skrip
  // sebaris — menimpanya berarti membuka kembali celah yang baru saja ditutup.
  if (!h.has("Content-Security-Policy")) {
    h.set("Content-Security-Policy", CSP);
  }
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");

  // HSTS hanya saat benar-benar lewat HTTPS. Memasangnya di atas HTTP tidak
  // ada gunanya, dan di pengembangan lokal justru mengunci localhost ke HTTPS
  // di peramban selama berbulan-bulan.
  if (context.url.protocol === "https:") {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
};
