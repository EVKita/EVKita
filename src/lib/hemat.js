/**
 * Hitungan "listrik vs bensin" — pertanyaan pertama setiap calon pembeli EV.
 *
 * Semua di sini fungsi murni tanpa API khusus Node, supaya berkas yang sama
 * dipakai dua sisi: frontmatter `.astro` yang merender hasil di server (jadi
 * halamannya berisi angka sungguhan sebelum skrip apa pun jalan) dan skrip di
 * browser yang menghitung ulang setiap angka diubah. Pola yang sama dengan
 * `card-html.js` dan `compare-html.js`.
 *
 * Teksnya Bahasa Indonesia dan memang tidak diterjemahkan — situs publik ini
 * berbahasa Indonesia.
 */

/**
 * Nilai awal formulir.
 *
 * Semuanya PERKIRAAN yang bisa diubah pembaca, bukan angka resmi: harga BBM
 * berbeda tiap jenis dan tiap daerah, tarif listrik berbeda tiap golongan, dan
 * konsumsi mobil bensin berbeda tiap model. Halamannya wajib mengatakan itu —
 * kalkulator yang menyajikan asumsinya sebagai fakta lebih menyesatkan
 * daripada tidak ada kalkulator sama sekali.
 */
export const DEFAULTS = {
  /** Rupiah per liter, sekelas bensin non-subsidi. */
  fuelPrice: 13000,
  /** Km per liter mobil bensin pembanding. */
  kmPerLiter: 12,
  /** Rupiah per kWh, sekelas tarif rumah tangga. */
  elecPrice: 1444.7,
  /** Km per bulan. */
  kmPerMonth: 1000,
};

/**
 * Batas masuk akal balik modal, dalam bulan.
 *
 * Di luar ini jawabannya berhenti berarti. "Balik modal dalam 403 tahun"
 * secara aritmetika benar, tapi yang dibaca orang dari sebuah angka adalah
 * "jadi ada waktunya" — padahal tidak ada mobil yang dipakai selama itu.
 * Lima belas tahun kira-kira umur pakai mobil yang wajar.
 */
export const BATAS_BALIK_MODAL = 15 * 12;

/** Tarif listrik yang lazim dipakai, sebagai tombol pintas. Keduanya perkiraan. */
export const TARIF_PRESETS = [
  { id: "rumah", label: "Di rumah", value: 1444.7, note: "tarif rumah tangga" },
  { id: "spklu", label: "SPKLU", value: 2466, note: "pengisian umum" },
];

/**
 * Konsumsi listrik kendaraan, kWh per 100 km.
 *
 * Diturunkan dari kapasitas baterai dibagi jarak tempuh klaim pabrik, karena
 * hanya itu yang ada di katalog. Angka klaim itu WLTP/NEDC dan di jalan
 * sebenarnya hampir selalu lebih boros — belum lagi rugi daya saat mengisi.
 * Karena itu nilainya dipakai sebagai ISIAN AWAL yang bisa diubah, bukan
 * sebagai angka yang dipatok.
 *
 * @param {any} v
 * @returns {number|null} dibulatkan satu desimal, atau null kalau datanya kurang
 */
export function consumptionKwhPer100(v) {
  if (!v) return null;
  const kwh = Number(v.batteryKwh);
  const km = Number(v.rangeKm);
  if (!Number.isFinite(kwh) || !Number.isFinite(km) || kwh <= 0 || km <= 0) return null;
  return Math.round((kwh / km) * 100 * 10) / 10;
}

/**
 * Membaca satu isian jadi angka, atau null.
 *
 * Isian yang KOSONG harus jadi null, bukan nol. `Number("")` bernilai 0, dan
 * kalau itu dibiarkan lolos, field "harga mobil bensin" yang belum diisi
 * terbaca sebagai mobil bensin seharga Rp 0 — lalu kalkulatornya dengan
 * percaya diri menghitung balik modal dari selisih harga yang tidak pernah
 * dimaksudkan siapa pun.
 */
