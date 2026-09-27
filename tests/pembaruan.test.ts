import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalkanPengaturan,
  pilihKendaraan,
  patchOtomatis,
  berbeda,
  PEMBARUAN_DEFAULTS,
} from "../src/lib/pembaruan.js";

describe("normalkanPengaturan", () => {
  it("mengisi nilai bawaan untuk pengaturan kosong", () => {
    assert.deepEqual(normalkanPengaturan({}), PEMBARUAN_DEFAULTS);
  });

  it("menjepit batasHarian ke rentang yang sah", () => {
    assert.equal(normalkanPengaturan({ batasHarian: 0 }).batasHarian, 1);
    assert.equal(normalkanPengaturan({ batasHarian: 999 }).batasHarian, 50);
  });

  it("membuang keyakinanMin yang tidak dikenal", () => {
    assert.equal(normalkanPengaturan({ keyakinanMin: "mutlak" }).keyakinanMin, "tinggi");
  });
});

describe("pilihKendaraan", () => {
  const content = {
    cars: [
      { id: "a", brand: "BYD", name: "Seal", status: "published", stale: false, updatedAt: "2026-01-01" },
      { id: "b", brand: "BYD", name: "Draft", status: "draft", stale: false, updatedAt: "" },
      { id: "c", brand: "", name: "Tanpa Merek", status: "published", stale: false, updatedAt: "" },
      { id: "d", brand: "Hyundai", name: "Ioniq 5", status: "published", stale: true, updatedAt: "2026-02-01" },
    ],
    motors: [
      { id: "e", brand: "Alva", name: "One", status: "published", stale: false, updatedAt: "" },
    ],
  };

  it("mendahulukan yang stale, lalu yang terlama tidak diperbarui", () => {
    const hasil = pilihKendaraan(content, { batasHarian: 50 });
    assert.equal(hasil[0].id, "d"); // stale
    assert.equal(hasil[1].id, "e"); // updatedAt kosong (terlama)
    assert.equal(hasil[2].id, "a");
    // draf dan tanpa merek dilewati
    assert.deepEqual(hasil.map((k) => k.id).sort(), ["a", "d", "e"]);
  });

  it("hanya mengambil kendaraan basi saat hanyaBasi", () => {
    const hasil = pilihKendaraan(content, { batasHarian: 50, hanyaBasi: true });
    assert.deepEqual(hasil.map((k) => k.id), ["d"]);
  });

  it("membatasi jumlah lewat batasHarian", () => {
    const hasil = pilihKendaraan(content, { batasHarian: 1 });
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].id, "d");
  });

  it("menandai kolom dan jenis dengan benar", () => {
    const hasil = pilihKendaraan(content, { batasHarian: 50 });
    const e = hasil.find((k) => k.id === "e");
    assert.equal(e.col, "motors");
    assert.equal(e.kind, "motor");
    const a = hasil.find((k) => k.id === "a");
    assert.equal(a.col, "cars");
    assert.equal(a.kind, "mobil");
  });
});

describe("berbeda", () => {
  it("angka dibandingkan sebagai angka", () => {
    assert.equal(berbeda(415, 415), false);
    assert.equal(berbeda(415, 416), true);
    assert.equal(berbeda("415", 415), false);
  });

  it("daftar dibandingkan elemen demi elemen", () => {
    assert.equal(berbeda(["A", "B"], ["A", "B"]), false);
    assert.equal(berbeda(["A", "B"], ["A", "C"]), true);
    assert.equal(berbeda(["A"], ["A", "B"]), true);
  });

  it("teks dipangkas sebelum dibandingkan", () => {
    assert.equal(berbeda("Rp 415 jt", "Rp 415 jt"), false);
    assert.equal(berbeda("Rp 415 jt", "Rp 415 jt "), false);
    assert.equal(berbeda("Rp 415 jt", "Rp 416 jt"), true);
  });
});

describe("patchOtomatis", () => {
  const vehicle = { price: 415000000, rangeKm: 410, seats: null };

  it("menerapkan nilai keyakinan tinggi yang berbeda", () => {
    const patch = patchOtomatis(
      [
        { key: "price", nilai: 420000000, keyakinan: "tinggi" },
        { key: "seats", nilai: 5, keyakinan: "tinggi" },
      ],
      vehicle,
      "tinggi"
    );
    assert.equal(patch.price, 420000000);
    assert.equal(patch.seats, 5);
  });

  it("tidak menerapkan nilai yang sama persis", () => {
    const patch = patchOtomatis([{ key: "rangeKm", nilai: 410, keyakinan: "tinggi" }], vehicle, "tinggi");
    assert.deepEqual(patch, {});
  });

  it("tidak menerapkan keyakinan di bawah ambang", () => {
    const patch = patchOtomatis([{ key: "price", nilai: 1, keyakinan: "sedang" }], vehicle, "tinggi");
    assert.deepEqual(patch, {});
    // Ambang "sedang" memang meloloskan nilai sedang.
    const patch2 = patchOtomatis([{ key: "price", nilai: 1, keyakinan: "sedang" }], vehicle, "sedang");
    assert.equal(patch2.price, 1);
  });

  it("tidak menerapkan nilai kosong (data tidak ditemukan)", () => {
    const patch = patchOtomatis(
      [
        { key: "price", nilai: null, keyakinan: "tinggi" },
        { key: "seats", nilai: "", keyakinan: "tinggi" },
        { key: "colors", nilai: [], keyakinan: "tinggi" },
      ],
      vehicle,
      "tinggi"
    );
    assert.deepEqual(patch, {});
  });
});
