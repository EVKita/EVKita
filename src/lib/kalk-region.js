/**
 * Angka bawaan kalkulator per edisi: TCO, emisi karbon, dan biaya perjalanan.
 *
 * Satu tempat, tiga edisi. Halaman TIDAK boleh menyalin angka-angka ini —
 * bawaan yang ditulis dua kali akan berbeda sendiri begitu salah satunya
 * diperbarui, dan pembaca di dua edisi akan melihat dua jawaban berbeda untuk
 * pertanyaan yang sama.
 *
 * Semuanya PERKIRAAN yang bisa diubah pembaca: harga mobil berbeda tiap model,
 * tarif listrik berbeda tiap golongan dan jaringan, harga BBM berubah tiap
 * pekan. Halamannya wajib mengatakan itu — kalkulator yang menyajikan
 * asumsinya sebagai fakta lebih menyesatkan daripada tidak ada kalkulator.
 *
 * Berkas ini murni (tanpa Node) supaya aturannya dipakai server DAN diuji di
 * `tests/kalk-region.test.ts`.
 */

import {
  MIL_KM,
  GALON_LITER,
  rupiahPenuh,
  rupiahHalus,
  dolarPenuh,
  dolarHalus,
  yuanPenuh,
  yuanHalus,
} from "./hemat.js";

export { MIL_KM, GALON_LITER };

/**
 * TCO: harga mobil, uang muka, jangka, bunga, jarak setahun, tarif listrik,
 * depresiasi, perawatan setahun, dan konsumsi listrik (kWh per km).
 *
 * `jarak` dalam satuan edisinya sendiri (mil untuk Amerika) — konversi ke km
 * dilakukan `jarakKeKm()` supaya mesin hitung tetap metrik.
 */
export const TCO_BAWAAN = {
  id: {
    harga: 400_000_000,
    uangMuka: 20,
    jangka: 5,
    bunga: 6,
    jarak: 15_000,
    tarif: 2_466,
    depresiasi: 15,
    perawatan: 2_000_000,
    konsumsiKwhPerKm: 0.18,
  },
  us: {
    harga: 45_000,
    uangMuka: 20,
    jangka: 5,
    bunga: 7,
    jarak: 12_000,
    tarif: 0.42,
    depresiasi: 15,
    perawatan: 600,
    konsumsiKwhPerKm: 0.17,
  },
  cn: {
    harga: 250_000,
    uangMuka: 30,
    jangka: 5,
    bunga: 5,
    jarak: 15_000,
    tarif: 1.8,
    depresiasi: 15,
    perawatan: 3_000,
    konsumsiKwhPerKm: 0.15,
  },
};

/**
 * Emisi karbon: jarak setahun, konsumsi mobil bensin & listrik, faktor emisi
 * jaringan listrik (kg CO₂ per kWh).
 *
 * `bbm` dan `ev` memakai satuan yang lazim di edisinya — Amerika MPG dan
 * kWh/100 mi, Indonesia & China L/100 km dan kWh/100 km. Konversinya di
 * `metrikKarbon()`.
 */
export const KARBON_BAWAAN = {
  id: { jarak: 15_000, bbm: 8, ev: 18, faktor: 0.85 },
  us: { jarak: 12_000, bbm: 25, ev: 30, faktor: 0.37 },
  cn: { jarak: 15_000, bbm: 7.5, ev: 15, faktor: 0.55 },
};

/**
 * Biaya perjalanan (dipakai halaman rute): konsumsi listrik, tarif listrik,
 * konsumsi bensin, harga bensin. Bensin Amerika dijual per galon, jadi
 * bawaannya per galon dan dikonversi ke per liter di `bawaanRute()`.
 */
export const RUTE_BAWAAN = {
  id: { konsumsiKwh100: 18, tarif: 2_466, konsumsiBbm100: 8, hargaBbm: 13_000 },
  us: { konsumsiKwh100: 30, tarif: 0.42, konsumsiBbm100: 25, hargaBbm: 3.6 },
  cn: { konsumsiKwh100: 15, tarif: 1.8, konsumsiBbm100: 7.5, hargaBbm: 7.5 },
};

/** Satuan jarak edisi: Amerika memakai mil, dua lainnya kilometer. */
export function satuanJarak(region) {
  return region === "us" ? "mi" : "km";
}

/** Satuan emisi yang dibaca orang di edisinya: Amerika pon, lainnya kilogram. */
export function satuanEmisi(region) {
  return region === "us" ? "lb" : "kg";
}

/** Kode mata uang ISO untuk JSON-LD. */
export function mataUang(region) {
  return region === "us" ? "USD" : region === "cn" ? "CNY" : "IDR";
}

/** Lambang mata uang untuk label formulir ("Tarif listrik (Rp/kWh)"). */
export function simbolMataUang(region) {
  return region === "us" ? "US$" : region === "cn" ? "¥" : "Rp";
}

