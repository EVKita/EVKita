/**
 * Lapisan terjemahan konten situs publik (Indonesia → Inggris & Mandarin).
 *
 * UI situs sudah berbahasa tiga lewat `src/lib/i18n/pub.js`, tapi ISI yang
 * disimpan pemilik lewat panel — judul dan deskripsi kendaraan, isi halaman
 * Markdown, judul berita, alamat dan jam buka SPKLU — tetap berbahasa
 * Indonesia di `data/content.json`. Berkas ini yang menerjemahkannya, di
 * saat halaman dirender, memakai DeepSeek (`src/lib/deepseek.ts`).
 *
 * Tiga aturan menentukan seluruh isi berkas ini:
 *
 *   1. **Panel tetap berbahasa Indonesia.** `content.json` tidak pernah
 *      disentuh. Yang dibaca hanya untuk diterjemahkan, yang ditulis hanya
 *      cache terjemahannya.
 *   2. **Kuncinya adalah TEKS ASLINYA.** `data/terjemahan/en.json` (dan
 *      `zh.json` untuk Mandarin) memetakan `sha1(teks Indonesia)` → teks
 *      terjemahan. Mengedit satu kata mengubah kuncinya, entri lama otomatis
 *      tidak terpakai lagi, dan teks barunya diterjemahkan sendiri pada
 *      render berikutnya — tanpa tombol "terjemahkan ulang", tanpa stempel
 *      waktu yang bisa basi, dan tanpa risiko terjemahan lama menempel di
 *      teks yang sudah diganti.
 *   3. **Gagal berarti tampil Bahasa Indonesia.** Tidak ada satu pun kondisi
 *      — jaringan mati, kunci salah, kuota habis, jawaban model rusak, berkas
 *      cache tidak bisa ditulis — yang boleh membuat halaman gagal
 *      dirender. Yang terburuk yang bisa terjadi adalah pembaca melihat teks
 *      Indonesia.
 *
 * Berkas ini memakai `node:fs` dan `node:crypto`, jadi hanya boleh dijalankan
 * di frontmatter SSR — tidak pernah di peramban.
 */

import crypto from "node:crypto";
import path from "node:path";
import { normalizePubLocale } from "./i18n/pub.js";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { terjemahkanBerteks, GalatTerjemahan } from "./deepseek";
import { APPEARANCE_DEFAULTS } from "./theme.js";

/** Bahasa tujuan yang didukung — masing-masing punya berkas cache sendiri. */
const BAHASA_TUJUAN = new Set(["en", "zh"]);

/** Jumlah teks maksimal dalam satu permintaan DeepSeek. */
const BATAS_BATCH_JUMLAH = 60;
/** Jumlah karakter maksimal dalam satu permintaan DeepSeek. */
const BATAS_BATCH_KARAKTER = 8000;

/* ==========================================================================
 * Daftar teks yang tidak boleh diterjemahkan
 * ========================================================================== */

/**
 * Kunci yang nilainya dibaca PROGRAM, bukan pembaca.
 *
 * Alasannya selalu sama: nilai ini jadi bahan pengelompokan, penyaring,
 * pembentuk tautan, penentu tayang, atau CSS. Menerjemahkannya membuat
 * `b.type.includes("Mobil")` di beranda menemukan nol bengkel, tawaran
 * `status === "published"` tidak pernah cocok sehingga seluruh konten hilang,
 * dan slot footer pindah kolom tanpa satu pun pesan.
 *
 * Daftar ini kontrak — panel dan halaman publik bergantung padanya, jadi
 * menambah atau menghapus baris harus lewat kesadaran, bukan lewat intuisi.
 */
