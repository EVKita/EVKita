import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BAWAAN,
  adaTag,
  bersihkanAdsTxt,
  hostCsp,
  isiAdsTxt,
  normalisasi,
  periksa,
} from "../src/lib/integrasi.js";

/**
 * Integrasi Google.
 *
 * Satu aturan yang menjadi alasan seluruh berkas ini diuji: nilai yang
 * tersimpan di sini LANGSUNG menjadi bagian dari `<script>` di setiap halaman
 * publik, dan isi ads.txt langsung disajikan mentah di `/ads.txt`. Jadi yang
 * diuji bukan "apakah formulirnya bekerja", melainkan apakah nilai yang tidak
 * berbentuk id yang sah benar-benar DITOLAK — bukan dibersihkan lalu dipakai.
 */

describe("pemeriksaan id", () => {
  it("menerima ketiga bentuk id Analytics yang masih beredar", () => {
    for (const id of ["G-ABCD123456", "UA-12345678-1", "GT-ABCDE12"]) {
      assert.deepEqual(periksa({ gaId: id }).galat, [], id);
    }
  });

  it("menolak id Analytics yang tidak berbentuk", () => {
    for (const id of ["g-abc", "G-", "GA-123456", "sembarang"]) {
      assert.deepEqual(periksa({ gaId: id }).galat, ["err.integrasi.gaId"], id);
    }
  });

  it("menolak id yang menyelundupkan kode", () => {
    // Inilah kenapa polanya daftar-putih: nilainya berakhir di dalam <script>.
    const jahat = "G-ABCD123456');alert(1);//";
    assert.deepEqual(periksa({ gaId: jahat }).galat, ["err.integrasi.gaId"]);
    assert.equal(normalisasi({ gaAktif: true, gaId: jahat }).gaId, "");
  });

  it("memeriksa bentuk id penayang AdSense dan kode Search Console", () => {
    assert.deepEqual(periksa({ adsenseId: "ca-pub-1234567890123456" }).galat, []);
    assert.deepEqual(periksa({ adsenseId: "pub-123" }).galat, ["err.integrasi.adsenseId"]);
    assert.deepEqual(periksa({ gscToken: "a".repeat(43) }).galat, []);
    assert.deepEqual(periksa({ gscToken: "pendek" }).galat, ["err.integrasi.gscToken"]);
  });
});

describe("saklar tanpa isi", () => {
  it("menolak menyalakan layanan yang idnya belum diisi", () => {
    // Keadaan yang paling sering bikin orang kehilangan sore: panel bilang
    // "aktif", halaman tidak memuat apa pun, dan tidak ada yang menghubungkan
    // keduanya.
    assert.deepEqual(periksa({ gaAktif: true }).galat, ["err.integrasi.gaKosong"]);
    assert.deepEqual(periksa({ adsenseAktif: true }).galat, ["err.integrasi.adsenseKosong"]);
    assert.deepEqual(periksa({ gscAktif: true }).galat, ["err.integrasi.gscKosong"]);
  });
});

describe("normalisasi berkas", () => {
  it("mengisi bentuk lengkap dari berkas kosong", () => {
    assert.deepEqual(normalisasi(null), BAWAAN);
    assert.deepEqual(normalisasi("bukan objek"), BAWAAN);
  });

  it("mematikan saklar yang idnya tidak sah, meski berkasnya disunting tangan", () => {
    // data/integrasi.json bisa disunting lewat SSH; halaman publik tidak boleh
    // memuat apa pun dari sana tanpa diperiksa ulang.
    const s = normalisasi({ gaAktif: true, gaId: "rusak", adsenseAktif: true, adsenseId: "" });
    assert.equal(s.gaAktif, false);
    assert.equal(s.adsenseAktif, false);
  });

  it("membuang kunci asing tanpa jejak", () => {
    const s: any = normalisasi({ gaId: "G-ABCD123456", jahat: "<script>" });
    assert.equal(s.jahat, undefined);
  });
});

describe("ads.txt", () => {
  it("merakit baris bawaan Google dari id penayang", () => {
    const isi = isiAdsTxt({ adsenseAktif: true, adsenseId: "ca-pub-1234567890123456" });
    assert.equal(isi, "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("tidak menyajikan apa pun saat AdSense mati", () => {
    // Berkas ads.txt KOSONG punya arti sendiri di mata perayap Google
    // ("tidak ada yang boleh menjual"), jadi jawabannya harus tidak ada berkas.
    assert.equal(isiAdsTxt({ adsenseAktif: false, adsenseId: "ca-pub-1234567890123456" }), "");
  });

  it("membuang seluruh baris yang mengandung karakter di luar daftar-putih", () => {
    // Bukan cuma karakternya: baris yang separuh benar dibaca Google sebagai
    // penayang lain.
    const isi = bersihkanAdsTxt(
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n<script>alert(1)</script>\n\nfoo.com, 42, RESELLER"
    );
    assert.deepEqual(isi.split("\n"), [
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0",
      "foo.com, 42, RESELLER",
    ]);
  });

  it("isi sendiri menggantikan baris bawaan", () => {
    const isi = isiAdsTxt({
      adsenseAktif: true,
      adsenseId: "ca-pub-1234567890123456",
      adsTxt: "lain.com, 99, DIRECT",
    });
    assert.equal(isi, "lain.com, 99, DIRECT\n");
  });
});

describe("domain yang dibuka di CSP", () => {
  it("tidak melonggarkan apa pun kalau tidak ada yang menyala", () => {
    const h = hostCsp(BAWAAN);
    assert.deepEqual(h.script, []);
    assert.deepEqual(h.frame, []);
    assert.equal(adaTag(BAWAAN), false);
  });

  it("membuka googletagmanager hanya saat Analytics menyala", () => {
    const h = hostCsp({ gaAktif: true, gaId: "G-ABCD123456" });
    assert.ok(h.script.includes("https://www.googletagmanager.com"));
    assert.deepEqual(h.frame, []);
  });

  it("membuka frame-src untuk AdSense — iklannya digambar di dalam iframe", () => {
    const h = hostCsp({ adsenseAktif: true, adsenseId: "ca-pub-1234567890123456" });
    assert.ok(h.script.includes("https://pagead2.googlesyndication.com"));
    assert.ok(h.frame.includes("https://googleads.g.doubleclick.net"));
  });

  it("Search Console tidak memuat skrip apa pun, jadi CSP tidak disentuh", () => {
    const h = hostCsp({ gscAktif: true, gscToken: "a".repeat(43) });
    assert.deepEqual(h.script, []);
    assert.equal(adaTag({ gscAktif: true, gscToken: "a".repeat(43) }), true);
  });
});
