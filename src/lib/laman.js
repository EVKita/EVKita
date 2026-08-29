/**
 * Halaman statis: Tentang, Kebijakan Privasi, Disclaimer, dan sejenisnya.
 *
 * Sebelum berkas ini ada, satu-satunya teks bebas milik pemilik situs adalah
 * seksi "Tentang" di beranda — satu judul dan satu paragraf, tanpa alamat
 * sendiri. Akibatnya tidak ada satu pun halaman yang bisa dirujuk ketika
 * dibutuhkan: kebijakan privasi diminta AdSense dan Analytics, disclaimer
 * diminta pembaca yang menganggap harga di katalog sebagai penawaran resmi,
 * dan "Tentang" yang hanya berupa jangkar `#tentang` tidak pernah muncul
 * sebagai hasil pencarian tersendiri.
 *
 * Tiga keputusan yang membentuk berkas ini:
 *
 *   1. **Satu halaman = satu alamat di akar situs** (`/kebijakan-privasi`),
 *      bukan `/halaman/kebijakan-privasi`. Alamat itulah bentuk yang dikenali
 *      orang dan mesin pencari, dan awalan yang tidak berarti apa-apa hanya
 *      memanjangkan setiap tautan. Harganya: slug halaman bertabrakan dengan
 *      rute yang sudah ada, jadi `SLUG_TERPAKAI` di bawah wajib ikut tumbuh
 *      setiap kali ada rute baru di akar `src/pages/`.
 *   2. **Isinya Markdown**, dirender `src/lib/markdown.ts` yang sudah dipakai
 *      catatan rilis. Halaman kebijakan berisi judul, daftar, dan tautan —
 *      tidak lebih — dan penyunting HTML utuh berarti menerima HTML sembarang
 *      dari peran Editor.
 *   3. **Footer diputuskan di sini, bukan di panel.** `tautanFooter()` yang
 *      sama dipakai `SiteFooter.astro`, jadi tidak ada kemungkinan panel
 *      menjanjikan letak yang berbeda dari yang digambar situs.
 *
 * Sengaja JavaScript polos tanpa API khusus Node, supaya berkas yang sama bisa
 * dipakai `store.ts` (normalisasi), halaman `.astro` (render), dan `admin.js`
 * (slug yang dihitung sambil mengetik) — persis alasan yang sama dengan
 * `footer.js` dan `tayang.js`.
 */

import { tayang } from "./tayang.js";

/** Batas panjang. Semuanya batas kewarasan, bukan batas teknis. */
export const BATAS_LAMAN = {
  judul: 120,
  slug: 60,
  ringkas: 200,
  isi: 60000,
  label: 40,
};

/** Letak tautan halaman di dalam footer. */
export const LETAK_FOOTER = ["legal", "menu"];

/**
 * Slug yang tidak boleh dipakai karena sudah menjadi rute.
 *
 * Rute statis memang menang atas rute dinamis `[slug].astro` di Astro, jadi
 * halaman bernama `katalog` tidak akan pernah menimpa katalog yang asli — ia
 * cuma tidak pernah bisa dibuka, dan pemiliknya tidak akan pernah tahu
 * kenapa. Menolaknya di panel jauh lebih ramah daripada membiarkannya
 * tersimpan lalu menghilang.
 */
export const SLUG_TERPAKAI = [
  "admin",
  "api",
  "install",
  "katalog",
  "merek",
  "tipe",
  "mobil",
  "motor",
  "bandingkan",
  "kalkulator",
  "gambar",
  "sitemap",
  "robots",
  "ads",
  "favicon",
];

function teks(v) {
  return v === null || v === undefined ? "" : String(v);
}

function potong(v, max) {
  return teks(v).trim().slice(0, max);
}

function bool(v, bawaan) {
  if (v === null || v === undefined || v === "") return bawaan;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return !!v;
}

/**
 * Membakukan sebuah slug: huruf kecil, angka, dan tanda hubung.
 *
 * Huruf beraksen diuraikan lebih dulu (`Ê` → `E`) supaya judul berbahasa
 * asing tidak berakhir sebagai deretan tanda hubung. `normalize("NFKD")` ada
 * di setiap mesin JavaScript yang menjalankan proyek ini, termasuk peramban.
 */
