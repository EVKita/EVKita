import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToHtml } from "../src/lib/markdown";

/**
 * Pengubah Markdown ini melayani dua pemakai yang tuntutannya berbeda:
 * catatan rilis di halaman Pembaruan (pendek, sudah lama ada) dan halaman
 * statis yang ditulis pemilik situs (panjang, dilipat sesuka penyuntingnya).
 * Yang diuji di sini adalah hal-hal yang membuat keduanya bisa dilayani satu
 * berkas yang sama.
 */

describe("paragraf", () => {
  it("baris yang berurutan adalah SATU paragraf, bukan satu paragraf per baris", () => {
    const html = markdownToHtml("Kalimat pertama\nyang dilipat di sini.\n\nParagraf kedua.");
    assert.equal(html, "<p>Kalimat pertama yang dilipat di sini.</p><p>Paragraf kedua.</p>");
  });

  it("baris kosong yang beruntun tidak menghasilkan paragraf kosong", () => {
    assert.equal(markdownToHtml("Satu\n\n\n\nDua"), "<p>Satu</p><p>Dua</p>");
  });
});

describe("daftar", () => {
  it("daftar bertanda dan bernomor punya tag masing-masing", () => {
    assert.equal(markdownToHtml("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
    assert.equal(markdownToHtml("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  });

  it("berganti jenis daftar menutup daftar sebelumnya", () => {
    assert.equal(markdownToHtml("- a\n1. b"), "<ul><li>a</li></ul><ol><li>b</li></ol>");
  });

  it("baris lanjutan menyambung butir terakhir, bukan keluar dari daftarnya", () => {
    const html = markdownToHtml("- Butir yang panjang\n  dan dilipat.\n- Butir kedua.");
    assert.equal(html, "<ul><li>Butir yang panjang dan dilipat.</li><li>Butir kedua.</li></ul>");
  });

  it("paragraf yang terbuka ditutup lebih dulu saat daftar dimulai", () => {
    assert.equal(markdownToHtml("Pengantar:\n- a"), "<p>Pengantar:</p><ul><li>a</li></ul>");
  });
});

describe("judul", () => {
  it("diberi id supaya bisa ditautkan per bagian", () => {
    assert.equal(markdownToHtml("## Hak kamu"), '<h2 id="hak-kamu">Hak kamu</h2>');
  });

  it("judul yang sama dua kali tidak menghasilkan dua id yang sama", () => {
    const html = markdownToHtml("## Cookie\n\n## Cookie");
    assert.match(html, /id="cookie"/);
    assert.match(html, /id="cookie-2"/);
  });

  it("judul yang seluruhnya tanda baca tetap punya id", () => {
    assert.match(markdownToHtml("## ???"), /id="bagian"/);
  });
});

describe("penekanan", () => {
  it("bintang dan garis bawah sama-sama dikenali", () => {
    assert.equal(markdownToHtml("*miring* dan _juga miring_"), "<p><em>miring</em> dan <em>juga miring</em></p>");
    assert.equal(markdownToHtml("**tebal** dan __juga tebal__"), "<p><strong>tebal</strong> dan <strong>juga tebal</strong></p>");
  });

  /* Yang paling mudah rusak: nama field bergaya snake_case di dalam kalimat.
     Garis bawah di tengah kata bukan penanda penekanan. */
  it("garis bawah di tengah kata dibiarkan utuh", () => {
    assert.equal(markdownToHtml("field nama_depan_pengguna dipakai"), "<p>field nama_depan_pengguna dipakai</p>");
  });
});

describe("tautan", () => {
  it("tautan ke luar dibuka di tab baru", () => {
    assert.equal(
      markdownToHtml("[situs](https://contoh.id)"),
      '<p><a href="https://contoh.id" target="_blank" rel="noopener">situs</a></p>'
    );
  });

  it("tautan ke dalam situs sendiri dibuka di tab yang sama", () => {
    assert.equal(markdownToHtml("[privasi](/kebijakan-privasi)"), '<p><a href="/kebijakan-privasi">privasi</a></p>');
  });

  it("skema yang berbahaya jatuh jadi teks biasa", () => {
    assert.equal(markdownToHtml("[klik](javascript:alert1)"), "<p>klik</p>");
    assert.equal(markdownToHtml("[klik](//situs-lain.id)"), "<p>klik</p>");
  });
});

describe("keamanan", () => {
  it("HTML yang diketik penyunting tidak pernah dirender sebagai HTML", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">');
    assert.ok(!html.includes("<img"), html);
    assert.match(html, /&lt;img/);
  });
});

describe("garis pemisah & blok kode", () => {
  it("tiga tanda hubung menjadi garis pemisah", () => {
    assert.equal(markdownToHtml("a\n\n---\n\nb"), "<p>a</p><hr /><p>b</p>");
  });

  it("isi blok kode tidak ikut ditafsirkan", () => {
    assert.equal(markdownToHtml("```\n- bukan daftar\n```"), "<pre><code>- bukan daftar</code></pre>");
  });

  it("blok kode yang lupa ditutup tetap dikeluarkan", () => {
    assert.equal(markdownToHtml("```\nsatu"), "<pre><code>satu</code></pre>");
  });
});
