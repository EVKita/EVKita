/**
 * Pencari gambar dan video di sebuah halaman resmi.
 *
 * Sengaja murni: masukannya teks HTML, keluarannya daftar alamat. Tidak ada
 * jaringan dan tidak ada Node, jadi aturannya bisa diuji langsung
 * (`tests/media-ambil.test.ts`) tanpa membuka satu pun situs.
 *
 * Urutannya penting. `og:image` diletakkan paling depan karena itulah yang
 * sengaja dipilih pemilik halaman sebagai gambar utamanya — jauh lebih andal
 * daripada menebak dari daftar `<img>` yang setengahnya ikon dan logo.
 */

/** Akhiran berkas yang memang gambar. */
const EKSTENSI = /\.(jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;

/** Kata yang menandakan gambar hiasan, bukan foto produk. */
const HIASAN = /(logo|icon|favicon|sprite|placeholder|spacer|pixel|badge|avatar|flag|arrow|chevron|loading|blank|transparent|banner-cookie|1x1)/i;

const VIDEO = /(youtube\.com|youtu\.be|vimeo\.com)/i;

function absolut(alamat, basis) {
  const teks = String(alamat || "").trim();
  if (!teks || /^data:/i.test(teks)) return "";
  try {
    return new URL(teks, basis).href;
  } catch {
    return "";
  }
}

function meta(html, nama) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${nama}["'][^>]*?content=["']([^"']+)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']${nama}["']`, "i");
  const m = html.match(a) || html.match(b);
  return m ? m[1] : "";
}

/** Entri `srcset` dengan lebar terbesar — biasanya foto aslinya. */
function srcsetTerbesar(srcset) {
  let pilihan = "";
  let lebar = -1;
  for (const bagian of String(srcset || "").split(",")) {
    const cocok = bagian.trim().match(/^(\S+)(?:\s+(\d+)w)?$/);
    if (!cocok) continue;
    const w = cocok[2] ? Number(cocok[2]) : 0;
    if (w >= lebar) {
      lebar = w;
      pilihan = cocok[1];
    }
  }
  return pilihan;
}

function layakGambar(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  if (HIASAN.test(url)) return false;
  // Hanya terima alamat yang jelas berupa berkas gambar. Halaman galeri yang
  // memuat gambar lewat JavaScript tidak akan terbaca di sini, dan menebak
  // dari URL tanpa akhiran hanya menghasilkan tautan rusak.
  return EKSTENSI.test(url);
}

/** Gambar: og:image → twitter:image → JSON-LD → <img> (srcset terbesar). */
export function ekstrakGambar(html, basis) {
  const out = [];
  const tambah = (u) => {
    const url = absolut(u, basis);
    if (layakGambar(url) && !out.includes(url)) out.push(url);
  };

  tambah(meta(html, "og:image"));
  tambah(meta(html, "og:image:secure_url"));
  tambah(meta(html, "twitter:image"));

  for (const m of html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) tambah(m[1]);
  for (const m of html.matchAll(/"image"\s*:\s*\[\s*"([^"]+)"/gi)) tambah(m[1]);

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = (tag.match(/\bsrcset=["']([^"']+)["']/i) || [])[1];
    const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    tambah(srcsetTerbesar(srcset) || src);
  }

  return out.slice(0, 12);
}

/** Video: og:video → <iframe> → <video>/<source> → tautan YouTube. */
export function ekstrakVideo(html, basis) {
  const out = [];
  const tambah = (u) => {
    const url = absolut(u, basis);
    if (url && VIDEO.test(url) && !out.includes(url)) out.push(url);
  };

  tambah(meta(html, "og:video"));
  tambah(meta(html, "og:video:url"));

  for (const m of html.matchAll(/<(?:iframe|video|source|embed)\b[^>]*\bsrc=["']([^"']+)["']/gi)) tambah(m[1]);
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) tambah(m[1]);

  return out.slice(0, 5);
}

/** Sekaligus, untuk satu halaman. */
export function ekstrakMedia(html, basis) {
  return { gambar: ekstrakGambar(html, basis), video: ekstrakVideo(html, basis) };
}
