/**
 * Artikel: tulisan orisinal yang diterbitkan di `/artikel/<slug>`.
 *
 * Koleksi ini lahir dari satu kebutuhan yang tidak dijawab koleksi lain:
 * `berita` adalah kurasi judul dan tautan milik penerbit lain, sementara
 * `halaman` adalah halaman statis (Tentang, Kebijakan Privasi) yang alamatnya
 * di akar situs dan isinya jarang berubah. Tidak ada satu pun tempat untuk
 * tulisan yang punya penulis, tanggal terbit, topik, dan — yang paling
 * menentukan — daftar sumbernya.
 *
 * **Daftar sumber itu bukan pelengkap, melainkan alasan koleksi ini ada.**
 * Tulisan yang mengutip angka dari situs resmi pabrikan harus bisa
 * membuktikan dari mana angkanya datang: itu yang membedakannya dari
 * rangkuman mesin yang tidak bisa ditelusuri. Karena itu `sources` disimpan
 * per baris `{ label, url }`, dan halaman publiknya selalu menampilkan
 * daftar itu apa adanya.
 *
 * Tiga aturan yang membentuk berkas ini:
 *
 *   1. **Alamatnya `/artikel/<slug>`**, bukan di akar seperti halaman statis.
 *      Dengan begitu slug artikel tidak pernah bertabrakan dengan rute situs,
 *      dan `SLUG_TERPAKAI` tidak perlu ikut tumbuh setiap kali ada rute baru.
 *      Harga yang dibayar: satu halaman tidak bisa lagi beralamat
 *      `/artikel` — alamat itu milik indeksnya, dan itu memang yang
 *      diharapkan orang.
 *   2. **Isinya Markdown**, dirender `src/lib/markdown.ts` yang sama dengan
 *      halaman statis. Penyunting HTML utuh berarti menerima HTML sembarang
 *      dari peran Editor.
 *   3. **URL sumber disaring saat RENDER, bukan saat simpan** — `sumberTampil()`
 *      memakai `safeUrl()`. Nilai yang tersimpan tetap apa adanya supaya
 *      memperbaiki penyaring tidak berarti kehilangan data yang sudah ditulis
 *      (aturan yang sama dengan tautan footer, lihat AGENTS.md).
 *
 * JavaScript polos tanpa API khusus Node, supaya berkas yang sama dipakai
 * `store.ts` (normalisasi), halaman `.astro` (render), dan `admin.js` (slug
 * yang dihitung sambil mengetik).
 */

import { tayang } from "./tayang.js";
import { ringkasLaman, slugLaman } from "./laman.js";
import { safeUrl } from "./url.js";

/** Batas panjang. Semuanya batas kewarasan, bukan batas teknis. */
export const BATAS_ARTIKEL = {
  judul: 140,
  ringkas: 200,
  isi: 120000,
  penulis: 80,
  kategori: 40,
  tag: 40,
  jumlahTag: 10,
  sumber: 20,
  sumberLabel: 120,
  sumberUrl: 500,
};

/**
 * Topik bawaan yang ditawarkan panel. Daftarnya sengaja pendek dan berupa
 * DATA, bukan terjemahan: nilainya ikut tersimpan ke `content.json` dan
 * tampil di situs publik yang berbahasa Indonesia — sama seperti tipe bodi
 * dan standar pengujian. Topik di luar daftar ini tetap boleh diketik.
 */
export const KATEGORI_ARTIKEL = ["Panduan", "Review", "Perbandingan", "Tips", "Opini", "Berita"];

/** Berapa kata per menit yang dipakai memperkirakan waktu baca. */
const KATA_PER_MENIT = 200;

function teks(v) {
  return v === null || v === undefined ? "" : String(v);
}

function potong(v, max) {
  return teks(v).trim().slice(0, max);
}

function bool(v) {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return !!v;
}

