import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Draf artikel otomatis harian.
 *
 * Yang diuji di sini adalah pagar-pagarnya, bukan tulisannya (yang
 * membutuhkan kunci AI dan jaringan): topik tidak boleh berulang, sumber di
 * luar bahan dibuang, naskah terlalu pendek ditolak, dan pembersihan hanya
 * menyentuh draf otomatis yang tua — tidak pernah tulisan manusia atau yang
 * sudah terbit.
 */

import {
  pilihTopik,
  bersihkanDraf,
  pangkasDrafLama,
  drafTunggu,
  umurHari,
  normalkanPengaturanArtikel,
  MAKS_DRAF_TUNGGU,
  UMUR_HAPUS_HARI,
  UMUR_AMAN_HARI,
  TOPIK_PANDUAN,
} from "../src/lib/artikel-harian";

const HARI = 24 * 3600 * 1000;
const SEKARANG = Date.parse("2026-10-03T00:00:00+07:00");
const isoLalu = (hari: number) => new Date(SEKARANG - hari * HARI).toISOString();

describe("pilihTopik", () => {
  const berita = [
    { title: "Pabrik baterai baru di Karawang", excerpt: "baterai kendaraan", url: "https://a.id/1", source: "A", date: "2026-10-02" },
    { title: "Harga baterai turun", excerpt: "baterai murah", url: "https://a.id/2", source: "A", date: "2026-10-01" },
    { title: "Festival kuliner Jakarta", excerpt: "makanan enak", url: "https://a.id/3", source: "A", date: "2026-10-02" },
  ];

  it("merangkum berita se-tema bila ada dua atau lebih", () => {
    const topik = pilihTopik({ berita, cars: [], motors: [] }, [], "2026-10-03");
    assert.ok(topik);
    assert.equal(topik.strategi, "berita");
    assert.equal(topik.sumberBoleh.length, 2);
  });

  it("melewati topik yang sudah dipakai 60 hari terakhir", () => {
    const dulu = pilihTopik({ berita, cars: [], motors: [] }, [], "2026-10-03");
    assert.ok(dulu);
    const lagi = pilihTopik({ berita, cars: [], motors: [] }, [{ kunci: dulu.kunci }], "2026-10-03");
    // Satu-satunya kelompok berita habis — jatuh ke panduan, bukan mengulang.
    assert.ok(lagi);
    assert.notEqual(lagi.kunci, dulu.kunci);
  });

  it("menyandingkan dua kendaraan sekelas kalau tidak ada berita", () => {
    const content = {
      berita: [],
      cars: [
        { id: "a", brand: "A", name: "Satu", bodyType: "SUV", rangeKm: 400 },
        { id: "b", brand: "B", name: "Dua", bodyType: "SUV", rangeKm: 500 },
      ],
      motors: [],
    };
    const topik = pilihTopik(content, [], "2026-10-03");
    assert.ok(topik);
    assert.equal(topik.strategi, "banding");
    assert.match(topik.bahan, /400 km/);
  });

  it("memutar panduan abadi dan tidak mengulang yang baru dipakai", () => {
    const t1 = pilihTopik({ berita: [], cars: [], motors: [] }, [], "2026-10-03");
    assert.ok(t1);
    assert.equal(t1.strategi, "panduan");
    assert.ok(TOPIK_PANDUAN.length >= 2);
    const t2 = pilihTopik({ berita: [], cars: [], motors: [] }, [{ kunci: t1.kunci }], "2026-10-03");
    assert.ok(t2);
    assert.notEqual(t2.kunci, t1.kunci);
  });
});

