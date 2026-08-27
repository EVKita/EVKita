import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumptionKwhPer100,
  hitungHemat,
  rupiahPenuh,
  rupiahHalus,
  lamaBalikModal,
  teksBalikModal,
  teksRingkas,
  BATAS_BALIK_MODAL,
  DEFAULTS,
} from "../src/lib/hemat.js";

/**
 * Kalkulator hemat. Ini satu-satunya tempat di situs ini yang menghasilkan
 * angka yang dipakai orang untuk mengambil keputusan membeli, jadi yang diuji
 * bukan cuma "hitungannya benar" melainkan juga bagaimana ia berperilaku saat
 * datanya tidak masuk akal — nol, kosong, atau justru merugi.
 */

/** Contoh yang angkanya sengaja bulat supaya kesalahan langsung terlihat. */
const contoh = {
  kwhPer100: 20, // 0,2 kWh/km
  elecPrice: 1500, // → Rp 300 per km
  kmPerLiter: 10,
  fuelPrice: 13000, // → Rp 1.300 per km
  kmPerMonth: 1000,
};

describe("konsumsi listrik dari data katalog", () => {
  it("menghitung kWh per 100 km dari baterai dan jarak tempuh", () => {
    assert.equal(consumptionKwhPer100({ batteryKwh: 60, rangeKm: 400 }), 15);
    assert.equal(consumptionKwhPer100({ batteryKwh: 82, rangeKm: 481 }), 17);
  });

  it("menolak data yang tidak lengkap atau tidak masuk akal", () => {
    assert.equal(consumptionKwhPer100(null), null);
    assert.equal(consumptionKwhPer100({ batteryKwh: 60 }), null);
    assert.equal(consumptionKwhPer100({ rangeKm: 400 }), null);
    assert.equal(consumptionKwhPer100({ batteryKwh: 60, rangeKm: 0 }), null);
    assert.equal(consumptionKwhPer100({ batteryKwh: -60, rangeKm: 400 }), null);
    assert.equal(consumptionKwhPer100({ batteryKwh: "kosong", rangeKm: 400 }), null);
  });
});

describe("biaya per km dan per bulan", () => {
  it("menghitung kedua sisi dengan benar", () => {
    const h = hitungHemat(contoh);
    assert.equal(h.evPerKm, 300);
    assert.equal(h.icePerKm, 1300);
    assert.equal(h.evMonthly, 300_000);
    assert.equal(h.iceMonthly, 1_300_000);
    assert.equal(h.savingMonthly, 1_000_000);
    assert.equal(h.savingYearly, 12_000_000);
    assert.equal(h.ok, true);
  });

  it("ikut jarak tempuh yang dipakai", () => {
    const h = hitungHemat({ ...contoh, kmPerMonth: 500 });
    assert.equal(h.evMonthly, 150_000);
    assert.equal(h.savingMonthly, 500_000);
  });

  it("menerima angka dalam bentuk teks dari isian formulir", () => {
    const h = hitungHemat({ ...contoh, elecPrice: "1500", kmPerMonth: "1000" });
    assert.equal(h.evMonthly, 300_000);
  });

  it("tidak membagi dengan nol saat konsumsi bensin diisi nol", () => {
    const h = hitungHemat({ ...contoh, kmPerLiter: 0 });
    assert.equal(h.icePerKm, null);
    assert.equal(h.iceMonthly, null);
    assert.equal(h.savingMonthly, null);
    assert.equal(h.ok, false);
  });

  it("tidak melempar saat isiannya kosong", () => {
    const h = hitungHemat({ kwhPer100: "", elecPrice: "", kmPerLiter: "", fuelPrice: "", kmPerMonth: "" });
    assert.equal(h.ok, false);
    assert.equal(h.savingMonthly, null);
    assert.equal(h.paybackMonths, null);
    assert.equal(h.paybackNever, false);
  });

  it("melaporkan angka minus apa adanya saat listrik justru lebih mahal", () => {
    // Mengisi di SPKLU mahal sementara mobil bensin pembandingnya sangat irit.
    const h = hitungHemat({ ...contoh, elecPrice: 2466, kmPerLiter: 35 });
    assert.ok(h.savingMonthly! < 0, "penghematan harus minus, bukan dipangkas jadi nol");
  });
});

