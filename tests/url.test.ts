import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { denganBase, safeUrl } from "../src/lib/url.js";

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