describe("bersihkanDraf", () => {
  const topik = { strategi: "berita", kunci: "berita:x", judulKerja: "X", bahan: "", sumberBoleh: ["https://a.id/1"] } as any;
  const naskah = (over: any = {}) => ({
    title: "Judul yang layak",
    excerpt: "Ringkas.",
    body: "x".repeat(1500),
    category: "Panduan",
    tags: ["ev"],
    sources: [{ label: "A", url: "https://a.id/1" }],
    ...over,
  });

  it("menerima draf lengkap yang sumbernya dari bahan", () => {
    const { draf, alasan } = bersihkanDraf(naskah(), topik);
    assert.equal(alasan, "");
    assert.ok(draf);
    assert.equal(draf.sources.length, 1);
  });

  it("menolak naskah terlalu pendek", () => {
    const { draf } = bersihkanDraf(naskah({ body: "terlalu pendek" }), topik);
    assert.equal(draf, null);
  });

  it("membuang alamat sumber yang tidak ada di bahan", () => {
    const { draf } = bersihkanDraf(
      naskah({ sources: [{ label: "Asing", url: "https://jahat.id/x" }, { label: "A", url: "https://a.id/1" }] }),
      topik
    );
    assert.ok(draf);
    assert.deepEqual(draf.sources.map((s: any) => s.url), ["https://a.id/1"]);
  });

  it("menolak tulisan tanpa sumber padahal strateginya menuntutnya", () => {
    const { draf, alasan } = bersihkanDraf(naskah({ sources: [] }), topik);
    assert.equal(draf, null);
    assert.equal(alasan, "tanpaSumber");
  });

  it("panduan boleh tanpa sumber", () => {
    const bebas = { ...topik, sumberBoleh: [] };
    const { draf } = bersihkanDraf(naskah({ sources: [] }), bebas);
    assert.ok(draf);
  });

  it("kategori di luar daftar jatuh ke Panduan", () => {
    const { draf } = bersihkanDraf(naskah({ category: "Hoaks" }), { ...topik, sumberBoleh: [] });
    assert.ok(draf);
    assert.equal(draf.category, "Panduan");
  });
});

describe("pangkasDrafLama", () => {
  const buat = (over: any = {}) => ({
    id: "x",
    title: "T",
    status: "draft",
    auto: true,
    updatedAt: isoLalu(40),
    ...over,
  });

  it("menghapus draf otomatis 40 hari yang tak tersentuh", () => {
    const { daftar, dipangkas } = pangkasDrafLama([buat()], SEKARANG);
    assert.equal(dipangkas, 1);
    assert.equal(daftar.length, 0);
  });

  it("tidak menyentuh draf seminggu pertama", () => {
    const { daftar, dipangkas } = pangkasDrafLama([buat({ updatedAt: isoLalu(3) })], SEKARANG);
    assert.equal(dipangkas, 0);
    assert.equal(daftar.length, 1);
  });

  it("tidak pernah menyentuh yang sudah terbit", () => {
    const { dipangkas } = pangkasDrafLama([buat({ status: "published" })], SEKARANG);
    assert.equal(dipangkas, 0);
  });

  it("tidak pernah menyentuh tulisan manusia", () => {
    const { dipangkas } = pangkasDrafLama([buat({ auto: false })], SEKARANG);
    assert.equal(dipangkas, 0);
  });

  it("batasnya 30 hari hapus dan 7 hari aman", () => {
    assert.equal(UMUR_HAPUS_HARI, 30);
    assert.equal(UMUR_AMAN_HARI, 7);
    assert.ok(MAKS_DRAF_TUNGGU >= 1);
  });
});

describe("pembantu", () => {
  it("drafTunggu hanya menghitung draf otomatis berstatus draf", () => {
    const daftar = [
      { auto: true, status: "draft" },
      { auto: true, status: "published" },
      { auto: false, status: "draft" },
    ];
    assert.equal(drafTunggu(daftar).length, 1);
  });

  it("umurHari menghitung dari stempel ISO", () => {
    assert.ok(umurHari(isoLalu(10), SEKARANG) > 9);
    assert.ok(umurHari(isoLalu(10), SEKARANG) < 11);
  });

  it("pengaturan bawaannya mati", () => {
    assert.deepEqual(normalkanPengaturanArtikel(undefined), { aktif: false });
    assert.deepEqual(normalkanPengaturanArtikel({ aktif: true }), { aktif: true });
  });
});
