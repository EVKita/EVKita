import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compareVersions } from "../src/lib/releases";
import { readJson, writeJsonAtomic } from "../src/lib/jsonfile";

/**
 * Keutuhan data: perbandingan versi (yang menentukan kapan tombol "perbarui"
 * menyala) dan baca-tulis JSON yang tahan mati mendadak.
 */

describe("compareVersions", () => {
  it("mengurutkan versi dengan benar", () => {
    assert.ok(compareVersions("1.0.15", "1.0.14") > 0);
    assert.ok(compareVersions("1.1.0", "1.0.99") > 0);
    assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
    assert.ok(compareVersions("1.0.14", "1.0.15") < 0);
    assert.equal(compareVersions("1.0.14", "1.0.14"), 0);
  });

  it("mengabaikan awalan v", () => {
    assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
    assert.ok(compareVersions("v1.2.4", "1.2.3") > 0);
  });

  it("membandingkan angka, bukan teks", () => {
    // Perbandingan teks akan menyimpulkan "1.0.9" > "1.0.10".
    assert.ok(compareVersions("1.0.10", "1.0.9") > 0);
    assert.ok(compareVersions("1.0.100", "1.0.99") > 0);
  });

  it("menganggap bagian yang hilang sebagai nol", () => {
    assert.equal(compareVersions("1.2", "1.2.0"), 0);
    assert.ok(compareVersions("1.2.1", "1.2") > 0);
  });

  it("tidak menyatakan versi baru saat berhadapan dengan 'dev'", () => {
    // Instalasi pengembangan melaporkan versi "dev". Ia diurai jadi 0, jadi
    // rilis apa pun terlihat lebih baru — itu memang yang diinginkan.
    assert.ok(compareVersions("1.0.14", "dev") > 0);
  });
});

describe("jsonfile", () => {
  let dir = "";

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-json-"));
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("membedakan berkas yang belum ada dari berkas yang rusak", () => {
    const hilang = readJson(path.join(dir, "belum-ada.json"));
    assert.equal(hilang.status, "missing");

    const rusak = path.join(dir, "rusak.json");
    fs.writeFileSync(rusak, '{"users": [ {"id": "a"');
    const hasil = readJson(rusak);
    assert.equal(hasil.status, "corrupt");

    // Perbedaan inilah inti perbaikannya: memperlakukan keduanya sama membuat
    // berkas akun yang terpotong ditimpa daftar kosong.
    assert.notEqual(hilang.status, hasil.status);
  });

  it("membaca kembali apa yang ditulis", () => {
    const file = path.join(dir, "isi.json");
    writeJsonAtomic(file, { version: 1, users: [{ id: "a", nama: "Budi" }] });
    const res = readJson<any>(file);
    assert.equal(res.status, "ok");
    assert.equal(res.status === "ok" && res.data.users[0].nama, "Budi");
  });

  it("membuat direktori yang belum ada", () => {
    const file = path.join(dir, "baru", "dalam", "isi.json");
    writeJsonAtomic(file, { a: 1 });
    assert.ok(fs.existsSync(file));
  });

  it("tidak meninggalkan berkas sementara", () => {
    const file = path.join(dir, "bersih.json");
    writeJsonAtomic(file, { a: 1 });
    writeJsonAtomic(file, { a: 2 });
    const sisa = fs.readdirSync(dir).filter((f) => f.includes(".tmp"));
    assert.deepEqual(sisa, [], `berkas sementara tertinggal: ${sisa.join(", ")}`);
  });

  it("menerima BOM di awal berkas", () => {
    const file = path.join(dir, "bom.json");
    fs.writeFileSync(file, "﻿" + JSON.stringify({ a: 1 }));
    const res = readJson<any>(file);
    assert.equal(res.status, "ok");
    assert.equal(res.status === "ok" && res.data.a, 1);
  });

  it("isi lama tetap utuh kalau penulisan gagal", () => {
    const file = path.join(dir, "utuh.json");
    writeJsonAtomic(file, { versi: "lama" });

    // Nilai yang punya rujukan melingkar membuat JSON.stringify melempar —
    // meniru kegagalan di tengah penulisan.
    const melingkar: any = {};
    melingkar.diri = melingkar;
    assert.throws(() => writeJsonAtomic(file, melingkar));

    const res = readJson<any>(file);
    assert.equal(res.status, "ok", "berkas lama harus tetap terbaca");
    assert.equal(res.status === "ok" && res.data.versi, "lama");
  });
});
