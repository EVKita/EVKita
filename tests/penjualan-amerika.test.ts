import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kuartalCoxTerbaru, tandaiJualanAmerika } from "../src/lib/penjualan-amerika";

/**
 * Padanan Gaikindo untuk Amerika: angka penjualan EV AS keluar kuartalan
 * lewat laporan Cox Automotive (~tanggal 20 bulan sesudah kuartal).
 */
describe("kuartalCoxTerbaru", () => {
  it("menolak masukan rusak", () => {
    assert.equal(kuartalCoxTerbaru(""), "");
    assert.equal(kuartalCoxTerbaru("2026-13-01"), "");
    assert.equal(kuartalCoxTerbaru("asal"), "");
  });

  it("sebelum tanggal rilis memakai kuartal sebelumnya", () => {
    // 12 Okt 2026: Q3 (berakhir Sep) belum keluar (batas 20 Okt) -> Q2 = Juni.
    assert.equal(kuartalCoxTerbaru("2026-10-12"), "2026-06");
    // 25 Okt 2026: Q3 sudah keluar -> September.
    assert.equal(kuartalCoxTerbaru("2026-10-25"), "2026-09");
  });

  it("tepat di tanggal rilis memakai kuartal berjalan", () => {
    assert.equal(kuartalCoxTerbaru("2026-10-20"), "2026-09");
    assert.equal(kuartalCoxTerbaru("2026-04-20"), "2026-03");
  });

  it("mundur melewati pergantian tahun", () => {
    // 5 Jan 2027: Q4 2026 belum keluar (batas 20 Jan) -> Q3 = Sep 2026.
    assert.equal(kuartalCoxTerbaru("2027-01-05"), "2026-09");
    assert.equal(kuartalCoxTerbaru("2027-01-25"), "2026-12");
    assert.equal(kuartalCoxTerbaru("2027-04-19"), "2026-12");
  });
});

describe("tandaiJualanAmerika", () => {
  it("tidak pernah melempar dan berbentuk hasil", () => {
    const hasil = tandaiJualanAmerika({ paksa: false });
    assert.equal(typeof hasil.dilewati, "boolean");
    assert.equal(typeof hasil.bulan, "string");
    assert.ok(Array.isArray(hasil.ditandai));
  });
});
