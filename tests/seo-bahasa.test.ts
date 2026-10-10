import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLangParam, parseAcceptLanguage } from "../src/lib/i18n/pub.js";
import { alternateLangUrls, canonicalUrl } from "../src/lib/site-url";
import { normalisasi, periksa } from "../src/lib/integrasi.js";

/**
 * SEO multibahasa: `?lang=`, negosiasi bahasa, dan penanda Baidu.
 *
 * Tiga keputusan yang dijaga uji ini:
 *
 *   1. `?lang=en/zh` adalah URL bahasa yang mandiri (dipertahankan kanonis,
 *      diumumkan hreflang + sitemap) — tanpanya Google/Baidu tidak pernah
 *      mengindeks versi Inggris/Mandarin sebagai halaman sendiri.
 *   2. Bahasa peramban hanya dipakai untuk manusia tanpa pilihan — robot
 *      tetap di bawaan (aturannya di middleware, yang diuji di sini
 *      adalah pemilah headernya).
 *   3. Token Baidu yang tidak berbentuk dibuang diam-diam, tidak pernah
 *      sampai ke HTML.
 */

describe("normalizeLangParam", () => {
  it("menerima id/en/zh termasuk varian wilayah", () => {
    assert.equal(normalizeLangParam("en"), "en");
    assert.equal(normalizeLangParam("en-US"), "en");
    assert.equal(normalizeLangParam("zh-CN"), "zh");
    assert.equal(normalizeLangParam("zh_TW"), "zh");
    assert.equal(normalizeLangParam("id"), "id");
    assert.equal(normalizeLangParam("ID"), "id");
  });

  it("mengembalikan null untuk yang bukan pilihan bahasa", () => {
    assert.equal(normalizeLangParam(null), null);
    assert.equal(normalizeLangParam(""), null);
    assert.equal(normalizeLangParam("fr"), null);
    assert.equal(normalizeLangParam("xx"), null);
  });
});

describe("parseAcceptLanguage", () => {
  it("mengikuti bahasa pertama yang dikenal", () => {
    assert.equal(parseAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8"), "zh");
    assert.equal(parseAcceptLanguage("en-US,en;q=0.9,id;q=0.8"), "en");
    assert.equal(parseAcceptLanguage("id-ID,id;q=0.9"), "id");
  });

  it("menghormati bobot q= di atas urutan", () => {
    assert.equal(parseAcceptLanguage("en;q=0.5,zh-CN;q=0.9"), "zh");
  });

  it("melewati rentang tak dikenal dan q=0", () => {
    assert.equal(parseAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.8"), "en");
    assert.equal(parseAcceptLanguage("en;q=0,zh-CN;q=0.5"), "zh");
  });

  it("jatuh ke Indonesia tanpa kecocokan", () => {
    assert.equal(parseAcceptLanguage(""), "id");
    assert.equal(parseAcceptLanguage(null), "id");
    assert.equal(parseAcceptLanguage("fr-FR,de;q=0.9"), "id");
  });
});

describe("canonicalUrl bahasa", () => {
  it("membuang filter katalog tapi mempertahankan ?lang=", () => {
    assert.equal(
      canonicalUrl(new URL("https://evkita.com/?merek=byd&urut=harga&lang=en")),
      "https://evkita.com/?lang=en"
    );
    assert.equal(
      canonicalUrl(new URL("https://evkita.com/mobil/byd-seal?banding=x&lang=zh")),
      "https://evkita.com/mobil/byd-seal?lang=zh"
    );
  });

  it("tanpa ?lang= tetap seperti dulu", () => {
    assert.equal(
      canonicalUrl(new URL("https://evkita.com/mobil/byd-seal?merek=byd")),
      "https://evkita.com/mobil/byd-seal"
    );
    assert.equal(canonicalUrl(new URL("https://evkita.com/")), "https://evkita.com/");
  });

  it("?lang=id dan nilai asing dinormalkan ke bawaan", () => {
    assert.equal(canonicalUrl(new URL("https://evkita.com/?lang=id")), "https://evkita.com/");
    assert.equal(canonicalUrl(new URL("https://evkita.com/?lang=fr")), "https://evkita.com/");
  });
});

describe("alternateLangUrls", () => {
  it("mengembalikan tiga URL hreflang", () => {
    assert.deepEqual(alternateLangUrls(new URL("https://evkita.com/mobil/byd-seal")), {
      id: "https://evkita.com/mobil/byd-seal",
      en: "https://evkita.com/mobil/byd-seal?lang=en",
      zh: "https://evkita.com/mobil/byd-seal?lang=zh",
    });
  });
});

describe("token Baidu", () => {
  it("disimpan kalau berbentuk kode verifikasi", () => {
    assert.equal(normalisasi({ baiduToken: "bXBkZXZlcmVuY2UxMjM0NQ" }).baiduToken, "bXBkZXZlcmVuY2UxMjM0NQ");
  });

  it("dibuang diam-diam kalau tidak berbentuk — tanpa kunci galat baru", () => {
    assert.equal(normalisasi({ baiduToken: `"><script>` }).baiduToken, "");
    const hasil = periksa({ baiduToken: `"><script>` });
    assert.equal(hasil.nilai.baiduToken, "");
    assert.deepEqual(hasil.galat, []);
  });
});
