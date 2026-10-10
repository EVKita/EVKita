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

/**
 * Menyambung `base` header/footer dengan tujuan tautan.
 *
 * `base` diisi "" di beranda dan "/" di semua subhalaman. Tanpa fungsi ini,
 * `${base}/artikel` di subhalaman menjadi `//artikel` — bentuk
 * protokol-relatif yang dibaca peramban sebagai host bernama "artikel" di
 * internet, bukan halaman situs ini (gejalanya persis "This site can't be
 * reached" + address bar bertuliskan `artikel/`). Jangkar (`#daftar`) di
 * beranda dipakai apa adanya supaya tidak memuat ulang halaman.
 *
 * @param {unknown} base "" atau "/"
 * @param {unknown} tujuan "artikel", "/artikel", atau "#daftar"
 * @returns {string} Tidak pernah diawali `//`.
 */
export function denganBase(base, tujuan) {
  const t = String(tujuan === null || tujuan === undefined ? "" : tujuan).trim();
  if (!t) return "";
  if (!base) {
    if (t.startsWith("#")) return t;
    return `/${t.replace(/^\/+/, "")}`;
  }
  if (t.startsWith("#")) return `/${t}`;
  return `/${t.replace(/^\/+/, "")}`;
}

/**
 * Alamat semat untuk video profil (bengkel, kendaraan).
 *
 * Video resmi biasanya tinggal di YouTube — yang tidak bisa diputar lewat
 * `<video src>`. Jadi YouTube diubah jadi sematan hemat-privasi
 * (`youtube-nocookie`, perlu `frame-src` di CSP), sementara berkas video
 * langsung (mp4) dibiarkan apa adanya untuk `<video>`. Selain keduanya
 * (mis. `javascript:`) hasilnya kosong — tidak ada yang dirender.
 *
 * @param {unknown} value
 * @returns {{ jenis: "youtube" | "langsung" | "", src: string }}
 */
export function sematVideo(value) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) return { jenis: "", src: "" };
  const yt = raw.match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^#]*?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  if (yt) return { jenis: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const langsung = safeUrl(raw);
  if (langsung && /^https?:\/\//i.test(langsung)) return { jenis: "langsung", src: langsung };
  return { jenis: "", src: "" };
}
