import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import {
  apakahBot,
  asalRujukan,
  deretHari,
  hariWib,
  jamWib,
  jenisPerangkat,
  mundurHari,
  pangkas,
  rapikanPath,
  ringkas,
  selisihPersen,
} from "../src/lib/trafik.js";

/**
 * Statistik kunjungan.
 *
 * Yang diuji di sini adalah keputusan-keputusan yang membuat angkanya bisa
 * dipercaya: robot tidak ikut, kunjungan admin dan berkas tidak ikut, hari
 * dihitung menurut WIB (bukan UTC), dan pengunjung unik dihitung dari sidik —
 * bukan dijumlahkan dari tiap penulisan.
 */

describe("saringan robot", () => {
  it("mengenali perayap yang lazim", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "facebookexternalhit/1.1",
      "python-requests/2.31.0",
      "curl/8.4.0",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
      "GPTBot/1.0",
    ]) {
      assert.equal(apakahBot(ua), true, ua);
    }
  });

  it("meloloskan peramban sungguhan", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    ]) {
      assert.equal(apakahBot(ua), false, ua);
    }
  });

  it("menganggap permintaan tanpa User-Agent sebagai robot", () => {
    // Peramban sungguhan selalu mengirimnya. Yang tidak, hampir selalu skrip.
    assert.equal(apakahBot(""), true);
    assert.equal(apakahBot(null), true);
  });
});

describe("golongan perangkat", () => {
  it("membedakan ponsel, tablet, dan komputer", () => {
    assert.equal(jenisPerangkat("iPhone; CPU iPhone OS 17_4 Mobile Safari"), "ponsel");
    assert.equal(jenisPerangkat("Mozilla/5.0 (Linux; Android 14; SM-A546E) Mobile Safari"), "ponsel");
    assert.equal(jenisPerangkat("Mozilla/5.0 (iPad; CPU OS 17_4) Safari"), "tablet");
    // Android tanpa "Mobile" adalah tablet — itu aturan Google sendiri.
    assert.equal(jenisPerangkat("Mozilla/5.0 (Linux; Android 14; SM-X200) Safari"), "tablet");
    assert.equal(jenisPerangkat("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0"), "desktop");
  });
});

describe("alamat halaman", () => {
  it("membuang panel, API, wizard, dan berkas", () => {
    assert.equal(rapikanPath("/admin"), null);
    assert.equal(rapikanPath("/admin/integrasi"), null);
    assert.equal(rapikanPath("/api/content"), null);
    assert.equal(rapikanPath("/install"), null);
    assert.equal(rapikanPath("/favicon.svg"), null);
    assert.equal(rapikanPath("/_astro/index.js"), null);
  });

  it("membuang query dan garis miring di akhir", () => {
    assert.equal(rapikanPath("/mobil/byd-seal/?merek=byd"), "/mobil/byd-seal");
    assert.equal(rapikanPath("/"), "/");
  });
});

describe("sumber kunjungan", () => {
  it("membuang www dan menyimpan domainnya saja", () => {
    assert.equal(asalRujukan("https://www.google.com/search?q=mobil+listrik", "evkita.com"), "google.com");
  });

  it("perujuk dari domain sendiri dihitung sebagai kunjungan langsung", () => {
    // Kalau tidak, berpindah halaman di dalam situs akan selalu jadi sumber
    // nomor satu dan mengubur satu-satunya angka yang berguna di daftar itu.
    assert.equal(asalRujukan("https://evkita.com/mobil/byd-seal", "evkita.com"), "");
    assert.equal(asalRujukan("https://www.evkita.com/", "evkita.com"), "");
  });

  it("perujuk kosong atau rusak jadi kunjungan langsung", () => {
    assert.equal(asalRujukan("", "evkita.com"), "");
    assert.equal(asalRujukan("bukan-url", "evkita.com"), "");
  });
});

