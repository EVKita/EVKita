import type { MiddlewareHandler } from "astro";
import { bacaIntegrasi } from "./lib/integrasi-simpan";
import { hostCsp } from "./lib/integrasi.js";
import { catatKunjungan } from "./lib/trafik-rekam";
import { cari as cariGeo, jadwalkanGeoip } from "./lib/geoip";
import { MEMBER_COOKIE } from "./lib/member.js";
import { jadwalkanBerita } from "./lib/berita-harian";
import { jadwalkanArtikel } from "./lib/artikel-harian";
import { jadwalkanSegar } from "./lib/artikel-segar";
import { jadwalkanModelBaru } from "./lib/model-baru";
import { jadwalkanPeluncuran } from "./lib/peluncuran-rekam";
import { jadwalkanPembaruan } from "./lib/pembaruan-kendaraan";
import { jadwalkanPantauan } from "./lib/pemantau";
import { SESSION_COOKIE } from "./lib/auth";
import { normalizePubLocale, PUB_COOKIE } from "./lib/i18n/pub.js";

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
    // Clerk menjalankan web worker dari `blob:`. Tanpa baris sendiri,
    // `script-src` yang berlaku — dan ia tidak pernah membuka `blob:`.
    if (baris.startsWith("base-uri") && extra.worker.length) {
      return `worker-src ${extra.worker.join(" ")}; ${baris}`;
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

/**
 * Jaring pengaman penjadwalan: interval sekali per proses.
 *
 * Semua `jadwalkan*()` di atas juga dipanggil di setiap permintaan — tapi
 * kalau tidak ada kunjungan yang sampai ke Node (mis. halaman disajikan dari
 * cache reverse proxy, atau lalu lintas sepi), penarikan harian tidak pernah
 * terpicu dan Berita Terkini membeku di tanggal lama tanpa satu pun galat.
 * Interval ini memastikan putaran tetap dicoba tiap 10 menit apa pun yang
 * terjadi di lalu lintas. Idempoten: tiap mesin menjaga dirinya lewat
 * berkas jadwalnya sendiri ("sekali sehari", "sejam sekali"), jadi
 * pemanggilan ganda tidak pernah menarik dua kali.
 *
 * `unref()` itu wajib, bukan hiasan: modul ini ikut dimuat saat `astro build`
 * (prerender), dan interval tanpa unref menahan proses build selamanya.
 * Penanda `globalThis` mencegah interval ganda saat HMR memuat ulang modul
 * di `astro dev`.
 */
const INTERVAL_PENJADWAL_MS = 10 * 60 * 1000;
function mulaiPenjadwalInterval(): void {
  try {
    const g = globalThis as any;
    if (g.__evkitaPenjadwalJalan) return;
    g.__evkitaPenjadwalJalan = true;
    const timer = setInterval(() => {
      try {
        jadwalkanBerita();
        jadwalkanArtikel();
        jadwalkanSegar();
        jadwalkanModelBaru();
        jadwalkanPeluncuran();
        jadwalkanPembaruan();
        jadwalkanPantauan();
        jadwalkanGeoip();
      } catch {
        /* tidak ada yang boleh menjatuhkan proses */
      }
    }, INTERVAL_PENJADWAL_MS);
    const t = timer as any;
    if (t && typeof t.unref === "function") t.unref();
  } catch {
    /* penjadwal yang gagal mulai bukan alasan menjatuhkan apa pun */
  }
}
mulaiPenjadwalInterval();

export const onRequest: MiddlewareHandler = async (context, next) => {  // Bahasa situs publik, dari cookie pilihan pembaca. Dipakai halaman dan
  // komponen lewat `Astro.locals.pubLang` tanpa harus diteruskan sebagai prop.
  context.locals.pubLang = normalizePubLocale(context.cookies.get(PUB_COOKIE)?.value);

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
   * harinya berganti. Pencarian geografi (negara/kota/jaringan) juga dihitung
   * dari IP saat itu juga dan yang disimpan hanya jumlah per kodenya.
   * Lihat src/lib/trafik-rekam.ts dan src/lib/geoip.ts.
   *
   * Pencariannya TIDAK ditunggu: respons pembaca tidak boleh membayar
   * pencarian basis data. Kunjungan beberapa milidetik kemudian tetap
   * tercatat — hanya agregatnya yang bertambah.
   */
  if (layakDicatat(context, response)) {
    const diteruskan = context.request.headers.get("x-forwarded-for") || "";
    /*
     * Alamat yang diteruskan reverse proxy lebih dulu — sama seperti
     * `clientKey()` di ratelimit.ts. Tanpa itu SETIAP pembaca datang dari
     * 127.0.0.1 di mata aplikasi, dan seluruh situs terhitung satu pengunjung.
     *
     * `clientAddress` dibungkus try/catch karena Astro melemparkannya pada
     * halaman yang dirender saat build; statistik tidak boleh menjatuhkan
     * apa pun, apalagi build.
     */
    const ip = diteruskan.split(",")[0]?.trim() || alamatKlien(context);
    const anggota = !!context.cookies.get(MEMBER_COOKIE)?.value;
    const dasar = {
      pathname: context.url.pathname,
      referrer: context.request.headers.get("referer"),
      userAgent: context.request.headers.get("user-agent"),
      ip,
      host: context.url.hostname,
      anggota,
    };
    try {
      void cariGeo(ip).then(
        (g) => catatKunjungan({ ...dasar, ...g }),
        () => catatKunjungan(dasar)
      );
    } catch {
      catatKunjungan(dasar);
    }
  }

  /*
   * Berita harian, draf artikel harian, penyegar artikel tayang, penemuan
   * model baru, dan pemantau model viral. Dipanggil tanpa `await` — semuanya
   * berjalan di latar belakang, sekali sehari, dan tidak boleh memperlambat
   * satu pun permintaan pembaca. Lihat src/lib/berita-harian.ts,
   * src/lib/artikel-harian.ts, src/lib/artikel-segar.ts,
   * src/lib/model-baru.ts, dan src/lib/peluncuran-rekam.ts.
   */
  jadwalkanBerita();
  jadwalkanArtikel();
  jadwalkanSegar();
  jadwalkanModelBaru();
  jadwalkanPeluncuran();
  jadwalkanPembaruan();
  /* Pemantau sinyal per jam: gratis (RSS saja), antrean review di panel. */
  jadwalkanPantauan();

  return response;
};
