import type { MiddlewareHandler } from "astro";
import { bacaIntegrasi } from "./lib/integrasi-simpan";
import { hostCsp } from "./lib/integrasi.js";
import { catatKunjungan } from "./lib/trafik-rekam";
import { SESSION_COOKIE } from "./lib/auth";

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
const CSP_DASAR = [
  "default-src 'self'",
  // Google Fonts dipakai Base.astro; berkas fontnya datang dari gstatic.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline'",
  /*
   * Gambar kendaraan sekarang disimpan sendiri di `public/gambar/`, dan baris
   * ini dulu ditandai sebagai yang pertama harus diperketat begitu itu terjadi.
   * Ia tetap TIDAK diperketat, dan alasannya sudah berbeda dari sebelumnya:
   *
   *   1. Panel memang membolehkan penyunting menempelkan URL gambar dari mana
   *      saja — itu fitur, bukan celah. Mengunci ke 'self' mengubahnya jadi
   *      kotak kosong tanpa penjelasan apa pun selain galat di konsol.
   *   2. Dua kendaraan gambarnya tidak bisa diambil ulang dan masih memakai
   *      URL aslinya (lihat tests/gambar.test.ts).
   *   3. Video masih seluruhnya dari domain pabrikan; `media-src` karena itu
   *      juga belum bisa dikunci.
   *
   * Yang sudah didapat tanpa mengubah baris ini nyata dan tidak bergantung
   * padanya: 38 dari 40 gambar tidak lagi memanggil domain pihak ketiga sama
   * sekali, jadi alamat IP pembaca tidak lagi dibagikan ke 24 domain.
   */
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/**
 * CSP halaman publik, yang MENGIKUTI integrasi yang menyala.
 *
 * Google Analytics dan AdSense memuat skrip dari domain Google, dan CSP dasar
 * di atas melarang skrip dari domain mana pun selain sendiri. Tanpa pelonggaran
 * ini, memasang keduanya lewat halaman Integrasi akan "berhasil disimpan" lalu
 * diam-diam diblokir peramban — kegagalan yang hanya terlihat di konsol
 * pembaca, tidak pernah di panel.
 *
 * Yang dilonggarkan hanya domain milik fitur yang benar-benar dinyalakan
 * (lihat `hostCsp()` di integrasi.js), dan hanya untuk halaman publik: panel,
 * halaman masuk, dan wizard pemasangan tidak pernah memuat tag itu, jadi tidak
 * ada alasan CSP-nya ikut longgar.
 */
function cspUntuk(pathname: string): string {
  const panel = /^\/(admin|install|api)(\/|$)/.test(pathname);
  if (panel) return CSP_DASAR.join("; ");

  const extra = hostCsp(bacaIntegrasi());
  if (!extra.script.length && !extra.frame.length && !extra.connect.length) {
    return CSP_DASAR.join("; ");
  }

  const tambah = (baris: string, host: string[]) =>
    host.length ? `${baris} ${host.join(" ")}` : baris;

  return CSP_DASAR.map((baris) => {
    if (baris.startsWith("script-src")) return tambah(baris, extra.script);
    if (baris.startsWith("connect-src")) return tambah(baris, extra.connect);
    // Iklan digambar di dalam iframe. Tanpa baris ini, `default-src 'self'`
    // yang berlaku, dan setiap slot iklan tampil sebagai kotak kosong.
    if (baris.startsWith("object-src") && extra.frame.length) {
      return `frame-src ${extra.frame.join(" ")}; ${baris}`;
    }
    return baris;
  }).join("; ");
}

/**
 * Kunjungan yang layak masuk statistik.
 *
 * Empat saringan, semuanya di sini supaya `trafik-rekam.ts` tidak perlu tahu
 * apa pun tentang bentuk permintaan HTTP:
 *
 *   - hanya GET yang berhasil dan benar-benar mengembalikan halaman HTML
 *     (aset, API, dan 404 tidak ikut);
 *   - bukan pratinjau draf — itu penyunting yang sedang memeriksa
 *     pekerjaannya sendiri, bukan pembaca;
 *   - bukan orang yang sedang masuk ke panel, dengan alasan yang sama;
 *   - sisanya disaring `rapikanPath()`, yang membuang /admin, /api, dan
 *     apa pun yang berupa berkas.
 */
function layakDicatat(context: Parameters<MiddlewareHandler>[0], response: Response): boolean {
  if (context.request.method !== "GET") return false;
  if (response.status >= 400) return false;
  if (!(response.headers.get("Content-Type") || "").includes("text/html")) return false;
  if (context.url.searchParams.has("pratinjau")) return false;
  if (context.cookies.get(SESSION_COOKIE)?.value) return false;
  return true;
}

function alamatKlien(context: Parameters<MiddlewareHandler>[0]): string {
  try {
    return context.clientAddress || "";
  } catch {
    return "";
  }
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const response = await next();

  const h = response.headers;

  // JANGAN menimpa CSP yang sudah dipasang rute lain. `/api/uploads` menyajikan
  // SVG lama dengan `sandbox`, dan CSP umum di atas justru MENGIZINKAN skrip
  // sebaris — menimpanya berarti membuka kembali celah yang baru saja ditutup.
  if (!h.has("Content-Security-Policy")) {
    h.set("Content-Security-Policy", cspUntuk(context.url.pathname));
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

  /*
   * Statistik kunjungan. Hanya menambah angka di memori — berkasnya ditulis
   * paling cepat sepuluh detik sekali, di luar jalur permintaan ini.
   *
   * Alamat IP dipakai sekejap untuk menghitung pengunjung unik lalu hilang;
   * yang tersimpan cuma sidik ber-garam harian, dan itu pun dibuang begitu
   * harinya berganti. Lihat src/lib/trafik-rekam.ts.
   */
  if (layakDicatat(context, response)) {
    const diteruskan = context.request.headers.get("x-forwarded-for") || "";
    catatKunjungan({
      pathname: context.url.pathname,
      referrer: context.request.headers.get("referer"),
      userAgent: context.request.headers.get("user-agent"),
      /*
       * Alamat yang diteruskan reverse proxy lebih dulu — sama seperti
       * `clientKey()` di ratelimit.ts. Tanpa itu SETIAP pembaca datang dari
       * 127.0.0.1 di mata aplikasi, dan seluruh situs terhitung satu pengunjung.
       *
       * `clientAddress` dibungkus try/catch karena Astro melemparkannya pada
       * halaman yang dirender saat build; statistik tidak boleh menjatuhkan
       * apa pun, apalagi build.
       */
      ip: diteruskan.split(",")[0]?.trim() || alamatKlien(context),
      host: context.url.hostname,
    });
  }

  return response;
};
