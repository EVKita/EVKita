import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  taxoSlug,
  groupByField,
  findGroup,
  summarize,
  countPhrase,
  kindNoun,
  koleksiTitle,
  koleksiLead,
  koleksiDescription,
} from "../src/lib/taxonomy.js";
import { vehicleHref } from "../src/lib/card-html.js";

/**
 * Halaman merek dan tipe bodi. Yang diuji di sini adalah dua hal yang paling
 * mahal kalau salah: ALAMAT-nya — sekali terindeks, alamat yang berubah berarti
 * peringkat yang hilang — dan KALIMAT-nya, yang dirakit dari data dan karena
 * itu bisa berbohong tanpa ada yang menyadarinya.
 */

const mobil = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "mobil",
  brand: "BYD",
  name: id,
  bodyType: "SUV",
  price: 500_000_000,
  rangeKm: 400,
  ...extra,
});

const motor = (id: string, extra: Record<string, unknown> = {}) =>
  mobil(id, { kind: "motor", brand: "Alva", bodyType: "Skuter", price: 40_000_000, rangeKm: 100, ...extra });

describe("taxoSlug", () => {
  it("membuat alamat yang bisa diketik dari nama merek", () => {
    assert.equal(taxoSlug("BYD"), "byd");
    assert.equal(taxoSlug("MG Motor"), "mg-motor");
    assert.equal(taxoSlug("GAC AION"), "gac-aion");
  });

  it("meluruskan huruf beraksen, bukan membuangnya", () => {
    // "Citroën" tidak boleh jadi "citron": huruf yang hilang membuat alamatnya
    // tidak bisa ditebak siapa pun.
    assert.equal(taxoSlug("Citroën"), "citroen");
    assert.equal(taxoSlug("Škoda"), "skoda");
  });

  it("menyamakan huruf beraksen yang tersusun dan yang terurai", () => {
    // Aplikasi yang berbeda menyalin "ë" dalam dua bentuk Unicode yang berbeda;
    // keduanya harus sampai ke halaman yang sama.
    assert.equal(taxoSlug("Citro\u00ebn"), taxoSlug("Citroe\u0308n"));
  });

  it("tidak menyisakan tanda pisah di ujung", () => {
    assert.equal(taxoSlug("  BYD  "), "byd");
    assert.equal(taxoSlug("— MG —"), "mg");
  });

  it("mengembalikan kosong untuk nilai yang tidak punya huruf sama sekali", () => {
    assert.equal(taxoSlug(""), "");
    assert.equal(taxoSlug("—"), "");
    assert.equal(taxoSlug(null), "");
    assert.equal(taxoSlug(undefined), "");
  });
});

describe("groupByField", () => {
  it("mengelompokkan menurut nilainya dan mengurutkan menurut label", () => {
    const groups = groupByField(
      [mobil("a", { brand: "Wuling" }), mobil("b", { brand: "BYD" }), mobil("c", { brand: "BYD" })],
      "brand"
    );
    assert.deepEqual(groups.map((g: any) => g.slug), ["byd", "wuling"]);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].label, "BYD");
  });

  it("menyatukan ejaan yang alamatnya sama", () => {
    // Dua halaman dengan alamat yang sama tidak bisa ada; yang dijadikan
    // identitas adalah slug-nya, bukan teks aslinya.
    const groups = groupByField([mobil("a", { brand: "MG Motor" }), mobil("b", { brand: "mg  motor" })], "brand");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].label, "MG Motor");
  });

  it("melewati nilai yang tidak punya alamat", () => {
    const groups = groupByField([mobil("a", { brand: "" }), mobil("b", { brand: "—" }), mobil("c")], "brand");
    assert.deepEqual(groups.map((g: any) => g.slug), ["byd"]);
  });

  it("tidak meledak pada masukan yang bukan daftar", () => {
    assert.deepEqual(groupByField(null as any, "brand"), []);
    assert.deepEqual(groupByField(undefined as any, "brand"), []);
  });

  it("tidak kehilangan atau menggandakan satu kendaraan pun", () => {
    const pool = [mobil("a"), mobil("b", { bodyType: "Sedan" }), motor("c"), motor("d", { brand: "Honda" })];
    const total = groupByField(pool, "brand").reduce((n: number, g: any) => n + g.items.length, 0);
    assert.equal(total, pool.length);
    const ids = groupByField(pool, "bodyType").flatMap((g: any) => g.items.map((v: any) => v.id));
    assert.equal(new Set(ids).size, pool.length);
  });
});

describe("findGroup", () => {
  const groups = groupByField([mobil("a", { brand: "MG Motor" })], "brand");

  it("menemukan lewat slug apa adanya", () => {
    assert.equal(findGroup(groups, "mg-motor")?.label, "MG Motor");
  });

  it("memaafkan alamat yang belum dibakukan", () => {
    // Halamannya yang mengalihkan ke bentuk baku; yang penting ia menemukannya
    // lebih dulu, bukan menjawab 404 untuk merek yang jelas-jelas ada.
    assert.equal(findGroup(groups, "MG Motor")?.slug, "mg-motor");
    assert.equal(findGroup(groups, "MG-Motor")?.slug, "mg-motor");
  });

  it("mengembalikan null untuk yang tidak ada", () => {
    assert.equal(findGroup(groups, "byd"), null);
    assert.equal(findGroup(groups, ""), null);
    assert.equal(findGroup([], "byd"), null);
  });
});

