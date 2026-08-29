import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  base32Encode,
  base32Decode,
  buatRahasia,
  kodeSekarang,
  periksaKode,
  otpauthUri,
  rahasiaTerbaca,
  buatKodeCadangan,
} from "../src/lib/totp";

/**
 * Kode sekali pakai berbasis waktu.
 *
 * Diuji terhadap vektor resmi RFC 6238, bukan terhadap dirinya sendiri.
 * Implementasi TOTP yang salah tetap "bekerja" selama server dan pengujinya
 * memakai kode yang sama-sama keliru — dan baru ketahuan ketika seseorang
 * memindainya dengan aplikasi autentikator sungguhan dan tidak pernah bisa
 * masuk lagi.
 */

/** Rahasia contoh RFC 6238: ASCII "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("kembali utuh setelah dikodekan lalu dibaca lagi", () => {
    const asal = Buffer.from("12345678901234567890", "ascii");
    assert.deepEqual(base32Decode(base32Encode(asal)), asal);
  });

  it("cocok dengan padanan yang sudah baku", () => {
    assert.equal(base32Encode(Buffer.from("Hello!", "ascii")), "JBSWY3DPEE");
  });

  it("mengabaikan spasi dan huruf kecil saat membaca", () => {
    // Orang menyalin kunci dari layar, lengkap dengan spasi pemisahnya.
    const rahasia = base32Encode(Buffer.from("abcdefghij", "ascii"));
    assert.deepEqual(base32Decode(rahasia.toLowerCase().replace(/(.{4})/g, "$1 ")), base32Decode(rahasia));
  });
});

describe("kodeSekarang", () => {
  it("cocok dengan vektor uji RFC 6238", () => {
    // Ketiganya diambil dari lampiran B RFC 6238 (SHA-1, 8 digit di sana;
    // enam digit terakhirnya yang dipakai di sini).
    assert.equal(kodeSekarang(RFC_SECRET, 59 * 1000), "287082");
    assert.equal(kodeSekarang(RFC_SECRET, 1111111109 * 1000), "081804");
    assert.equal(kodeSekarang(RFC_SECRET, 1234567890 * 1000), "005924");
  });

  it("berubah setiap tiga puluh detik", () => {
    const a = kodeSekarang(RFC_SECRET, 1111111109 * 1000);
    const b = kodeSekarang(RFC_SECRET, (1111111109 + 30) * 1000);
    assert.notEqual(a, b);
  });
});

describe("periksaKode", () => {
  const T = 1234567890 * 1000;

  it("menerima kode yang berlaku sekarang", () => {
    assert.equal(periksaKode(RFC_SECRET, kodeSekarang(RFC_SECRET, T), T), true);
  });

  it("menerima kode dari satu selang sebelum dan sesudah", () => {
    // Jam ponsel yang meleset setengah menit adalah hal biasa.
    assert.equal(periksaKode(RFC_SECRET, kodeSekarang(RFC_SECRET, T - 30000), T), true);
    assert.equal(periksaKode(RFC_SECRET, kodeSekarang(RFC_SECRET, T + 30000), T), true);
  });

  it("menolak kode dari dua selang jauhnya", () => {
    assert.equal(periksaKode(RFC_SECRET, kodeSekarang(RFC_SECRET, T - 90000), T), false);
    assert.equal(periksaKode(RFC_SECRET, kodeSekarang(RFC_SECRET, T + 90000), T), false);
  });

  it("menolak kode dari rahasia lain", () => {
    assert.equal(periksaKode(buatRahasia(), kodeSekarang(RFC_SECRET, T), T), false);
  });

  it("menolak bentuk yang bukan enam digit", () => {
    for (const buruk of ["", "12345", "1234567", "abcdef", null, undefined, {}, 123456]) {
      assert.equal(periksaKode(RFC_SECRET, buruk as any, T), false, String(buruk));
    }
  });

  it("rahasia kosong tidak pernah menerima apa pun", () => {
    // Akun yang belum memasang dua faktor tidak boleh bisa dimasuki dengan
    // kode apa pun, termasuk kode yang kebetulan benar untuk rahasia kosong.
    assert.equal(periksaKode("", "000000", T), false);
  });

  it("spasi di dalam kode yang diketik tidak membuatnya ditolak", () => {
    const kode = kodeSekarang(RFC_SECRET, T);
    assert.equal(periksaKode(RFC_SECRET, `${kode.slice(0, 3)} ${kode.slice(3)}`, T), true);
  });
});

describe("buatRahasia", () => {
  it("menghasilkan rahasia yang berbeda tiap kali, panjangnya 32 karakter", () => {
    const a = buatRahasia();
    const b = buatRahasia();
    assert.notEqual(a, b);
    assert.equal(a.length, 32); // 20 byte = 160 bit = 32 karakter base32
    assert.match(a, /^[A-Z2-7]+$/);
  });
});

describe("otpauthUri", () => {
  it("memuat rahasia, penerbit, dan parameter yang dibaca aplikasi lama maupun baru", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "penguji");
    assert.ok(uri.startsWith("otpauth://totp/EVKita%3Apenguji?"));
    const q = new URLSearchParams(uri.split("?")[1]);
    assert.equal(q.get("secret"), "JBSWY3DPEHPK3PXP");
    assert.equal(q.get("issuer"), "EVKita");
    assert.equal(q.get("algorithm"), "SHA1");
    assert.equal(q.get("digits"), "6");
    assert.equal(q.get("period"), "30");
  });
});

describe("rahasiaTerbaca", () => {
  it("dipotong berkelompok empat supaya bisa disalin dengan mata", () => {
    assert.equal(rahasiaTerbaca("ABCDEFGHIJKL"), "ABCD EFGH IJKL");
  });
});

describe("buatKodeCadangan", () => {
  it("menghasilkan delapan kode yang semuanya berbeda", () => {
    const kode = buatKodeCadangan();
    assert.equal(kode.length, 8);
    assert.equal(new Set(kode).size, 8);
  });

  it("tiap kode memakai abjad yang tidak punya huruf mudah tertukar", () => {
    // Tanpa I, L, O, U, 0, dan 1: kode yang dibacakan lewat telepon atau
    // disalin dari kertas tetap sampai dengan benar.
    for (const k of buatKodeCadangan()) {
      assert.match(k, /^[A-HJ-KM-NP-TV-Z2-9]{5}-[A-HJ-KM-NP-TV-Z2-9]{5}$/, k);
      assert.equal(/[ILOU01]/.test(k), false, k);
    }
  });
});
