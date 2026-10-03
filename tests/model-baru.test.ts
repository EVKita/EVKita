import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  kandidatPeluncuran,
  saringKandidat,
  sudahAda,
  kunciKandidat,
  hostDari,
  umurHariIso,
} from "../src/lib/model-baru.ts";

/**
 * Aturan penemuan model baru yang dijaga di sini:
 * - Hanya kabar peluncuran ≤7 hari yang tidak cocok kendaraan katalog.
 * - Kandidat lolos kalau disebut ≥2 host berbeda, bukan kembaran katalog,
 *   dan belum pernah ditambahkan.
 */

const ARMADA = [
  { brand: "BYD", name: "Seal" },
  { brand: "Wuling", name: "Air EV" },
];

function berita(title: string, hariLalu: number, extra: any = {}) {
  const d = new Date(Date.now() - hariLalu * 24 * 3600 * 1000);
  return { title, url: `https://media.id/${encodeURIComponent(title.slice(0, 10))}`, date: d.toISOString().slice(0, 10), ...extra };
}

describe("kandidatPeluncuran", () => {
  it("melewatkan yang sudah ada di katalog dan yang bukan kabar model", () => {
    const items = [
      berita("BYD Seal meluncur resmi di Indonesia", 1),
      berita("Penjualan Wuling Air EV naik dua kali lipat", 1),
      berita("Merek VoltRider X9 resmi hadir di Jakarta", 1),
    ];
    const dapat = kandidatPeluncuran(items, ARMADA);
    assert.equal(dapat.length, 1);
    assert.match(dapat[0].title, /VoltRider/);
  });

  it("membuang kabar basi lebih dari 7 hari", () => {
    const items = [berita("VoltRider X9 diluncurkan", 9)];
    assert.deepEqual(kandidatPeluncuran(items, ARMADA), []);
  });
});

describe("sudahAda", () => {
  it("mengenali nama yang sama dan yang terkandung", () => {
    assert.equal(sudahAda(ARMADA, "BYD", "Seal"), true);
    assert.equal(sudahAda(ARMADA, "byd", "SEAL"), true);
    assert.equal(sudahAda(ARMADA, "BYD", "BYD Seal"), true);
    assert.equal(sudahAda(ARMADA, "VoltRider", "X9"), false);
    assert.equal(sudahAda(ARMADA, "", ""), true);
  });
});

describe("saringKandidat", () => {
  const ekstraksi = {
    kandidat: [
      { brand: "VoltRider", model: "X9", kind: "motor", urls: ["https://a.id/1", "https://b.id/2"] },
      { brand: "Solo", model: "Saja", kind: "mobil", urls: ["https://a.id/3"] },
      { brand: "BYD", model: "Seal", kind: "mobil", urls: ["https://a.id/4", "https://b.id/5"] },
      { brand: "", model: "Tanpa Merek", kind: "mobil", urls: ["https://a.id/6", "https://b.id/7"] },
    ],
  };

  it("satu host, kembaran katalog, dan tanpa merek semuanya gugur", () => {
    const dapat = saringKandidat(ekstraksi, ARMADA, []);
    assert.deepEqual(dapat.map((k) => k.model), ["X9"]);
    assert.equal(dapat[0].kind, "motor");
  });

  it("yang sudah pernah ditambahkan tidak diproses dua kali", () => {
    const dapat = saringKandidat(ekstraksi, ARMADA, [kunciKandidat("VoltRider", "X9")]);
    assert.deepEqual(dapat, []);
  });
});

describe("hostDari & umurHariIso", () => {
  it("host dinormalkan tanpa www", () => {
    assert.equal(hostDari("https://WWW.Contoh.id/jalan"), "contoh.id");
    assert.equal(hostDari("bukan url"), "");
  });

  it("tanggal rusak dianggap sangat tua", () => {
    assert.ok(umurHariIso("bukan-tanggal") > 7);
    assert.equal(umurHariIso(new Date().toISOString().slice(0, 10)), 0);
  });
});
