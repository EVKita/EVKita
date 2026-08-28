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
 */
export function buildSchema(kind, only) {
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

function describeFields(kind, only) {
  const wanted = only && only.length ? new Set(only) : null;
  return fieldsFor(kind)
    .filter((f) => !wanted || wanted.has(f.key))
    .map((f) => {
      const batas =
        f.type === "number" || f.type === "integer"
          ? ` Nilai wajar antara ${f.min} dan ${f.max}${f.unit ? " " + f.unit : ""}.`
          : "";
      return `- ${f.key}: ${f.desc}${batas}`;
    })
    .join("\n");
}

/**
 * Instruksi sistem.
 *
 * Ditulis dalam Bahasa Indonesia karena seluruh sasarannya berbahasa Indonesia:
 * pasarnya, sumbernya, dan pembaca hasilnya.
 *
 * @param {object} opts
 * @param {"mobil"|"motor"} opts.kind
 * @param {string} opts.brand
 * @param {string} opts.name
 * @param {string} [opts.hint] Teks bebas dari penyunting, mis. tahun modelnya.
 * @param {string[]} [opts.only] Batasi ke field tertentu.
 * @param {string} opts.today Tanggal hari ini (YYYY-MM-DD). Diberikan pemanggil,
 *   bukan dibaca di sini, supaya fungsinya bisa diuji dengan hasil yang tetap.
 */
export function buildInstructions(opts) {
  const { kind, brand, name, hint, only, today } = opts;
  const jenis = kind === "motor" ? "motor listrik" : "mobil listrik";
  const sebagian = only && only.length;

  return [
    `Kamu meriset spesifikasi dan harga ${jenis} untuk katalog referensi berbahasa Indonesia.`,
    `Hari ini ${today}. Kendaraan yang diriset: ${brand} ${name}.`,
    hint ? `Keterangan tambahan dari penyunting: ${hint}` : "",
    "",
    "PASAR",
    "- Hanya versi yang dijual resmi di Indonesia. Kalau versi Indonesia berbeda dari versi global, pakai yang Indonesia.",
    "- Harga dalam Rupiah, on the road. Sebutkan di catatan itu OTR kota mana dan per tanggal berapa.",
    "",
    "SUMBER",
    "- Dahulukan situs resmi pabrikan di Indonesia, lalu media otomotif Indonesia yang mapan.",
    "- Marketplace, iklan baris, dan forum BUKAN sumber harga maupun spesifikasi.",
    "- Sebutkan satu alamat halaman untuk tiap nilai yang kamu isi.",
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
    describeFields(kind, only),
  ]
    .filter((baris) => baris !== "")
    .join("\n");
}