describe("summarize", () => {
  it("menghitung mobil dan motor terpisah", () => {
    const s = summarize([mobil("a"), mobil("b"), motor("c")]);
    assert.equal(s.total, 3);
    assert.equal(s.mobil, 2);
    assert.equal(s.motor, 1);
  });

  it("mengetahui kapan datanya belum lengkap", () => {
    const penuh = summarize([mobil("a"), mobil("b", { price: 300_000_000 })]);
    assert.equal(penuh.hargaLengkap, true);
    assert.equal(penuh.hargaMin, 300_000_000);
    assert.equal(penuh.hargaMaks, 500_000_000);

    const bolong = summarize([mobil("a"), mobil("b", { price: null })]);
    assert.equal(bolong.hargaLengkap, false);
    assert.equal(bolong.hargaMin, 500_000_000);
  });

  it("tidak mengarang angka saat tidak ada satu pun nilainya", () => {
    // Math.min() tanpa argumen bernilai Infinity — persis jenis angka yang
    // kelihatan sah sampai ia dicetak ke halaman.
    const s = summarize([mobil("a", { price: null, rangeKm: null })]);
    assert.equal(s.hargaMin, null);
    assert.equal(s.hargaMaks, null);
    assert.equal(s.jarakMin, null);
    assert.equal(s.hargaLengkap, false);
  });

  it("tidak meledak pada daftar kosong", () => {
    const s = summarize([]);
    assert.equal(s.total, 0);
    assert.equal(s.hargaMin, null);
    assert.equal(s.hargaLengkap, false);
  });
});

describe("kalimat kelompok", () => {
  it("menyebut mobil dan motor apa adanya", () => {
    assert.equal(countPhrase(summarize([mobil("a"), mobil("b")])), "2 mobil listrik");
    assert.equal(countPhrase(summarize([motor("a")])), "1 motor listrik");
    assert.equal(countPhrase(summarize([mobil("a"), motor("b")])), "1 mobil listrik dan 1 motor listrik");
  });

  it("memilih kata benda judul menurut isinya", () => {
    assert.equal(kindNoun(summarize([mobil("a")])), "Mobil listrik");
    assert.equal(kindNoun(summarize([motor("a")])), "Motor listrik");
    assert.equal(kindNoun(summarize([mobil("a"), motor("b")])), "Kendaraan listrik");
  });

  it("membedakan judul merek dari judul tipe bodi", () => {
    const s = summarize([mobil("a")]);
    assert.equal(koleksiTitle("merek", "BYD", s), "Mobil listrik BYD");
    assert.equal(koleksiTitle("tipe", "SUV", s), "Mobil listrik tipe SUV");
  });

  it("merangkum kelompok jadi satu kalimat berisi angkanya sendiri", () => {
    const kalimat = koleksiLead("merek", "BYD", [
      mobil("a", { price: 195_000_000, rangeKm: 300 }),
      mobil("b", { price: 950_000_000, rangeKm: 570 }),
    ]);
    assert.match(kalimat, /^2 mobil listrik BYD yang dijual di Indonesia/);
    assert.match(kalimat, /harganya Rp 195 jt sampai Rp 950 jt/);
    assert.match(kalimat, /jarak tempuhnya 300–570 km/);
    assert.ok(kalimat.endsWith("."));
  });

  it("mengaku saat rentangnya dirakit dari data yang bolong", () => {
    // "harganya Rp 195 jt sampai Rp 500 jt" atas 2 dari 3 mobil dibaca orang
    // sebagai "semuanya ada di antara segitu" — dan itu tidak sama.
    const kalimat = koleksiLead("merek", "BYD", [
      mobil("a", { price: 195_000_000 }),
      mobil("b"),
      mobil("c", { price: null }),
    ]);
    assert.match(kalimat, /harga yang tercatat/);
    assert.doesNotMatch(kalimat, /harganya Rp/);
  });

  it("tidak menyebut rentang untuk kelompok berisi satu harga", () => {
    const kalimat = koleksiLead("tipe", "Coupe", [mobil("a", { price: 500_000_000, rangeKm: 400 })]);
    assert.match(kalimat, /harganya Rp 500 jt/);
    assert.doesNotMatch(kalimat, /sampai/);
  });

  it("membuang klausa yang datanya memang tidak ada", () => {
    const kalimat = koleksiLead("merek", "Gesits", [motor("a", { price: null, rangeKm: null })]);
    assert.equal(kalimat, "1 motor listrik Gesits yang dijual di Indonesia.");
  });

  it("tidak menghasilkan kalimat untuk kelompok kosong", () => {
    assert.equal(koleksiLead("merek", "BYD", []), "");
  });

  it("menyebut jumlah merek hanya di halaman tipe bodi", () => {
    const items = [mobil("a"), mobil("b", { brand: "Wuling" })];
    assert.match(koleksiLead("tipe", "SUV", items), /dari 2 merek/);
    assert.doesNotMatch(koleksiLead("merek", "BYD", items), /dari 2 merek/);
  });

  it("menulis deskripsi meta yang berbeda dari kalimat pembukanya", () => {
    const items = [mobil("a", { price: 195_000_000 }), mobil("b", { price: 950_000_000 })];
    const desc = koleksiDescription("merek", "BYD", items);
    assert.notEqual(desc, koleksiLead("merek", "BYD", items));
    assert.match(desc, /Rp 195 jt–Rp 950 jt/);
  });
});

describe("vehicleHref", () => {
  it("mengirim motor ke halaman motornya, bukan ke /mobil/", () => {
    assert.equal(vehicleHref(mobil("byd-seal")), "/mobil/byd-seal");
    assert.equal(vehicleHref(motor("alva-cervo")), "/motor/alva-cervo");
  });

  it("menganggap kendaraan tanpa penanda sebagai mobil", () => {
    // Data yang disuntik ke browser dipangkas ke field tertentu; kalau `kind`
    // sampai tertinggal, jatuhnya harus ke perilaku lama, bukan ke "/undefined".
    assert.equal(vehicleHref({ id: "x" }), "/mobil/x");
  });
});
