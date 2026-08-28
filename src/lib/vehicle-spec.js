/**
 * Definisi field kendaraan — sumber tunggal.
 *
 * Daftar tipe bodi, standar jarak, dan tipe penggerak dulu hidup di dalam
 * `src/scripts/admin.js`, tempat mereka hanya perlu diketahui satu pihak:
 * formulir. Sejak ada fitur riset AI, pihak kedua ikut membutuhkannya — skema
 * JSON yang dikirim ke DeepSeek memakai daftar yang sama sebagai `enum`, dan
 * itulah yang membuat model tidak bisa mengarang tipe bodi yang ditolak
 * dropdown.
 *
 * Dua salinan daftar yang sama akan berbeda dalam hitungan bulan. Karena itu
 * daftarnya pindah ke sini, dan dibaca keduanya. Polanya sama dengan
 * `theme.js` dan `footer.js`, yang alasannya sudah ditulis di AGENTS.md.
 *
 * Sengaja JavaScript polos tanpa API khusus Node: berkas ini dipakai
 * `admin.js` (di peramban) maupun penyusun skema di sisi server.
 *
 * BAHASA: nilai di berkas ini adalah DATA, bukan antarmuka. Ia tersimpan apa
 * adanya di `content.json` dan ikut tampil di situs publik yang berbahasa
 * Indonesia, jadi tidak diterjemahkan — sama seperti sebelumnya.
 */

export const CAR_BODY_TYPES = ["Hatchback", "Crossover", "SUV", "Sedan", "Coupe", "MPV", "Wagon", "Pikap", "Van", "Niaga"];
export const MOTOR_BODY_TYPES = ["Skuter", "Motor Bebek", "Motor Sport", "Moped", "Motor Trail", "Sepeda Listrik"];
export const RANGE_STANDARDS = ["", "WLTP", "NEDC", "CLTC", "EPA", "Klaim pabrikan"];
export const DRIVE_TYPES = ["", "FWD", "RWD", "AWD", "4WD"];

/**
 * Field yang boleh diusulkan AI, beserta batas nilai wajarnya.
 *
 * `min`/`max` bukan validasi bentuk — normalisasi di `store.ts` sudah
 * mengurus itu. Ia pagar terakhir terhadap halusinasi: angka yang mustahil
 * untuk sebuah kendaraan listrik dibuang SEBELUM sampai ke layar, supaya
 * penyunting tidak perlu menyaringnya sendiri satu per satu.
 *
 * Batasnya sengaja longgar. Yang ingin ditangkap adalah "baterai 3.500 kWh"
 * dan "harga Rp 195" — bukan menghakimi kendaraan yang memang di luar
 * kebiasaan.
 *
 * `car` / `motor` menentukan field itu ditanyakan untuk kendaraan yang mana.
 * Motor tidak punya jumlah kursi maupun penggerak roda, persis seperti
 * formulirnya di panel.
 *
 * `desc` masuk ke dalam skema JSON yang dikirim ke DeepSeek — ia yang memberi
 * tahu model apa yang sebenarnya dicari, jadi bukan sekadar komentar.
 */
export const RESEARCHABLE = [
  {
    key: "bodyType",
    type: "enum",
    car: true,
    motor: true,
    /* Pilihannya berbeda antara mobil dan motor; lihat `enumFor()`. */
    desc: "Tipe bodi kendaraan.",
  },
  { key: "year", type: "integer", car: true, motor: true, min: 2008, max: 2035, desc: "Tahun model yang dijual di Indonesia." },

  { key: "rangeKm", type: "number", car: true, motor: true, min: 20, max: 1200, unit: "km", desc: "Jarak tempuh sekali pengisian penuh, dalam kilometer." },
  { key: "rangeStandard", type: "enum", car: true, motor: true, desc: "Standar pengujian yang dipakai untuk angka jarak tempuh. Kosongkan kalau sumbernya tidak menyebut." },
  { key: "batteryKwh", type: "number", car: true, motor: true, min: 0.5, max: 250, unit: "kWh", desc: "Kapasitas baterai dalam kWh." },
  { key: "powerHp", type: "number", car: true, motor: true, min: 1, max: 2000, unit: "hp", desc: "Tenaga maksimum dalam daya kuda (hp). Kalau sumber menyebut kW, ubah dulu: 1 kW = 1,341 hp." },
  { key: "torqueNm", type: "number", car: true, motor: true, min: 1, max: 2500, unit: "Nm", desc: "Torsi maksimum dalam Nm." },
  { key: "topSpeedKph", type: "number", car: true, motor: true, min: 25, max: 400, unit: "km/j", desc: "Kecepatan maksimum dalam km/jam." },
  { key: "accelSec", type: "number", car: true, motor: true, min: 0.5, max: 60, unit: "detik", desc: "Waktu akselerasi 0-100 km/jam untuk mobil, atau 0-60 km/jam untuk motor, dalam detik." },

  { key: "seats", type: "integer", car: true, motor: false, min: 1, max: 9, desc: "Jumlah kursi." },
  { key: "driveType", type: "enum", car: true, motor: false, desc: "Penggerak roda. Kosongkan kalau sumbernya tidak menyebut." },

  { key: "chargeDcKw", type: "number", car: true, motor: true, min: 1, max: 500, unit: "kW", desc: "Daya pengisian arus searah (DC fast charging) maksimum, dalam kW." },
  { key: "chargeAcKw", type: "number", car: true, motor: true, min: 0.3, max: 50, unit: "kW", desc: "Daya pengisian arus bolak-balik (AC) maksimum, dalam kW." },
  { key: "chargeTime", type: "text", car: true, motor: true, max: 120, desc: "Ringkasan waktu pengisian apa adanya dari sumbernya, mis. \"30 menit (10-80% DC)\" atau \"4 jam (0-100%)\"." },
  { key: "warranty", type: "text", car: true, motor: true, max: 160, desc: "Ringkasan garansi, terutama garansi baterai, mis. \"8 tahun / 160.000 km untuk baterai\"." },

  { key: "price", type: "integer", car: true, motor: true, min: 5_000_000, max: 20_000_000_000, unit: "Rp", desc: "Harga on the road dalam Rupiah, sebagai angka bulat tanpa titik atau nama mata uang. Sebutkan di catatan itu OTR mana dan per tanggal berapa." },
  { key: "priceText", type: "text", car: true, motor: true, max: 60, desc: "Harga yang sama dalam bentuk singkat untuk ditampilkan, mis. \"Rp 415 jt\"." },

  { key: "variantNames", type: "list", car: true, motor: true, maxItems: 12, maxLen: 60, desc: "Nama varian resmi yang dijual di Indonesia, mis. [\"Dynamic\", \"Premium\"]." },
  { key: "colors", type: "list", car: true, motor: true, maxItems: 20, maxLen: 40, desc: "Nama warna bodi yang tersedia." },
];