describe("kalender WIB", () => {
  it("hari berganti pukul 00.00 WIB, bukan UTC", () => {
    // 29 Agustus 17.30 UTC sudah tanggal 30 di Indonesia.
    assert.equal(hariWib(new Date("2026-08-29T17:30:00Z")), "2026-08-30");
    assert.equal(hariWib(new Date("2026-08-29T16:00:00Z")), "2026-08-29");
  });

  it("jam ikut digeser tujuh jam", () => {
    assert.equal(jamWib(new Date("2026-08-29T00:00:00Z")), 7);
    assert.equal(jamWib(new Date("2026-08-29T18:00:00Z")), 1);
  });

  it("mundur melewati pergantian bulan dan tahun", () => {
    assert.equal(mundurHari("2026-03-01", 1), "2026-02-28");
    assert.equal(mundurHari("2026-01-01", 1), "2025-12-31");
    assert.deepEqual(deretHari("2026-03-01", 3), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("ringkasan", () => {
  const peta = {
    "2026-08-27": {
      tampilan: 10,
      pengunjung: 6,
      bot: 3,
      jam: Array.from({ length: 24 }, (_, i) => (i === 9 ? 10 : 0)),
      halaman: { "/": 7, "/mobil/byd-seal": 3 },
      rujukan: { "": 5, "google.com": 5 },
      perangkat: { ponsel: 6, desktop: 4 },
    },
    "2026-08-28": {
      tampilan: 30,
      pengunjung: 14,
      bot: 1,
      jam: Array.from({ length: 24 }, (_, i) => (i === 20 ? 30 : 0)),
      halaman: { "/": 20, "/katalog": 10 },
      rujukan: { "google.com": 30 },
      perangkat: { ponsel: 25, desktop: 5 },
    },
  };

  it("menjumlahkan hari yang diminta saja, termasuk hari yang kosong", () => {
    const r = ringkas(peta, ["2026-08-27", "2026-08-28", "2026-08-29"]);
    assert.equal(r.hari.length, 3);
    assert.equal(r.hari[2].tampilan, 0);
    assert.equal(r.total.tampilan, 40);
    assert.equal(r.total.pengunjung, 20);
    assert.equal(r.total.bot, 4);
    assert.equal(r.total.perPengunjung, 2);
  });

  it("menyebut hari teramai, dan tidak menyebut apa pun kalau semuanya kosong", () => {
    assert.equal(ringkas(peta, ["2026-08-27", "2026-08-28"]).puncak?.tanggal, "2026-08-28");
    assert.equal(ringkas({}, ["2026-08-27"]).puncak, null);
  });

  it("menggabungkan halaman dan sumber lintas hari, terbesar lebih dulu", () => {
    const r = ringkas(peta, ["2026-08-27", "2026-08-28"]);
    assert.deepEqual(r.halaman[0], { label: "/", n: 27 });
    assert.deepEqual(r.rujukan[0], { label: "google.com", n: 35 });
    // Kunjungan langsung disimpan sebagai kunci kosong dan diterjemahkan panel.
    assert.equal(r.rujukan[1].label, "");
  });

  it("membuang golongan perangkat yang tidak pernah muncul", () => {
    const r = ringkas(peta, ["2026-08-27", "2026-08-28"]);
    assert.deepEqual(r.perangkat.map((p) => p.label), ["ponsel", "desktop"]);
  });
});

describe("selisih antar periode", () => {
  it("dihitung dalam persen dan dibulatkan", () => {
    assert.equal(selisihPersen(150, 100), 50);
    assert.equal(selisihPersen(50, 100), -50);
  });

  it("tidak menjawab apa-apa kalau periode sebelumnya kosong", () => {
    // "+100%" dari nol adalah kebohongan kecil yang menetap di laporan.
    assert.equal(selisihPersen(120, 0), null);
  });
});

describe("pemangkasan daftar", () => {
  it("menyisakan yang terbesar saja", () => {
    const peta: Record<string, number> = { a: 1, b: 9, c: 5, d: 3 };
    assert.deepEqual(pangkas(peta, 2), { b: 9, c: 5 });
  });
});

/* ------------------------------------------------------------------ *
 * Penyimpanan
 * ------------------------------------------------------------------ */

let rekam: typeof import("../src/lib/trafik-rekam");
let fs: typeof import("node:fs");
let path: typeof import("node:path");

const PERAMBAN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

before(async () => {
  const os = await import("node:os");
  fs = await import("node:fs");
  path = await import("node:path");
  // Modul ini menulis ke process.cwd()/data — dijalankan dari direktori
  // sementara supaya data pengembang tidak ikut tertimpa.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-trafik-"));
  process.chdir(dir);
  rekam = await import("../src/lib/trafik-rekam");
});

describe("pencatatan ke berkas", () => {
  /*
   * Memakai waktu SEKARANG, bukan tanggal karangan. Sidik pengunjung hanya
   * disimpan selama harinya masih berjalan (lihat `buangSidikLama`), jadi
   * mencatat ke tanggal yang sudah lewat akan menguji jalur yang berbeda dari
   * yang dipakai server sungguhan setiap hari.
   */
  const sekarang = new Date();
  const hari = hariWib(sekarang);
  const bulan = hari.slice(0, 7);

  it("menghitung tampilan, pengunjung unik, dan robot secara terpisah", () => {
    // Satu orang membuka dua halaman: dua tampilan, satu pengunjung.
    rekam.catatKunjungan({ pathname: "/", userAgent: PERAMBAN, ip: "1.1.1.1", host: "evkita.com", waktu: sekarang });
    rekam.catatKunjungan({ pathname: "/katalog", userAgent: PERAMBAN, ip: "1.1.1.1", host: "evkita.com", waktu: sekarang });
    // Orang kedua.
    rekam.catatKunjungan({ pathname: "/", userAgent: PERAMBAN, ip: "2.2.2.2", host: "evkita.com", waktu: sekarang });
    // Robot: dihitung di ember sendiri, tidak menaikkan tampilan.
    rekam.catatKunjungan({ pathname: "/", userAgent: "Googlebot/2.1", ip: "3.3.3.3", host: "evkita.com", waktu: sekarang });
    // Halaman panel tidak pernah masuk hitungan.
    rekam.catatKunjungan({ pathname: "/admin", userAgent: PERAMBAN, ip: "1.1.1.1", host: "evkita.com", waktu: sekarang });

    const hasil = rekam.bacaRentang(7, hari);
    assert.equal(hasil.sekarang.total.tampilan, 3);
    assert.equal(hasil.sekarang.total.pengunjung, 2);
    assert.equal(hasil.sekarang.total.bot, 1);
    assert.deepEqual(hasil.sekarang.halaman[0], { label: "/", n: 2 });
  });

  it("orang yang sama pada penulisan berikutnya tidak dihitung dua kali", () => {
    // Kunjungan baru setelah buffer sebelumnya sudah tertulis ke berkas.
    rekam.catatKunjungan({ pathname: "/motor", userAgent: PERAMBAN, ip: "1.1.1.1", host: "evkita.com", waktu: sekarang });

    const hasil = rekam.bacaRentang(7, hari);
    assert.equal(hasil.sekarang.total.tampilan, 4);
    // Tetap dua: sidiknya sudah ada di berkas, jadi ia bukan pengunjung baru.
    assert.equal(hasil.sekarang.total.pengunjung, 2);
  });

  it("menyimpan per bulan dan menyebutkan bulan yang punya catatan", () => {
    assert.equal(fs.existsSync(path.join(process.cwd(), "data", "trafik", `${bulan}.json`)), true);
    assert.deepEqual(rekam.daftarBulan(), [bulan]);
  });

  it("tidak menyimpan alamat IP dalam bentuk apa pun", () => {
    // Jaminan privasi yang paling mudah dilanggar tanpa sengaja, jadi diuji
    // langsung ke isi berkasnya.
    const isi = fs.readFileSync(path.join(process.cwd(), "data", "trafik", `${bulan}.json`), "utf8");
    assert.equal(isi.includes("1.1.1.1"), false);
    assert.equal(isi.includes("2.2.2.2"), false);
    assert.equal(isi.includes(PERAMBAN), false);
  });
});
