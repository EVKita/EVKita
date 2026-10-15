import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterWilayah,
  isWilayah,
  normalizeWilayah,
  wilayahDariPath,
} from "../src/lib/region.js";

describe("normalizeWilayah", () => {
  it("kosong berarti Indonesia — isi lama tidak perlu migrasi", () => {
    assert.equal(normalizeWilayah(undefined), "id");
    assert.equal(normalizeWilayah(""), "id");
    assert.equal(normalizeWilayah(null), "id");
  });

  it("menerima us tanpa peduli kapital dan spasi", () => {
    assert.equal(normalizeWilayah("us"), "us");
    assert.equal(normalizeWilayah(" US "), "us");
  });

  it("nilai asing jatuh ke Indonesia, bukan menyembunyikan entri", () => {
    assert.equal(normalizeWilayah("eropa"), "id");
    assert.equal(normalizeWilayah("xx"), "id");
  });

  it("mengenal tiga edisi", () => {
    assert.equal(normalizeWilayah("cn"), "cn");
    assert.equal(normalizeWilayah("CN"), "cn");
  });
});

describe("filterWilayah", () => {
  it("memisahkan edisi tanpa mengubah urutan", () => {
    const daftar = [{ id: "a" }, { id: "b", wilayah: "us" }, { id: "c", wilayah: "id" }];
    assert.deepEqual(filterWilayah(daftar, "us").map((x) => x.id), ["b"]);
    assert.deepEqual(filterWilayah(daftar, "id").map((x) => x.id), ["a", "c"]);
  });

  it("bukan larik berarti daftar kosong, bukan meledak", () => {
    assert.deepEqual(filterWilayah(null, "us"), []);
    assert.deepEqual(filterWilayah(undefined, "id"), []);
  });
});

describe("isWilayah", () => {
  it("entri tanpa wilayah milik Indonesia", () => {
    assert.equal(isWilayah({}, "id"), true);
    assert.equal(isWilayah({}, "us"), false);
    assert.equal(isWilayah({ wilayah: "us" }, "us"), true);
  });
});

describe("wilayahDariPath", () => {
  it("/amerika dan turunannya edisi us, /china edisi cn, selainnya id", () => {
    assert.equal(wilayahDariPath("/amerika"), "us");
    assert.equal(wilayahDariPath("/amerika/katalog"), "us");
    assert.equal(wilayahDariPath("/china"), "cn");
    assert.equal(wilayahDariPath("/china/katalog"), "cn");
    assert.equal(wilayahDariPath("/"), "id");
    assert.equal(wilayahDariPath("/katalog"), "id");
    assert.equal(wilayahDariPath(""), "id");
  });
});

import { SUMBER_BERITA, relevanBerita } from "../src/lib/berita-sumber.js";
import { pilihTopik, sampulArtikel } from "../src/lib/artikel-harian";
import { bahanSegar } from "../src/lib/artikel-segar";
import { buildInstructions } from "../src/lib/ai-prompt.js";

describe("sumber berita dua edisi", () => {
  it("setiap sumber bertag wilayah; AS dari feed AS", () => {
    const us = SUMBER_BERITA.filter((s: any) => s.wilayah === "us");
    assert.ok(us.length >= 2, "minimal dua sumber Amerika");
    for (const s of SUMBER_BERITA) {
      assert.ok(s.id && s.nama && s.feed, `${s.id} tak lengkap`);
    }
  });

  it("pola EV menangkap headline Inggris", () => {
    assert.equal(relevanBerita("Rivian Deliveries Hit Record High In Q3 2026 Thanks To R2"), true);
    assert.equal(relevanBerita("Resep rendang padang untuk hajatan"), false);
  });
});

