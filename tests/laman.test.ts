import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATAS_LAMAN,
  SLUG_TERPAKAI,
  slugLaman,
  slugBentrok,
  hrefLaman,
  normalizeLaman,
  labelFooter,
  tautanFooter,
  isiLaman,
  ringkasLaman,
  lamanBawaan,
} from "../src/lib/laman.js";

/**
 * Halaman statis punya satu sifat yang tidak dimiliki koleksi lain: slug-nya
 * adalah ALAMAT. Slug yang kosong, bentrok dengan rute yang sudah ada, atau
 * kembar dengan halaman lain semuanya berujung pada halaman yang tidak pernah
 * bisa dibuka — kegagalan yang tidak melempar galat apa pun. Karena itu bagian
 * terbesar berkas ini menguji slug.
 */

describe("slugLaman", () => {
  it("membakukan judul menjadi alamat yang aman", () => {
    assert.equal(slugLaman("Kebijakan Privasi"), "kebijakan-privasi");
    assert.equal(slugLaman("  Syarat & Ketentuan!  "), "syarat-ketentuan");
    assert.equal(slugLaman("Tentang   Kami"), "tentang-kami");
  });

  it("menguraikan huruf beraksen, bukan membuangnya jadi tanda hubung", () => {
    assert.equal(slugLaman("Éditeur Français"), "editeur-francais");
  });

  it("tidak pernah menyisakan tanda hubung di ujung", () => {
    assert.equal(slugLaman("---halo---"), "halo");
    // Dipotong tepat di tengah tanda hubung: pemotongan itu sendiri bisa
    // meninggalkan tanda hubung di ujung, dan itu harus ikut dibersihkan.
    const panjang = "a".repeat(BATAS_LAMAN.slug - 1) + " kata";
    const slug = slugLaman(panjang);
    assert.ok(slug.length <= BATAS_LAMAN.slug);
    assert.ok(!slug.endsWith("-"), slug);
  });

  it("nilai yang bukan teks tidak membuatnya meledak", () => {
    assert.equal(slugLaman(null), "");
    assert.equal(slugLaman(undefined), "");
    assert.equal(slugLaman("!!!"), "");
  });
});

describe("slugBentrok", () => {
  it("menolak alamat yang sudah menjadi rute", () => {
    for (const dipakai of SLUG_TERPAKAI) assert.equal(slugBentrok(dipakai), true, dipakai);
  });

  it("membandingkan bentuk yang sudah dibakukan, bukan yang mentah", () => {
    assert.equal(slugBentrok("Katalog"), true);
    assert.equal(slugBentrok(" ADMIN "), true);
  });

  it("meloloskan alamat yang memang bebas", () => {
    assert.equal(slugBentrok("kebijakan-privasi"), false);
    assert.equal(slugBentrok("katalog-kami"), false);
  });
});

describe("normalizeLaman", () => {
  it("mengisi bawaan untuk halaman yang baru separuh jadi", () => {
    const p = normalizeLaman({ title: "Disclaimer" });
    assert.equal(p.slug, "");
    assert.equal(p.status, "published");
    // Tampil di footer adalah bawaan: halaman yang dibuat lalu tidak muncul di
    // mana pun adalah kegagalan paling mudah dilakukan di fitur ini.
    assert.equal(p.showInFooter, true);
    assert.equal(p.footerSlot, "legal");
    assert.equal(p.noindex, false);
  });

  it("menghormati saklar footer yang sengaja dimatikan", () => {
    assert.equal(normalizeLaman({ showInFooter: false }).showInFooter, false);
    assert.equal(normalizeLaman({ showInFooter: "false" }).showInFooter, false);
  });

  it("letak footer yang tidak dikenal jatuh ke bilah bawah", () => {
    assert.equal(normalizeLaman({ footerSlot: "menu" }).footerSlot, "menu");
    assert.equal(normalizeLaman({ footerSlot: "sembarang" }).footerSlot, "legal");
  });

  it("membakukan slug yang disunting tangan lewat SSH", () => {
    assert.equal(normalizeLaman({ slug: "Kebijakan Privasi" }).slug, "kebijakan-privasi");
  });

  it("memotong pada batas panjang", () => {
    const p = normalizeLaman({
      title: "J".repeat(300),
      excerpt: "R".repeat(500),
      body: "B".repeat(BATAS_LAMAN.isi + 500),
    });
    assert.equal(p.title.length, BATAS_LAMAN.judul);
    assert.equal(p.excerpt.length, BATAS_LAMAN.ringkas);
    assert.equal(p.body.length, BATAS_LAMAN.isi);
  });

  it("idempoten — menjalankannya dua kali menghasilkan yang sama", () => {
    const sekali = normalizeLaman({ title: " Tentang ", slug: "Tentang Kami", footerSlot: "menu" });
    assert.deepEqual(normalizeLaman(sekali), sekali);
  });
});

