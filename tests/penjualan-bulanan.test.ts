import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSchema } from "../src/lib/ai-prompt.js";
import { bersihkanUsulan } from "../src/lib/ai-usulan.js";
import { normalizeContent } from "../src/lib/store";
import {
  bulanGaikindoTerbaru,
  pilihJualan,
} from "../src/lib/penjualan-bulanan";

/**
 * Penjualan bulanan otomatis — umpan panel "Laris Mobil Kita".
 *
 * Yang dijaga uji ini:
 *
 *   1. Bulan Gaikindo terbaru dihitung dari tanggal rilis pertengahan bulan
 *      (batas HARI_RILIS_GAIKINDO), termasuk pergantian tahun.
 *   2. Yang ditandai hanya yang angkanya basi — draf, tanpa merek/nama, yang
 *      sudah antre, dan yang bulannya sudah kini semuanya dilewati.
 *   3. Urutan: yang berangka dulu (penghuni panel), lalu bulan tertua.
 *   4. Bulan yang bentuknya bukan YYYY-MM tidak lolos skema, normalisasi,
 *      maupun label panel — di semua lapis, bukan satu.
 */

function jawaban(field: Record<string, any>) {
  return { ringkasan: "Riset Gaikindo.", peringatan: [], field };
}

function isi(nilai: any) {
  return { nilai, keyakinan: "tinggi", sumber: "https://gaikindo.or.id/", catatan: "Wholesales." };
}

const mobil = (id: string, extra: Record<string, any> = {}) => ({
  id,
  brand: "Merek",
  name: `Model ${id}`,
  status: "published",
  ...extra,
});

describe("bulanGaikindoTerbaru", () => {
  it("sebelum tanggal rilis memakai dua bulan lalu", () => {
    // 11 Oktober 2026: data September belum keluar (batas tanggal 12).
    assert.equal(bulanGaikindoTerbaru("2026-10-11"), "2026-08");
  });

  it("mulai tanggal rilis memakai bulan lalu", () => {
    assert.equal(bulanGaikindoTerbaru("2026-10-12"), "2026-09");
    assert.equal(bulanGaikindoTerbaru("2026-10-31"), "2026-09");
  });

  it("mundur melewati pergantian tahun", () => {
    assert.equal(bulanGaikindoTerbaru("2026-01-05"), "2025-11");
    assert.equal(bulanGaikindoTerbaru("2026-01-20"), "2025-12");
  });

  it("masukan rusak menghasilkan string kosong, bukan bulan ngawur", () => {
    assert.equal(bulanGaikindoTerbaru(""), "");
    assert.equal(bulanGaikindoTerbaru("kemarin"), "");
    assert.equal(bulanGaikindoTerbaru("2026-13-01"), "");
  });
});

describe("pilihJualan", () => {
  const isiKonten = {
    cars: [
      mobil("segar", { penjualan2026: 1000, penjualanBulan: "2026-09" }),
      mobil("basi-angka", { penjualan2026: 2000, penjualanBulan: "2026-08" }),
      mobil("tua-tanpa-angka", { penjualan2026: null, penjualanBulan: "", updatedAt: "2026-01-01T00:00:00.000Z" }),
      mobil("baru-tanpa-angka", { penjualan2026: null, penjualanBulan: "", updatedAt: "2026-10-01T00:00:00.000Z" }),
      mobil("draf", { status: "draft", penjualan2026: 9999, penjualanBulan: "2026-01" }),
      mobil("antre", { penjualan2026: 500, penjualanBulan: "2026-07", perluCek: true }),
      { id: "tanpa-nama", brand: "Merek", status: "published" },
    ],
    motors: [mobil("motor-basi", { penjualan2026: 100, penjualanBulan: "2026-08" })],
  };

  it("melewati yang segar, draf, antre, dan tanpa nama", () => {
    const ids = pilihJualan(isiKonten, "2026-09", 10).map((k) => k.id);
    assert.deepEqual(ids.sort(), ["basi-angka", "baru-tanpa-angka", "motor-basi", "tua-tanpa-angka"].sort());
  });

  it("yang berangka dulu, lalu bulan tertua", () => {
    const ids = pilihJualan(isiKonten, "2026-09", 10).map((k) => k.id);
    // Berangka: basi-angka, motor-basi (bulan sama, abjad). Tanpa angka:
    // tua-tanpa-angka (lebih lama tak diperbarui) sebelum baru-tanpa-angka.
    assert.deepEqual(ids, ["basi-angka", "motor-basi", "tua-tanpa-angka", "baru-tanpa-angka"]);
  });

  it("batas dipatuhi dan target kosong berarti tidak ada kerja", () => {
    assert.equal(pilihJualan(isiKonten, "2026-09", 2).length, 2);
    assert.deepEqual(pilihJualan(isiKonten, "", 10), []);
    assert.deepEqual(pilihJualan(isiKonten, "2026-09", 0), []);
  });

  it("yang baru ditandai bulan ini dilewati, kecuali penandaannya sudah tua", () => {
    const ditandai = { "basi-angka": "2026-10-10" };
    const ids = pilihJualan(isiKonten, "2026-09", 10, ditandai, "2026-10-11").map((k) => k.id);
    assert.equal(ids.includes("basi-angka"), false);
    const lama = pilihJualan(isiKonten, "2026-09", 10, { "basi-angka": "2026-08-01" }, "2026-10-11").map(
      (k) => k.id
    );
    assert.equal(lama.includes("basi-angka"), true);
  });
});