/** Satuan konsumsi listrik di edisinya sendiri. */
export function satuanKonsumsiListrik(region) {
  return region === "us" ? "kWh/100 mi" : "kWh/100 km";
}

/** Satuan konsumsi bensin di edisinya sendiri. */
export function satuanKonsumsiBbm(region) {
  return region === "us" ? "MPG" : "L/100 km";
}

/** Mata uang penuh: "Rp 1.234.567", "US$12,345", "¥1,234". */
export function uangTeks(region, n) {
  if (region === "us") return dolarPenuh(n);
  if (region === "cn") return yuanPenuh(n);
  return rupiahPenuh(n);
}

/** Mata uang dengan pecahan — untuk angka di bawah seratus (biaya per km). */
export function uangHalusTeks(region, n) {
  if (region === "us") return dolarHalus(n);
  if (region === "cn") return yuanHalus(n);
  return rupiahHalus(n);
}

/** Angka edisi (mil untuk Amerika) → kilometer, untuk mesin hitung. */
export function jarakKeKm(nilai, region) {
  const n = Number(nilai);
  if (!Number.isFinite(n)) return 0;
  return region === "us" ? n * MIL_KM : n;
}

/** Kilometer → satuan edisi (mil untuk Amerika), untuk ditampilkan. */
export function kmKeSatuan(km, region) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 0;
  return region === "us" ? n / MIL_KM : n;
}

/** "12.345 km" atau "7.671 mi". */
export function jarakTeks(km, region) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const tag = region === "id" ? "id-ID" : "en-US";
  return `${Math.round(kmKeSatuan(n, region)).toLocaleString(tag)} ${satuanJarak(region)}`;
}

/** "1.234 kg" atau "2.721 lb" — edisi Amerika memakai pon. */
export function emisiTeks(kg, region) {
  const n = Number(kg);
  if (!Number.isFinite(n)) return "—";
  const tag = region === "id" ? "id-ID" : "en-US";
  const nilai = region === "us" ? n * 2.2046226218 : n;
  return `${Math.round(nilai).toLocaleString(tag)} ${satuanEmisi(region)}`;
}

/** MPG → L/100 km. 235,214583 adalah 100 km dalam mil dikali 3,78541 L/galon. */
export function mpgKeL100(mpg) {
  const n = Number(mpg);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return 235.214583 / n;
}

/** kWh/100 mi → kWh/100 km. */
export function kwhPer100miKeKwhPer100km(nilai) {
  const n = Number(nilai);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / MIL_KM;
}

/** Harga per galon → harga per liter. */
export function perGalonKePerLiter(harga) {
  const n = Number(harga);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / GALON_LITER;
}

function angka(n, bawaan = 0) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : bawaan;
}

/**
 * TCO dalam rupiah/dolar/yuan apa adanya — TIDAK mengonversi mata uang.
 *
 * Konversi kurs sengaja tidak ada: harga katalog tiap edisi sudah dalam mata
 * uang negaranya sendiri, jadi mengonversi dari rupiah hanya menambah galat dan
 * ketergantungan pada layanan kurs.
 *
 * `jarakKm` sudah metrik. `perKm` dihitung per kilometer; halaman edisi
 * Amerika mengalikannya sendiri dengan `MIL_KM`.
 */
export function hitungTco(input) {
  const harga = angka(input.harga);
  const uangMukaPct = Math.min(100, angka(input.uangMukaPct));
  const jangka = Math.max(1, Math.round(angka(input.jangka, 1)));
  const bungaPct = angka(input.bungaPct);
  const jarakKm = angka(input.jarakKm);
  const tarif = angka(input.tarif);
  const depresiasiPct = Math.min(100, angka(input.depresiasiPct));
  const perawatan = angka(input.perawatan);
  const konsumsiKwhPerKm = angka(input.konsumsiKwhPerKm, 0.18);

  const uangMuka = (harga * uangMukaPct) / 100;
  const pokok = harga - uangMuka;
  const bulan = jangka * 12;
  const rBulan = bungaPct / 100 / 12;
  const cicilan =
    pokok <= 0
      ? 0
      : rBulan > 0
        ? (pokok * rBulan) / (1 - Math.pow(1 + rBulan, -bulan))
        : pokok / bulan;

  const totalCicilan = cicilan * bulan;
  const kwhPerTahun = jarakKm * konsumsiKwhPerKm;
  const biayaListrik = kwhPerTahun * tarif * jangka;
  const biayaPerawatan = perawatan * jangka;
  const nilaiAkhir = harga * Math.pow(1 - depresiasiPct / 100, jangka);
  const penyusutan = harga - nilaiAkhir;
  const total = uangMuka + totalCicilan + biayaListrik + biayaPerawatan - penyusutan;
  const perKm = jarakKm * jangka > 0 ? total / (jarakKm * jangka) : 0;

  return {
    uangMuka,
    pokok,
    cicilan,
    totalCicilan,
    biayaListrik,
    biayaPerawatan,
    nilaiAkhir,
    penyusutan,
    total,
    perKm,
  };
}