export const KUNCI_LEWAT = new Set([
  // — Kontrak: identitas, pengelompokan, penunjuk —
  "id",
  "slug",
  "kind",
  "type",
  "jenis",
  "brand",
  "name",
  "bodyType",
  "tags",
  "url",
  "href",
  "image",
  "video",
  "gallery",
  "icon",
  "logoImage",
  "favicon",
  "mapUrl",
  "source",
  "standard",
  "driveType",
  "connector",
  "variantNames",
  "colors",

  // — Tayang, waktu, dan letak (dibaca `tayang.js`, `laman.js`, panel) —
  "status",
  "publishAt",
  "updatedAt",
  "updatedBy",
  "date",
  "revision",
  "footerSlot",

  // — Nama field yang maknanya sama dengan `standard` di atas, cuma ditulis
  //    panjang di data kendaraan. "WLTP"/"NEDC" bukan kalimat. —
  "rangeStandard",

  // — Identitas situs: nama brand dan inisial logo —
  "brandText",
  "brandSuffix",
  "logoMark",

  // — Kontak dan tautan: dipakai membentuk `mailto:`, `tel:`, `wa.me` —
  "contactEmail",
  "contactPhone",
  "contactWhatsapp",
  "contactMapUrl",
  "contactWebsite",
  "footerSourceUrl",
  "phone",
  "socialInstagram",
  "socialYoutube",
  "socialTiktok",
  "socialFacebook",
  "socialX",
  "socialWhatsapp",
  "socialLinkedin",
  "socialTelegram",

  // — Gambar besar dan tautan CTA yang isinya alamat —
  "heroImage",
  "heroCtaUrl",
  "heroCtaAltUrl",
  "seoOgImage",

  // — Seluruh setelan tampilan. Sumbernya `APPEARANCE_DEFAULTS` di
  //    `theme.js`, supaya menambah satu setelan Tampilan di panel ikut
  //    terlindung tanpa perlu menyunting dua berkas. Nilainya langsung
  //    disusun jadi CSS atau kelas `ui-*`, bukan kalimat. —
  ...Object.keys(APPEARANCE_DEFAULTS),
]);

/**
 * Apakah sebuah nilai string layak diterjemahkan?
 *
 * Di luar daftar kunci di atas, ada nilai yang bentuknya sendiri sudah
 * menjawab: alamat, warna, angka, dan istilah teknis satu kata. Menerjemahkan
 * "blur" jadi "blur" membuang satu panggilan model; menerjemahkannya jadi
 * "kabur" merusak stylesheet.
 */
