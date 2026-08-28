import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MENU_COLS,
  MAX_MENU_LINKS,
  MAX_LEGAL_LINKS,
  SOCIAL_NETWORKS,
  CONTACT_ROWS,
  blankMenuColumn,
  normalizeLinks,
  normalizeMenus,
} from "../src/lib/footer.js";

/**
 * Menu footer datang dari dua arah: panel admin (`admin.js`) dan berkas konten
 * yang bisa disunting tangan. Keduanya melewati fungsi yang sama, jadi di sinilah
 * batas jumlah dan pembuangan baris kosong benar-benar dijaga.
 */

describe("normalizeLinks", () => {
  it("memangkas spasi dan membuang baris yang kosong sama sekali", () => {
    const rows = normalizeLinks(
      [
        { label: "  Kebijakan Privasi ", url: " /privasi " },
        { label: "", url: "" },
        { label: "Kontak", url: "" },
      ],
      MAX_LEGAL_LINKS
    );
    assert.deepEqual(rows, [
      { label: "Kebijakan Privasi", url: "/privasi" },
      // Baris berlabel tanpa alamat tetap disimpan: pemilik situs mungkin baru
      // mengetik separuh, dan penyimpanan otomatis tidak boleh menghapusnya.
      { label: "Kontak", url: "" },
    ]);
  });

  it("memotong pada batas yang diberikan", () => {
    const many = Array.from({ length: MAX_LEGAL_LINKS + 5 }, (_, i) => ({ label: `T${i}`, url: "/x" }));
    assert.equal(normalizeLinks(many, MAX_LEGAL_LINKS).length, MAX_LEGAL_LINKS);
  });

  it("mengembalikan larik kosong untuk nilai yang bukan larik", () => {
    for (const v of [undefined, null, "", 0, {}, "bukan larik"]) {
      assert.deepEqual(normalizeLinks(v, MAX_LEGAL_LINKS), []);
    }
  });

  it("tidak ikut menilai alamatnya — penyaringan skema dikerjakan saat render", () => {
    // safeUrl() yang membuangnya di SiteFooter.astro; menyaring dua kali berarti
    // dua tempat yang bisa berbeda pendapat.
    assert.deepEqual(normalizeLinks([{ label: "X", url: "javascript:alert(1)" }], 4), [
      { label: "X", url: "javascript:alert(1)" },
    ]);
  });
});

describe("normalizeMenus", () => {
  it("membuang kolom yang tidak berjudul dan tidak bertautan", () => {
    const cols = normalizeMenus([
      { title: " Layanan ", links: [{ label: "Uji coba", url: "/katalog" }] },
      { title: "", links: [] },
      { title: "", links: [{ label: "", url: "" }] },
      { title: "Baru", links: [] },
    ]);
    assert.deepEqual(cols, [
      { title: "Layanan", links: [{ label: "Uji coba", url: "/katalog" }] },
      { title: "Baru", links: [] },
    ]);
  });

  it("memotong jumlah kolom dan jumlah tautan per kolom", () => {
    const cols = normalizeMenus(
      Array.from({ length: MAX_MENU_COLS + 3 }, (_, i) => ({
        title: `Kolom ${i}`,
        links: Array.from({ length: MAX_MENU_LINKS + 4 }, (_, j) => ({ label: `T${j}`, url: "/x" })),
      }))
    );
    assert.equal(cols.length, MAX_MENU_COLS);
    for (const col of cols) assert.equal(col.links.length, MAX_MENU_LINKS);
  });

  it("tahan terhadap bentuk yang tidak diduga", () => {
    assert.deepEqual(normalizeMenus("bukan larik"), []);
    assert.deepEqual(normalizeMenus([null, 7, { title: "Ok" }]), [{ title: "Ok", links: [] }]);
  });

  it("menerima kolom kosong buatan panel tanpa mengubah bentuknya", () => {
    // Tombol "tambah kolom" di panel memakai blankMenuColumn(); kalau bentuknya
    // berbeda dari hasil normalisasi, kolom baru akan hilang saat disimpan.
    const blank = blankMenuColumn();
    assert.deepEqual(Object.keys(blank), ["title", "links"]);
    assert.deepEqual(normalizeMenus([blank]), []);
    assert.deepEqual(normalizeMenus([{ ...blank, title: "Layanan" }]), [{ title: "Layanan", links: [] }]);
  });
});

describe("daftar ikon footer", () => {
  it("setiap jejaring punya kunci site, label, dan ikon", () => {
    for (const s of SOCIAL_NETWORKS) {
      assert.match(s.key, /^social[A-Z]/, `kunci tidak wajar: ${s.key}`);
      assert.ok(s.label, `label kosong untuk ${s.key}`);
      assert.match(s.icon, /^<(path|rect|circle)/, `ikon kosong untuk ${s.key}`);
    }
  });

  it("baris kontak yang punya href menghasilkan alamat yang bisa dibuka", () => {
    const byKey = Object.fromEntries(CONTACT_ROWS.map((r) => [r.key, r]));
    assert.equal(byKey.contactEmail.href("halo@evkita.com"), "mailto:halo@evkita.com");
    assert.equal(byKey.contactPhone.href("+62 21 5080 1234"), "tel:+622150801234");
    assert.equal(byKey.contactWhatsapp.href("+62 812-3456-789"), "https://wa.me/628123456789");
    // Alamat dan jam buka bukan tautan.
    assert.equal(byKey.contactAddress.href, null);
    assert.equal(byKey.contactHours.href, null);
  });

  it("tidak ada kunci yang tertulis dua kali", () => {
    const keys = [...SOCIAL_NETWORKS.map((s) => s.key), ...CONTACT_ROWS.map((r) => r.key)];
    assert.equal(new Set(keys).size, keys.length);
  });
});
