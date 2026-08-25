// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),

  security: {
    // Tanpa daftar ini Astro tidak mempercayai header Host sama sekali dan
    // menganggap setiap permintaan datang ke "http://localhost". Akibatnya
    // pemeriksaan origin bawaannya menolak SEMUA unggahan multipart dengan
    // 403, dan Astro.url.protocol tidak pernah "https:".
    //
    // Aplikasi ini dipasang sendiri di domain mana pun, jadi domainnya tidak
    // bisa ditentukan saat build. Pola kosong berarti "cocokkan apa saja",
    // yakni percayai Host yang diteruskan reverse proxy — aman selama proxy
    // (OpenLiteSpeed/Nginx) yang menetapkan header itu, bukan klien.
    //
    // Pertahanan CSRF yang sebenarnya tetap ada di cookie sesi (SameSite=Lax),
    // yang tidak ikut terkirim pada POST lintas situs.
    allowedDomains: [{}],
  },

  image: {
    // Aplikasi ini tidak memakai astro:assets — gambar diunggah lewat
    // /api/upload dan disajikan apa adanya. Layanan bawaan menarik sharp
    // (~20 MB berikut biner libvips) yang tidak pernah dipanggil.
    service: { entrypoint: "astro/assets/services/noop" },
  },

  vite: {
    ssr: {
      // Bundel dependensi runtime ke dalam dist/. Tanpa ini paket rilis harus
      // membawa seluruh toolchain build Astro (TypeScript, Vite, esbuild,
      // sharp, shiki) — 186 MB dan 11.440 berkas yang tidak dipakai server.
      noExternal: true,
    },
  },
});