function bolehNilai(nilai) {
  if (typeof nilai !== "string") return false;

  const t = nilai.trim();
  // Termasuk string kosong dan spasi: tidak ada yang bisa diterjemahkan.
  if (t.length < 2) return false;

  // Alamat: tautan mutlak dan skema tautan. Nol pun di antaranya bisa jadi
  // `mailto:` atau `tel:` yang dibentuk panel.
  if (/^(https?:\/\/|\/\/|\/|mailto:|tel:|javascript:|data:|ftp:)/i.test(t)) return false;

  // Jangkar halaman ("#daftar") dan warna heksadesimal ("#37e0a6"). BERBEDA
  // dari awalan "#" yang ditulis isi Markdown: "# Judul" adalah heading yang
  // sah, dan kalau "#" ditolak mentah-mentah, seluruh halaman statis yang
  // judulnya memakai ATX heading tidak akan pernah diterjemahkan.
  if (/^#[a-z0-9][a-z0-9._-]*$/i.test(t)) return false;

  // Angka murni dan nomor telepon: "1.500", "60", "+62 812-3456-7890".
  if (/^[+()\-–—.\s\d]+$/.test(t)) return false;

  // Tanggal ISO — nilai `publishAt`, `updatedAt`, dan `date` memang berbentuk
  // begini, tapi menjaga di sini juga berarti selamat kalau ada isinya.
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;

  // Satu istilah teknis huruf kecil tanpa spasi: "blur", "published",
  // "linear-gradient", "menu". Kalimat asli yang layak diterjemahkan hampir
  // tidak pernah berbentuk begini, dan yang tertinggal pun tetap tampil
  // apa adanya.
  if (/^[a-z0-9]+([._+\-][a-z0-9]+)*$/.test(t)) return false;

  return true;
}

function setLewati(opsi) {
  const tambahan = opsi && Array.isArray(opsi.lewatiKunci) ? opsi.lewatiKunci : [];
  return tambahan.length ? new Set([...KUNCI_LEWAT, ...tambahan]) : KUNCI_LEWAT;
}

/**
 * Koleksi yang `name`-nya boleh ikut diterjemahkan.
 *
 * `name` ada di daftar lewati karena pada kendaraan isinya nama model
 * ("Seal", "iX3") yang tidak boleh disentuh. Pada direktori SPKLU dan
 * bengkel, `name` adalah NAMA TEMPAT yang dibaca orang — "SPKLU Plaza
 * Senayan" layak tampil berbahasa Inggris. Karena itu pengecualian ini
 * diikat pada koleksinya, bukan pada kuncinya.
 */
const KOLEKSI_NAMA = new Set(["spklu", "bengkel"]);

/**
 * Menelusuri objek, memanggil `kunjungi(teks)` untuk setiap kandidat.
 *
 * Sub-pohon di bawah kunci terlarang dilewati SEBAGAI UTUH, bukan hanya
 * nilainya: `gallery: [{ alt: "..." }]` tidak boleh menyumbang satu pun
 * teks, karena seluruh isinya memang urusan gambar.
 */
function jalan(nilai, kunci, lewati, kunjungi, dalamKoleksiNama) {
  const namaOke = dalamKoleksiNama || (kunci !== undefined && KOLEKSI_NAMA.has(kunci));
  if (kunci && lewati.has(kunci) && !(namaOke && kunci === "name")) return;

  if (typeof nilai === "string") {
    if (bolehNilai(nilai)) kunjungi(nilai);
    return;
  }
  if (Array.isArray(nilai)) {
    // Elemen larik mewarisi kunci induknya — itulah sebabnya `tags` dan
    // `variantNames` ikut aman sebagai larik primitif.
    for (const v of nilai) jalan(v, kunci, lewati, kunjungi, namaOke);
    return;
  }
  if (nilai && typeof nilai === "object") {
    for (const k of Object.keys(nilai)) jalan(nilai[k], k, lewati, kunjungi, namaOke);
    return;
  }
  // Angka, boolean, dan null: bukan teks, bukan tugas kita.
}

/**
 * Seluruh teks yang layak diterjemahkan, unik, berurutan traversal.
 *
 * Murni: tidak membaca berkas, tidak memanggil model. Karena kuncinya teks
 * asli, daftar ini yang menentukan isi batch — dan karena nilainya unik,
 * dua kendaraan yang deskripsinya kebetulan sama hanya diterjemahkan sekali.
 *
 * @param {object} objek Biasanya seluruh `content.json`.
 * @param {{ lewatiKunci?: string[] }} [opsi] Kunci tambahan yang harus
 *   dilewati, untuk pemanggil yang tahu field miliknya sendiri.
 * @returns {string[]}
 */
export function kumpulkanTeks(objek, opsi) {
  const lewati = setLewati(opsi);
  const sudah = new Set();
  const hasil = [];
  jalan(objek, "", lewati, (teks) => {
    if (sudah.has(teks)) return;
    sudah.add(teks);
    hasil.push(teks);
  });
  return hasil;
}

/**
 * Salinan objek dengan setiap teks yang ada di `peta` sudah diganti.
 *
 * `peta` memetakan TEKS ASLI → terjemahan (bukan hash → terjemahan): ia yang
 * dipakai bersama oleh seluruh pemanggil, jadi bentuknya sederhana dan
 * mudah diuji. Cache di disk memakai hash sebagai kuncinya; pemetaannya
 * dikerjakan `terjemahContent()`.
 *
 * Murni: `objek` tidak pernah diubah, dan sub-pohon terlarang ikut ikut
 * tersalin supaya hasilnya benar-benar milik sendiri.
 *
 * @param {object} objek
 * @param {Record<string, string>} peta
 * @param {{ lewatiKunci?: string[] }} [opsi]
 */
export function terapkanTerjemahan(objek, peta, opsi) {
  const lewati = setLewati(opsi);
  const klon = structuredClone(objek);
  ganti(klon, "", lewati, peta || {});
  return klon;
}

function ganti(nilai, kunci, lewati, peta, dalamKoleksiNama) {
  const namaOke = dalamKoleksiNama || (kunci !== undefined && KOLEKSI_NAMA.has(kunci));
  // Sub-pohon terlarang sudah ikut terklon di atas, jadi ia aman dikembalikan
  // apa adanya — tanpa perlu disentuh satu per satu.
  if (kunci && lewati.has(kunci) && !(namaOke && kunci === "name")) return nilai;

  if (typeof nilai === "string") {
    if (!bolehNilai(nilai)) return nilai;
    const gantian = peta[nilai];
    return typeof gantian === "string" && gantian !== "" ? gantian : nilai;
  }
  if (Array.isArray(nilai)) {
    for (let i = 0; i < nilai.length; i++)
      nilai[i] = ganti(nilai[i], kunci, lewati, peta, namaOke);
    return nilai;
  }
  if (nilai && typeof nilai === "object") {
    for (const k of Object.keys(nilai))
      nilai[k] = ganti(nilai[k], k, lewati, peta, namaOke);
    return nilai;
  }
  return nilai;
}

/* ==========================================================================
 * Kunci cache
 * ========================================================================== */

/**
 * Kunci cache: sha1(hex) dari teks Indonesia persis seperti yang ditulis
 * pemilik situs.
 *
 * sha1 di sini bukan soal keamanan — tidak ada yang sedang dijaga, hanya
 * dibutuhkan kunci pendek dan stabil untuk JSON. Yang penting adalah sifatnya:
 * satu karakter berbeda menghasilkan kunci berbeda, jadi teks yang diedit
 * tidak akan pernah memakai terjemahan teks lamanya.
 */
export function hashTeks(teks) {
  return crypto.createHash("sha1").update(String(teks), "utf8").digest("hex");
}

/** Alamat cache per bahasa tujuan: `data/terjemahan/en.json`, `zh.json`. */
function berkasPeta(target) {
  return path.resolve(process.cwd(), "data", "terjemahan", `${target}.json`);
}

/**
 * Memuat cache sekali per berkas, dijaga satu janji.
 *
 * Dua permintaan yang datang bersamaan berbagi SATU pembacaan, jadi keduanya
 * juga berbagi SATU objek hasil — dan karena objek itulah yang ditulis balik,
 * terjemahan yang ditemukan pemanggil pertama langsung terlihat pemanggil
 * kedua tanpa perlu membaca disk lagi.
 *
 * Berkas yang rusak dianggap kosong, bukan bencana: isinya murni cache yang
 * bisa dibangun ulang dari `content.json` dengan menerjemahkan lagi, dan
 * menolak menimpanya justru akan mengunci seluruh situs pada teks Indonesia
 * selamanya.
 */
const petaPerBerkas = new Map();

function muatPeta(berkas) {
  let janji = petaPerBerkas.get(berkas);
  if (!janji) {
    janji = Promise.resolve().then(() => {
      const hasil = readJson(berkas);
      if (hasil.status !== "ok") return {};
      const data = hasil.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      const bersih = {};
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (typeof v === "string" && v) bersih[k] = v;
      }
      return bersih;
    });
    janji.catch(() => petaPerBerkas.delete(berkas));
    petaPerBerkas.set(berkas, janji);
  }
  return janji;
}