describe("tautanFooter", () => {
  const buat = (extra: Record<string, unknown>) =>
    normalizeLaman({ id: "x", title: "Halaman", slug: "halaman", ...extra });

  it("memisahkan menurut letaknya", () => {
    const hasil = tautanFooter([
      buat({ title: "Tentang", slug: "tentang", footerSlot: "menu" }),
      buat({ title: "Privasi", slug: "privasi", footerSlot: "legal" }),
    ]);
    assert.deepEqual(hasil.menu, [{ label: "Tentang", href: "/tentang" }]);
    assert.deepEqual(hasil.legal, [{ label: "Privasi", href: "/privasi" }]);
  });

  it("halaman draf tidak pernah tampil, sekalipun saklarnya menyala", () => {
    const hasil = tautanFooter([buat({ status: "draft" })]);
    assert.deepEqual(hasil, { menu: [], legal: [] });
  });

  it("halaman terjadwal baru tampil setelah waktunya tiba", () => {
    const besok = new Date(Date.now() + 86400000).toISOString();
    const daftar = [buat({ publishAt: besok })];
    assert.equal(tautanFooter(daftar).legal.length, 0);
    assert.equal(tautanFooter(daftar, Date.parse(besok) + 1000).legal.length, 1);
  });

  it("saklar yang dimatikan mengeluarkannya dari footer, bukan dari situs", () => {
    assert.deepEqual(tautanFooter([buat({ showInFooter: false })]), { menu: [], legal: [] });
  });

  it("label pendek menang atas judul", () => {
    const hasil = tautanFooter([buat({ title: "Kebijakan Privasi", footerLabel: "Privasi" })]);
    assert.equal(hasil.legal[0].label, "Privasi");
  });

  it("halaman tanpa slug tidak diumumkan — alamatnya belum ada", () => {
    assert.deepEqual(tautanFooter([buat({ slug: "" })]), { menu: [], legal: [] });
  });

  it("isi yang bukan larik tidak membuatnya meledak", () => {
    assert.deepEqual(tautanFooter(null as any), { menu: [], legal: [] });
  });
});

describe("hrefLaman & labelFooter", () => {
  it("alamat halaman ada di akar situs", () => {
    assert.equal(hrefLaman({ slug: "kebijakan-privasi" }), "/kebijakan-privasi");
  });

  it("slug kosong tidak menghasilkan tautan ke beranda", () => {
    assert.equal(hrefLaman({ slug: "" }), "");
    assert.equal(hrefLaman(null), "");
  });

  it("label jatuh ke judul kalau label pendek kosong", () => {
    assert.equal(labelFooter({ title: "Disclaimer", footerLabel: "" }), "Disclaimer");
  });
});

describe("isiLaman", () => {
  it("mengganti penanda merek dan tahun", () => {
    assert.equal(isiLaman("© {tahun} {brand}", { brand: "EVKita", tahun: "2026" }), "© 2026 EVKita");
  });

  it("mengganti SEMUA kemunculan, bukan yang pertama saja", () => {
    assert.equal(isiLaman("{brand} dan {brand}", { brand: "X" }), "X dan X");
  });

  it("penanda yang tidak dikenal dibiarkan apa adanya", () => {
    assert.equal(isiLaman("{lain}", { brand: "X" }), "{lain}");
  });
});

describe("ringkasLaman", () => {
  it("memakai ringkasan yang ditulis, lengkap dengan penandanya terisi", () => {
    const teks = ringkasLaman({ excerpt: "Tentang {brand}." }, { brand: "EVKita" });
    assert.equal(teks, "Tentang EVKita.");
  });

  it("tanpa ringkasan, isi halaman dipakai tanpa penanda Markdown", () => {
    const teks = ringkasLaman(
      { excerpt: "", body: "## Judul\n\nIni **paragraf** dengan [tautan](https://a.id)." },
      {}
    );
    assert.equal(teks, "Judul Ini paragraf dengan tautan.");
  });

  it("dipotong pada batas deskripsi dan diberi elipsis", () => {
    const teks = ringkasLaman({ body: "kata ".repeat(200) }, {});
    assert.ok(teks.length <= BATAS_LAMAN.ringkas + 1, String(teks.length));
    assert.ok(teks.endsWith("…"));
  });
});

describe("lamanBawaan", () => {
  const bawaan = lamanBawaan();

  it("menyediakan empat halaman yang paling sering diminta", () => {
    assert.deepEqual(
      bawaan.map((p: any) => p.slug),
      ["tentang-kami", "kebijakan-privasi", "disclaimer", "syarat-ketentuan"]
    );
  });

  it("setiap slug bawaan lolos penyaring yang sama dengan slug buatan sendiri", () => {
    for (const p of bawaan) {
      assert.equal(slugLaman(p.slug), p.slug, p.slug);
      assert.equal(slugBentrok(p.slug), false, p.slug);
    }
  });

  it("semuanya tayang dan tampil di footer begitu dipasang", () => {
    for (const p of bawaan) {
      const n = normalizeLaman(p);
      assert.equal(n.status, "published", n.slug);
      assert.equal(n.showInFooter, true, n.slug);
    }
  });

  /* Isi bawaan menyebut nama situsnya lewat penanda, bukan lewat "EVKita" yang
     dipatok: tiap pemasangan punya nama sendiri. */
  it("menyebut merek lewat penanda, bukan nama yang dipatok", () => {
    const semua = bawaan.map((p: any) => `${p.body} ${p.excerpt}`).join("\n");
    assert.ok(semua.includes("{brand}"));
    assert.ok(!semua.includes("EVKita"));
  });
});
