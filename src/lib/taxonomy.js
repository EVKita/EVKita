import { rupiah } from "./card-html.js";
import { hargaWajar } from "./vehicle-spec.js";
import { makePubT } from "./i18n/pub.js";

const tId = makePubT("id");

/**
 * Pengelompokan katalog menurut merek dan tipe bodi.
 *
 * Sampai sekarang "semua mobil listrik BYD" dan "semua SUV listrik" hanya bisa
 * dijawab dengan membuka beranda lalu menggerakkan dua dropdown. Itu bukan
 * alamat, jadi tidak bisa dibagikan, tidak bisa ditautkan, dan tidak pernah
 * dilihat perayap — padahal "mobil listrik BYD" persis yang orang ketik.
 *
 * Nilainya diturunkan dari `content.json`, bukan dari daftar tetap: merek yang
 * baru ditambahkan lewat panel langsung punya halamannya sendiri, tanpa ada
 * yang perlu ingat memperbarui daftar di kode.
 *
 * Sengaja JavaScript polos tanpa API khusus Node — dipakai frontmatter
 * `.astro` maupun rute peta situs, sama seperti `pagination.js`.
 */

/**
 * Alamat sebuah nilai data: `"MG Motor"` → `mg-motor`.
 *
 * Huruf beraksen diluruskan lebih dulu (`"Citroën"` → `citroen`) supaya
 * alamatnya bisa diketik orang dan tidak berubah bentuk saat disalin lewat
 * aplikasi yang menormalkan Unicode dengan cara berbeda.
 */
export function taxoSlug(name) {
  return String(name === null || name === undefined ? "" : name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mengelompokkan kendaraan menurut satu field, dengan slug sebagai identitas.
 *
 * Yang dijadikan kunci adalah SLUG-nya, bukan teks aslinya: `"MG Motor"` dan
 * `"MG  Motor"` menghasilkan alamat yang sama, dan dua halaman dengan alamat
 * yang sama tidak bisa ada. Labelnya diambil dari nilai pertama yang ditemui
 * supaya yang tampil tetap ejaan yang ditulis penyunting.
 *
 * Nilai yang slug-nya kosong — field yang belum diisi, atau isinya hanya tanda
 * baca — sengaja tidak menghasilkan kelompok: ia tidak punya alamat yang bisa
 * didatangi. Kendaraannya tetap muncul di katalog dan di halaman detailnya.
 *
 * @param {any[]} list
 * @param {string} field
 * @returns {{ slug: string, label: string, items: any[] }[]} urut menurut label
 */
export function groupByField(list, field) {
  const map = new Map();
  for (const v of Array.isArray(list) ? list : []) {
    const raw = v && v[field];
    const slug = taxoSlug(raw);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, { slug, label: String(raw).trim(), items: [] });
    map.get(slug).items.push(v);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "id"));
}

/** Kelompok dengan slug ini, atau null. Pemanggil yang menjawab 404. */
export function findGroup(groups, slug) {
  const wanted = taxoSlug(slug);
  if (!wanted) return null;
  return (groups || []).find((g) => g.slug === wanted) || null;
}

/**
 * Angka-angka yang dipakai kalimat pembuka.
 *
 * `hargaLengkap` dan `jarakLengkap` bukan hiasan: rentang harga yang dirakit
 * dari 5 dari 9 mobil tetap benar sebagai rentang, tapi dibaca orang sebagai
 * "semua mobilnya ada di antara segini" — dan itu tidak sama.
 */
export function summarize(items) {
  const list = Array.isArray(items) ? items : [];
  /* Harga di luar batas wajar dibuang dari RENTANG, bukan dari daftarnya:
     satu salah ketik tidak boleh membuat seluruh halaman merek berbunyi
     "Rp 0 jt". Entri itu sendiri tetap tampil dengan harga apa adanya. */
  const harga = list.map((v) => v.price).filter(hargaWajar);
  const jarak = list.map((v) => v.rangeKm).filter((n) => n !== null && n !== undefined);

  return {
    total: list.length,
    mobil: list.filter((v) => v.kind !== "motor").length,
    motor: list.filter((v) => v.kind === "motor").length,
    merek: new Set(list.map((v) => v.brand).filter(Boolean)).size,
    tipe: new Set(list.map((v) => v.bodyType).filter(Boolean)).size,
    hargaMin: harga.length ? Math.min(...harga) : null,
    hargaMaks: harga.length ? Math.max(...harga) : null,
    hargaLengkap: harga.length > 0 && harga.length === list.length,
    jarakMin: jarak.length ? Math.min(...jarak) : null,
    jarakMaks: jarak.length ? Math.max(...jarak) : null,
    jarakLengkap: jarak.length > 0 && jarak.length === list.length,
  };
}