/* ==========================================================================
 * Antrean: satu penerjemah, banyak halaman
 * ========================================================================== */

/**
 * Antrean tunggal untuk seluruh proses.
 *
 * Tanpa ini, dua halaman yang dirender bersamaan akan melihat teks yang sama
 * belum ada di cache, dan keduanya akan membayar penerjemahan yang sama dua
 * kali. Yang dipakai di sini bukan sekadar berbagi janji: setiap pemanggil
 * MEMERIKSA ULANG cache begitu gilirannya tiba, jadi teks yang sudah
 * diterjemahkan pemanggil sebelumnya tidak pernah diminta lagi — apa pun
 * bentuk batch-nya.
 *
 * Antrean ini juga yang membuatnya pelan-pelan terhadap DeepSeek: satu
 * permintaan pada satu waktu, bukan puluhan permintaan serempak dari
 * halaman-halaman yang sedang dirender.
 */
let antrean = Promise.resolve();

function dalamAntrean(kerja) {
  // Kegagalan satu pemanggil tidak boleh menjatuhkan pemanggil berikutnya:
  // hasil `kerja` selalu ditangkap pemanggilnya sendiri.
  const hasil = antrean.then(kerja, kerja);
  antrean = hasil.then(
    () => {},
    () => {}
  );
  return hasil;
}

