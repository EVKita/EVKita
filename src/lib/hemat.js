/**
 * Hitungan "listrik vs bensin" — pertanyaan pertama setiap calon pembeli EV.
 *
 * Semua di sini fungsi murni tanpa API khusus Node, supaya berkas yang sama
 * dipakai dua sisi: frontmatter `.astro` yang merender hasil di server (jadi
 * halamannya berisi angka sungguhan sebelum skrip apa pun jalan) dan skrip di
 * browser yang menghitung ulang setiap angka diubah. Pola yang sama dengan
 * `card-html.js` dan `compare-html.js`.
 *
 * Kalimat hasilnya ada di kamus situs publik (`src/lib/i18n/pub.js`). Tiap
 * fungsi yang menghasilkan teks menerima `t` opsional; kalau tidak diisi ia
 * memakai Bahasa Indonesia, jadi pemanggil yang lama tidak berubah artinya.
 */
import { makePubT } from "./i18n/pub.js";

const tId = makePubT("id");

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
  { id: "rumah", label: "Di rumah", i18n: "pub.hemat.rumah", value: 1444.7, note: "tarif rumah tangga", i18nNote: "pub.hemat.tarifRumah" },
  { id: "spklu", label: "SPKLU", i18n: "pub.nav.spklu", value: 2466, note: "pengisian umum", i18nNote: "pub.hemat.pengisianUmum" },
];

/**
 * Faktor satuan Amerika — mesin hitung TETAP metrik, konversi hanya di batas
 * (halaman dan skrip mengubah isian tampilan ke metrik sebelum menghitung,
 * dan mengubah hasilnya kembali sebelum menampilkan). Pola yang sama dengan
 * mil di kalkulator pengisian.
 */
export const MIL_KM = 1.60934;
export const GALON_LITER = 3.78541;
/** 1 km/liter = 2,35215 mil/galon. */
export const MPG_PER_KML = 2.35215;

/**
 * Tarif Amerika ($ per kWh) — tarif publikasi jaringan, April–Juni 2026.
 * Polanya sama dengan `TARIF_PRESETS`: angka perkiraan sebagai tombol pintas.
 */
export const TARIF_PRESETS_US = [
  { id: "rumah", i18n: "pub.calc.usRumah", value: 0.17, i18nNote: "pub.calc.usRataNasional" },
  { id: "supercharger", i18n: "pub.calc.usSupercharger", value: 0.42, i18nNote: "pub.calc.usBayarTempat" },
  { id: "electrify", i18n: "pub.calc.usElectrify", value: 0.48, i18nNote: "pub.calc.usBayarTempat" },
  { id: "evgo", i18n: "pub.calc.usEvgo", value: 0.45, i18nNote: "pub.calc.usBayarTempat" },
];

/**
 * Tarif China (¥ per kWh) — tarif publikasi operator, Juni 2026: rumah 0,60,
 * valley malam 0,32, AC umum 1,20, DC umum 1,80.
 */
export const TARIF_PRESETS_CN = [
  { id: "rumah", i18n: "pub.calc.cnRumah", value: 0.6, i18nNote: "pub.calc.cnRataNasional" },
  { id: "malam", i18n: "pub.calc.cnMalam", value: 0.32, i18nNote: "pub.calc.cnRataNasional" },
  { id: "ac-umum", i18n: "pub.calc.cnAcUmum", value: 1.2, i18nNote: "pub.calc.cnBayarTempat" },
  { id: "dc-umum", i18n: "pub.calc.cnDcUmum", value: 1.8, i18nNote: "pub.calc.cnBayarTempat" },
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
 * Dolar AS untuk kalkulator edisi Amerika — pasangan `rupiahPenuh`.
 * "US$12.75", "US$1,500". Awalan "US$" dipakai di ketiga bahasa supaya tidak
 * tertukar dengan satuan lain di halaman berbahasa Indonesia/Mandarin.
 */
export function dolarPenuh(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return "US$" + (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2));
}

/** Dolar dengan sen — pasangan `rupiahHalus`, untuk biaya per kWh. */
export function dolarHalus(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 100) return dolarPenuh(v);
  return "US$" + v.toFixed(2);
}

/**
 * Yuan untuk kalkulator edisi China — pasangan `rupiahPenuh`/`dolarPenuh`.
 * "¥12.75", "¥1,500". Awalan "¥" dipakai di ketiga bahasa.
 */
export function yuanPenuh(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return "¥" + (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2));
}

/** Yuan dengan sen — pasangan `rupiahHalus`/`dolarHalus`, untuk biaya per kWh. */
export function yuanHalus(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 100) return yuanPenuh(v);
  return "¥" + v.toFixed(2);
}

/**
 * Lama balik modal dalam kalimat manusia: "2 tahun 3 bulan".
 *
 * Dibulatkan ke atas ke bulan penuh — bulan yang belum lewat belum menghemat
 * apa pun, jadi membulatkannya ke bawah akan menjanjikan lebih cepat dari
 * yang sebenarnya.
 */
export function lamaBalikModal(months, t = tId) {
  // `Number(null)` bernilai 0, jadi null harus dicegat SEBELUM diubah jadi
  // angka — kalau tidak, "belum bisa dihitung" terbaca "balik seketika".
  if (months === null || months === undefined) return "";
  const n = Number(months);
  if (!Number.isFinite(n)) return "";
  const m = Math.ceil(n);
  if (m <= 0) return t("pub.hemat.balikLangsung");
  if (m < 12) return t("pub.hemat.balikBulan", { n: m });
  const tahun = Math.floor(m / 12);
  const sisa = m % 12;
  return sisa
    ? t("pub.hemat.balikTahunBulan", { t: tahun, b: sisa })
    : t("pub.hemat.balikTahun", { t: tahun });
}

/**
 * Jawaban "kapan balik modal" dalam satu frasa.
 *
 * Ditaruh di sini, bukan di halaman dan skripnya masing-masing: kalimat yang
 * berbeda antara render server dan render browser sama merusaknya dengan angka
 * yang berbeda.
 */
export function teksBalikModal(hasil, t = tId) {
  if (hasil.paybackNever) return t("pub.hemat.tidakPernah");
  if (hasil.paybackTooLong) return t("pub.hemat.terlaluLama");
  return lamaBalikModal(hasil.paybackMonths, t) || "—";
}

/** Kalimat ringkas di atas kartu hasil. */
export function teksRingkas(hasil, t = tId, o = {}) {
  /* Edisi regional memakai mata uangnya sendiri. Pemanggil lama yang
     tidak mengirim opsi tidak berubah artinya. */
  const uang = o && o.region === "us" ? dolarPenuh : o && o.region === "cn" ? yuanPenuh : rupiahPenuh;
  if (hasil.savingMonthly === null) return t("pub.hemat.isiAngka");
  if (hasil.savingMonthly > 0) {
    return t("pub.hemat.hematBulan", {
      bulan: uang(hasil.savingMonthly),
      tahun: uang(hasil.savingYearly),
    });
  }
  if (hasil.savingMonthly < 0) {
    return t("pub.hemat.lebihMahal", { bulan: uang(Math.abs(hasil.savingMonthly)) });
  }
  return t("pub.hemat.sama");
}
