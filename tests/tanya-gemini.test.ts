import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pilihKonteks,
  pilihTampil,
  ringkasKonteks,
  susunInstruksi,
  kunciGeminiTampakSah,
  urutkanModelFlash,
  ujiKunciGemini,
} from "../src/lib/gemini-tanya.ts";
import {
  tanggalWib,
  sisaKuota,
  catatPertanyaan,
  galatPertanyaan,
  TANYA_KUOTA_HARIAN,
} from "../src/lib/tanya.js";

/**
 * Aturan Tanya EVKita yang dijaga di sini:
 * - Konteks katalog hanya berisi yang benar-benar cocok (AND), bukan tebakan.
 * - Instruksi selalu memerintahkan kejujuran dan mengutamakan katalog.
 * - Kuota harian dihitung per anggota per tanggal WIB, bukan zona server.
 */

const KATALOG = [
  { brand: "BYD", name: "Seal", bodyType: "Sedan", rangeKm: 520, batteryKwh: 82, price: 700000000, priceText: "" },
  { brand: "Wuling", name: "Air EV", bodyType: "Hatchback", rangeKm: 300, batteryKwh: 26, price: 250000000, priceText: "" },
];

describe("pilihKonteks", () => {
  it("semua kata harus cocok — tidak mengembalikan yang setengah cocok", () => {
    assert.deepEqual(pilihKonteks(KATALOG, "byd seal"), [KATALOG[0]]);
    assert.deepEqual(pilihKonteks(KATALOG, "byd yang tidak ada"), []);
  });

  it("tanpa kata kunci tidak ada konteks — lebih baik kosong daripada salah", () => {
    assert.deepEqual(pilihKonteks(KATALOG, "???"), []);
    assert.equal(ringkasKonteks([]), "");
  });

  it("ringkasan memuat angka yang bisa dipakai model", () => {
    const s = ringkasKonteks([KATALOG[0]]);
    assert.match(s, /BYD Seal/);
    assert.match(s, /520 km/);
    assert.match(s, /82 kWh/);
  });
});

describe("pilihTampil", () => {
  const KAYA = [
    { id: "byd-seal", kind: "mobil", brand: "BYD", name: "Seal", bodyType: "Sedan", rangeKm: 520, batteryKwh: 82, price: 700000000, priceText: "", image: "/api/uploads/a.avif" },
    { id: "", kind: "mobil", brand: "Tanpa", name: "ID", bodyType: "", rangeKm: null, batteryKwh: null, price: null, priceText: "", image: "" },
  ];

  it("kartu menaut ke koleksi yang benar dengan angka katalog", () => {
    const dapat = pilihTampil(KAYA, "byd seal");
    assert.equal(dapat.length, 1);
    assert.equal(dapat[0].href, "/mobil/byd-seal");
    assert.equal(dapat[0].nama, "BYD Seal");
    assert.match(dapat[0].meta, /520 km/);
    assert.match(dapat[0].harga, /Rp/);
  });

  it("motor menaut ke /motor/, tanpa id dibuang", () => {
    const motor = [{ ...KAYA[0], id: "m1", kind: "motor", brand: "Voltz", name: "R1", bodyType: "", rangeKm: null, batteryKwh: null, price: null, priceText: "Rp 30 jt", image: "" }];
    const dapat = pilihTampil(motor, "voltz r1");
    assert.equal(dapat[0].href, "/motor/m1");
    assert.equal(dapat[0].meta, "");
    assert.equal(dapat[0].harga, "Rp 30 jt");
  });

  it("tanpa kecocokan tidak ada kartu — hanya jawaban AI", () => {
    assert.deepEqual(pilihTampil(KAYA, "biaya cas 100 km berapa"), []);
  });
});

describe("susunInstruksi", () => {
  it("selalu memerintahkan kejujuran dan menjawab sesuai bahasa", () => {
    const id = susunInstruksi("id", "- BYD Seal · 520 km");
    assert.match(id, /tidak tahu/);
    assert.match(id, /Bahasa Indonesia/);
    assert.match(id, /DATA KATALOG/);
    assert.match(susunInstruksi("en", ""), /English/);
    assert.match(susunInstruksi("zh", ""), /简体中文/);
  });
});

describe("kunciGeminiTampakSah", () => {
  it("menolak kunci DeepSeek yang salah tempel", () => {
    assert.equal(kunciGeminiTampakSah("sk-abcdef1234567890"), false);
    assert.equal(kunciGeminiTampakSah(""), false);
  });

  it("menerima kunci lama AIza dan kunci otorisasi baru AQ.", () => {
    assert.equal(kunciGeminiTampakSah("AIza1234567890abcdef1234567890ab"), true);
    assert.equal(kunciGeminiTampakSah("AQ.Ab8RN6IXKCausKIRKGQuRK-AL3ZOqIWQluAc3R_3CDpQk8nig"), true);
    assert.equal(kunciGeminiTampakSah("AQ.Ab8RN6IXKCausKIRKGQuRK AL3ZOqIWQluAc3R"), false);
  });
});