/* ==========================================================================
 * Pemotongan teks dan pengelompokan batch
 * ========================================================================== */

/**
 * Memotong satu teks panjang jadi potongan yang tetap utuh bila disambung.
 *
 * `pecahPotongan(t).join("") === t` selalu — tidak ada satu karakter pun
 * yang hilang atau terduplikasi di batas potongan, jadi menerjemahkan
 * potongan demi potongan lalu menyambungnya kembali menghasilkan terjemahan
 * utuh. Pemotongannya di batas paragraf bila memungkinkan: model menerjemahkan
 * satu paragraf utuh lebih baik daripada paragraf yang terbelah dua.
 *
 * Ini yang membuat batas karakter per permintaan bisa dipegang teguh, termasuk
 * untuk isi halaman yang panjangnya puluhan ribu karakter.
 */
export function pecahPotongan(teks, batas = BATAS_BATCH_KARAKTER) {
  const s = String(teks);
  if (s.length <= batas) return [s];
  if (batas < 1) return [s];

  const potongan = [];
  let sisa = s;
  while (sisa.length > batas) {
    let potong = sisa.lastIndexOf("\n\n", batas);
    // Jangan memotong terlalu jauh ke belakang: satu paragraf raksasa akan
    // membuat potongan pertama pendek dan sisanya melompati batas.
    if (potong < batas / 4) potong = sisa.lastIndexOf("\n", batas);
    if (potong < batas / 4) potong = batas;
    if (potong <= 0) potong = batas;
    potongan.push(sisa.slice(0, potong));
    sisa = sisa.slice(potong);
  }
  if (sisa) potongan.push(sisa);
  return potongan;
}

/**
 * Mengelompokkan daftar jadi batch sesuai batas jumlah dan batas karakter.
 *
 * Mengembalikan indeks, bukan potongan, supaya pemanggil bisa melacak ke
 * mana tiap indeks pergi tanpa menyalin data. Tidak ada indeks yang hilang
 * dan urutannya selalu terjaga.
 *
 * @param {any[]} daftar
 * @param {(item: any) => number} [panjang]
 * @returns {number[][]}
 */
export function potongBatch(daftar, panjang) {
  const ukur = typeof panjang === "function" ? panjang : (x) => String(x ?? "").length;
  const batch = [];
  let sekarang = [];
  let karakter = 0;

  for (let i = 0; i < daftar.length; i++) {
    const p = ukur(daftar[i]);
    if (sekarang.length && (sekarang.length >= BATAS_BATCH_JUMLAH || karakter + p > BATAS_BATCH_KARAKTER)) {
      batch.push(sekarang);
      sekarang = [];
      karakter = 0;
    }
    sekarang.push(i);
    karakter += p;
  }
  if (sekarang.length) batch.push(sekarang);
  return batch;
}

