/**
 * Penyusun permintaan riset: instruksi + skema JSON untuk DeepSeek.
 *
 * Keduanya dibangun dari `vehicle-spec.js`, bukan ditulis tangan. Itu yang
 * membuat dua janji ini bisa ditegakkan, bukan sekadar diharapkan:
 *
 *   1. Tipe bodi, standar jarak, dan tipe penggerak yang dikembalikan model
 *      SELALU salah satu pilihan di dropdown panel — karena `enum` di dalam
 *      skema adalah daftar yang sama persis.
 *   2. Field yang tidak boleh diisi AI (deskripsi, tagline, sorotan, gambar)
 *      tidak punya tempat untuk ditulis. Ia bukan larangan di dalam kalimat
 *      prompt, yang bisa diabaikan model; ia ketiadaan properti di dalam
 *      skema, yang tidak bisa.
 *
 * Sengaja JavaScript polos: berkas ini tidak memanggil apa pun milik Node,
 * sehingga bisa diuji langsung dan dipakai di kedua sisi.
 */

import { CONFIDENCE, enumFor, fieldsFor, isFilled } from "./vehicle-spec.js";

/** Panjang maksimum catatan per field. Cukup untuk satu kalimat plus tanggal. */
const MAX_CATATAN = 240;

function schemaForValue(field, kind) {
  if (field.type === "enum") {
    // `null` ikut di dalam enum, bukan sekadar di `type`: itu satu-satunya cara
    // model bisa mengatakan "tidak ketemu" tanpa memilih salah satu nilai asal.
    return { type: ["string", "null"], enum: [...enumFor(field.key, kind), null] };
  }
  if (field.type === "integer") return { type: ["integer", "null"] };
  if (field.type === "number") return { type: ["number", "null"] };
  if (field.type === "list") {
    return { type: ["array", "null"], items: { type: "string" }, maxItems: field.maxItems || 20 };
  }
  return { type: ["string", "null"] };
}

/**
 * Skema satu field.
 *
 * Setiap field jadi OBJEK, bukan nilai telanjang. Nilai telanjang memaksa
 * penyunting memercayai seluruh jawaban atau tidak sama sekali; dengan sumber
 * dan keyakinan menempel pada angkanya sendiri, mereka bisa memutuskan baris
 * per baris — dan itu satu-satunya cara panel usulan bisa berguna.
 */
function schemaForField(field, kind) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      nilai: schemaForValue(field, kind),
      keyakinan: { type: "string", enum: [...CONFIDENCE] },
      sumber: {
        type: ["string", "null"],
        description: "Alamat halaman tempat nilai ini ditemukan. null kalau nilainya juga null.",
      },
      catatan: {
        type: "string",
        maxLength: MAX_CATATAN,
        description: "Fakta pendukung singkat: tanggal, varian mana, satuan aslinya. Bukan kalimat pemasaran.",
      },
    },
    required: ["nilai", "keyakinan", "sumber", "catatan"],
  };
}

/**
 * Skema lengkap satu riset kendaraan.
 *
 * @param {"mobil"|"motor"} kind
 * @param {string[]} [only] Batasi ke field tertentu (mode "lengkapi yang
 *   kosong" dan "cek harga"). Kosong berarti seluruh field yang berlaku.
 * @param {string} [wilayah] "us" memakai deskripsi Dolar/mil/EPA untuk
 *   field yang satuannya beda pasar — tanpa ini AI disuruh mencari harga
 *   Dolar lalu diminta menuliskannya "dalam Rupiah".
 */
export function buildSchema(kind, only, wilayah) {
  const wanted = only && only.length ? new Set(only) : null;
  const fields = fieldsFor(kind).filter((f) => !wanted || wanted.has(f.key));

  const properties = {};
  for (const f of fields) properties[f.key] = schemaForField(f, kind);

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ringkasan: {
        type: "string",
        maxLength: 400,
        description: "Satu-dua kalimat tentang bagaimana riset ini dilakukan dan seberapa bisa dipercaya hasilnya.",
      },
      peringatan: {
        type: "array",
        maxItems: 8,
        items: { type: "string", maxLength: 200 },
        description: "Hal yang perlu diperiksa manusia: sumber yang saling bertentangan, angka yang mungkin sudah kedaluwarsa.",
      },
      field: {
        type: "object",
        additionalProperties: false,
        properties,
        required: Object.keys(properties),
      },
    },
    required: ["ringkasan", "peringatan", "field"],
  };
}

