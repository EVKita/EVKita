// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

/**
 * `noExternal` di bawah hanya relevan saat MEM-BUILD paket rilis. Menyalakannya
 * juga di `astro dev` memaksa Vite memproses seluruh dependensi Astro sendiri,
 * dan salah satunya (`cookie`, yang masih CommonJS) gagal dimuat di graf modul
 * middleware — `npm run dev` menjawab 500 di setiap halaman, sementara build
 * produksi baik-baik saja. Gejala seperti itu paling mahal: yang rusak justru
 * lingkungan tempat orang bekerja.
 */
const sedangBuild = process.argv.includes("build");

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),

  server: {
    /**
     * `astro dev` tidak membaca PORT sendiri — kalau 4321 sedang dipakai ia
     * diam-diam pindah ke 4322, dan siapa pun yang menunggu di alamat yang
     * mereka tentukan menemukan halaman kosong. Server produksi
     * (`dist/server/entry.mjs`) sudah membaca PORT, jadi baris ini membuat
     * keduanya berperilaku sama. Tanpa PORT, angkanya tetap 4321 seperti dulu.
     */
    port: Number(process.env.PORT) || 4321,
  },

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
      //
      // Hanya saat build: lihat catatan di atas berkas ini.
      // Daftar kosong, bukan `false`: Vite mengharapkan `true` atau daftar
      // pola, dan `false` membuatnya mencoba memperlakukan nilai itu sebagai
      // nama berkas.
      noExternal: sedangBuild ? true : [],
    },
  },
});