/* ==========================================================================
 * Pemeriksaan jawaban model
 * ========================================================================== */

/** Seluruh placeholder `{kata}` dalam sebuah teks, tanpa duplikat. */
function placeholder(teks) {
  const set = new Set(String(teks).match(/\{\w+\}/g) || []);
  return [...set].sort();
}

/** Seluruh tujuan tautan Markdown `[teks](/alamat)` dalam sebuah teks. */
function tujuanTautan(teks) {
  const set = new Set();
  for (const m of String(teks).matchAll(/\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g)) set.add(m[1]);
  return [...set].sort();
}

/**
 * Apakah terjemahan ini mempertahankan kerangka teks aslinya?
 *
 * Struktur yang dicek bukan gaya bahasanya, melainkan dua hal yang kalau
 * hilang merusak halaman secara diam-diam: placeholder yang akan diisi
 * `pubT()` (hilang `{brand}` berarti nama situs raib dari kalimat) dan
 * tujuan tautan Markdown (hilang `/katalog` berarti tautan mati). Keduanya
 * sering dipegang model ketika diminta — tapi "sering" bukan jaminan, dan
 * yang menggantinya tetap pembaca, bukan mesin.
 *
 * @returns {{ ok: boolean, alasan: string }}
 */
export function cocokkanStruktur(sumber, hasil) {
  const a = String(sumber ?? "");
  const b = String(hasil ?? "");
  if (a.length > 0 && b.trim() === "") return { ok: false, alasan: "Terjemahan kosong." };

  const phA = placeholder(a).join("\n");
  const phB = placeholder(b).join("\n");
  if (phA !== phB) return { ok: false, alasan: `Placeholder berubah: [${phA}] jadi [${phB}].` };

  const tA = tujuanTautan(a).join("\n");
  const tB = tujuanTautan(b).join("\n");
  if (tA !== tB) return { ok: false, alasan: `Tujuan tautan berubah: [${tA}] jadi [${tB}].` };

  return { ok: true, alasan: "" };
}

/* ==========================================================================
 * Penerjemahan
 * ========================================================================== */

/**
 * Menerjemahkan teks-teks yang belum ada di cache, lalu menyimpannya.
 *
 * Berjalan DALAM antrean, jadi ia memulai dengan memeriksa ulang mana yang
 * benar-benar belum terjemahan — pemanggil sebelumnya mungkin sudah
 * mengerjakannya selagi kita menunggu giliran.
 *
 * Teks yang lebih panjang dari batas karakter dipecah lebih dulu; hasil
 * potongannya disambung kembali sebelum dijadikan satu entri cache, supaya
 * kuncinya tetap teks asli utuh, bukan potongannya.
 */
