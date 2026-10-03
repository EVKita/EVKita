import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  kunciKanonik,
  masihSegar,
  pangkasCache,
  gambarBerita,
  UMUR_CACHE_MS,
  MAKS_ENTRI,
} from "../src/lib/berita-gambar.ts";

/**
 * Aturan thumbnail "Berita Terkini":
 * - Kunci kanonik supaya http/https dan garis miring akhir tidak jadi dua cache.
 * - Tidak ada jaringan untuk masukan yang jelas-jelas bukan alamat.
 * - Tidak pernah melempar — gagal berarti "", baris tampil tanpa foto.
 */

describe("kunciKanonik", () => {
  it("menyamakan http/https, membuang hash dan garis miring akhir", () => {
    assert.equal(
      kunciKanonik("https://contoh.test/berita/x/?a=1#/bagian"),
      "https://contoh.test/berita/x/?a=1"
    );
  });

  it("menolak yang bukan http/https dan yang bukan alamat", () => {
    assert.equal(kunciKanonik("javascript:alert(1)"), "");
    assert.equal(kunciKanonik("bukan alamat"), "");
    assert.equal(kunciKanonik(""), "");
  });
});

describe("masihSegar", () => {
  it("segar di dalam tujuh hari, basi sesudahnya", () => {
    const sekarang = Date.parse("2026-10-03T10:00:00+07:00");
    assert.equal(masihSegar(new Date(sekarang - 60 * 1000).toISOString(), sekarang), true);
    assert.equal(
      masihSegar(new Date(sekarang - UMUR_CACHE_MS - 1000).toISOString(), sekarang),
      false
    );
    assert.equal(masihSegar("bukan-tanggal", sekarang), false);
  });
});

describe("pangkasCache", () => {
  it("membuang yang terlama sampai tinggal batas", () => {
    const semua = {};
    for (let i = 0; i < MAKS_ENTRI + 10; i++) {
      semua[`k${i}`] = { image: "", at: new Date(i).toISOString() };
    }
    const hasil = pangkasCache(semua);
    assert.equal(Object.keys(hasil).length, MAKS_ENTRI);
    assert.ok(!("k0" in hasil));
    assert.ok(`k${MAKS_ENTRI + 9}` in hasil);
  });
});

describe("gambarBerita tanpa jaringan", () => {
  it("kosong dan sampah langsung '' tanpa membuka koneksi", async () => {
    assert.equal(await gambarBerita(""), "");
    assert.equal(await gambarBerita("javascript:alert(1)"), "");
    assert.equal(await gambarBerita("bukan alamat sama sekali"), "");
  });
});
