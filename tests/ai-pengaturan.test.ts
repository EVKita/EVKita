import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

/**
 * Pengaturan AI: kunci API DeepSeek.
 *
 * Yang diuji di sini adalah janji-janji yang membuat halaman itu boleh ada:
 * kunci yang salah bentuk ditolak sebelum menyentuh jaringan, kunci yang
 * ditampilkan tidak pernah lebih dari empat karakter terakhirnya, kode galat
 * DeepSeek diterjemahkan jadi kunci pesan yang benar, dan `.env` yang memuatnya
 * tidak bisa dibaca proses lain di server.
 *
 * Sama seperti tests/sesi.test.ts, seluruhnya dijalankan dari direktori
 * sementara supaya `.env` milik pengembang tidak ikut terbaca — dan yang lebih
 * penting di berkas ini: supaya `.env` miliknya tidak ikut TERTULIS.
 */

let deepseek: typeof import("../src/lib/deepseek");
let env: typeof import("../src/lib/env");
let fs: typeof import("node:fs");
let dir: string;

before(async () => {
  const os = await import("node:os");
  fs = await import("node:fs");
  const path = await import("node:path");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-ai-uji-"));
  process.chdir(dir);

  deepseek = await import("../src/lib/deepseek");
  env = await import("../src/lib/env");
});

const KUNCI_SAH = "sk-1234567890abcdef1234567890abcdef";

describe("bentuk kunci DeepSeek", () => {
  it("kunci berbentuk wajar diterima", () => {
    assert.equal(deepseek.keyLooksValid(KUNCI_SAH), true);
  });

  it("spasi yang ikut tersalin ditolak", () => {
    assert.equal(deepseek.keyLooksValid("sk-1234567890abcdef 1234567890abcdef"), false);
  });

  it("kunci tanpa awalan sk- ditolak", () => {
    assert.equal(deepseek.keyLooksValid("1234567890abcdef1234567890abcdef"), false);
  });

  it("kunci yang terlalu pendek ditolak", () => {
    assert.equal(deepseek.keyLooksValid("sk-abc"), false);
  });

  it("spasi di ujung dibersihkan, bukan membuat kunci ditolak", () => {
    assert.equal(deepseek.keyLooksValid(`  ${KUNCI_SAH}\n`), true);
  });
});

describe("penyamaran kunci", () => {
  it("hanya empat karakter terakhir yang dikembalikan", () => {
    assert.equal(deepseek.keyTail(KUNCI_SAH), "cdef");
  });

  it("tidak pernah mengembalikan kunci utuh, bahkan untuk masukan pendek", () => {
    const ekor = deepseek.keyTail("sk-abc");
    assert.equal(ekor.length <= 4, true);
    assert.equal("sk-abc".includes(ekor), true);
    assert.notEqual(ekor, "sk-abc");
  });

  it("masukan kosong tidak menghasilkan apa-apa", () => {
    assert.equal(deepseek.keyTail(""), "");
  });
});

describe("kode galat DeepSeek", () => {
  it("401 berarti kuncinya yang salah, bukan servernya", () => {
    assert.equal(deepseek.errorKeyForStatus(401), "err.ai.kunciSalah");
  });

  it("402 berarti saldo habis", () => {
    assert.equal(deepseek.errorKeyForStatus(402), "err.ai.saldoHabis");
  });

  it("429 berarti terlalu cepat", () => {
    assert.equal(deepseek.errorKeyForStatus(429), "err.ai.sibuk");
  });

  it("semua 5xx dianggap masalah di sisi DeepSeek", () => {
    for (const status of [500, 502, 503]) {
      assert.equal(deepseek.errorKeyForStatus(status), "err.ai.deepseekBermasalah");
    }
  });

  it("kode lain jatuh ke penolakan umum", () => {
    assert.equal(deepseek.errorKeyForStatus(418), "err.ai.ditolak");
  });
});

describe("saldo tanpa kunci", () => {
  it("tidak menyentuh jaringan sama sekali", async () => {
    const hasil = await deepseek.fetchBalance("");
    assert.equal(hasil.ok, false);
    assert.equal(hasil.ok === false && hasil.errorKey, "err.ai.belumAdaKunci");
  });
});

describe("berkas .env", () => {
  it("kunci tersimpan dan terbaca kembali", () => {
    env.writeEnvFile({ DEEPSEEK_API_KEY: KUNCI_SAH });
    assert.equal(env.getEnv("DEEPSEEK_API_KEY", ""), KUNCI_SAH);
  });

  it("izinnya 0600 — proses lain di server tidak bisa membacanya", () => {
    env.writeEnvFile({ DEEPSEEK_API_KEY: KUNCI_SAH });
    const mode = fs.statSync(".env").mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("nilai null menghapus barisnya, bukan menuliskannya sebagai kosong", () => {
    env.writeEnvFile({ DEEPSEEK_API_KEY: KUNCI_SAH, SESSION_SECRET: "rahasia-uji" });
    env.writeEnvFile({ DEEPSEEK_API_KEY: null });

    const isi = fs.readFileSync(".env", "utf8");
    assert.equal(isi.includes("DEEPSEEK_API_KEY"), false);
    // Kunci lain tidak ikut terhapus.
    assert.equal(isi.includes("SESSION_SECRET=rahasia-uji"), true);
  });

  it("komentar dan urutan baris selamat melewati penyimpanan", () => {
    fs.writeFileSync(
      ".env",
      ["# catatan pemilik server", "PORT=4322", "", "# rahasia", "SESSION_SECRET=lama"].join("\n") + "\n",
      "utf8"
    );

    env.writeEnvFile({ SESSION_SECRET: "baru", DEEPSEEK_API_KEY: KUNCI_SAH });

    const baris = fs.readFileSync(".env", "utf8").split("\n");
    assert.deepEqual(baris, [
      "# catatan pemilik server",
      "PORT=4322",
      "",
      "# rahasia",
      "SESSION_SECRET=baru",
      `DEEPSEEK_API_KEY=${KUNCI_SAH}`,
      "",
    ]);
  });

  it("menyimpan berkali-kali tidak menumpuk baris kosong", () => {
    fs.writeFileSync(".env", "PORT=4322\n", "utf8");
    for (let i = 0; i < 5; i++) env.writeEnvFile({ DEEPSEEK_API_KEY: KUNCI_SAH });
    assert.equal(fs.readFileSync(".env", "utf8"), `PORT=4322\nDEEPSEEK_API_KEY=${KUNCI_SAH}\n`);
  });
});
