import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bahasaDariNegara } from "../src/lib/i18n/pub.js";

/**
 * Bahasa bawaan dari negara pengunjung.
 *
 * Indonesia → Indonesia; China, Taiwan, Hong Kong → Mandarin; negara lain →
 * Inggris; tidak terlacak → null (jatuh ke bawaan edisi). Kalau uji ini
 * merah, berarti ada negara baru yang perlu dipetakan.
 */
describe("bahasaDariNegara", () => {
  it("Indonesia selalu Bahasa Indonesia", () => {
    assert.equal(bahasaDariNegara("ID"), "id");
    assert.equal(bahasaDariNegara("id"), "id");
  });

  it("China, Taiwan, dan Hong Kong berbahasa Mandarin", () => {
    for (const negara of ["CN", "TW", "HK", "cn", "tw", "hk"]) {
      assert.equal(bahasaDariNegara(negara), "zh");
    }
  });

  it("negara lain berbahasa Inggris", () => {
    for (const negara of ["US", "MY", "SG", "JP", "DE", "AU", "NL", "XX"]) {
      assert.equal(bahasaDariNegara(negara), "en");
    }
  });

  it("tidak terlacak berarti null — bawaan edisi yang menentukan", () => {
    for (const negara of ["", "  ", null, undefined]) {
      assert.equal(bahasaDariNegara(negara as any), null);
    }
  });
});