async function terjemahkanDanSimpan(peta, sumber, berkas, target, opsi) {
  const belum = sumber.filter((s) => typeof peta[hashTeks(s)] !== "string");
  if (!belum.length) return;

  const terjemah = typeof opsi.terjemah === "function" ? opsi.terjemah : terjemahkanBerteks;

  const segmen = [];
  const kerja = belum.map((teks) => {
    const potongan = pecahPotongan(teks);
    const awal = segmen.length;
    for (const p of potongan) segmen.push({ teks: p, hasil: "" });
    return { teks, awal, jumlah: potongan.length };
  });

  for (const indeks of potongBatch(segmen, (s) => s.teks.length)) {
    const masukan = indeks.map((i) => segmen[i].teks);
    const keluar = await terjemah(masukan, { dari: "id", ke: target });

    if (!Array.isArray(keluar) || keluar.length !== masukan.length) {
      throw new GalatTerjemahan("err.ai.jawabanTidakTerbaca", "Jumlah terjemahan tidak sama dengan masukan.");
    }

    for (let n = 0; n < masukan.length; n++) {
      const hasil = keluar[n];
      if (typeof hasil !== "string") {
        throw new GalatTerjemahan("err.ai.jawabanTidakTerbaca", "Ada terjemahan yang bukan teks.");
      }
      const cocok = cocokkanStruktur(masukan[n], hasil);
      if (!cocok.ok) throw new GalatTerjemahan("err.ai.jawabanTidakTerbaca", cocok.alasan);
      segmen[indeks[n]].hasil = hasil;
    }

    /*
     * Simpan setiap batch yang berhasil, bukan di akhir. Teks yang sudah
     * utuh hari ini tidak boleh hilang karena batch berikutnya gagal di
     * tengah jalan — cache yang separuh terisi tetap lebih baik daripada
     * cache kosong, dan render berikutnya tinggal mengerjakan sisanya.
     */
    let adaBaru = false;
    for (const k of kerja) {
      if (typeof peta[hashTeks(k.teks)] === "string") continue;
      const sambung = [];
      let utuh = true;
      for (let n = 0; n < k.jumlah; n++) {
        const h = segmen[k.awal + n].hasil;
        if (!h) {
          utuh = false;
          break;
        }
        sambung.push(h);
      }
      if (!utuh) continue;
      peta[hashTeks(k.teks)] = sambung.join("");
      adaBaru = true;
    }
    if (adaBaru) writeJsonAtomic(berkas, peta);
  }
}

/**
 * Terjemahkan seluruh isi `content.json` ke bahasa tujuan.
 *
 * Satu-satunya yang dipanggil halaman publik. Bentuknya persis seperti
 * `content`, hanya isinya yang sudah terjemahan — penggantian terjadi per
 * teks, jadi identitas, alamat, dan seluruh field terlarang tidak tersentuh.
 *
 * @param {object} content Isi `data/content.json`.
 * @param {string} lang Locale yang sudah dinormalisasi `normalizePubLocale`.
 *   Selain `"en"` dan `"zh"` mengembalikan `content` apa adanya, tanpa
 *   membaca berkas dan tanpa menyentuh jaringan.
 * @param {{ terjemah?: Function, berkas?: string, lewatiKunci?: string[] }} [opsi]
 *   Hanya untuk pengujian: pengganti fungsi terjemah dan alamat cache.
 * @returns {Promise<object>} Konten terjemahan, atau konten ASLI kalau
 *   terjadi apa pun.
 */
export async function terjemahContent(content, lang, opsi = {}) {
  const target = normalizePubLocale(lang);
  if (!BAHASA_TUJUAN.has(target)) return content;

  try {
    const klon = structuredClone(content);
    const sumber = kumpulkanTeks(klon, opsi);
    if (!sumber.length) return klon;

    const berkas = opsi.berkas || berkasPeta(target);
    const peta = await muatPeta(berkas);
    const hilang = sumber.filter((s) => typeof peta[hashTeks(s)] !== "string");

    if (hilang.length) await dalamAntrean(() => terjemahkanDanSimpan(peta, hilang, berkas, target, opsi));

    const petaSumber = Object.create(null);
    for (const s of sumber) {
      const hasil = peta[hashTeks(s)];
      if (typeof hasil === "string" && hasil) petaSumber[s] = hasil;
    }
    return terapkanTerjemahan(klon, petaSumber, opsi);
  } catch {
    /*
     * Tangkapan serba ini adalah jaminan terakhir: jaringan yang mati, kunci
     * yang ditolak, kuota habis, jawaban model yang rusak, atau disk penuh —
     * semuanya berujung di sini, dan halaman tetap dirender dengan teks
     * Indonesia. Tidak ada yang perlu dilaporkan ke pembaca; ia hanya melihat
     * bahasa yang biasa ia lihat.
     */
    return content;
  }
}
