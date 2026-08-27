import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PER_PAGE, pageCount, pageSlice, pageHref, pageWindow } from "../src/lib/pagination.js";

/**
 * Pembagian halaman katalog. Yang diuji terutama dua hal yang kalau salah
 * membuat perayap tersesat: jumlah halaman yang harus persis (satu halaman
 * kurang berarti mobil terakhir tidak punya alamat) dan alamat halaman pertama
 * yang harus tunggal.
 */

const daftar = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("jumlah halaman", () => {
  it("membulatkan ke atas", () => {
    assert.equal(pageCount(28, 12), 3);
    assert.equal(pageCount(24, 12), 2);
    assert.equal(pageCount(25, 12), 3);
    assert.equal(pageCount(1, 12), 1);
  });

  it("katalog kosong tetap satu halaman", () => {
    // Nol halaman berarti /katalog sendiri tidak ada — pemasangan baru yang
    // belum mengisi apa pun akan menjawab 404 di halaman katalognya sendiri.
    assert.equal(pageCount(0, 12), 1);
    assert.equal(pageCount(-5, 12), 1);
  });

  it("tidak meledak pada ukuran halaman yang cacat", () => {
    assert.equal(pageCount(28, 0), 1);
    assert.equal(pageCount(28, NaN), 1);
  });
});

describe("potongan halaman", () => {
  it("mengambil bagian yang benar", () => {
    assert.deepEqual(pageSlice(daftar(28), 1, 12), daftar(12));
    assert.deepEqual(pageSlice(daftar(28), 2, 12)[0], 13);
    assert.deepEqual(pageSlice(daftar(28), 3, 12), [25, 26, 27, 28]);
  });

  it("halaman di luar rentang menghasilkan daftar kosong, bukan galat", () => {
    assert.deepEqual(pageSlice(daftar(28), 9, 12), []);
    assert.deepEqual(pageSlice(daftar(28), 0, 12), []);
    assert.deepEqual(pageSlice(daftar(28), -1, 12), []);
  });

  it("tidak ada kartu yang hilang atau kembar di seluruh halaman", () => {
    const semua = daftar(28);
    const gabung = [];
    for (let h = 1; h <= pageCount(28, 12); h++) gabung.push(...pageSlice(semua, h, 12));
    assert.deepEqual(gabung, semua);
  });
});

describe("alamat halaman", () => {
  it("halaman pertama tidak memakai angka", () => {
    // Satu halaman, satu alamat: "/katalog/1" hanyalah "/katalog".
    assert.equal(pageHref(1), "/katalog");
    assert.equal(pageHref(2), "/katalog/2");
    assert.equal(pageHref(10), "/katalog/10");
  });
});

describe("deretan nomor halaman", () => {
  it("menampilkan semuanya kalau memang sedikit", () => {
    assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
    assert.deepEqual(pageWindow(2, 3), [1, 2, 3]);
  });

  it("selalu menyertakan halaman pertama dan terakhir", () => {
    const w = pageWindow(10, 20);
    assert.equal(w[0], 1);
    assert.equal(w[w.length - 1], 20);
  });

  it("memakai elipsis untuk celah yang lebar", () => {
    assert.deepEqual(pageWindow(10, 20), [1, "…", 9, 10, 11, "…", 20]);
  });

  it("celah selebar satu halaman diisi angkanya, bukan elipsis", () => {
    // "1 … 3 4 5" menyembunyikan halaman 2 di balik tanda yang lebih panjang
    // daripada angkanya sendiri.
    assert.deepEqual(pageWindow(4, 8), [1, 2, 3, 4, 5, "…", 8]);
  });

  it("tidak pernah menyebut halaman di luar rentang", () => {
    for (const [now, total] of [[1, 5], [5, 5], [3, 5], [1, 1], [99, 5]] as const) {
      for (const n of pageWindow(now, total)) {
        if (n === "…") continue;
        assert.ok(n >= 1 && n <= total, `halaman ${n} di luar 1..${total}`);
      }
    }
  });

  it("tidak ada nomor kembar", () => {
    const w = pageWindow(3, 10).filter((n) => n !== "…");
    assert.equal(new Set(w).size, w.length);
  });

  it("aman untuk nilai yang cacat", () => {
    assert.deepEqual(pageWindow(NaN, NaN), [1]);
    assert.deepEqual(pageWindow(0, 1), [1]);
  });
});

describe("ukuran halaman bawaan", () => {
  it("angka positif yang masuk akal", () => {
    assert.ok(Number.isInteger(PER_PAGE) && PER_PAGE > 0);
  });
});
