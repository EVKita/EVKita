import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

/**
 * Sesi dan pembatasan percobaan masuk.
 *
 * `auth.ts` membaca SESSION_SECRET lewat `getEnv`, yang mendahulukan isi berkas
 * `.env` di direktori kerja. Pengujian dijalankan dari direktori sementara
 * supaya berkas `.env` milik pengembang tidak ikut terbaca — hasilnya jadi sama
 * di mesin siapa pun dan di CI.
 */

const RAHASIA_UJI = "rahasia-uji-yang-panjang-sekali-dan-acak";

let auth: typeof import("../src/lib/auth");
let ratelimit: typeof import("../src/lib/ratelimit");

before(async () => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-uji-"));
  process.chdir(dir);
  process.env.SESSION_SECRET = RAHASIA_UJI;

  auth = await import("../src/lib/auth");
  ratelimit = await import("../src/lib/ratelimit");
});

describe("token sesi", () => {
  it("token yang baru dibuat terbaca kembali", () => {
    const token = auth.makeSession("pengguna-123");
    const info = auth.readSession(token);
    assert.equal(info?.userId, "pengguna-123");
    assert.ok(info && Date.now() - info.issuedAt < 5000);
  });

  it("token yang tanda tangannya diubah ditolak", () => {
    const token = auth.makeSession("pengguna-123");
    const rusak = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    assert.equal(auth.readSession(rusak), null);
  });

  it("id pengguna tidak bisa ditukar tanpa memutus tanda tangan", () => {
    const token = auth.makeSession("editor");
    const parts = token.split(".");
    parts[0] = "pemilik";
    assert.equal(auth.readSession(parts.join(".")), null);
  });

  it("waktu terbit tidak bisa dimundurkan untuk memperpanjang sesi", () => {
    const token = auth.makeSession("pengguna-123");
    const parts = token.split(".");
    // Dimundurkan enam hari: kalau tanda tangan tidak mencakup waktu terbit,
    // token ini akan tetap terbaca dan umurnya bisa diatur sesuka penyerang.
    parts[1] = (Date.now() - 6 * 24 * 3600 * 1000).toString(36);
    assert.equal(auth.readSession(parts.join(".")), null);
  });

  it("token berbentuk lama (tiga bagian) tidak lagi sah", () => {
    // Bentuk lama tidak membawa waktu terbit, jadi ia tidak pernah kedaluwarsa.
    assert.equal(auth.readSession("pengguna.acak.tandatangan"), null);
  });

  it("token yang lebih tua dari batas umur ditolak", () => {
    const asli = Date.now;
    try {
      const lampau = asli() - auth.MAX_SESSION_MS - 60_000;
      Date.now = () => lampau;
      const token = auth.makeSession("pengguna-123");
      Date.now = asli;
      assert.equal(auth.readSession(token), null);
    } finally {
      Date.now = asli;
    }
  });

  it("bentuk yang cacat tidak melempar", () => {
    for (const t of ["", "...", "a.b", "a.b.c.d.e", null, undefined]) {
      assert.equal(auth.readSession(t as string), null);
    }
  });
});

describe("pencabutan sesi", () => {
  it("sesi yang terbit sebelum pencabutan ditolak", () => {
    const cabut = new Date();
    const sesiLama = { userId: "a", issuedAt: cabut.getTime() - 1 };
    assert.equal(auth.stillAccepted({ sessionsValidFrom: cabut.toISOString() }, sesiLama), false);
  });

  it("sesi yang terbit SEDETIK sebelum pencabutan juga ditolak", () => {
    // Regresi: sempat ada toleransi satu detik di sini, dan akibatnya sesi lain
    // yang baru dibuat justru selamat dari tombol "keluar dari semua perangkat"
    // — persis sesi yang sedang ingin diputus orangnya.
    const cabut = new Date();
    const sesi = { userId: "a", issuedAt: cabut.getTime() - 900 };
    assert.equal(auth.stillAccepted({ sessionsValidFrom: cabut.toISOString() }, sesi), false);
  });

  it("sesi yang terbit pada atau sesudah pencabutan diterima", () => {
    const cabut = new Date();
    for (const selisih of [0, 1, 5000]) {
      const sesi = { userId: "a", issuedAt: cabut.getTime() + selisih };
      assert.equal(auth.stillAccepted({ sessionsValidFrom: cabut.toISOString() }, sesi), true);
    }
  });

  it("akun yang belum pernah mencabut apa pun menerima semua sesinya", () => {
    assert.equal(auth.stillAccepted({ sessionsValidFrom: "" }, { userId: "a", issuedAt: 1 }), true);
  });

  it("nilai pencabutan yang cacat tidak mengunci orang keluar", () => {
    // Gagal ke arah "izinkan": berkas yang isinya aneh tidak boleh membuat
    // pemilik tidak bisa masuk ke panelnya sendiri.
    assert.equal(auth.stillAccepted({ sessionsValidFrom: "bukan-tanggal" }, { userId: "a", issuedAt: 1 }), true);
  });
});

describe("pembatasan percobaan masuk", () => {
  it("memblokir setelah percobaan gagal berturut-turut", () => {
    const keys = ["ip:1.2.3.4", "user:budi"];
    ratelimit.clearLimit(keys);

    let blocked = false;
    for (let i = 0; i < 20; i++) {
      if (ratelimit.checkLimit(keys).blocked) {
        blocked = true;
        break;
      }
      ratelimit.recordFailure(keys);
    }
    assert.ok(blocked, "seharusnya diblokir sebelum 20 percobaan");

    const state = ratelimit.checkLimit(keys);
    assert.ok(state.retryAfter > 0, "harus memberi tahu kapan boleh mencoba lagi");
    ratelimit.clearLimit(keys);
  });

  it("masuk yang berhasil menghapus hitungannya", () => {
    const keys = ["ip:5.6.7.8", "user:siti"];
    ratelimit.clearLimit(keys);
    for (let i = 0; i < 5; i++) ratelimit.recordFailure(keys);
    ratelimit.clearLimit(keys);
    assert.equal(ratelimit.checkLimit(keys).blocked, false);
  });

  it("blokir pada satu akun tidak ikut mengunci akun lain", () => {
    const budi = ["user:budi2"];
    const siti = ["user:siti2"];
    ratelimit.clearLimit([...budi, ...siti]);
    for (let i = 0; i < 12; i++) ratelimit.recordFailure(budi);
    assert.ok(ratelimit.checkLimit(budi).blocked);
    assert.equal(ratelimit.checkLimit(siti).blocked, false);
    ratelimit.clearLimit([...budi, ...siti]);
  });

  it("memalsukan alamat tidak melewati kunci nama pengguna", () => {
    // Inilah alasan pembatasan dipasang pada DUA kunci sekaligus.
    const korban = "user:target";
    ratelimit.clearLimit([korban]);
    for (let i = 0; i < 12; i++) {
      ratelimit.recordFailure([`ip:10.0.0.${i}`, korban]);
    }
    assert.ok(
      ratelimit.checkLimit(["ip:10.0.0.99", korban]).blocked,
      "alamat baru sekalipun tetap terbentur kunci nama pengguna"
    );
    ratelimit.clearLimit([korban]);
  });

  it("membaca alamat klien dari X-Forwarded-For di balik proxy", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    assert.equal(ratelimit.clientKey(req, "127.0.0.1"), "ip:203.0.113.7");
  });

  it("jatuh ke alamat koneksi kalau tidak ada proxy", () => {
    assert.equal(ratelimit.clientKey(new Request("http://localhost/"), "198.51.100.9"), "ip:198.51.100.9");
  });
});