describe("bulan penjualan di skema dan normalisasi", () => {
  it("masuk skema mobil dan motor sebagai string YYYY-MM", () => {
    for (const kind of ["mobil", "motor"] as const) {
      const props = buildSchema(kind).properties.field.properties;
      assert.equal("penjualanBulan" in props, true);
      assert.deepEqual(props.penjualanBulan.properties.nilai.type, ["string", "null"]);
    }
  });

  it("bentuk YYYY-MM lolos, bentuk lain dibuang dengan peringatan", () => {
    const { usulan } = bersihkanUsulan(jawaban({ penjualanBulan: isi("2026-09") }), { kind: "mobil" });
    assert.equal(usulan.length, 1);
    assert.equal(usulan[0].nilai, "2026-09");
    const { usulan: kosong, peringatan } = bersihkanUsulan(jawaban({ penjualanBulan: isi("September 2026") }), {
      kind: "mobil",
    });
    assert.equal(kosong.length, 0);
    assert.deepEqual(peringatan, ["penjualanBulan: bukanBulan"]);
  });

  it("normalisasi menyimpan yang berbentuk, membuang yang tidak", () => {
    const out = normalizeContent({
      bengkel: [],
      cars: [
        mobil("a", { penjualanBulan: "2026-09" }),
        mobil("b", { penjualanBulan: "September 2026" }),
        mobil("c", {}),
      ],
    });
    assert.equal(out.cars.find((v: any) => v.id === "a").penjualanBulan, "2026-09");
    assert.equal(out.cars.find((v: any) => v.id === "b").penjualanBulan, "");
    assert.equal(out.cars.find((v: any) => v.id === "c").penjualanBulan, "");
  });
});

describe("tandaiJualan ujung-ke-ujung", () => {
  /*
   * Dijalankan di PROSES TERPISAH dengan cwd direktori sementara: store.ts
   * mengikat alamat data/content.json saat modul dimuat, jadi chdir di dalam
   * proses uji tidak mempan — pernah terbukti menulis perluCek ke
   * data/content.json milik pengembang (untung tertangkap sebelum commit).
   */
  it("menandai yang basi, tidak mengulang, menghormati saklar mati", async () => {
    const os = await import("node:os");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { pathToFileURL } = await import("node:url");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-jualan-"));
    fs.mkdirSync(path.join(dir, "data"), { recursive: true });
    const modul = pathToFileURL(path.resolve("src/lib/penjualan-bulanan.ts")).href;
    const resolver = pathToFileURL(path.resolve("tools/ts-resolver.mjs")).href;

    const tulisKonten = (cars: unknown[]) =>
      fs.writeFileSync(
        path.join(dir, "data", "content.json"),
        JSON.stringify({ site: {}, cars, motors: [] })
      );
    tulisKonten([{ id: "x", brand: "Merek", name: "Model X", status: "published", penjualan2026: 100 }]);

    const skrip = [
      `const fs = await import("node:fs");`,
      `const m = await import(${JSON.stringify(modul)});`,
      `const baca = () => JSON.parse(fs.readFileSync("data/content.json", "utf8"));`,
      `const r1 = m.tandaiJualan({ paksa: true });`,
      `const c1 = baca();`,
      `const r2 = m.tandaiJualan({ paksa: true });`,
      `fs.writeFileSync("data/pembaruan-kendaraan.json", JSON.stringify({ pengaturan: { aktif: false } }));`,
      `fs.writeFileSync("data/content.json", JSON.stringify({ site: {}, cars: [{ id: "y", brand: "Merek", name: "Model Y", status: "published", penjualan2026: 50 }], motors: [] }));`,
      `const r3 = m.tandaiJualan();`,
      `const c3 = baca();`,
      `console.log("HASIL " + JSON.stringify({`,
      `  tandai1: r1.ditandai.map((k) => k.id), bulan: r1.bulan,`,
      `  perluCekX: !!c1.cars[0].perluCek,`,
      `  tandai2: r2.ditandai.length,`,
      `  lewati3: r3.dilewati, perluCekY: !!c3.cars[0].perluCek,`,
      `}));`,
    ].join("\n");

    const jalan = spawnSync(process.execPath, ["--import", resolver, "-e", skrip], {
      cwd: dir,
      encoding: "utf8",
      timeout: 120000,
    });
    assert.equal(jalan.status, 0, jalan.stderr);
    const baris = String(jalan.stdout).split("\n").find((b) => b.startsWith("HASIL "));
    assert.ok(baris, "skenario anak harus mencetak HASIL");
    const h = JSON.parse(baris.slice("HASIL ".length));
    assert.deepEqual(h.tandai1, ["x"]);
    assert.match(h.bulan, /^\d{4}-(0[1-9]|1[0-2])$/);
    assert.equal(h.perluCekX, true);
    assert.equal(h.tandai2, 0);
    assert.equal(h.lewati3, true);
    assert.equal(h.perluCekY, false);
  });
});
