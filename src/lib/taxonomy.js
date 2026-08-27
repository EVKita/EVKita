import { rupiah } from "./card-html.js";

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
  const harga = list.map((v) => v.price).filter((n) => n !== null && n !== undefined);
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
export function countPhrase(s) {
  const bagian = [];
  if (s.mobil) bagian.push(`${s.mobil} mobil listrik`);
  if (s.motor) bagian.push(`${s.motor} motor listrik`);
  if (!bagian.length) return "0 kendaraan listrik";
  return bagian.join(" dan ");
}

/** Kata benda untuk judul: "Mobil listrik", "Motor listrik", "Kendaraan listrik". */
export function kindNoun(s) {
  if (s.mobil && s.motor) return "Kendaraan listrik";
  return s.motor ? "Motor listrik" : "Mobil listrik";
}

/**
 * Judul halaman kelompok.
 *
 * Tipe bodi diberi kata "tipe" di depannya karena "Mobil listrik Crossover"
 * terbaca seperti nama model, sementara "Mobil listrik tipe Crossover" jelas
 * menyebut golongan.
 */
export function koleksiTitle(jenis, label, s) {
  return jenis === "tipe" ? `${kindNoun(s)} tipe ${label}` : `${kindNoun(s)} ${label}`;
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
 * @returns {string} satu kalimat lengkap dengan titiknya
 */
export function koleksiLead(jenis, label, items) {
  const s = summarize(items);
  if (!s.total) return "";

  const pokok =
    jenis === "tipe"
      ? `${countPhrase(s)} bertipe ${label} yang dijual di Indonesia`
      : `${countPhrase(s)} ${label} yang dijual di Indonesia`;

  const klausa = [];

  // Di halaman tipe bodi, "dari 6 merek" adalah informasi; di halaman merek ia
  // hanya mengulang judulnya sendiri.
  if (jenis === "tipe" && s.merek > 1) klausa.push(`dari ${s.merek} merek`);
  if (jenis === "merek" && s.tipe > 1) klausa.push(`dalam ${s.tipe} tipe bodi`);

  if (s.hargaMin !== null) {
    const awalan = s.hargaLengkap ? "harganya" : "harga yang tercatat";
    klausa.push(
      s.hargaMin === s.hargaMaks
        ? `${awalan} ${rupiah(s.hargaMin)}`
        : `${awalan} ${rupiah(s.hargaMin)} sampai ${rupiah(s.hargaMaks)}`
    );
  }

  if (s.jarakMin !== null) {
    const awalan = s.jarakLengkap ? "jarak tempuhnya" : "jarak tempuh yang tercatat";
    klausa.push(
      s.jarakMin === s.jarakMaks
        ? `${awalan} ${s.jarakMin} km`
        : `${awalan} ${s.jarakMin}–${s.jarakMaks} km`
    );
  }

  return klausa.length ? `${pokok}, ${klausa.join(", ")}.` : `${pokok}.`;
}

/** Deskripsi meta — sengaja berbeda dari kalimat pembuka, bukan salinannya. */
export function koleksiDescription(jenis, label, items) {
  const s = summarize(items);
  const apa = jenis === "tipe" ? `bertipe ${label}` : `dari ${label}`;
  const harga =
    s.hargaMin !== null && s.hargaMin !== s.hargaMaks
      ? ` Harga ${rupiah(s.hargaMin)}–${rupiah(s.hargaMaks)}.`
      : s.hargaMin !== null
        ? ` Harga ${rupiah(s.hargaMin)}.`
        : "";
  return `Daftar ${countPhrase(s)} ${apa} yang dijual di Indonesia, lengkap dengan jarak tempuh, kapasitas baterai, tenaga, dan harganya.${harga}`;
}