describe("balik modal", () => {
  it("membagi selisih harga beli dengan penghematan bulanan", () => {
    // Selisih 24 juta, hemat 1 juta sebulan → 24 bulan.
    const h = hitungHemat({ ...contoh, evPrice: 524_000_000, icePrice: 500_000_000 });
    assert.equal(h.priceGap, 24_000_000);
    assert.equal(h.paybackMonths, 24);
    assert.equal(h.paybackNever, false);
  });

  it("menjawab nol kalau mobil listriknya memang tidak lebih mahal", () => {
    const h = hitungHemat({ ...contoh, evPrice: 400_000_000, icePrice: 500_000_000 });
    assert.equal(h.paybackMonths, 0);
    assert.equal(lamaBalikModal(h.paybackMonths), "langsung, sejak hari pertama");
  });

  it("mengatakan tidak pernah kembali, bukan menampilkan angka raksasa", () => {
    // Angka raksasa terbaca seperti "sabar, nanti juga balik". Ini tidak.
    const h = hitungHemat({ ...contoh, elecPrice: 2466, kmPerLiter: 35, evPrice: 600_000_000, icePrice: 400_000_000 });
    assert.equal(h.paybackNever, true);
    assert.equal(h.paybackMonths, null);
  });

  it("tidak menjawab apa-apa kalau harga pembandingnya belum diisi", () => {
    const h = hitungHemat({ ...contoh, evPrice: 500_000_000 });
    assert.equal(h.priceGap, null);
    assert.equal(h.paybackMonths, null);
    assert.equal(h.paybackNever, false);
  });
});

describe("jawaban balik modal yang tidak berguna", () => {
  it("menolak menyebut angka di luar umur pakai mobil", () => {
    // Selisih 380 juta, hemat 800 ribu sebulan → 475 bulan, hampir 40 tahun.
    // Aritmetikanya benar; sebagai jawaban ia menyesatkan.
    const h = hitungHemat({ ...contoh, evPrice: 780_000_000, icePrice: 400_000_000 });
    assert.ok(h.paybackMonths! > BATAS_BALIK_MODAL);
    assert.equal(h.paybackTooLong, true);
    assert.equal(teksBalikModal(h), "Lebih lama dari umur pakai mobilnya");
  });

  it("tetap menyebut angka untuk jangka yang masuk akal", () => {
    const h = hitungHemat({ ...contoh, evPrice: 524_000_000, icePrice: 500_000_000 });
    assert.equal(h.paybackTooLong, false);
    assert.equal(teksBalikModal(h), "2 tahun");
  });

  it("membedakan 'tidak pernah' dari 'terlalu lama'", () => {
    const rugi = hitungHemat({ ...contoh, elecPrice: 2466, kmPerLiter: 35, evPrice: 600_000_000, icePrice: 400_000_000 });
    assert.equal(teksBalikModal(rugi), "Tidak pernah kembali");
  });

  it("menjawab strip kalau memang belum bisa dihitung", () => {
    assert.equal(teksBalikModal(hitungHemat(contoh)), "—");
  });
});

describe("kalimat ringkas", () => {
  it("menyebut hemat saat listrik lebih murah", () => {
    assert.match(teksRingkas(hitungHemat(contoh)), /menghemat Rp 1\.000\.000 sebulan/);
  });

  it("mengatakan terus terang saat listrik justru lebih mahal", () => {
    const h = hitungHemat({ ...contoh, elecPrice: 2466, kmPerLiter: 35 });
    assert.match(teksRingkas(h), /justru lebih mahal/);
  });

  it("meminta angka saat isiannya belum cukup", () => {
    assert.match(teksRingkas(hitungHemat({ kwhPer100: "", elecPrice: "", kmPerLiter: "", fuelPrice: "", kmPerMonth: "" })), /Isi angkanya/);
  });
});

describe("penulisan angka", () => {
  it("menulis rupiah penuh, bukan singkatan", () => {
    assert.equal(rupiahPenuh(1_234_567), "Rp 1.234.567");
    assert.equal(rupiahPenuh(0), "Rp 0");
    assert.equal(rupiahPenuh(null), "—");
    assert.equal(rupiahPenuh("bukan angka"), "—");
  });

  it("memakai dua desimal untuk biaya kecil per km", () => {
    assert.equal(rupiahHalus(12.5), "Rp 12,50");
    assert.equal(rupiahHalus(1300), "Rp 1.300");
    assert.equal(rupiahHalus(null), "—");
  });

  it("membulatkan lama balik modal KE ATAS", () => {
    // Bulan yang belum lewat belum menghemat apa pun.
    assert.equal(lamaBalikModal(5.2), "6 bulan");
    assert.equal(lamaBalikModal(23.1), "2 tahun"); // dibulatkan ke atas jadi 24
    assert.equal(lamaBalikModal(12), "1 tahun");
    assert.equal(lamaBalikModal(27), "2 tahun 3 bulan");
    assert.equal(lamaBalikModal(6), "6 bulan");
    assert.equal(lamaBalikModal(null), "");
  });
});

describe("nilai bawaan", () => {
  it("semuanya angka positif yang masuk akal", () => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      assert.ok(Number.isFinite(value) && value > 0, `${key} harus angka positif`);
    }
  });

  it("menghasilkan penghematan positif pada pemakaian biasa", () => {
    // Kalau nilai bawaannya sendiri menghasilkan kesimpulan "EV lebih boros",
    // yang salah hampir pasti nilai bawaannya, bukan mobilnya.
    const h = hitungHemat({ ...DEFAULTS, kwhPer100: 17 });
    assert.ok(h.savingMonthly! > 0);
  });
});