/**
 * Emisi setahun, semuanya dalam KILOGRAM.
 *
 * Faktor pembakaran bensin 2,31 kg CO₂ per liter adalah angka tetap IPCC yang
 * dipakai kalkulator mana pun; faktor listrik datang dari bawaan edisi dan
 * bisa diubah pembaca.
 *
 * Catatan: versi sebelumnya membagi hasil listrik dengan 1000, sehingga emisi
 * EV tampil seribu kali lebih kecil dan "hemat emisi" praktis sama dengan
 * emisi mobil bensin. Diperbaiki di sini dan dikunci uji.
 */
export function hitungKarbon(input) {
  const jarakKm = angka(input.jarakKm);
  const bbmL100 = angka(input.bbmL100);
  const evKwh100 = angka(input.evKwh100);
  const faktor = angka(input.faktor);

  const liter = (jarakKm * bbmL100) / 100;
  const kwh = (jarakKm * evKwh100) / 100;
  const co2BbmKg = liter * 2.31;
  const co2EvKg = kwh * faktor;
  const hematKg = co2BbmKg - co2EvKg;

  return {
    liter,
    kwh,
    co2BbmKg,
    co2EvKg,
    hematKg,
    pohon: hematKg / 21,
  };
}

/**
 * Biaya perjalanan sekali jalan: listrik vs bensin, keduanya dalam mata uang
 * edisi. Konsumsi dalam satuan edisi, sudah dikonversi pemanggil lewat
 * `metrikRute()`.
 */
export function hitungBiayaRute(jarakKm, input) {
  const jarak = angka(jarakKm);
  const kwh = (jarak * angka(input.konsumsiKwh100)) / 100;
  const liter = (jarak * angka(input.konsumsiBbm100)) / 100;
  const listrik = kwh * angka(input.tarif);
  const bensin = liter * angka(input.hargaBbmPerLiter);
  return { kwh, liter, listrik, bensin, hemat: bensin - listrik };
}

/** Bawaan TCO satu edisi, sudah dalam bentuk yang dipakai formulir. */
export function bawaanTco(region) {
  return TCO_BAWAAN[region] || TCO_BAWAAN.id;
}

/** Bawaan karbon satu edisi, dalam satuan edisinya (lihat `metrikKarbon`). */
export function bawaanKarbon(region) {
  return KARBON_BAWAAN[region] || KARBON_BAWAAN.id;
}

/** Bawaan rute satu edisi, dalam satuan tampilannya (MPG dan $/galon untuk AS). */
export function bawaanRuteTampil(region) {
  return RUTE_BAWAAN[region] || RUTE_BAWAAN.id;
}

/**
 * Bawaan rute satu edisi, sudah metrik: konsumsi per 100 km dan harga bensin
 * per liter. Formulir tetap menampilkan satuan edisinya; konversi bolak-balik
 * terjadi di sini, bukan di halaman.
 */
export function bawaanRute(region) {
  const b = RUTE_BAWAAN[region] || RUTE_BAWAAN.id;
  if (region === "us") {
    return {
      konsumsiKwh100: kwhPer100miKeKwhPer100km(b.konsumsiKwh100),
      tarif: b.tarif,
      konsumsiBbm100: mpgKeL100(b.konsumsiBbm100),
      hargaBbmPerLiter: perGalonKePerLiter(b.hargaBbm),
    };
  }
  return {
    konsumsiKwh100: b.konsumsiKwh100,
    tarif: b.tarif,
    konsumsiBbm100: b.konsumsiBbm100,
    hargaBbmPerLiter: b.hargaBbm,
  };
}

/** Konsumsi karbon edisi → metrik (km, L/100 km, kWh/100 km). */
export function metrikKarbon(region, input) {
  const jarakKm = jarakKeKm(input.jarak, region);
  const bbmL100 = region === "us" ? mpgKeL100(input.bbm) : angka(input.bbm);
  const evKwh100 = region === "us" ? kwhPer100miKeKwhPer100km(input.ev) : angka(input.ev);
  return { jarakKm, bbmL100, evKwh100, faktor: angka(input.faktor) };
}

/** Konsumsi rute edisi → metrik. */
export function metrikRute(region, input) {
  const konsumsiKwh100 =
    region === "us" ? kwhPer100miKeKwhPer100km(input.konsumsiKwh100) : angka(input.konsumsiKwh100);
  const konsumsiBbm100 = region === "us" ? mpgKeL100(input.konsumsiBbm100) : angka(input.konsumsiBbm100);
  const hargaBbmPerLiter = region === "us" ? perGalonKePerLiter(input.hargaBbm) : angka(input.hargaBbm);
  return {
    konsumsiKwh100,
    konsumsiBbm100,
    hargaBbmPerLiter,
    tarif: angka(input.tarif),
  };
}