export function slugLaman(v) {
  return teks(v)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BATAS_LAMAN.slug)
    .replace(/-+$/g, "");
}

/** Apakah slug ini bentrok dengan rute yang sudah ada? */
export function slugBentrok(slug) {
  return SLUG_TERPAKAI.includes(slugLaman(slug));
}

/** Alamat halaman di situs publik. Kosong kalau slug-nya belum sah. */
export function hrefLaman(laman) {
  const slug = slugLaman(laman && laman.slug);
  return slug ? `/${slug}` : "";
}

/**
 * Bentuk baku satu halaman.
 *
 * Dipakai `store.ts`, jadi ia yang menentukan field apa saja yang ada — dan
 * karena `perubahan.ts` membandingkan dokumen yang sudah dinormalkan, field
 * yang lupa disebut di sini akan hilang diam-diam pada penyimpanan pertama.
 */
export function normalizeLaman(v) {
  const letak = LETAK_FOOTER.includes(teks(v && v.footerSlot)) ? teks(v.footerSlot) : "legal";
  return {
    id: teks(v && v.id),
    title: potong(v && v.title, BATAS_LAMAN.judul),
    slug: slugLaman(v && v.slug),
    body: teks(v && v.body).slice(0, BATAS_LAMAN.isi),

    // SEO. `seoTitle` kosong berarti "pakai judul halamannya".
    seoTitle: potong(v && v.seoTitle, BATAS_LAMAN.judul),
    excerpt: potong(v && v.excerpt, BATAS_LAMAN.ringkas),
    keywords: potong(v && v.keywords, BATAS_LAMAN.ringkas),
    image: teks(v && v.image).trim(),
    noindex: !!(v && v.noindex),

    // Footer
    showInFooter: bool(v && v.showInFooter, true),
    footerSlot: letak,
    footerLabel: potong(v && v.footerLabel, BATAS_LAMAN.label),

    // Penayangan — aturannya sama dengan koleksi lain, lihat tayang.js.
    status: teks(v && v.status) === "draft" ? "draft" : "published",
    publishAt: teks(v && v.publishAt),
    updatedAt: teks(v && v.updatedAt),
    updatedBy: teks(v && v.updatedBy),
  };
}

/** Label tautan footer: label pendek kalau diisi, kalau tidak judulnya. */
export function labelFooter(laman) {
  return (laman && teks(laman.footerLabel).trim()) || (laman && teks(laman.title).trim()) || "";
}

/**
 * Tautan halaman yang tampil di footer, dipisah menurut letaknya.
 *
 * Halaman draf dan yang belum tiba waktu tayangnya tidak ikut — footer adalah
 * bagian dari situs publik, dan mengumumkan alamat yang menjawab 404 di sana
 * sama buruknya dengan mengumumkannya di peta situs.
 *
 * @param {any[]} daftar Isi `content.halaman`.
 * @param {number} sekarang Untuk pengujian; bawaannya waktu sekarang.
 */
export function tautanFooter(daftar, sekarang = Date.now()) {
  const out = { menu: [], legal: [] };
  for (const laman of Array.isArray(daftar) ? daftar : []) {
    if (!laman || !laman.showInFooter) continue;
    if (!tayang(laman, sekarang)) continue;
    const href = hrefLaman(laman);
    const label = labelFooter(laman);
    if (!href || !label) continue;
    (laman.footerSlot === "menu" ? out.menu : out.legal).push({ label, href });
  }
  return out;
}

/**
 * Mengisi penanda `{brand}` dan `{tahun}` di dalam isi halaman.
 *
 * Bentuk penandanya sengaja sama dengan `footerCopyright`, yang sudah memakai
 * `{tahun}` dan `{brand}` sejak lama — dua konvensi berbeda untuk hal yang
 * sama persis hanya akan membuat keduanya salah diketik bergantian.
 *
 * Ini yang membuat teks bawaan di bawah bisa dipakai apa adanya oleh
 * pemasangan mana pun: kebijakan privasi menyebut nama situsnya sendiri tanpa
 * pemiliknya perlu mencari dan mengganti nama itu di empat halaman.
 */
export function isiLaman(body, vars = {}) {
  const brand = teks(vars.brand);
  const tahun = teks(vars.tahun);
  return teks(body)
    .replace(/\{brand\}/g, brand)
    .replace(/\{tahun\}/g, tahun);
}

