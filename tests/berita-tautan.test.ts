import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { idGoogleNews, perluDiselesaikan, tautanDariJawaban } from "../src/lib/berita-tautan";

/*
 * Bagian murni dari penukar tautan Google News. Jaringan tidak diuji di sini:
 * jawaban Google berubah-ubah, dan uji yang bergantung padanya akan merah
 * sendiri esok hari tanpa ada kode yang berubah.
 */

describe("perluDiselesaikan", () => {
  it("hanya menerima alamat artikel Google News", () => {
    assert.equal(perluDiselesaikan("https://news.google.com/rss/articles/CBMiabc123?oc=5"), true);
    assert.equal(perluDiselesaikan("https://otomotif.kompas.com/read/2026/11/18/x"), false);
    assert.equal(perluDiselesaikan("https://news.google.com/rss/search?q=ev"), false);
    assert.equal(perluDiselesaikan(""), false);
    assert.equal(perluDiselesaikan("javascript:alert(1)"), false);
  });

  it("mengambil bagian artikel tanpa parameter", () => {
    assert.equal(
      idGoogleNews("https://news.google.com/rss/articles/CBMiabc123?oc=5&hl=id"),
      "CBMiabc123"
    );
    assert.equal(idGoogleNews("https://contoh.test/berita"), "");
  });
});

describe("tautanDariJawaban", () => {
  it("mengambil alamat penerbit dari jawaban berlapis", () => {
    const jawaban = String.raw`[["wrb.fr","Fbv4je","[\"garturlres\",\"https:\/\/otomotif.kompas.com\/read\/2026\/11\/18\/x\",\"abc\"]",null,null,null,"generic"]]`;
    assert.equal(
      tautanDariJawaban(jawaban),
      "https://otomotif.kompas.com/read/2026/11/18/x"
    );
  });

  it("melewati alamat milik Google sendiri", () => {
    const jawaban = `["garturlres","https://news.google.com/rss/articles/x","https://cnevpost.com/2026/11/19/story/"]`;
    assert.equal(tautanDariJawaban(jawaban), "https://cnevpost.com/2026/11/19/story/");
  });

  it("mengembalikan string kosong kalau tidak ada alamat yang layak", () => {
    assert.equal(tautanDariJawaban(""), "");
    assert.equal(tautanDariJawaban(`["x","bukan alamat"]`), "");
  });
});
