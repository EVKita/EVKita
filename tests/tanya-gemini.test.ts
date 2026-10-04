import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pilihKonteks,
  pilihTampil,
  ringkasKonteks,
  susunInstruksi,
  kunciGeminiTampakSah,
} from "../src/lib/gemini-tanya.ts";
import {
  tanggalWib,
  sisaKuota,
  catatPertanyaan,
  galatPertanyaan,
  TANYA_KUOTA_HARIAN,
} from "../src/lib/tanya.js";

/**
 * Aturan Tanya EVKita yang dijaga di sini:
 * - Konteks katalog hanya berisi yang benar-benar cocok (AND), bukan tebakan.
 * - Instruksi selalu memerintahkan kejujuran dan mengutamakan katalog.
 * - Kuota harian dihitung per anggota per tanggal WIB, bukan zona server.
 */

const KATALOG = [
  { brand: "BYD", name: "Seal", bodyType: "Sedan", rangeKm: 520, batteryKwh: 82, price: 700000000, priceText: "" },
  { brand: "Wuling", name: "Air EV", bodyType: "Hatchback", rangeKm: 300, batteryKwh: 26, price: 250000000, priceText: "" },
];

describe("pilihKonteks", () => {
  it("semua kata harus cocok — tidak mengembalikan yang setengah cocok", () => {
    assert.deepEqual(pilihKonteks(KATALOG, "byd seal"), [KATALOG[0]]);
    assert.deepEqual(pilihKonteks(KATALOG, "byd yang tidak ada"), []);
  });

  it("tanpa kata kunci tidak ada konteks — lebih baik kosong daripada salah", () => {
    assert.deepEqual(pilihKonteks(KATALOG, "???"), []);
    assert.equal(ringkasKonteks([]), "");
  });

  it("ringkasan memuat angka yang bisa dipakai model", () => {
    const s = ringkasKonteks([KATALOG[0]]);
    assert.match(s, /BYD Seal/);
    assert.match(s, /520 km/);
    assert.match(s, /82 kWh/);
  });
});

describe("pilihTampil", () => {
  const KAYA = [
    { id: "byd-seal", kind: "mobil", brand: "BYD", name: "Seal", bodyType: "Sedan", rangeKm: 520, batteryKwh: 82, price: 700000000, priceText: "", image: "/api/uploads/a.avif" },
    { id: "", kind: "mobil", brand: "Tanpa", name: "ID", bodyType: "", rangeKm: null, batteryKwh: null, price: null, priceText: "", image: "" },
  ];

  it("kartu menaut ke koleksi yang benar dengan angka katalog", () => {
    const dapat = pilihTampil(KAYA, "byd seal");
    assert.equal(dapat.length, 1);
    assert.equal(dapat[0].href, "/mobil/byd-seal");
    assert.equal(dapat[0].nama, "BYD Seal");
    assert.match(dapat[0].meta, /520 km/);
    assert.match(dapat[0].harga, /Rp/);
  });

  it("motor menaut ke /motor/, tanpa id dibuang", () => {
    const motor = [{ ...KAYA[0], id: "m1", kind: "motor", brand: "Voltz", name: "R1", bodyType: "", rangeKm: null, batteryKwh: null, price: null, priceText: "Rp 30 jt", image: "" }];
    const dapat = pilihTampil(motor, "voltz r1");
    assert.equal(dapat[0].href, "/motor/m1");
    assert.equal(dapat[0].meta, "");
    assert.equal(dapat[0].harga, "Rp 30 jt");
  });

  it("tanpa kecocokan tidak ada kartu — hanya jawaban AI", () => {
    assert.deepEqual(pilihTampil(KAYA, "biaya cas 100 km berapa"), []);
  });
});

describe("susunInstruksi", () => {
  it("selalu memerintahkan kejujuran dan menjawab sesuai bahasa", () => {
    const id = susunInstruksi("id", "- BYD Seal · 520 km");
    assert.match(id, /tidak tahu/);
    assert.match(id, /Bahasa Indonesia/);
    assert.match(id, /DATA KATALOG/);
    assert.match(susunInstruksi("en", ""), /English/);
    assert.match(susunInstruksi("zh", ""), /简体中文/);
  });
});

describe("kunciGeminiTampakSah", () => {
  it("menolak kunci DeepSeek yang salah tempel", () => {
    assert.equal(kunciGeminiTampakSah("sk-abcdef1234567890"), false);
    assert.equal(kunciGeminiTampakSah(""), false);
  });

  it("menerima kunci lama AIza dan kunci otorisasi baru AQ.", () => {
    assert.equal(kunciGeminiTampakSah("AIza1234567890abcdef1234567890ab"), true);
    assert.equal(kunciGeminiTampakSah("AQ.Ab8RN6IXKCausKIRKGQuRK-AL3ZOqIWQluAc3R_3CDpQk8nig"), true);
    assert.equal(kunciGeminiTampakSah("AQ.Ab8RN6IXKCausKIRKGQuRK AL3ZOqIWQluAc3R"), false);
  });
});

describe("kuota harian", () => {
  // Selasa, 3 Okt 2026 10:00 WIB = 03:00 UTC. Kalau memakai UTC, tanggalnya
  // masih 2 Okt — kuota akan berganti tujuh jam terlambat.
  const pagi = new Date("2026-10-03T03:00:00Z");

  it("tanggal memakai WIB yang dipatok", () => {
    assert.equal(tanggalWib(pagi), "2026-10-03");
  });

  it(`${TANYA_KUOTA_HARIAN} pertanyaan per anggota, lalu ditolak`, () => {
    const siapa = `uji-${Date.now()}`;
    assert.equal(sisaKuota(siapa, pagi), TANYA_KUOTA_HARIAN);
    for (let i = 0; i < TANYA_KUOTA_HARIAN; i++) {
      assert.equal(catatPertanyaan(siapa, pagi).boleh, true);
    }
    assert.equal(catatPertanyaan(siapa, pagi).boleh, false);
    assert.equal(sisaKuota(siapa, pagi), 0);
  });

  it("kuota orang lain tidak ikut terpakai", () => {
    assert.equal(sisaKuota(`lain-${Date.now()}`, pagi), TANYA_KUOTA_HARIAN);
  });
});

describe("galatPertanyaan", () => {
  it("menolak yang kosong dan yang melewati 500 karakter", () => {
    assert.equal(galatPertanyaan("  "), "err.tanya.kosong");
    assert.equal(galatPertanyaan("x".repeat(501)), "err.tanya.panjang");
    assert.equal(galatPertanyaan("BYD Seal berapa harganya?"), "");
  });
});