/**
 * Ringkasan untuk `<meta name="description">`.
 *
 * Kalau penyuntingnya belum menulis ringkasan, kalimat pertama isi halaman
 * dipakai — dengan penanda Markdown dibuang. Deskripsi yang diambil mentah
 * dari Markdown akan menampilkan `##` dan `**` di hasil pencarian.
 */
export function ringkasLaman(laman, vars = {}) {
  const ditulis = isiLaman(laman && laman.excerpt, vars).trim();
  if (ditulis) return ditulis;

  const polos = isiLaman(laman && laman.body, vars)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (polos.length <= BATAS_LAMAN.ringkas) return polos;
  const potongan = polos.slice(0, BATAS_LAMAN.ringkas);
  const spasi = potongan.lastIndexOf(" ");
  return `${(spasi > 80 ? potongan.slice(0, spasi) : potongan).trim()}…`;
}

/**
 * Halaman bawaan untuk pemasangan yang belum punya satu pun.
 *
 * Ini TEMPLAT, bukan nasihat hukum — dan panel mengatakan itu di tempat yang
 * sama. Alasannya tetap: pemasangan yang lahir tanpa kebijakan privasi
 * biasanya tidak pernah punya satu pun, sementara halaman yang sudah ada dan
 * tinggal disunting hampir selalu jadi disunting.
 *
 * Dipakai `store.ts` HANYA ketika `content.halaman` belum pernah ada (bukan
 * ketika daftarnya kosong), supaya pemilik situs yang sengaja menghapus semua
 * halaman tidak menemukannya tumbuh kembali di setiap muat ulang.
 */