describe("pilihTopik edisi Amerika", () => {
  const usContent = {
    berita: [
      { title: "Rivian R2 deliveries begin", url: "https://x.test/r1", source: "InsideEVs", wilayah: "us", date: "2026-10-11" },
      { title: "Rivian R2 range confirmed", url: "https://x.test/r2", source: "Electrek", wilayah: "us", date: "2026-10-11" },
    ],
    cars: [
      { id: "us-a", brand: "Tesla", name: "Model Y", bodyType: "SUV", rangeKm: 575, batteryKwh: 75, powerHp: 295, priceText: "US$39.990", wilayah: "us" },
      { id: "us-b", brand: "Tesla", name: "Model 3", bodyType: "Sedan", rangeKm: 517, batteryKwh: null, powerHp: 271, priceText: "US$36.990", wilayah: "us" },
    ],
    motors: [],
  };
  const idContent = {
    berita: [{ title: "Mobil listrik baru", url: "https://x.test/i1", source: "detikOto", date: "2026-10-11" }],
    cars: [{ id: "id-a", brand: "BYD", name: "Atto 1", bodyType: "Hatchback", rangeKm: 300, batteryKwh: 30, powerHp: 74, price: 195000000, wilayah: "id" }],
    motors: [],
  };

  it("edisi us tidak memakai berita/kendaraan Indonesia", () => {
    const topik = pilihTopik(usContent, [], "2026-10-11", "us");
    assert.ok(topik, "ada topik");
    assert.ok(String(topik!.kunci).startsWith("us:"), `kunci namespaced: ${topik!.kunci}`);
    assert.equal((topik as any).wilayah, "us");
    assert.ok(!topik!.bahan.includes("BYD"), "bahan bebas Indonesia");
  });

  it("edisi id tidak memakai konten Amerika", () => {
    const topik = pilihTopik(idContent, [], "2026-10-11", "id");
    assert.ok(topik, "ada topik");
    assert.ok(!String(topik!.kunci).startsWith("us:"), `kunci polos: ${topik!.kunci}`);
    assert.ok(!topik!.bahan.includes("Tesla"), "bahan bebas Amerika");
  });

  it("bahan banding AS memakai dolar dan mil", () => {
    const dua = {
      berita: [],
      cars: [
        ...usContent.cars,
        { id: "us-c", brand: "Ford", name: "Mach-E", bodyType: "SUV", rangeKm: 515, batteryKwh: 88, powerHp: null, priceText: "US$37.795", wilayah: "us" },
      ],
      motors: [],
    };
    const t2 = pilihTopik(dua, [], "2026-10-11", "us");
    assert.ok(t2 && t2.strategi === "banding", `strategi banding, dapat ${t2 && t2.strategi}`);
    assert.match(t2!.bahan, /US\$/);
    assert.match(t2!.bahan, /mi EPA/);
  });
});

describe("sampul edisi Amerika", () => {
  it("artikel AS tidak bersampul foto Indonesia", () => {
    const content = {
      cars: [
        { id: "id-a", brand: "BYD", name: "Atto", image: "/gambar/mobil/id.webp" },
        { id: "us-a", brand: "Tesla", name: "Model Y", image: "/gambar/mobil/us.webp", wilayah: "us" },
      ],
      motors: [],
      berita: [],
    };
    const topikUs: any = { strategi: "panduan", kunci: "us:panduan:x", judulKerja: "x", bahan: "x", sumberBoleh: [], wilayah: "us" };
    assert.equal(sampulArtikel(content, topikUs, "2026-10-11"), "/gambar/mobil/us.webp");
    const topikId: any = { strategi: "panduan", kunci: "panduan:x", judulKerja: "x", bahan: "x", sumberBoleh: [] };
    assert.equal(sampulArtikel(content, topikId, "2026-10-11"), "/gambar/mobil/id.webp");
  });
});

describe("bahanSegar edisi Amerika", () => {
  it("artikel AS disegarkan dari katalog dan berita AS", () => {
    const content = {
      cars: [
        { id: "us-a", brand: "Tesla", name: "Model Y", rangeKm: 575, batteryKwh: 75, powerHp: 295, priceText: "US$39.990", wilayah: "us" },
        { id: "id-a", brand: "BYD", name: "Atto", rangeKm: 300, batteryKwh: 30, powerHp: 74, price: 195000000 },
      ],
      motors: [],
      berita: [
        { title: "Rivian record", url: "https://x.test/r", source: "InsideEVs", wilayah: "us" },
        { title: "Mobil baru", url: "https://x.test/i", source: "detikOto" },
      ],
    };
    const { bahan, sumberBoleh } = bahanSegar(content, { title: "Tesla Model Y guide", body: "Tesla Model Y review" });
    // Tanpa wilayah = edisi id (perilaku lama).
    assert.ok(bahan.includes("BYD"), "bahan Indonesia untuk artikel tanpa wilayah");
    const us = bahanSegar(content, { title: "Tesla Model Y guide", body: "Tesla Model Y review", wilayah: "us" });
    assert.ok(us.bahan.includes("Tesla"), "bahan AS menyebut Tesla");
    assert.ok(!us.bahan.includes("BYD"), "bahan AS bebas BYD");
    assert.ok(us.bahan.includes("US$"), "harga dolar di bahan AS");
    assert.deepEqual(us.sumberBoleh, ["https://x.test/r"], "sumber AS saja");
    assert.deepEqual(sumberBoleh, ["https://x.test/i"], "sumber ID saja");
  });
});

describe("buildInstructions pasar Amerika", () => {
  const HARI = "2026-10-11";
  it("tanpa wilayah tetap Indonesia (perilaku lama)", () => {
    const teks = buildInstructions({ kind: "mobil", brand: "BYD", name: "Atto 1", today: HARI });
    assert.match(teks, /dijual resmi di Indonesia/);
    assert.match(teks, /Rupiah/);
  });

  it("wilayah us memakai Dolar, EPA, dan sumber Amerika", () => {
    const teks = buildInstructions({ kind: "mobil", brand: "Tesla", name: "Model Y", today: HARI, wilayah: "us" });
    assert.match(teks, /Amerika Serikat/);
    assert.match(teks, /Dolar AS/);
    assert.match(teks, /EPA/);
    assert.match(teks, /InsideEVs/);
    assert.ok(!teks.includes("Harga dalam Rupiah"), "tanpa harga Rupiah");
    assert.match(teks, /Harga MSRP dalam Dolar AS/);
  });
});
