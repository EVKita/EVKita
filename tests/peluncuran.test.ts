import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AMBANG_VIRAL, pathKendaraan, kandidatViral } from "../src/lib/peluncuran.js";

describe("pathKendaraan", () => {
  it("mengenali rute detail mobil dan motor", () => {
    assert.deepEqual(pathKendaraan("/mobil/byd-atto-3"), { kind: "mobil", slug: "byd-atto-3" });
    assert.deepEqual(pathKendaraan("/motor/polytron-fox-500"), { kind: "motor", slug: "polytron-fox-500" });
  });

  it("membuka percent-encoding pada slug", () => {
    assert.deepEqual(pathKendaraan("/mobil/Citro%C3%ABn"), { kind: "mobil", slug: "Citroën" });
  });

  it("menolak rute yang bukan satu model", () => {
    assert.equal(pathKendaraan("/katalog"), null);
    assert.equal(pathKendaraan("/mobil"), null);
    assert.equal(pathKendaraan("/mobil/byd-atto-3/spesifikasi"), null);
    assert.equal(pathKendaraan("/"), null);
  });
});

describe("kandidatViral", () => {
  it("mengambil halaman kendaraan yang melewati ambang, terbesar lebih dulu", () => {
    const hasil = kandidatViral(
      {
        "/mobil/byd-atto-3": 1500,
        "/motor/polytron-fox-500": 1200,
        "/katalog": 9999,
        "/mobil/byd-seal": 400,
      },
      AMBANG_VIRAL
    );
    assert.equal(hasil.length, 2);
    assert.equal(hasil[0].slug, "byd-atto-3");
    assert.equal(hasil[1].slug, "polytron-fox-500");
  });

  it("kosong kalau tidak ada yang melewati ambang", () => {
    assert.deepEqual(kandidatViral({ "/mobil/byd-atto-3": 10 }), []);
  });
});