export function lamanBawaan() {
  return [
    {
      id: "tentang-kami",
      title: "Tentang Kami",
      slug: "tentang-kami",
      footerSlot: "menu",
      excerpt:
        "Mengenal {brand}: apa yang kami kumpulkan, dari mana datanya, dan bagaimana kami merawatnya.",
      body: `## Apa itu {brand}?

{brand} adalah basis data kendaraan listrik yang dijual di Indonesia. Isinya
spesifikasi, jarak tempuh, kapasitas baterai, tenaga, dan kisaran harga —
disusun supaya bisa dibandingkan berdampingan, bukan dibaca satu per satu dari
brosur yang formatnya berbeda-beda.

## Dari mana datanya

Angka yang kami tampilkan dikumpulkan dari materi resmi pabrikan dan agen
pemegang merek, dilengkapi pengumuman harga dan pemberitaan media otomotif.
Setiap entri dicantumkan standar pengujiannya bila tersedia, karena jarak
tempuh WLTP, NEDC, dan CLTC tidak bisa dibandingkan langsung.

## Bagaimana kami merawatnya

Harga dan spesifikasi berubah lebih sering daripada yang terlihat. Entri yang
sudah lama tidak disentuh kami tandai supaya bisa ditinjau ulang, dan setiap
perubahan tercatat waktunya.

## Menemukan yang keliru?

Kami lebih senang dikoreksi daripada dibiarkan salah. Kirim pesan lewat kanal
kontak yang tercantum di footer, sertakan tautan sumbernya bila ada.`,
    },
    {
      id: "kebijakan-privasi",
      title: "Kebijakan Privasi",
      slug: "kebijakan-privasi",
      footerSlot: "legal",
      excerpt:
        "Data apa yang dikumpulkan {brand} saat kamu membuka situs ini, untuk apa dipakai, dan hak apa yang kamu punya.",
      body: `_Berlaku sejak {tahun}. Silakan sesuaikan halaman ini dengan praktik yang
benar-benar berjalan di situsmu sebelum ditayangkan._

## Ringkasnya

{brand} tidak meminta kamu membuat akun, dan tidak mengumpulkan nama, alamat,
maupun nomor telepon untuk sekadar membaca isi situs.

## Data yang kami kumpulkan

- **Statistik kunjungan.** Halaman yang dibuka, jenis perangkat, dan situs
  perujuk. Angkanya dihitung dalam bentuk jumlah, bukan disimpan sebagai
  catatan per orang.
- **Data yang kamu kirim sendiri.** Bila kamu menghubungi kami lewat surel atau
  pesan, isi pesan itu tersimpan selama diperlukan untuk menjawabnya.

## Layanan pihak ketiga

Bila diaktifkan, situs ini dapat memuat layanan Google (Analytics, AdSense,
Search Console) yang memasang cookie-nya sendiri dan tunduk pada kebijakan
privasi Google. Kamu bisa menolak cookie lewat setelan peramban.

## Cookie

Cookie yang kami pasang sendiri hanya menyimpan preferensi tampilan, misalnya
pilihan mode terang atau gelap. Menghapusnya tidak menghilangkan akses ke isi
situs.

## Hak kamu

Kamu berhak meminta salinan, koreksi, atau penghapusan data pribadi yang kami
simpan tentangmu. Ajukan lewat kanal kontak yang tercantum di footer.

## Perubahan kebijakan

Kebijakan ini dapat diperbarui sewaktu-waktu. Tanggal perubahan terakhir
tercantum di bagian bawah halaman ini.`,
    },
    {
      id: "disclaimer",
      title: "Disclaimer",
      slug: "disclaimer",
      footerSlot: "legal",
      excerpt:
        "Batasan penggunaan informasi di {brand}: harga, spesifikasi, dan ketersediaan bukan penawaran resmi.",
      body: `## Informasi bersifat referensi

Seluruh isi {brand} disusun sebagai referensi. Kami berusaha menjaganya tetap
akurat, tetapi tidak menjamin bahwa setiap angka di situs ini mutakhir, lengkap,
dan bebas dari kekeliruan.

## Harga bukan penawaran

Harga yang tercantum adalah perkiraan berdasarkan pengumuman publik. Harga
sebenarnya berbeda antar wilayah, berubah tanpa pemberitahuan, dan belum tentu
mencakup biaya lain di luar harga kendaraan. Harga resmi hanya berlaku dari
agen pemegang merek dan dealer resminya.

## Spesifikasi dan jarak tempuh

Jarak tempuh yang tercantum berasal dari klaim pabrikan dan diukur dengan
standar pengujian tertentu. Pemakaian sehari-hari hampir selalu menghasilkan
angka yang lebih rendah, bergantung gaya berkendara, muatan, cuaca, dan medan.

## Tautan ke situs lain

Halaman ini dapat memuat tautan ke situs pihak ketiga. Kami tidak mengendalikan
isinya dan tidak bertanggung jawab atas apa pun yang ada di sana.

## Batasan tanggung jawab

Keputusan membeli, menjual, atau memakai kendaraan sepenuhnya ada pada
pembacanya. {brand} tidak bertanggung jawab atas kerugian yang timbul dari
penggunaan informasi di situs ini. Selalu konfirmasi ke dealer resmi sebelum
mengambil keputusan.`,
    },
    {
      id: "syarat-ketentuan",
      title: "Syarat & Ketentuan",
      slug: "syarat-ketentuan",
      footerSlot: "legal",
      excerpt: "Ketentuan penggunaan situs {brand}, termasuk hak cipta dan batasan penyalinan isi.",
      body: `_Silakan sesuaikan halaman ini sebelum ditayangkan._

## Penggunaan situs

Dengan membuka {brand}, kamu setuju memakai situs ini untuk keperluan yang sah
dan tidak mengganggu jalannya layanan bagi pembaca lain.

## Hak cipta

Susunan, teks, dan tata letak di situs ini milik {brand}. Kamu boleh mengutip
sebagian isinya untuk keperluan berita, penelitian, atau ulasan, dengan
menyebutkan sumber dan menautkan halaman asalnya.

Merek, logo, dan foto produk adalah milik pemegang haknya masing-masing dan
ditampilkan untuk keperluan identifikasi.

## Pengambilan data otomatis

Perayapan otomatis dalam jumlah besar, penyalinan seluruh basis data, dan
penerbitan ulang isinya secara utuh tidak diizinkan tanpa persetujuan tertulis.

## Ketersediaan layanan

Situs ini disediakan apa adanya. Kami dapat mengubah, menghentikan sementara,
atau menghapus bagian mana pun dari layanan tanpa pemberitahuan lebih dulu.

## Perubahan ketentuan

Ketentuan ini dapat diperbarui sewaktu-waktu. Melanjutkan penggunaan situs
setelah perubahan berarti kamu menyetujui versi yang berlaku saat itu.`,
    },
  ];
}
