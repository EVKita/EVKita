import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

/**
 * Token tautan pratinjau.
 *
 * Sama seperti `sesi.test.ts`, pengujian dijalankan dari direktori sementara
 * supaya `.env` milik pengembang tidak ikut terbaca — `pratinjau.ts`
 * menandatangani dengan SESSION_SECRET lewat `auth.ts`, dan hasilnya harus
 * sama di mesin siapa pun.
 *
 * Yang dibuktikan di sini semuanya soal satu hal: sebuah tautan pratinjau
 * hanya boleh membuka SATU kendaraan, dan hanya untuk waktu yang singkat.
 * Draf adalah isi yang sengaja belum boleh dilihat orang; kalau tokennya bisa
 * dipakai ulang untuk kendaraan lain atau diperpanjang dari luar, status draf
 * berhenti berarti apa pun.
 */

const RAHASIA_UJI = "rahasia-uji-yang-panjang-sekali-dan-acak";

let pratinjau: typeof import("../src/lib/pratinjau");

before(async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-uji-"));
  process.chdir(dir);
  process.env.SESSION_SECRET = RAHASIA_UJI;

  pratinjau = await import("../src/lib/pratinjau");
});

describe("token pratinjau", () => {
  it("token yang baru dibuat sah untuk kendaraannya sendiri", () => {
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3");
    assert.ok(token);
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3"), true);
  });

  it("token satu kendaraan tidak membuka kendaraan lain", () => {
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3");
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-seal"), false);
  });

  it("token mobil tidak membuka motor dengan id yang sama", () => {
    const token = pratinjau.makePreviewToken("cars", "polytron-fox-r");
    assert.equal(pratinjau.verifyPreviewToken(token, "motors", "polytron-fox-r"), false);
  });

  it("tanda tangan yang diubah satu karakter ditolak", () => {
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3") as string;
    const rusak = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.equal(pratinjau.verifyPreviewToken(rusak, "cars", "byd-atto-3"), false);
  });

  it("token kedaluwarsa setelah batas umurnya lewat", () => {
    const sekarang = Date.now();
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3", sekarang) as string;
    const sesudah = sekarang + pratinjau.PREVIEW_TTL_MS + 1000;
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3", sesudah), false);
  });

  it("masih sah tepat sebelum batas umurnya", () => {
    const sekarang = Date.now();
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3", sekarang) as string;
    const hampir = sekarang + pratinjau.PREVIEW_TTL_MS - 1000;
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3", hampir), true);
  });

  it("waktu kedaluwarsa tidak bisa dimajukan untuk memperpanjang tautan", () => {
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3") as string;
    const bagian = token.split(".");
    // Dimajukan setahun. Kalau waktu kedaluwarsa tidak ikut ditandatangani,
    // token ini akan tetap terbaca dan umurnya bisa ditentukan penerimanya.
    bagian[0] = (Date.now() + 365 * 24 * 3600 * 1000).toString(36);
    assert.equal(pratinjau.verifyPreviewToken(bagian.join("."), "cars", "byd-atto-3"), false);
  });

  it("umur yang lebih panjang dari batas ditolak walau tanda tangannya cocok", () => {
    // Token yang sah, tapi dinilai dari waktu yang jauh SEBELUM ia diterbitkan:
    // dari sudut pandang itu umurnya melebihi batas. Ini penjagaan yang tetap
    // berlaku seandainya token lama beredar setelah aturan umurnya diperpendek.
    const sekarang = Date.now();
    const token = pratinjau.makePreviewToken("cars", "byd-atto-3", sekarang) as string;
    const jauhSebelum = sekarang - 10 * 60 * 60 * 1000;
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3", jauhSebelum), false);
  });

  it("bentuk token yang tidak dikenali ditolak, bukan dilempar", () => {
    for (const nilai of [null, undefined, "", "abc", "a.b.c", 123, {}, []]) {
      assert.equal(pratinjau.verifyPreviewToken(nilai, "cars", "byd-atto-3"), false);
    }
  });
});

describe("alamat pratinjau", () => {
  it("mobil dan motor memakai awalan alamatnya masing-masing", () => {
    const mobil = pratinjau.previewPath("cars", "byd-atto-3") as string;
    const motor = pratinjau.previewPath("motors", "alva-cervo") as string;
    assert.ok(mobil.startsWith("/mobil/byd-atto-3?pratinjau="));
    assert.ok(motor.startsWith("/motor/alva-cervo?pratinjau="));
  });

  it("token di dalam alamat terbaca kembali oleh pemeriksanya", () => {
    const alamat = pratinjau.previewPath("cars", "byd-atto-3") as string;
    const token = new URLSearchParams(alamat.split("?")[1]).get("pratinjau");
    assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3"), true);
  });

  it("hanya cars, motors, dan halaman yang dikenali sebagai koleksi pratinjau", () => {
    assert.equal(pratinjau.isPreviewCollection("cars"), true);
    assert.equal(pratinjau.isPreviewCollection("motors"), true);
    assert.equal(pratinjau.isPreviewCollection("halaman"), true);
    for (const nilai of ["spklu", "bengkel", "berita", "site", "", null]) {
      assert.equal(pratinjau.isPreviewCollection(nilai), false);
    }
  });

  /* Halaman statis dialamati lewat slug, sementara tokennya menandatangani id:
     mengganti alamat halaman tidak boleh mematikan tautan yang sudah dikirim. */
  it("halaman memakai slug di alamatnya, tapi id di tanda tangannya", () => {
    const alamat = pratinjau.previewPath("halaman", "kebijakan-privasi", "privasi") as string;
    assert.ok(alamat.startsWith("/privasi?pratinjau="));
    const token = new URL(alamat, "https://contoh.id").searchParams.get("pratinjau");
    assert.equal(pratinjau.verifyPreviewToken(token, "halaman", "kebijakan-privasi"), true);
    assert.equal(pratinjau.verifyPreviewToken(token, "halaman", "privasi"), false);
  });
});

describe("tanpa SESSION_SECRET", () => {
  it("token tidak diterbitkan dan tidak ada yang dianggap sah", async () => {
    const asli = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "";
    try {
      assert.equal(pratinjau.makePreviewToken("cars", "byd-atto-3"), null);
      assert.equal(pratinjau.previewPath("cars", "byd-atto-3"), null);
      // Token yang tadinya sah pun ikut mati: rahasianya yang menentukan.
      process.env.SESSION_SECRET = asli;
      const token = pratinjau.makePreviewToken("cars", "byd-atto-3") as string;
      process.env.SESSION_SECRET = "";
      assert.equal(pratinjau.verifyPreviewToken(token, "cars", "byd-atto-3"), false);
    } finally {
      process.env.SESSION_SECRET = asli;
    }
  });
});
