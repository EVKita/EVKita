import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bandingkanKonten } from "../src/lib/perubahan";

/**
 * Perbandingan dua dokumen konten.
 *
 * Ini yang menentukan isi log aktivitas, jadi kesalahannya punya dua bentuk
 * yang sama buruknya: melaporkan perubahan yang tidak pernah terjadi (log
 * penuh derau, dan derau membuat orang berhenti membacanya), atau melewatkan
 * perubahan yang benar-benar terjadi (log yang berbohong lebih buruk daripada
 * tidak ada log).
 */

const mobil = (extra: any = {}) => ({
  id: "byd-atto-3",
  brand: "BYD",
  name: "Atto 3",
  price: 515000000,
  rangeKm: 480,
  tags: ["suv"],
  status: "published",
  ...extra,
});

const dok = (extra: any = {}) => ({
  site: { brandText: "EVKita", heroTitle: "Halo" },
  cars: [],
  motors: [],
  spklu: [],
  bengkel: [],
  berita: [],
  media: {},
  ...extra,
});

describe("bandingkanKonten", () => {
  it("dokumen yang sama persis tidak menghasilkan perubahan", () => {
    const a = dok({ cars: [mobil()] });
    assert.deepEqual(bandingkanKonten(a, dok({ cars: [mobil()] })), []);
  });

  it("item baru dilaporkan sebagai penambahan, lengkap dengan judulnya", () => {
    const hasil = bandingkanKonten(dok(), dok({ cars: [mobil()] }));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].jenis, "tambah");
    assert.equal(hasil[0].col, "cars");
    assert.equal(hasil[0].id, "byd-atto-3");
    assert.equal(hasil[0].title, "BYD Atto 3");
  });

  it("item yang hilang dilaporkan sebagai penghapusan", () => {
    const hasil = bandingkanKonten(dok({ cars: [mobil()] }), dok());
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].jenis, "hapus");
    assert.equal(hasil[0].title, "BYD Atto 3");
  });

  it("menyebut field mana saja yang berubah, terurut", () => {
    const hasil = bandingkanKonten(
      dok({ cars: [mobil()] }),
      dok({ cars: [mobil({ price: 525000000, rangeKm: 490 })] })
    );
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].jenis, "ubah");
    assert.deepEqual(hasil[0].fields, ["price", "rangeKm"]);
  });

  it("field turunan dan stempel tidak pernah dihitung sebagai perubahan", () => {
    // Kalau salah satu dari ini ikut terbaca, SETIAP penyimpanan akan
    // melaporkan dirinya sendiri sebagai perubahan dan log tidak pernah sepi.
    const hasil = bandingkanKonten(
      dok({ cars: [mobil({ updatedAt: "2026-01-01T00:00:00Z", updatedBy: "Ana", variants: 1, kind: "mobil" })] }),
      dok({ cars: [mobil({ updatedAt: "2026-08-29T00:00:00Z", updatedBy: "Budi", variants: 3, kind: "mobil" })] })
    );
    assert.deepEqual(hasil, []);
  });

  it("nilai kosong dalam bentuk apa pun dianggap sama", () => {
    const hasil = bandingkanKonten(
      dok({ cars: [mobil({ tagline: "", powerHp: null })] }),
      dok({ cars: [mobil({ tagline: undefined, powerHp: "" })] })
    );
    assert.deepEqual(hasil, []);
  });

  it("perubahan di dalam larik ikut terbaca", () => {
    const hasil = bandingkanKonten(
      dok({ cars: [mobil()] }),
      dok({ cars: [mobil({ tags: ["suv", "keluarga"] })] })
    );
    assert.deepEqual(hasil[0].fields, ["tags"]);
  });

  it("urutan yang berubah dilaporkan sendiri, tanpa field", () => {
    const a = mobil();
    const b = mobil({ id: "wuling-air-ev", brand: "Wuling", name: "Air ev" });
    const hasil = bandingkanKonten(dok({ cars: [a, b] }), dok({ cars: [b, a] }));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].jenis, "urut");
    assert.equal(hasil[0].col, "cars");
    assert.deepEqual(hasil[0].fields, []);
  });

  it("urutan tidak dilaporkan kalau isinya memang berubah", () => {
    // Menambah satu item pasti menggeser urutan; melaporkannya di situ hanya
    // menambah baris yang tidak memberi tahu apa-apa.
    const a = mobil();
    const b = mobil({ id: "wuling-air-ev", brand: "Wuling", name: "Air ev" });
    const hasil = bandingkanKonten(dok({ cars: [a] }), dok({ cars: [b, a] }));
    assert.deepEqual(hasil.map((h) => h.jenis), ["tambah"]);
  });

  it("pengaturan situs dilaporkan sebagai satu perubahan berisi nama fieldnya", () => {
    const hasil = bandingkanKonten(dok(), dok({ site: { brandText: "EVKita", heroTitle: "Halo dunia" } }));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].col, "site");
    assert.deepEqual(hasil[0].fields, ["heroTitle"]);
  });

  it("metadata gambar disebut dengan nama berkasnya, bukan alamat penuhnya", () => {
    const hasil = bandingkanKonten(
      dok({ media: { "/api/uploads/abc123.webp": { alt: "" } } }),
      dok({ media: { "/api/uploads/abc123.webp": { alt: "BYD Atto 3 tampak depan" } } })
    );
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].col, "media");
    assert.deepEqual(hasil[0].fields, ["abc123.webp"]);
  });

  it("membaca kelima koleksi, bukan hanya kendaraan", () => {
    const hasil = bandingkanKonten(
      dok(),
      dok({
        spklu: [{ id: "spklu-1", name: "SPKLU Senayan" }],
        bengkel: [{ id: "b-1", name: "Bengkel EV" }],
        berita: [{ id: "n-1", title: "Berita baru" }],
      })
    );
    assert.deepEqual(hasil.map((h) => h.col).sort(), ["bengkel", "berita", "spklu"]);
    assert.deepEqual(hasil.map((h) => h.title).sort(), ["Bengkel EV", "Berita baru", "SPKLU Senayan"]);
  });

  it("dokumen kosong atau rusak tidak membuatnya meledak", () => {
    assert.deepEqual(bandingkanKonten(null, null), []);
    assert.deepEqual(bandingkanKonten(undefined, {}), []);
    assert.deepEqual(bandingkanKonten({ cars: "bukan larik" }, { cars: null }), []);
  });
});
