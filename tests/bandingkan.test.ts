import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSlug,
  parseCompareSlug,
  bestIndex,
  compareVerdicts,
  verdictSentence,
  joinPhrase,
  COMPARE_ROWS,
} from "../src/lib/compare-html.js";
import { rivalsFor, comparePairs } from "../src/lib/compare-pairs.js";

/**
 * Halaman perbandingan. Yang diuji di sini adalah bagian yang menentukan
 * ALAMAT dan KESIMPULAN halaman itu: slug yang harus tunggal per pasangan,
 * penanda "unggul" yang tidak boleh berbohong saat datanya bolong, dan
 * pemilihan lawan yang menentukan isi peta situs.
 */

const row = (key: string) => COMPARE_ROWS.find((r: any) => r.key === key)!;

const mobil = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  brand: id.split("-")[0],
  name: id,
  bodyType: "SUV",
  price: 500_000_000,
  ...extra,
});

describe("slug perbandingan", () => {
  it("membakukan urutan supaya satu pasangan hanya punya satu alamat", () => {
    const a = compareSlug(["hyundai-ioniq-5", "byd-seal"]);
    const b = compareSlug(["byd-seal", "hyundai-ioniq-5"]);
    assert.equal(a, b);
    assert.equal(a, "byd-seal-vs-hyundai-ioniq-5");
  });

  it("mengurai kembali jadi daftar id", () => {
    assert.deepEqual(parseCompareSlug("byd-seal-vs-hyundai-ioniq-5"), ["byd-seal", "hyundai-ioniq-5"]);
  });

  it("menangani tiga kendaraan", () => {
    const slug = compareSlug(["c-tiga", "a-satu", "b-dua"]);
    assert.equal(slug, "a-satu-vs-b-dua-vs-c-tiga");
    assert.deepEqual(parseCompareSlug(slug), ["a-satu", "b-dua", "c-tiga"]);
  });

  it("tidak meledak pada slug kosong atau cacat", () => {
    assert.deepEqual(parseCompareSlug(""), []);
    assert.deepEqual(parseCompareSlug("-vs-"), []);
    assert.deepEqual(parseCompareSlug("sendirian"), ["sendirian"]);
  });
});

describe("penanda unggul", () => {
  it("menandai nilai terbesar untuk baris yang makin besar makin baik", () => {
    const items = [mobil("a", { rangeKm: 400 }), mobil("b", { rangeKm: 520 })];
    assert.equal(bestIndex(row("rangeKm"), items), 1);
  });

  it("menandai nilai terkecil untuk harga dan akselerasi", () => {
    const items = [mobil("a", { price: 700_000_000 }), mobil("b", { price: 500_000_000 })];
    assert.equal(bestIndex(row("price"), items), 1);
    const cepat = [mobil("a", { accelSec: 6.1 }), mobil("b", { accelSec: 8.4 })];
    assert.equal(bestIndex(row("accelSec"), cepat), 0);
  });

  it("tidak menandai apa pun kalau nilainya seri", () => {
    const items = [mobil("a", { rangeKm: 400 }), mobil("b", { rangeKm: 400 })];
    assert.equal(bestIndex(row("rangeKm"), items), -1);
  });

  it("tidak menandai kalau hanya satu kendaraan yang punya angkanya", () => {
    // Menang tanpa lawan bukan menang: yang lain sekadar belum terisi datanya.
    const items = [mobil("a", { rangeKm: 400 }), mobil("b", { rangeKm: null })];
    assert.equal(bestIndex(row("rangeKm"), items), -1);
  });

  it("tidak menandai baris yang memang bukan angka", () => {
    const items = [mobil("a", { driveType: "RWD" }), mobil("b", { driveType: "AWD" })];
    assert.equal(bestIndex(row("driveType"), items), -1);
  });
});

describe("kesimpulan singkat", () => {
  it("hanya menyebut baris yang punya pemenang tunggal", () => {
    const items = [
      mobil("a", { rangeKm: 520, price: 700_000_000, powerHp: 200 }),
      mobil("b", { rangeKm: 400, price: 500_000_000, powerHp: 200 }),
    ];
    const v = compareVerdicts(items);
    assert.deepEqual(
      v.map((x: any) => x.key),
      ["rangeKm", "price"]
    );
    assert.equal(v[0].winner.id, "a");
    assert.equal(v[0].value, "520 km");
    assert.equal(v[1].winner.id, "b");
  });

  it("mengembalikan daftar kosong kalau tidak ada angka sama sekali", () => {
    assert.deepEqual(compareVerdicts([mobil("a", { price: null }), mobil("b", { price: null })]), []);
  });
});

