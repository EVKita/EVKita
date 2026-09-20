import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATAS_ARTIKEL,
  artikelTayang,
  bacaMenit,
  hrefArtikel,
  jumlahKata,
  namaHost,
  normalizeArtikel,
  normalizeSumberList,
  ringkasArtikel,
  sumberTampil,
  tanggalArtikel,
  tanggalIso,
} from "../src/lib/artikel.js";

/**
 * Artikel punya dua sifat yang tidak dimiliki koleksi lain, dan keduanya
 * menentukan isi berkas uji ini:
 *
 *   1. **Slug-nya adalah alamat** di bawah `/artikel/`, jadi ia dibakukan dan
 *      tidak boleh kosong.
 *   2. **Daftar sumbernya adalah janji.** Alamat yang skemanya berbahaya tidak
 *      boleh pernah sampai ke `href`, dan baris tanpa alamat sah harus dibuang
 *      — bukan dirender sebagai tautan kosong.
 */

describe("hrefArtikel", () => {
  it("menaruh artikel di bawah /artikel/", () => {
    assert.equal(hrefArtikel({ slug: "panduan-charging" }), "/artikel/panduan-charging");
  });

  it("slug kosong tidak menghasilkan tautan ke indeks", () => {
    assert.equal(hrefArtikel({ slug: "" }), "");
    assert.equal(hrefArtikel(null), "");
  });
});

