import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ringkasRiwayat } from "../src/lib/riwayat.js";

/**
 * Peringkasan riwayat satu item.
 *
 * Cadangan dibuat menurut WAKTU, bukan menurut perubahan: dua puluh cadangan
 * berturut-turut bisa memuat mobil yang sama persis karena yang berubah di
 * antaranya adalah mobil lain. Tanpa peringkasan ini, "riwayat" sebuah item
 * adalah daftar panjang yang seluruh isinya identik — dan daftar seperti itu
 * menyembunyikan satu-satunya baris yang dicari orang.
 */

const versi = (name: string, item: any) => ({ name, time: `2026-08-${name}T00:00:00Z`, item });

describe("ringkasRiwayat", () => {
  it("membuang versi yang sama dengan versi sebelumnya", () => {
    // Masukan terbaru→terlama. Harga berubah sekali, di antara 27 dan 26.
    const hasil = ringkasRiwayat([
      versi("29", { price: 500 }),
      versi("28", { price: 500 }),
      versi("27", { price: 500 }),
      versi("26", { price: 400 }),
    ]);
    assert.deepEqual(hasil.map((v) => v.name), ["27", "26"]);
  });

  it("menyimpan versi tempat sebuah nilai MULAI berlaku, bukan yang terakhir memuatnya", () => {
    // Yang berguna dibaca adalah "sejak kapan harganya jadi 500", bukan
    // "cadangan mana saja yang kebetulan masih memuat 500".
    const hasil = ringkasRiwayat([versi("29", { price: 500 }), versi("28", { price: 500 }), versi("27", { price: 400 })]);
    assert.deepEqual(hasil.map((v) => v.name), ["28", "27"]);
  });

  it("versi paling tua selalu disimpan", () => {
    const hasil = ringkasRiwayat([versi("29", { price: 500 })]);
    assert.deepEqual(hasil.map((v) => v.name), ["29"]);
  });

  it("stempel waktu dan pengubah tidak dihitung sebagai perbedaan", () => {
    // Keduanya berubah pada setiap penyimpanan yang menyentuh item ini, jadi
    // membiarkannya ikut berarti tidak ada satu pun versi yang pernah dibuang.
    const hasil = ringkasRiwayat([
      versi("29", { price: 500, updatedAt: "2026-08-29T00:00:00Z", updatedBy: "Ana" }),
      versi("28", { price: 500, updatedAt: "2026-08-28T00:00:00Z", updatedBy: "Budi" }),
    ]);
    assert.equal(hasil.length, 1);
  });

  it("perbedaan di dalam larik tetap terbaca", () => {
    const hasil = ringkasRiwayat([
      versi("29", { tags: ["suv", "keluarga"] }),
      versi("28", { tags: ["suv"] }),
    ]);
    assert.equal(hasil.length, 2);
  });

  it("versi tanpa item dilewati, bukan membuat daftarnya rusak", () => {
    const hasil = ringkasRiwayat([versi("29", null), versi("28", { price: 500 }), null as any]);
    assert.deepEqual(hasil.map((v) => v.name), ["28"]);
  });

  it("masukan yang bukan larik menghasilkan daftar kosong", () => {
    assert.deepEqual(ringkasRiwayat(null as any), []);
    assert.deepEqual(ringkasRiwayat(undefined as any), []);
  });
});