/** Peta `key` → definisi, untuk pencarian cepat saat memvalidasi usulan. */
export const RESEARCHABLE_BY_KEY = new Map(RESEARCHABLE.map((f) => [f.key, f]));

/**
 * Field yang TIDAK PERNAH boleh diusulkan AI, beserta alasannya.
 *
 * Daftar ini bukan hiasan dokumentasi: `tests/ai-skema.test.ts` memakainya
 * untuk membuktikan tidak satu pun dari mereka bocor ke dalam skema JSON.
 * Menambahkan field baru ke `RESEARCHABLE` yang juga tercantum di sini akan
 * menggagalkan uji itu — dan memang seharusnya begitu.
 */
export const NEVER_RESEARCHED = {
  description: "Kalimat yang dibaca pengunjung; suara situs ditulis manusia.",
  tagline: "Kalimat yang dibaca pengunjung; suara situs ditulis manusia.",
  highlights: "Kalimat yang dibaca pengunjung; suara situs ditulis manusia.",
  image: "Hak cipta dan ketersediaan; panel sudah punya alur unggah sendiri.",
  gallery: "Hak cipta dan ketersediaan; panel sudah punya alur unggah sendiri.",
  video: "Hak cipta dan ketersediaan.",
  id: "Dihasilkan sistem.",
  kind: "Dihasilkan sistem.",
  updatedAt: "Dihasilkan sistem.",
  status: "Keputusan redaksi, bukan fakta yang bisa dicari.",
  featured: "Keputusan redaksi, bukan fakta yang bisa dicari.",
  stale: "Keputusan redaksi, bukan fakta yang bisa dicari.",
  tags: "Keputusan redaksi, bukan fakta yang bisa dicari.",
  brand: "Sudah diketahui — ia justru masukan untuk risetnya.",
  name: "Sudah diketahui — ia justru masukan untuk risetnya.",
};

/** Tingkat keyakinan yang boleh dikembalikan model. Urut dari yang tertinggi. */
export const CONFIDENCE = ["tinggi", "sedang", "rendah"];

/** `"mobil"` atau `"motor"` dari nama koleksi panel. */
export function kindOfCollection(col) {
  return col === "motors" ? "motor" : "mobil";
}

/** Field yang berlaku untuk jenis kendaraan ini. */
export function fieldsFor(kind) {
  const motor = kind === "motor";
  return RESEARCHABLE.filter((f) => (motor ? f.motor : f.car));
}

/**
 * Pilihan sah untuk field bertipe `enum`, per jenis kendaraan.
 *
 * Nilai kosong `""` sengaja ikut di `rangeStandard` dan `driveType`: "tidak
 * disebut sumbernya" adalah jawaban yang sah dan harus punya cara diungkapkan
 * yang tidak sama dengan menebak.
 */
export function enumFor(key, kind) {
  if (key === "bodyType") return kind === "motor" ? MOTOR_BODY_TYPES : CAR_BODY_TYPES;
  if (key === "rangeStandard") return RANGE_STANDARDS;
  if (key === "driveType") return DRIVE_TYPES;
  return [];
}

/**
 * Apakah nilai ini sudah terisi?
 *
 * Dipakai mode "lengkapi yang kosong" untuk memutuskan field mana yang perlu
 * diriset. `0` dianggap TERISI — nol adalah jawaban, bukan ketiadaan jawaban.
 */
export function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}