/** Tanggal `YYYY-MM-DD` yang sah, atau string kosong. */
function tanggalSah(v) {
  const s = teks(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Alamat artikel. Kosong kalau slug-nya belum sah. */
export function hrefArtikel(artikel) {
  const slug = slugLaman(artikel && artikel.slug);
  return slug ? `/artikel/${slug}` : "";
}

/** Jumlah kata naskah — dipakai perkiraan waktu baca dan meteran panel. */
export function jumlahKata(artikel) {
  const bersih = teks(artikel && artikel.body).trim();
  return bersih ? bersih.split(/\s+/).length : 0;
}

/** Perkiraan waktu baca dalam menit, minimal satu. */
export function bacaMenit(artikel) {
  return Math.max(1, Math.round(jumlahKata(artikel) / KATA_PER_MENIT));
}

/** Satu baris sumber dibakukan. Baris kosong dibuang. */
export function normalizeSumber(v) {
  if (!v || typeof v !== "object") return null;
  const label = potong(v.label, BATAS_ARTIKEL.sumberLabel);
  const url = potong(v.url, BATAS_ARTIKEL.sumberUrl);
  if (!label && !url) return null;
  return { label, url };
}

/** Daftar sumber: dibatasi jumlahnya, tanpa baris kembar. */
export function normalizeSumberList(v) {
  const out = [];
  const terlihat = new Set();
  for (const baris of Array.isArray(v) ? v : []) {
    const s = normalizeSumber(baris);
    if (!s) continue;
    const kunci = `${s.label.toLowerCase()}\n${s.url.toLowerCase()}`;
    if (terlihat.has(kunci)) continue;
    terlihat.add(kunci);
    out.push(s);
    if (out.length >= BATAS_ARTIKEL.sumber) break;
  }
  return out;
}

/** Tag: daftar teks pendek, tanpa kembar, dibatasi jumlahnya. */
function normalizeTags(v) {
  const out = [];
  const terlihat = new Set();
  for (const t of Array.isArray(v) ? v : []) {
    const s = potong(t, BATAS_ARTIKEL.tag);
    if (!s) continue;
    const kunci = s.toLowerCase();
    if (terlihat.has(kunci)) continue;
    terlihat.add(kunci);
    out.push(s);
    if (out.length >= BATAS_ARTIKEL.jumlahTag) break;
  }
  return out;
}

/**
 * Bentuk baku satu artikel.
 *
 * Dipakai `store.ts`, jadi ia yang menentukan field apa saja yang ada — dan
 * karena `perubahan.ts` membandingkan dokumen yang sudah dinormalkan, field
 * yang lupa disebut di sini akan hilang diam-diam pada penyimpanan pertama.
 */
export function normalizeArtikel(v) {
  return {
    id: teks(v && v.id),
    title: potong(v && v.title, BATAS_ARTIKEL.judul),
    slug: slugLaman(v && v.slug),
    excerpt: potong(v && v.excerpt, BATAS_ARTIKEL.ringkas),
    body: teks(v && v.body).slice(0, BATAS_ARTIKEL.isi),

    // Penulis & topik. Kategori disimpan apa adanya (boleh di luar daftar
    // bawaan) karena ia ikut tampil di situs publik yang berbahasa Indonesia.
    author: potong(v && v.author, BATAS_ARTIKEL.penulis),
    category: potong(v && v.category, BATAS_ARTIKEL.kategori),
    tags: normalizeTags(v && v.tags),

    // Sumber. Barisnya boleh kosong; yang menentukan ia tampil atau tidak
    // adalah penyaring skema di halaman publik, bukan di sini.
    sources: normalizeSumberList(v && v.sources),

    // Media & SEO
    image: teks(v && v.image).trim(),
    seoTitle: potong(v && v.seoTitle, BATAS_ARTIKEL.judul),
    keywords: potong(v && v.keywords, BATAS_ARTIKEL.ringkas),
    noindex: bool(v && v.noindex),
    featured: bool(v && v.featured),

    /**
     * Penanda transparansi: artikel ini pernah dibantu draf AI. Sengaja TIDAK
     * dipakai untuk apa pun di situs publik — ia hanya tampil sebagai lencana
     * di panel, supaya tim redaksi tahu tulisan mana yang masih perlu dibaca
     * ulang lebih teliti. Menjadikannya sinyal SEO justru mengundang orang
     * menyembunyikannya.
     */
    aiAssisted: bool(v && v.aiAssisted),

    // Tanggal terbit yang ditulis manusia, terpisah dari jadwal tayang.
    date: tanggalSah(v && v.date),

    // Penayangan — aturannya sama dengan koleksi lain, lihat tayang.js.
    status: teks(v && v.status) === "draft" ? "draft" : "published",
    publishAt: teks(v && v.publishAt),
    updatedAt: teks(v && v.updatedAt),
    updatedBy: teks(v && v.updatedBy),
  };
}

/**
 * Ringkasan untuk kartu dan `<meta name="description">`.
 *
 * Aturannya sama persis dengan halaman statis — termasuk membuang penanda
 * Markdown saat ringkasan harus diambil dari isi — jadi fungsinya memang
 * dipinjam, bukan disalin.
 */
export function ringkasArtikel(artikel, vars = {}) {
  return ringkasLaman(artikel, vars);
}

/**
 * Tanggal yang dipakai urutan dan tampilan, dalam bentuk `YYYY-MM-DD`.
 *
 * Urutannya: tanggal terbit yang ditulis penyunting, lalu jadwal tayang, lalu
 * waktu perubahan terakhir. Artikel yang baru disunting tanpa tanggal terbit
 * tetap muncul di atas — lebih baik daripada tenggelam karena satu field
 * kosong.
 */
export function tanggalArtikel(artikel) {
  const ditulis = tanggalSah(artikel && artikel.date);
  if (ditulis) return ditulis;
  const at = teks(artikel && artikel.publishAt).trim() || teks(artikel && artikel.updatedAt).trim();
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

/**
 * Tanggal berzona untuk `datePublished` di JSON-LD.
 *
 * `YYYY-MM-DD` tanpa zona ditafsirkan mesin pencari menurut zona waktunya
 * sendiri. Situs ini terbit dalam WIB, jadi zonanya disebut eksplisit.
 */
export function tanggalIso(artikel) {
  const tanggal = tanggalArtikel(artikel);
  return tanggal ? `${tanggal}T00:00:00+07:00` : "";
}

/** Nama domain dari sebuah alamat — dipakai saat label sumber kosong. */
export function namaHost(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "") || "";
  } catch {
    return String(url || "");
  }
}

/**
 * Sumber yang benar-benar boleh dirender.
 *
 * Di sinilah penyaring skema dipasang — lihat catatan di kepala berkas.
 * Baris tanpa alamat yang sah dibuang, bukan dirender sebagai teks kosong.
 */
export function sumberTampil(daftar) {
  const out = [];
  for (const s of Array.isArray(daftar) ? daftar : []) {
    const url = safeUrl(s && s.url);
    if (!url) continue;
    const label = teks(s && s.label).trim() || namaHost(url);
    out.push({ label, url });
  }
  return out;
}

/**
 * Artikel yang tayang, terbaru lebih dulu.
 *
 * Perbandingan tanggalnya memakai bentuk `YYYY-MM-DD` dari `tanggalArtikel()`,
 * jadi dua artikel yang terbit di hari yang sama diurutkan menurut judulnya —
 * urutan yang stabil, bukan urutan yang berubah tiap kali halaman dimuat.
 */
export function artikelTayang(daftar, sekarang = Date.now()) {
  return (Array.isArray(daftar) ? daftar : [])
    .filter((a) => tayang(a, sekarang))
    .sort((a, b) => {
      const da = tanggalArtikel(a);
      const db = tanggalArtikel(b);
      if (da !== db) return db.localeCompare(da);
      return teks(a && a.title).localeCompare(teks(b && b.title));
    });
}