/** Field mana yang perlu diriset untuk mode "lengkapi yang kosong". */
export function emptyFieldKeys(kind, vehicle) {
  return fieldsFor(kind)
    .filter((f) => !isFilled(vehicle ? vehicle[f.key] : null))
    .map((f) => f.key);
}

/** Field untuk mode "cek harga". */
export const PRICE_FIELDS = ["price", "priceText", "variantNames"];

function describeFields(kind, only, wilayah) {
  const wanted = only && only.length ? new Set(only) : null;
  const us = wilayah === "us";
  return fieldsFor(kind)
    .filter((f) => !wanted || wanted.has(f.key))
    .map((f) => {
      const batas =
        f.type === "number" || f.type === "integer"
          ? ` Nilai wajar antara ${f.min} dan ${f.max}${f.unit ? " " + f.unit : ""}.`
          : "";
      const desc = us && US_DESC[f.key] ? US_DESC[f.key] : f.desc;
      return `- ${f.key}: ${desc}${batas}`;
    })
    .join("\n");
}

/**
 * Deskripsi field yang satuannya beda pasar — dipakai `describeFields()`
 * bila risetnya untuk Amerika. Batas angka (`min`/`max`) tetap milik definisi
 * asal: mil dan Dolar angkanya lebih kecil sehingga selalu lolos batas
 * Indonesia (yang menolak hanyalah angka yang memang ngawur di kedua pasar).
 */
const US_DESC = {
  price: "Harga MSRP dalam Dolar AS, sebagai angka bulat tanpa titik atau nama mata uang.",
  priceText: 'Harga yang sama dalam bentuk singkat untuk ditampilkan, mis. "US$39,990".',
  rangeKm: "Jarak tempuh sekali pengisian penuh, dalam MIL (standar EPA).",
  rangeStandard: "Standar pengujian untuk angka jarak tempuh — untuk Amerika isi EPA.",
  topSpeedKph: "Kecepatan maksimum dalam mil/jam.",
  accelSec: "Waktu akselerasi 0-60 mph, dalam detik.",
  year: "Tahun model yang dijual di Amerika.",
  penjualan2026: "Unit terjual di Amerika Serikat sepanjang tahun 2026 (angka resmi pabrikan atau estimasi Cox Automotive). Tulis angka tahun berjalan apa adanya; kosongkan kalau tidak ada sumber yang menyebut.",
  penjualanBulan: "Bulan yang dicerminkan angka penjualan2026, format YYYY-MM persis. Selalu isi bersama penjualan2026; kosongkan kalau penjualan2026 dikosongkan.",
  variantNames: "Nama varian resmi yang dijual di Amerika.",
  warranty: "Ringkasan garansi, terutama garansi baterai, mis. garansi baterai 8 tahun / 100.000 mil.",
};

/**
 * Instruksi sistem.
 *
 * Ditulis dalam Bahasa Indonesia karena seluruh sasarannya berbahasa Indonesia:
 * pasarnya, sumbernya, dan pembaca hasilnya.
 *
 * Pengecualian satu-satunya: kendaraan edisi Amerika (`opts.wilayah === "us").
 * Promptnya tetap Bahasa Indonesia (panelnya begitu), tetapi pasarnya Amerika
 * Serikat — harga Dolar AS, jarak EPA dalam mil, colokan NACS, dan sumber
 * resmi pabrikan versi Amerika. Tanpa ini riset kendaraan Amerika memakai
 * angka pasar Indonesia.
 *
 * @param {object} opts
 * @param {"mobil"|"motor"} opts.kind
 * @param {string} opts.brand
 * @param {string} opts.name
 * @param {string} [opts.hint] Teks bebas dari penyunting, mis. tahun modelnya.
 * @param {string[]} [opts.only] Batasi ke field tertentu.
 * @param {string} opts.today Tanggal hari ini (YYYY-MM-DD). Diberikan pemanggil,
 *   bukan dibaca di sini, supaya fungsinya bisa diuji dengan hasil yang tetap.
 * @param {string} [opts.wilayah] "us" untuk pasar Amerika; selainnya Indonesia.
 */
