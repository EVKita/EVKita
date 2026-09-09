import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { themeAccentStyle } from "../src/lib/theme.js";

/**
 * Palet panel admin.
 *
 * Halaman admin utama dirender server, sedangkan formulir Tampilan baru
 * digambar di peramban setelah konten dimuat. Kalau tema tidak ikut dikirim ke
 * Base pada render awal, panel memakai warna oranye fallback sampai pengguna
 * membuka menu Tampilan. Uji integrasi ringan ini menjaga sambungan tersebut.
 */
describe("palet panel admin", () => {
  it("membaca pengaturan situs dan mengirim aksennya ke layout pada render awal", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/pages/admin/index.astro"), "utf8");

    assert.match(source, /const site = readContent\(\)\.site \|\| \{\};/);
    assert.match(source, /<Base[^>]*\bsite=\{site\}[^>]*\baccentOnly\b/);
  });

  it("menghasilkan token warna dari palet yang dipilih, bukan fallback oranye", () => {
    const style = themeAccentStyle({
      themePrimary: "#123456",
      themeSecondary: "#abcdef",
    });

    assert.match(style, /--accent:#123456(?:;|$)/);
    assert.match(style, /--accent-2:#abcdef(?:;|$)/);
    assert.match(style, /--accent-grad:linear-gradient\(135deg, #123456, #abcdef\)/);
    assert.ok(!style.includes("#ff3d2e"));
    assert.ok(!style.includes("#ff8a00"));
    assert.ok(!style.includes("--radius"), "panel tidak boleh ikut menerima bentuk situs publik");
    assert.ok(!style.includes("--font"), "panel tidak boleh ikut menerima tipografi situs publik");
  });
});