describe("kalimat kesimpulan", () => {
  it("menggabungkan keunggulan milik kendaraan yang sama jadi satu klausa", () => {
    // Tanpa pengelompokan ini kalimatnya berbunyi "Ioniq 5 …, Ioniq 5 …".
    const items = [
      mobil("ioniq", { brand: "Hyundai", name: "IONIQ 5", rangeKm: 480, batteryKwh: 72.6, price: 780_000_000 }),
      mobil("seal", { brand: "BYD", name: "Seal", rangeKm: 400, batteryKwh: 61.4, price: 630_000_000 }),
    ];
    assert.equal(
      verdictSentence(compareVerdicts(items)),
      "Hyundai IONIQ 5 jarak tempuhnya lebih jauh (480 km) dan baterainya lebih besar (72.6 kWh); BYD Seal harganya lebih murah (Rp 630 jt)"
    );
  });

  it("membatasi berapa keunggulan yang disebut per kendaraan", () => {
    const items = [
      mobil("a", { brand: "A", name: "Satu", rangeKm: 500, batteryKwh: 80, powerHp: 300, price: 900_000_000 }),
      mobil("b", { brand: "B", name: "Dua", rangeKm: 300, batteryKwh: 50, powerHp: 150, price: 500_000_000 }),
    ];
    const kalimat = verdictSentence(compareVerdicts(items), 2);
    assert.ok(kalimat.includes("jarak tempuhnya lebih jauh"));
    assert.ok(kalimat.includes("baterainya lebih besar"));
    assert.ok(!kalimat.includes("tenaganya lebih besar"), "keunggulan ketiga tidak boleh ikut");
  });

  it("kosong kalau tidak ada yang bisa disimpulkan", () => {
    assert.equal(verdictSentence([]), "");
  });
});

describe("perangkaian daftar", () => {
  it("memakai koma seri untuk tiga item ke atas", () => {
    assert.equal(joinPhrase(["A"]), "A");
    assert.equal(joinPhrase(["A", "B"]), "A dan B");
    assert.equal(joinPhrase(["A", "B", "C"]), "A, B, dan C");
  });

  it("aman untuk daftar kosong", () => {
    assert.equal(joinPhrase([]), "");
  });
});

describe("pemilihan lawan", () => {
  const pool = [
    mobil("byd-seal", { brand: "BYD", bodyType: "Sedan", price: 630_000_000 }),
    mobil("hyundai-ioniq-5", { brand: "Hyundai", bodyType: "SUV", price: 720_000_000 }),
    mobil("byd-atto-3", { brand: "BYD", bodyType: "SUV", price: 415_000_000 }),
    mobil("wuling-air", { brand: "Wuling", bodyType: "Hatchback", price: 200_000_000 }),
    mobil("chery-omoda", { brand: "Chery", bodyType: "SUV", price: 700_000_000 }),
  ];

  it("mendahulukan bentuk bodi yang sama", () => {
    const rivals = rivalsFor(pool[1], pool, 2).map((r: any) => r.id);
    assert.ok(rivals.includes("chery-omoda"));
    assert.ok(!rivals.includes("wuling-air"), "hatchback termurah tidak boleh jadi lawan terdekat SUV");
  });

  it("tidak pernah menyandingkan kendaraan dengan dirinya sendiri", () => {
    for (const v of pool) {
      assert.ok(!rivalsFor(v, pool, 4).some((r: any) => r.id === v.id));
    }
  });

  it("memilih harga terdekat di antara bodi yang sama", () => {
    // Omoda (700 jt) lebih dekat ke Ioniq 5 (720 jt) daripada Atto 3 (415 jt).
    assert.equal(rivalsFor(pool[1], pool, 1)[0].id, "chery-omoda");
  });

  it("menghasilkan pasangan yang stabil dan tanpa kembar", () => {
    const pairs = comparePairs(pool, 3);
    const slugs = pairs.map((p: any) => p.slug);
    assert.equal(new Set(slugs).size, slugs.length, "tidak boleh ada pasangan kembar");
    // Perayap yang datang dua kali harus melihat peta situs yang sama.
    assert.deepEqual(comparePairs(pool, 3).map((p: any) => p.slug), slugs);
  });

  it("setiap pasangan berisi dua id yang memang ada di katalog", () => {
    const ada = new Set(pool.map((v) => v.id));
    for (const p of comparePairs(pool, 3)) {
      assert.equal(p.ids.length, 2);
      for (const id of p.ids) assert.ok(ada.has(id), `${id} tidak ada di katalog`);
    }
  });

  it("aman untuk katalog yang cuma berisi satu kendaraan", () => {
    assert.deepEqual(comparePairs([pool[0]], 3), []);
  });
});