/** "7 mobil listrik", "3 mobil listrik dan 2 motor listrik", "12 motor listrik". */
export function countPhrase(s, t) {
  const tt = t || tId;
  const bagian = [];
  if (s.mobil) bagian.push(`${s.mobil} ${tt("pub.tax.mobil")}`);
  if (s.motor) bagian.push(`${s.motor} ${tt("pub.tax.motor")}`);
  if (!bagian.length) return `0 ${tt("pub.tax.kendaraan")}`;
  return bagian.join(` ${tt("pub.dan")} `);
}

/** Kata benda untuk judul: "Mobil listrik", "Motor listrik", "Kendaraan listrik". */
export function kindNoun(s, t) {
  const tt = t || tId;
  if (s.mobil && s.motor) return tt("pub.tax.titleKendaraan");
  return s.motor ? tt("pub.tax.titleMotor") : tt("pub.tax.titleMobil");
}

/**
 * Judul halaman kelompok.
 *
 * Tipe bodi diberi kata "tipe" di depannya karena "Mobil listrik Crossover"
 * terbaca seperti nama model, sementara "Mobil listrik tipe Crossover" jelas
 * menyebut golongan.
 */
export function koleksiTitle(jenis, label, s, t) {
  const tt = t || tId;
  const noun = kindNoun(s, tt);
  return jenis === "tipe" ? tt("pub.tax.titleTipe", { noun, label }) : tt("pub.tax.titleMerek", { noun, label });
}

/**
 * Kalimat pembuka yang dirakit dari datanya sendiri.
 *
 * Halaman yang isinya cuma deretan kartu tidak menjawab pertanyaan siapa pun —
 * pembaca yang mengetik "mobil listrik BYD" ingin tahu ada berapa, semahal apa,
 * dan sejauh apa jalannya, dan ketiganya sudah ada di data. Klausa yang datanya
 * tidak ada sengaja tidak muncul sama sekali, bukan diisi "—".
 *
 * @param {"merek"|"tipe"} jenis
 * @param {string} label nama merek atau tipe bodi apa adanya
 * @param {any[]} items
 * @param {any} [t] fungsi terjemah
 * @param {string} [lang] bahasa harga ("zh" memakai 亿/万, tanpa itu bawaan)
 * @returns {string} satu kalimat lengkap dengan titiknya
 */
export function koleksiLead(jenis, label, items, t, lang) {
  const tt = t || tId;
  const s = summarize(items);
  if (!s.total) return "";

  const count = countPhrase(s, tt);
  const pokok =
    jenis === "tipe"
      ? tt("pub.tax.pokokTipe", { count, label })
      : tt("pub.tax.pokokMerek", { count, label });

  const klausa = [];

  // Di halaman tipe bodi, "dari 6 merek" adalah informasi; di halaman merek ia
  // hanya mengulang judulnya sendiri.
  if (jenis === "tipe" && s.merek > 1) klausa.push(tt("pub.tax.dariMerek", { n: s.merek }));
  if (jenis === "merek" && s.tipe > 1) klausa.push(tt("pub.tax.dalamTipe", { n: s.tipe }));

  if (s.hargaMin !== null) {
    const nilai =
      s.hargaMin === s.hargaMaks
        ? rupiah(s.hargaMin, lang)
        : `${rupiah(s.hargaMin, lang)} ${tt("pub.tax.sampai")} ${rupiah(s.hargaMaks, lang)}`;
    klausa.push(tt(s.hargaLengkap ? "pub.tax.harganya" : "pub.tax.hargaTercatat", { nilai }));
  }

  if (s.jarakMin !== null) {
    const nilai =
      s.jarakMin === s.jarakMaks
        ? `${s.jarakMin} km`
        : `${s.jarakMin}–${s.jarakMaks} km`;
    klausa.push(tt(s.jarakLengkap ? "pub.tax.jaraknya" : "pub.tax.jarakTercatat", { nilai }));
  }

  return klausa.length ? `${pokok}, ${klausa.join(", ")}.` : `${pokok}.`;
}

/** Deskripsi meta — sengaja berbeda dari kalimat pembuka, bukan salinannya. */
export function koleksiDescription(jenis, label, items, t, lang) {
  const tt = t || tId;
  const s = summarize(items);
  const count = countPhrase(s, tt);
  const apa =
    jenis === "tipe" ? tt("pub.tax.bertipe", { label }) : tt("pub.tax.dari", { label });
  const harga =
    s.hargaMin !== null && s.hargaMin !== s.hargaMaks
      ? tt("pub.tax.harga", { nilai: `${rupiah(s.hargaMin, lang)}–${rupiah(s.hargaMaks, lang)}` })
      : s.hargaMin !== null
        ? tt("pub.tax.harga", { nilai: rupiah(s.hargaMin, lang) })
        : "";
  return tt("pub.tax.daftar", { count, apa }) + harga;
}
