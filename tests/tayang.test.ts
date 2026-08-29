import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tayang, terjadwal, hanyaTayang } from "../src/lib/tayang.js";

/**
 * Aturan "boleh dilihat pengunjung?".
 *
 * Aturannya dulu ditulis ulang di sembilan halaman. Berkas ini yang
 * menggantikan kesembilannya, jadi kesalahan di sini muncul di seluruh situs
 * sekaligus — dan dua bentuk kesalahannya sama-sama buruk: menayangkan yang
 * belum siap, atau menyembunyikan yang sudah lama tayang.
 */

const JAM = 3600 * 1000;
const SEKARANG = Date.parse("2026-08-29T10:00:00Z");

describe("tayang", () => {
  it("entri tanpa status apa pun dianggap tayang", () => {
    // Bukan kelalaian: direktori baru mengenal status mulai versi ini, dan
    // seluruh isi yang sudah ada di server memang sedang tayang. Menganggapnya
    // draf akan mengosongkan setiap pemasangan begitu pembaruan dipasang.
    assert.equal(tayang({ id: "a" }, SEKARANG), true);
  });

  it("draf tidak pernah tayang", () => {
    assert.equal(tayang({ status: "draft" }, SEKARANG), false);
  });

  it("draf tetap tidak tayang walau waktunya sudah lewat", () => {
    const lalu = new Date(SEKARANG - JAM).toISOString();
    assert.equal(tayang({ status: "draft", publishAt: lalu }, SEKARANG), false);
  });

  it("waktu tayang yang belum tiba menahan entri", () => {
    const nanti = new Date(SEKARANG + JAM).toISOString();
    assert.equal(tayang({ status: "published", publishAt: nanti }, SEKARANG), false);
  });

  it("waktu tayang yang sudah lewat melepaskannya", () => {
    const lalu = new Date(SEKARANG - JAM).toISOString();
    assert.equal(tayang({ status: "published", publishAt: lalu }, SEKARANG), true);
  });

  it("waktu tayang yang tidak terbaca diabaikan, bukan menyembunyikan entri", () => {
    // Nilai rusak tidak boleh menghapus entri dari situs diam-diam.
    assert.equal(tayang({ status: "published", publishAt: "besok pagi" }, SEKARANG), true);
    assert.equal(tayang({ status: "published", publishAt: "" }, SEKARANG), true);
  });

  it("null dan undefined tidak pernah tayang", () => {
    assert.equal(tayang(null, SEKARANG), false);
    assert.equal(tayang(undefined, SEKARANG), false);
  });
});

describe("terjadwal", () => {
  it("hanya entri terbit yang waktunya belum tiba", () => {
    const nanti = new Date(SEKARANG + JAM).toISOString();
    const lalu = new Date(SEKARANG - JAM).toISOString();
    assert.equal(terjadwal({ status: "published", publishAt: nanti }, SEKARANG), true);
    assert.equal(terjadwal({ status: "published", publishAt: lalu }, SEKARANG), false);
    assert.equal(terjadwal({ status: "draft", publishAt: nanti }, SEKARANG), false);
    assert.equal(terjadwal({ status: "published" }, SEKARANG), false);
  });
});

describe("hanyaTayang", () => {
  it("menyaring daftar memakai satu waktu yang sama untuk semuanya", () => {
    const nanti = new Date(SEKARANG + JAM).toISOString();
    const daftar = [
      { id: "a" },
      { id: "b", status: "draft" },
      { id: "c", status: "published", publishAt: nanti },
      { id: "d", status: "published" },
    ];
    assert.deepEqual(daftar.filter(hanyaTayang(SEKARANG)).map((x) => x.id), ["a", "d"]);
  });
});