export function buildInstructions(opts) {
  const { kind, brand, name, hint, only, today } = opts;
  const us = opts && opts.wilayah === "us";
  const jenis = kind === "motor" ? "motor listrik" : "mobil listrik";
  const sebagian = only && only.length;

  const pasar = us
    ? [
        "PASAR",
        "- Hanya versi yang dijual resmi di Amerika Serikat. Kalau versi Amerika berbeda dari versi global, pakai yang Amerika.",
        "- Harga dalam Dolar AS (angka saja, tanpa simbol). Jarak tempuh dalam MIL (standar EPA), bukan kilometer.",
        "",
        "SUMBER",
        "- Dahulukan situs resmi pabrikan versi Amerika (tesla.com, ford.com, chevrolet.com, hyundaiusa.com, kia.com, zeromotorcycles.com, livewire.com), lalu media otomotif Amerika yang mapan (InsideEVs, Electrek, Car and Driver, Edmunds, Kelley Blue Book).",
        "- Marketplace, iklan baris, dan forum BUKAN sumber harga maupun spesifikasi.",
        "- Sebutkan satu alamat halaman untuk tiap nilai yang kamu isi.",
      ]
    : [
        "PASAR",
        "- Hanya versi yang dijual resmi di Indonesia. Kalau versi Indonesia berbeda dari versi global, pakai yang Indonesia.",
        "- Harga dalam Rupiah, on the road. Sebutkan di catatan itu OTR kota mana dan per tanggal berapa.",
        "",
        "SUMBER",
        "- Dahulukan situs resmi pabrikan di Indonesia, lalu media otomotif Indonesia yang mapan.",
        "- Marketplace, iklan baris, dan forum BUKAN sumber harga maupun spesifikasi.",
        "- Sebutkan satu alamat halaman untuk tiap nilai yang kamu isi.",
      ];

  return [
    `Kamu meriset spesifikasi dan harga ${jenis} untuk katalog referensi berbahasa Indonesia.`,
    `Hari ini ${today}. Kendaraan yang diriset: ${brand} ${name}.`,
    hint ? `Keterangan tambahan dari penyunting: ${hint}` : "",
    "",
    ...pasar,
    "",
    "KEJUJURAN",
    "- Kalau sebuah angka tidak ketemu, isi nilainya null dengan keyakinan \"rendah\". JANGAN menebak.",
    "  Field yang kosong jauh lebih baik daripada field yang salah — situs ini dibaca orang untuk mengambil keputusan.",
    "- Keyakinan \"tinggi\" hanya untuk nilai dari situs resmi pabrikan.",
    "- Kalau dua sumber berbeda, pakai yang paling resmi dan tulis perbedaannya di peringatan.",
    "- Kalau angkanya lebih tua dari satu tahun, katakan itu di catatan.",
    "",
    "BENTUK JAWABAN",
    "- Satuan sudah ditentukan per field di bawah. Ubah dulu kalau sumbernya memakai satuan lain.",
    "- Angka ditulis sebagai angka, tanpa satuan, tanpa titik pemisah ribuan.",
    "- Jangan menulis kalimat pemasaran di mana pun, termasuk di catatan.",
    "",
    sebagian
      ? "FIELD YANG DIMINTA (hanya ini, sisanya sudah terisi dan tidak boleh diubah)"
      : "FIELD YANG DIMINTA",
    describeFields(kind, only, opts && opts.wilayah),
  ]
    .filter((baris) => baris !== "")
    .join("\n");
}
