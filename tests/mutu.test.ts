import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nilaiJanggal, konsumsiJanggal, cariKembar, basi, HARI_BASI } from "../src/lib/mutu.js";

/**
 * Pemeriksa mutu data.
 *
 * Sikapnya memperingatkan, bukan menolak — jadi kesalahan yang paling mahal di
 * sini bukan melewatkan sesuatu, melainkan berteriak pada nilai yang benar.
 * Peringatan yang sering keliru akan diabaikan dalam seminggu, dan sesudah itu
 * ia sama sekali tidak berguna. Karena itu uji di bawah ini menaruh perhatian
 * yang sama besarnya pada apa yang HARUS lolos.
 */

const mobil = (extra: any = {}) => ({ id: "x", kind: "mobil", brand: "BYD", name: "Atto 3", ...extra });
const motor = (extra: any = {}) => ({ id: "y", kind: "motor", brand: "Alva", name: "Cervo", ...extra });

describe("nilaiJanggal", () => {
  it("kendaraan dengan angka wajar tidak menghasilkan peringatan apa pun", () => {
    assert.deepEqual(
      nilaiJanggal(mobil({ rangeKm: 480, batteryKwh: 60, powerHp: 201, price: 515_000_000, year: 2025 }), "cars"),
      []
    );
  });

  it("jarak tempuh yang mustahil ditangkap", () => {
    const hasil = nilaiJanggal(mobil({ rangeKm: 4500 }), "cars");
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].key, "rangeKm");
    assert.equal(hasil[0].jenis, "tinggi");
  });

  it("harga yang salah nol-nya ditangkap", () => {
    // Rp 415.000, bukan Rp 415.000.000 — salah ketik yang paling sering terjadi.
    const hasil = nilaiJanggal(mobil({ price: 415_000 }), "cars");
    assert.deepEqual(hasil.map((h) => [h.key, h.jenis]), [["price", "rendah"]]);
  });

  it("field kosong tidak pernah diperiksa", () => {
    assert.deepEqual(nilaiJanggal(mobil({ rangeKm: null, price: "", powerHp: undefined }), "cars"), []);
  });

  it("field khusus mobil tidak diperiksa pada motor", () => {
    // Motor tidak punya jumlah kursi; nilai nyasar di sana bukan urusan
    // pemeriksa ini, dan memperingatkannya hanya membuat derau.
    assert.deepEqual(nilaiJanggal(motor({ seats: 99 }), "motors"), []);
  });

  it("batas yang sama berlaku untuk motor pada field yang memang dimilikinya", () => {
    const hasil = nilaiJanggal(motor({ topSpeedKph: 900 }), "motors");
    assert.deepEqual(hasil.map((h) => h.key), ["topSpeedKph"]);
  });
});

describe("konsumsiJanggal", () => {
  it("mobil listrik sungguhan lolos", () => {
    // 60 kWh / 480 km = 12,5 kWh/100 km — angka BYD Atto 3 yang sebenarnya.
    assert.equal(konsumsiJanggal(mobil({ batteryKwh: 60, rangeKm: 480 }), "cars"), null);
  });

  it("motor listrik sungguhan lolos", () => {
    // 2,4 kWh / 80 km = 3 kWh/100 km.
    assert.equal(konsumsiJanggal(motor({ batteryKwh: 2.4, rangeKm: 80 }), "motors"), null);
  });

  it("pasangan yang mustahil ditangkap walau kedua angkanya sendiri wajar", () => {
    // 60 kWh dan 60 km dua-duanya di dalam batasnya masing-masing, tapi
    // bersamaan berarti 100 kWh/100 km.
    const hasil = konsumsiJanggal(mobil({ batteryKwh: 60, rangeKm: 60 }), "cars");
    assert.equal(hasil?.jenis, "tinggi");
    assert.equal(hasil?.konsumsi, 100);
  });

  it("mobil yang diberi kapasitas baterai motor ditangkap", () => {
    const hasil = konsumsiJanggal(mobil({ batteryKwh: 2.4, rangeKm: 400 }), "cars");
    assert.equal(hasil?.jenis, "rendah");
  });

  it("tidak menghitung apa pun kalau salah satu angkanya belum diisi", () => {
    assert.equal(konsumsiJanggal(mobil({ batteryKwh: 60 }), "cars"), null);
    assert.equal(konsumsiJanggal(mobil({ rangeKm: 480 }), "cars"), null);
  });
});

describe("cariKembar", () => {
  it("menemukan dua entri bermerek dan bernama sama", () => {
    const peta = cariKembar([
      { id: "a", brand: "BYD", name: "Atto 3" },
      { id: "b", brand: "byd", name: "  ATTO  3 " },
      { id: "c", brand: "BYD", name: "Seal" },
    ]);
    assert.equal(peta.size, 1);
    assert.deepEqual([...peta.values()][0], ["a", "b"]);
  });

  it("entri yang namanya berbeda tidak dianggap kembar", () => {
    assert.equal(cariKembar([{ id: "a", brand: "BYD", name: "Atto 3" }, { id: "b", brand: "BYD", name: "Atto 2" }]).size, 0);
  });

  it("entri tanpa nama diabaikan, bukan dianggap kembar satu sama lain", () => {
    assert.equal(cariKembar([{ id: "a" }, { id: "b" }, { id: "c", brand: "", name: "" }]).size, 0);
  });
});

describe("basi", () => {
  const SEKARANG = Date.parse("2026-08-29T00:00:00Z");
  const hariLalu = (n: number) => new Date(SEKARANG - n * 24 * 3600 * 1000).toISOString();

  it("entri yang baru disentuh belum basi", () => {
    assert.equal(basi({ updatedAt: hariLalu(3) }, SEKARANG), false);
  });

  it("entri yang lama tidak disentuh dianggap basi", () => {
    assert.equal(basi({ updatedAt: hariLalu(HARI_BASI + 1) }, SEKARANG), true);
  });

  it("tepat di ambangnya belum basi", () => {
    assert.equal(basi({ updatedAt: hariLalu(HARI_BASI) }, SEKARANG), false);
  });

  it("entri yang belum pernah punya stempel tidak dianggap basi", () => {
    // Seluruh isi direktori berada di keadaan ini sebelum stempel diperkenalkan.
    // Menandainya basi berarti menuduh setiap entri lama sekaligus.
    assert.equal(basi({}, SEKARANG), false);
    assert.equal(basi({ updatedAt: "" }, SEKARANG), false);
    assert.equal(basi({ updatedAt: "kemarin" }, SEKARANG), false);
  });
});
