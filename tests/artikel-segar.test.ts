import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pilihSegar,
  bersihkanSegar,
  bahanSegar,
  normalkanPengaturanSegar,
  BATAS_SEHARI,
} from "../src/lib/artikel-segar.ts";

/**
 * Aturan penyegar artikel tayang yang dijaga di sini:
 * - Hanya yang tayang yang disegarkan (draf milik alur telaah).
 * - Yang sudah disegarkan hari ini dilewati; sisanya dari yang paling lama
 *   tak tersentuh, dibatasi BATAS_SEHARI.
 * - Hasil AI yang terlalu pendek/terpotong ditolak; isi yang sama persis
 *   dicatat "tetap" tanpa stempel.
 * - Sumber lama manusia tidak pernah dibuang; sumber baru harus dari daftar
 *   putih; skrip dibuang.
 */

const ISI = (n: number) => `# Panduan\n\n${"Kalimat isi yang wajar dan cukup panjang untuk lolos batas minimum. ".repeat(n)}`;

function artikel(id: string, patch: any = {}) {
  return {
    id,
    title: `Artikel ${id}`,
    slug: `artikel-${id}`,
    excerpt: "Ringkasan dua kalimat.",
    body: ISI(40),
    category: "Panduan",
    tags: [],
    sources: [{ label: "Sumber lama", url: "https://contoh.id/lama" }],
    status: "published",
    date: "2026-01-01",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("normalkanPengaturanSegar", () => {
  it("bawaan menyala, saklar panel dihormati", () => {
    assert.deepEqual(normalkanPengaturanSegar(undefined), { aktif: true });
    assert.deepEqual(normalkanPengaturanSegar({}), { aktif: true });
    assert.deepEqual(normalkanPengaturanSegar({ aktif: false }), { aktif: false });
  });
});

describe("pilihSegar", () => {
  it("draf tidak ikut; yang disegarkan hari ini dilewati", () => {
    const daftar = [artikel("a"), artikel("b", { status: "draft" }), artikel("c")];
    const dapat = pilihSegar(daftar, [{ id: "a", tanggal: "2026-10-03", hasil: "diperbarui" }], "2026-10-03");
    assert.deepEqual(dapat.map((a: any) => a.id), ["c"]);
  });

  it("yang tak pernah disegarkan didahulukan dari yang baru disegarkan", () => {
    const daftar = [artikel("lama"), artikel("baru")];
    const riwayat = [{ id: "baru", tanggal: "2026-10-02", hasil: "tetap" as const }];
    const dapat = pilihSegar(daftar, riwayat, "2026-10-03");
    assert.equal(dapat[0].id, "lama");
  });

  it("dibatasi BATAS_SEHARI", () => {
    const daftar = Array.from({ length: BATAS_SEHARI + 5 }, (_, i) => artikel(`a${i}`));
    assert.equal(pilihSegar(daftar, [], "2026-10-03").length, BATAS_SEHARI);
  });
});

describe("bahanSegar", () => {
  it("menyebut kendaraan yang dibahas artikel, plus berita terbaru", () => {
    const content = {
      cars: [
        { id: "m1", brand: "BYD", name: "Seal", rangeKm: 520, batteryKwh: 82, price: 700000000, priceText: "" },
        { id: "m2", brand: "Wuling", name: "Air EV", rangeKm: 300, batteryKwh: 26, price: 250000000, priceText: "" },
      ],
      motors: [],
      berita: [{ title: "Harga baterai turun", url: "https://media.id/x", source: "Media" }],
    };
    const a = artikel("a", { body: `${ISI(40)}\n\nBYD Seal disebut di sini.` });
    const { bahan, sumberBoleh } = bahanSegar(content, a);
    assert.match(bahan, /BYD Seal/);
    assert.match(bahan, /Harga baterai turun/);
    assert.deepEqual(sumberBoleh, ["https://media.id/x"]);
  });
});

describe("bersihkanSegar", () => {
  it("isi yang sama persis berarti tetap — tanpa stempel", () => {
    const a = artikel("a");
    const bersih = bersihkanSegar({ body: a.body, excerpt: a.excerpt, ringkasan: "tetap", sources: [] }, a, []);
    assert.equal(bersih.tetap, true);
    assert.equal(bersih.berubah, false);
  });

  it("menolak yang terlalu pendek dan yang menyusut separuh", () => {
    const a = artikel("a");
    assert.equal(bersihkanSegar({ body: "pendek", excerpt: "", ringkasan: "", sources: [] }, a, []).alasan, "terlaluPendek");
    const susut = bersihkanSegar(
      { body: ISI(5), excerpt: "", ringkasan: "x", sources: [] },
      a,
      []
    );
    assert.equal(susut.berubah, false);
    assert.ok(["terlaluPendek", "terpotong"].includes(susut.alasan));
  });

  it("sumber lama dipertahankan, sumber asing dibuang, skrip dibuang", () => {
    const a = artikel("a");
    const bodyBaru = `${ISI(40)}\n\n<script>alert(1)</script>\nTambahan segar.`;
    const bersih = bersihkanSegar(
      {
        body: bodyBaru,
        excerpt: "Ringkasan baru dua kalimat.",
        ringkasan: "Harga diperbarui.",
        sources: [
          { label: "Berita", url: "https://media.id/x" },
          { label: "Asing", url: "https://jahat.example/phish" },
        ],
      },
      a,
      ["https://media.id/x"]
    );
    assert.equal(bersih.berubah, true);
    assert.ok(!bersih.body.includes("<script>"));
    const urls = bersih.sources.map((s) => s.url);
    assert.ok(urls.includes("https://contoh.id/lama"));
    assert.ok(urls.includes("https://media.id/x"));
    assert.ok(!urls.includes("https://jahat.example/phish"));
  });
});