describe("normalizeArtikel", () => {
  it("mengisi bawaan untuk artikel yang baru separuh jadi", () => {
    const a = normalizeArtikel({ title: "Panduan" });
    assert.equal(a.status, "published");
    assert.equal(a.date, "");
    assert.deepEqual(a.sources, []);
    assert.deepEqual(a.tags, []);
    assert.equal(a.aiAssisted, false);
    assert.equal(a.noindex, false);
    assert.equal(a.category, "");
  });

  it("membakukan slug yang disunting tangan lewat SSH", () => {
    assert.equal(normalizeArtikel({ slug: "Panduan Charging!" }).slug, "panduan-charging");
  });

  it("menerima topik di luar daftar bawaan, karena ia ikut tersimpan ke data", () => {
    assert.equal(normalizeArtikel({ category: "Investigasi" }).category, "Investigasi");
  });

  it("membuang tanggal yang bukan YYYY-MM-DD", () => {
    assert.equal(normalizeArtikel({ date: "20 September 2026" }).date, "");
    assert.equal(normalizeArtikel({ date: "2026-09-20" }).date, "2026-09-20");
  });

  it("memotong pada batas panjang", () => {
    const a = normalizeArtikel({
      title: "J".repeat(300),
      excerpt: "R".repeat(400),
      body: "B".repeat(BATAS_ARTIKEL.isi + 500),
      author: "P".repeat(200),
      category: "K".repeat(100),
    });
    assert.equal(a.title.length, BATAS_ARTIKEL.judul);
    assert.equal(a.excerpt.length, BATAS_ARTIKEL.ringkas);
    assert.equal(a.body.length, BATAS_ARTIKEL.isi);
    assert.equal(a.author.length, BATAS_ARTIKEL.penulis);
    assert.equal(a.category.length, BATAS_ARTIKEL.kategori);
  });

  it("membatasi jumlah tag dan membuang yang kembar", () => {
    const a = normalizeArtikel({ tags: ["a", "A", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"] });
    assert.equal(a.tags.length, BATAS_ARTIKEL.jumlahTag);
    assert.equal(a.tags[0], "a");
    assert.equal(a.tags[1], "b");
  });

  it("idempoten — menjalankannya dua kali menghasilkan yang sama", () => {
    const sekali = normalizeArtikel({
      title: "Panduan",
      slug: "Panduan Charging",
      tags: ["baterai"],
      sources: [{ label: "Hyundai", url: "https://hyundai.co.id" }],
      date: "2026-09-20",
    });
    assert.deepEqual(normalizeArtikel(sekali), sekali);
  });
});

describe("normalizeSumberList", () => {
  it("membuang baris yang benar-benar kosong", () => {
    assert.deepEqual(normalizeSumberList([{ label: "", url: "" }, null, "bukan objek"]), []);
  });

  it("mempertahankan baris yang baru terisi separuh", () => {
    assert.deepEqual(normalizeSumberList([{ label: "Hyundai", url: "" }]), [{ label: "Hyundai", url: "" }]);
  });

  it("membuang baris kembar dan membatasi jumlahnya", () => {
    const banyak = Array.from({ length: 30 }, (_, i) => ({ label: `S${i}`, url: `https://s${i}.id` }));
    assert.equal(normalizeSumberList(banyak).length, BATAS_ARTIKEL.sumber);
    assert.deepEqual(normalizeSumberList([{ label: "A", url: "https://a.id" }, { label: "a", url: "https://A.id" }]), [
      { label: "A", url: "https://a.id" },
    ]);
  });
});

describe("sumberTampil", () => {
  it("membuang alamat yang skemanya berbahaya", () => {
    const hasil = sumberTampil([
      { label: "Jahat", url: "javascript:alert(1)" },
      { label: "Resmi", url: "https://hyundai.co.id/ioniq-5" },
    ]);
    assert.deepEqual(hasil, [{ label: "Resmi", url: "https://hyundai.co.id/ioniq-5" }]);
  });

  it("membuang baris yang alamatnya kosong, bukan merendernya sebagai teks", () => {
    assert.deepEqual(sumberTampil([{ label: "Tanpa alamat", url: "" }]), []);
  });

  it("memakai nama domain saat labelnya kosong", () => {
    const hasil = sumberTampil([{ label: "", url: "https://www.hyundai.co.id/ioniq-5" }]);
    assert.deepEqual(hasil, [{ label: "hyundai.co.id", url: "https://www.hyundai.co.id/ioniq-5" }]);
  });
});

describe("jumlahKata & bacaMenit", () => {
  it("menghitung kata naskah", () => {
    assert.equal(jumlahKata({ body: "satu dua tiga" }), 3);
    assert.equal(jumlahKata({ body: "   " }), 0);
  });

  it("waktu baca minimal satu menit", () => {
    assert.equal(bacaMenit({ body: "" }), 1);
    assert.equal(bacaMenit({ body: "kata ".repeat(400) }), 2);
  });
});

describe("tanggalArtikel & tanggalIso", () => {
  it("tanggal terbit yang ditulis menang atas jadwal tayang", () => {
    const a = { date: "2026-01-02", publishAt: "2026-09-20T10:00:00.000Z" };
    assert.equal(tanggalArtikel(a), "2026-01-02");
  });

  it("jatuh ke jadwal tayang, lalu ke waktu perubahan terakhir", () => {
    assert.equal(tanggalArtikel({ publishAt: "2026-09-20T10:00:00.000Z" }), "2026-09-20");
    assert.equal(tanggalArtikel({ updatedAt: "2026-08-01T10:00:00.000Z" }), "2026-08-01");
    assert.equal(tanggalArtikel({}), "");
  });

  it("membawa zona WIB di tanggal yang dikirim ke mesin pencari", () => {
    assert.equal(tanggalIso({ date: "2026-09-20" }), "2026-09-20T00:00:00+07:00");
    assert.equal(tanggalIso({}), "");
  });
});

describe("artikelTayang", () => {
  const buat = (extra: Record<string, unknown>) => normalizeArtikel({ id: "x", title: "Artikel", slug: "artikel", ...extra });

  it("draf tidak pernah tayang, sekalipun tanggalnya sudah lewat", () => {
    assert.deepEqual(artikelTayang([buat({ status: "draft", date: "2020-01-01" })]), []);
  });

  it("artikel terjadwal baru tayang setelah waktunya tiba", () => {
    const besok = new Date(Date.now() + 86400000).toISOString();
    const daftar = [buat({ publishAt: besok })];
    assert.equal(artikelTayang(daftar).length, 0);
    assert.equal(artikelTayang(daftar, Date.parse(besok) + 1000).length, 1);
  });

  it("mengurutkan dari yang terbaru", () => {
    const daftar = [
      buat({ title: "Lama", date: "2025-01-01" }),
      buat({ title: "Baru", date: "2026-09-01" }),
      buat({ title: "Tengah", date: "2026-01-01" }),
    ];
    assert.deepEqual(artikelTayang(daftar).map((a: any) => a.title), ["Baru", "Tengah", "Lama"]);
  });

  it("tanggal yang sama diurutkan menurut judul, supaya urutannya stabil", () => {
    const daftar = [buat({ title: "B", date: "2026-01-01" }), buat({ title: "A", date: "2026-01-01" })];
    assert.deepEqual(artikelTayang(daftar).map((a: any) => a.title), ["A", "B"]);
  });

  it("daftar rusak tidak membuatnya meledak", () => {
    assert.deepEqual(artikelTayang(null as any), []);
  });
});

describe("ringkasArtikel & namaHost", () => {
  it("memakai ringkasan yang ditulis", () => {
    assert.equal(ringkasArtikel({ excerpt: "Ringkas saja." }), "Ringkas saja.");
  });

  it("tanpa ringkasan, kalimat pertama naskah dipakai tanpa penanda Markdown", () => {
    assert.equal(ringkasArtikel({ excerpt: "", body: "## Judul\n\nIni **kalimat** pertama." }), "Judul Ini kalimat pertama.");
  });

  it("nama host membuang www, dan nilai aneh dikembalikan apa adanya", () => {
    assert.equal(namaHost("https://www.hyundai.co.id/ioniq-5"), "hyundai.co.id");
    assert.equal(namaHost("bukan alamat"), "bukan alamat");
  });
});