describe("urutkanModelFlash", () => {
  it("mendahulukan Flash stabil terbaru, menaruh 2.5 dan varian non-teks di belakang/dibuang", () => {
    const urut = urutkanModelFlash([
      "models/gemini-2.5-flash",
      "models/gemini-3.6-flash",
      "models/gemini-3.8-flash",
      "models/gemini-flash-latest",
      "models/gemini-3.5-flash-lite",
      "models/gemini-3.9-flash-preview",
      "models/gemini-2.5-flash-image",
      "models/text-embedding-004",
    ]);
    assert.deepEqual(urut, [
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.9-flash-preview",
    ]);
  });
});

describe("ujiKunciGemini", () => {
  const jawab = (status: number, body: any) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function denganFetch(palsu: (url: string, init: any) => Response, fn: () => Promise<void>) {
    const asli = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => palsu(String(url), init)) as any;
    try {
      await fn();
    } finally {
      globalThis.fetch = asli;
    }
  }

  it("kunci AQ. sah tapi model 2.5 tertutup → pindah ke Flash terbaru dan mengembalikan modelnya", async () => {
    const dipanggil: string[] = [];
    await denganFetch((url, init) => {
      assert.equal(init.headers["x-goog-api-key"], "AQ.contohKunciYangPanjang123");
      assert.ok(!url.includes("key="), "kunci tidak boleh masuk URL");
      if (url.includes("/models?")) {
        return jawab(200, { models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
        ] });
      }
      dipanggil.push(url);
      if (url.includes("gemini-2.5-flash")) return jawab(404, { error: { message: "This model is no longer available to new users." } });
      return jawab(200, { candidates: [{ content: { parts: [{ text: "OK" }] } }] });
    }, async () => {
      const hasil = await ujiKunciGemini("AQ.contohKunciYangPanjang123", "gemini-2.5-flash");
      assert.equal(hasil.ok, true);
      assert.equal(hasil.model, "gemini-3.8-flash");
      assert.equal(dipanggil.length, 2);
    });
  });

  it("kunci yang ditolak di daftar model → kunciSalah, tanpa mencoba model", async () => {
    let generate = 0;
    await denganFetch((url) => {
      if (url.includes("/models?")) return jawab(400, { error: { message: "API key not valid." } });
      generate++;
      return jawab(200, {});
    }, async () => {
      const hasil = await ujiKunciGemini("AQ.salahSalahSalah12345");
      assert.equal(hasil.ok, false);
      assert.equal(hasil.errorKey, "err.tanya.kunciSalah");
      assert.equal(hasil.detail, "API key not valid.");
      assert.equal(generate, 0);
    });
  });

  it("kunci sah tapi semua model menolak → modelTakTersedia, bukan kunciSalah", async () => {
    await denganFetch((url) => {
      if (url.includes("/models?")) return jawab(200, { models: [{ name: "models/gemini-3.8-flash" }] });
      return jawab(403, { error: { message: "Permission denied for model." } });
    }, async () => {
      const hasil = await ujiKunciGemini("AQ.contohKunciYangPanjang123");
      assert.equal(hasil.ok, false);
      assert.equal(hasil.errorKey, "err.tanya.modelTakTersedia");
    });
  });
});

describe("kuota harian", () => {
  // Selasa, 3 Okt 2026 10:00 WIB = 03:00 UTC. Kalau memakai UTC, tanggalnya
  // masih 2 Okt — kuota akan berganti tujuh jam terlambat.
  const pagi = new Date("2026-10-03T03:00:00Z");

  it("tanggal memakai WIB yang dipatok", () => {
    assert.equal(tanggalWib(pagi), "2026-10-03");
  });

  it(`${TANYA_KUOTA_HARIAN} pertanyaan per anggota, lalu ditolak`, () => {
    const siapa = `uji-${Date.now()}`;
    assert.equal(sisaKuota(siapa, pagi), TANYA_KUOTA_HARIAN);
    for (let i = 0; i < TANYA_KUOTA_HARIAN; i++) {
      assert.equal(catatPertanyaan(siapa, pagi).boleh, true);
    }
    assert.equal(catatPertanyaan(siapa, pagi).boleh, false);
    assert.equal(sisaKuota(siapa, pagi), 0);
  });

  it("kuota orang lain tidak ikut terpakai", () => {
    assert.equal(sisaKuota(`lain-${Date.now()}`, pagi), TANYA_KUOTA_HARIAN);
  });
});

describe("galatPertanyaan", () => {
  it("menolak yang kosong dan yang melewati 500 karakter", () => {
    assert.equal(galatPertanyaan("  "), "err.tanya.kosong");
    assert.equal(galatPertanyaan("x".repeat(501)), "err.tanya.panjang");
    assert.equal(galatPertanyaan("BYD Seal berapa harganya?"), "");
  });
});
