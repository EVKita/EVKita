import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cocokModel, jenisSinyal, pilihDitandai } from "../src/lib/pemantau";

/**
 * Pemantau sinyal per jam: murni tanpa jaringan dan tanpa disk, jadi seluruh
 * aturannya diuji di sini — berita mana yang jadi sinyal, model mana yang
 * tersangkut, dan siapa yang ditandai.
 */

describe("jenisSinyal", () => {
  it("penjualan menang atas peluncuran", () => {
    assert.equal(jenisSinyal("Penjualan Avanza meluncur naik bulan ini"), "penjualan");
    assert.equal(jenisSinyal("Data wholesales Gaikindo turun"), "penjualan");
    assert.equal(jenisSinyal("BYD Atto 1 resmi meluncur, harga mulai Rp 200 jutaan"), "model");
    assert.equal(jenisSinyal("Pabrik Toyota pekerjakan 200 wanita"), null);
  });

  it("tidak rewel soal kapital", () => {
    assert.equal(jenisSinyal("MOBIL TERLARIS 2026"), "penjualan");
    assert.equal(jenisSinyal("Generasi Baru Meluncur"), "model");
  });
});

describe("cocokModel", () => {
  it("merek dan satu kata nama harus sama-sama disebut", () => {
    assert.equal(cocokModel("Hyundai Ioniq V Resmi Meluncur", "Hyundai", "Ioniq 5"), true);
    assert.equal(cocokModel("Mobil BYD gagal raih nilai sempurna", "BYD", "Atto 3"), false);
    assert.equal(cocokModel("Produksi Veloz Hybrid tembus 15 ribu unit", "Toyota", "Kijang Innova"), false);
  });

  it("kata pendek diabaikan, merek saja tidak cukup", () => {
    assert.equal(cocokModel("Pabrik BYD di Subang", "BYD", "Atto 3"), false);
    assert.equal(cocokModel("Berita apa pun", "", "Atto 3"), false);
  });
});

describe("pilihDitandai", () => {
  const armada = [
    { col: "cars", id: "byd-atto-3", brand: "BYD", name: "Atto 3" },
    { col: "cars", id: "hyundai-ioniq-5", brand: "Hyundai", name: "Ioniq 5" },
  ];

  it("hanya berita bersinyal yang modelnya cocok", () => {
    const hasil = pilihDitandai(
      [
        { title: "Hyundai Ioniq V Resmi Meluncur" },
        { title: "Pabrik Toyota pekerjakan 200 wanita" },
        { title: "Penjualan BYD Atto 3 naik dua kali lipat" },
      ],
      armada
    );
    assert.deepEqual(hasil, [
      { col: "cars", id: "hyundai-ioniq-5", jenis: "model" },
      { col: "cars", id: "byd-atto-3", jenis: "penjualan" },
    ]);
  });

  it("tanpa kembar walau dua berita menyangkut model yang sama", () => {
    const hasil = pilihDitandai(
      [{ title: "BYD Atto 3 meluncur" }, { title: "Harga BYD Atto 3 turun" }],
      armada
    );
    assert.equal(hasil.length, 1);
  });

  it("masukan rusak tidak meledak", () => {
    assert.deepEqual(pilihDitandai([], armada), []);
    assert.deepEqual(pilihDitandai([{ title: "" }], armada), []);
    assert.deepEqual(pilihDitandai([{ title: "BYD Atto 3 meluncur" }], []), []);
  });
});