function angka(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const teks = String(v).trim();
  if (teks === "") return null;
  const n = Number(teks.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Angka yang harus lebih dari nol: harga, tarif, jarak, konsumsi. */
function positif(v) {
  const n = angka(v);
  return n !== null && n > 0 ? n : null;
}

/** Sama, tapi nol diterima — harga beli boleh saja sama besar. */
function nonNegatif(v) {
  const n = angka(v);
  return n !== null && n >= 0 ? n : null;
}

/**
 * @typedef {object} HematInput
 * @property {number|string} kwhPer100 konsumsi listrik per 100 km
 * @property {number|string} elecPrice rupiah per kWh
 * @property {number|string} kmPerLiter konsumsi mobil bensin
 * @property {number|string} fuelPrice rupiah per liter
 * @property {number|string} kmPerMonth km per bulan
 * @property {number|string} [evPrice] harga beli mobil listrik
 * @property {number|string} [icePrice] harga beli mobil bensin
 */

/**
 * @param {HematInput} input
 * @returns {{
 *   ok: boolean,
 *   evPerKm: number|null, icePerKm: number|null,
 *   evMonthly: number|null, iceMonthly: number|null,
 *   savingMonthly: number|null, savingYearly: number|null,
 *   priceGap: number|null,
 *   paybackMonths: number|null,
 *   paybackNever: boolean,
 * }}
 */
export function hitungHemat(input) {
  const kwhPer100 = positif(input.kwhPer100);
  const elecPrice = positif(input.elecPrice);
  const kmPerLiter = positif(input.kmPerLiter);
  const fuelPrice = positif(input.fuelPrice);
  const kmPerMonth = positif(input.kmPerMonth);

  const evPerKm = kwhPer100 !== null && elecPrice !== null ? (kwhPer100 / 100) * elecPrice : null;
  const icePerKm = kmPerLiter !== null && fuelPrice !== null ? fuelPrice / kmPerLiter : null;

  const evMonthly = evPerKm !== null && kmPerMonth !== null ? evPerKm * kmPerMonth : null;
  const iceMonthly = icePerKm !== null && kmPerMonth !== null ? icePerKm * kmPerMonth : null;

  const savingMonthly = evMonthly !== null && iceMonthly !== null ? iceMonthly - evMonthly : null;
  const savingYearly = savingMonthly !== null ? savingMonthly * 12 : null;

  const evPrice = nonNegatif(input.evPrice);
  const icePrice = nonNegatif(input.icePrice);
  const priceGap = evPrice !== null && icePrice !== null ? evPrice - icePrice : null;

  /*
   * Tiga jawaban yang berbeda, dan membedakannya penting:
   *   0     — mobil listriknya sudah tidak lebih mahal, jadi tidak ada yang
   *           perlu dikembalikan;
   *   null + paybackNever — hemat bahan bakarnya nol atau justru minus, jadi
   *           selisih harga beli TIDAK akan pernah kembali. Menampilkan angka
   *           raksasa di sini akan terbaca seperti "sabar, nanti juga balik";
   *   null  — datanya memang belum cukup untuk menjawab.
   */
  let paybackMonths = null;
  let paybackNever = false;
  if (priceGap !== null && savingMonthly !== null) {
    if (priceGap <= 0) paybackMonths = 0;
    else if (savingMonthly <= 0) paybackNever = true;
    else paybackMonths = priceGap / savingMonthly;
  }
  const paybackTooLong = paybackMonths !== null && paybackMonths > BATAS_BALIK_MODAL;

  return {
    ok: evMonthly !== null && iceMonthly !== null,
    evPerKm,
    icePerKm,
    evMonthly,
    iceMonthly,
    savingMonthly,
    savingYearly,
    priceGap,
    paybackMonths,
    paybackNever,
    paybackTooLong,
  };
}

/** "Rp 1.234.567" — bentuk penuh, bukan singkatan "Rp 1,2 jt" seperti di kartu. */
export function rupiahPenuh(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return "Rp " + Math.round(Number(n)).toLocaleString("id-ID");
}

/** Rupiah dengan dua desimal — biaya per km bisa saja di bawah seribu. */
export function rupiahHalus(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 100) return rupiahPenuh(v);
  return "Rp " + v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lama balik modal dalam kalimat manusia: "2 tahun 3 bulan".
 *
 * Dibulatkan ke atas ke bulan penuh — bulan yang belum lewat belum menghemat
 * apa pun, jadi membulatkannya ke bawah akan menjanjikan lebih cepat dari
 * yang sebenarnya.
 */
export function lamaBalikModal(months) {
  // `Number(null)` bernilai 0, jadi null harus dicegat SEBELUM diubah jadi
  // angka — kalau tidak, "belum bisa dihitung" terbaca "balik seketika".
  if (months === null || months === undefined) return "";
  const n = Number(months);
  if (!Number.isFinite(n)) return "";
  const m = Math.ceil(n);
  if (m <= 0) return "langsung, sejak hari pertama";
  if (m < 12) return `${m} bulan`;
  const tahun = Math.floor(m / 12);
  const sisa = m % 12;
  return sisa ? `${tahun} tahun ${sisa} bulan` : `${tahun} tahun`;
}

/**
 * Jawaban "kapan balik modal" dalam satu frasa.
 *
 * Ditaruh di sini, bukan di halaman dan skripnya masing-masing: kalimat yang
 * berbeda antara render server dan render browser sama merusaknya dengan angka
 * yang berbeda.
 */
export function teksBalikModal(hasil) {
  if (hasil.paybackNever) return "Tidak pernah kembali";
  if (hasil.paybackTooLong) return "Lebih lama dari umur pakai mobilnya";
  return lamaBalikModal(hasil.paybackMonths) || "—";
}

/** Kalimat ringkas di atas kartu hasil. */
export function teksRingkas(hasil) {
  if (hasil.savingMonthly === null) return "Isi angkanya untuk melihat hasilnya.";
  if (hasil.savingMonthly > 0) {
    return `Dengan angka di atas, mobil listrik menghemat ${rupiahPenuh(hasil.savingMonthly)} sebulan — ${rupiahPenuh(hasil.savingYearly)} setahun.`;
  }
  if (hasil.savingMonthly < 0) {
    return `Dengan angka di atas, mobil listriknya justru lebih mahal ${rupiahPenuh(Math.abs(hasil.savingMonthly))} sebulan. Biasanya ini tanda tarif listrik yang dipakai terlalu tinggi, atau mobil bensin pembandingnya terlalu irit.`;
  }
  return "Dengan angka di atas, biaya keduanya persis sama.";
}
