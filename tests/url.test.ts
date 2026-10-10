import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { denganBase, safeUrl, sematVideo } from "../src/lib/url.js";

/**
 * Regresi bug nyata: di semua subhalaman, menu "Artikel" mengarah ke
 * `//artikel` — dibaca peramban sebagai host luar bernama "artikel", berakhir
 * di "This site can't be reached" (DNS_PROBE_FINISHED_NXDOMAIN). Jangkar
 * `#daftar`/`#tentang` pun ikut rusak (`//#daftar`). Di beranda semuanya
 * terlihat baik-baik saja, jadi bugnya hanya muncul "terkadang".
 */

describe("denganBase", () => {
  it("di beranda: jangkar apa adanya, halaman absolut dari akar", () => {
    assert.equal(denganBase("", "#daftar"), "#daftar");
    assert.equal(denganBase("", "#tentang"), "#tentang");
    assert.equal(denganBase("", "artikel"), "/artikel");
    assert.equal(denganBase("", "/artikel"), "/artikel");
  });

  it("di subhalaman: semuanya absolut — tidak pernah garis miring ganda", () => {
    assert.equal(denganBase("/", "#daftar"), "/#daftar");
    assert.equal(denganBase("/", "#tentang"), "/#tentang");
    assert.equal(denganBase("/", "artikel"), "/artikel");
    assert.equal(denganBase("/", "/artikel"), "/artikel");
  });

  it("hasilnya selalu lolos safeUrl (bukan protokol-relatif, bukan kosong)", () => {
    const semua = [
      denganBase("", "#daftar"),
      denganBase("", "artikel"),
      denganBase("/", "#daftar"),
      denganBase("/", "#tentang"),
      denganBase("/", "artikel"),
      denganBase("/", "/artikel"),
    ];
    for (const h of semua) {
      assert.ok(h && !h.startsWith("//"), `berbahaya: ${h}`);
      assert.equal(safeUrl(h), h);
    }
  });

  it("masukan kosong menghasilkan string kosong, bukan '/'", () => {
    assert.equal(denganBase("", ""), "");
    assert.equal(denganBase("/", ""), "");
  });
});

describe("sematVideo", () => {
  it("YouTube jadi sematan hemat-privasi", () => {
    for (const [masuk, id] of [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ]) {
      assert.deepEqual(sematVideo(masuk), {
        jenis: "youtube",
        src: `https://www.youtube-nocookie.com/embed/${id}`,
      }, masuk);
    }
  });

  it("berkas video langsung dibiarkan apa adanya", () => {
    assert.deepEqual(sematVideo("https://resmi.bengkel.id/profil.mp4"), {
      jenis: "langsung",
      src: "https://resmi.bengkel.id/profil.mp4",
    });
  });

  it("selain itu tidak ada yang dirender", () => {
    for (const masuk of ["", "   ", "javascript:alert(1)", "/video/lokal.mp4", "bukan url"]) {
      assert.deepEqual(sematVideo(masuk), { jenis: "", src: "" }, String(masuk));
    }
  });
});
