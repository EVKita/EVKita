import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMediaMap, mediaEntry, mediaAlt, altMapFor, MEDIA_LIMITS } from "../src/lib/media.js";
import { cardHTML } from "../src/lib/card-html.js";

/**
 * Metadata gambar — judul, teks alternatif, catatan — yang diisi lewat
 * Admin → Media.
 *
 * Yang dijaga di sini bukan tampilannya, melainkan dua hal yang diam-diam bisa
 * rusak: bentuk data yang masuk ke `content.json` (dokumen itu dikirim mentah
 * dari panel, jadi apa pun bisa sampai ke sana), dan janji bahwa alt yang
 * ditulis benar-benar keluar di markup kartu.
 */

describe("normalizeMediaMap", () => {
  it("merapikan spasi dan memotong nilai yang kelewat panjang", () => {
    const out = normalizeMediaMap({
      "/gambar/a.png": { alt: "  Mobil   putih \n di jalan  ", title: "A", note: "" },
      "/gambar/b.png": { alt: "x".repeat(MEDIA_LIMITS.alt + 50) },
    });
    assert.equal(out["/gambar/a.png"].alt, "Mobil putih di jalan");
    assert.equal(out["/gambar/a.png"].title, "A");
    assert.equal(out["/gambar/b.png"].alt.length, MEDIA_LIMITS.alt);
  });

  it("membuang entri yang seluruh isinya kosong", () => {
    // Kalau tidak, membuka-buka gambar di panel akan menambah baris permanen
    // di content.json untuk setiap gambar yang pernah dilihat.
    const out = normalizeMediaMap({
      "/gambar/a.png": { alt: "   ", title: "", note: "" },
      "/gambar/b.png": { alt: "ada isinya" },
    });
    assert.deepEqual(Object.keys(out), ["/gambar/b.png"]);
  });

  it("menolak bentuk yang bukan peta objek", () => {
    for (const jelek of [null, undefined, [], "teks", 7]) {
      assert.deepEqual(normalizeMediaMap(jelek as any), {});
    }
    assert.deepEqual(normalizeMediaMap({ "/a.png": "bukan objek" } as any), {});
    assert.deepEqual(normalizeMediaMap({ "   ": { alt: "tanpa alamat" } }), {});
  });

  it("hanya menyimpan field yang dikenal", () => {
    const out = normalizeMediaMap({ "/a.png": { alt: "halo", jahat: "<script>" } as any });
    assert.deepEqual(Object.keys(out["/a.png"]).sort(), ["alt", "note", "title"]);
  });
});

describe("pembacaan metadata", () => {
  it("selalu mengembalikan bentuk lengkap, juga untuk gambar yang belum punya entri", () => {
    assert.deepEqual(mediaEntry({}, "/a.png"), { title: "", alt: "", note: "" });
    assert.deepEqual(mediaEntry(null as any, ""), { title: "", alt: "", note: "" });
  });

  it("memakai cadangan saat alt belum ditulis", () => {
    const map = { "/a.png": { title: "", alt: "Foto depan BYD Atto 3", note: "" } };
    assert.equal(mediaAlt(map, "/a.png", "BYD Atto 3"), "Foto depan BYD Atto 3");
    assert.equal(mediaAlt(map, "/b.png", "BYD Dolphin"), "BYD Dolphin");
    assert.equal(mediaAlt({}, "/b.png"), "");
  });

  it("peta ringkas untuk browser hanya membawa gambar yang punya alt", () => {
    const map = { "/a.png": { alt: "Ada" }, "/b.png": { alt: "" } } as any;
    assert.deepEqual(altMapFor(map, ["/a.png", "/b.png", "/c.png"]), { "/a.png": "Ada" });
  });
});

describe("alt di kartu kendaraan", () => {
  const mobil = { id: "x", kind: "mobil", brand: "BYD", name: "Atto 3", image: "/gambar/x.png", variantNames: [] };

  it("memakai teks alternatif dari panel kalau ada", () => {
    const html = cardHTML(mobil, { media: { "/gambar/x.png": { alt: "BYD Atto 3 warna putih" } } });
    assert.match(html, /alt="BYD Atto 3 warna putih"/);
  });

  it("kembali ke merek + model kalau belum diisi", () => {
    assert.match(cardHTML(mobil, {}), /alt="BYD Atto 3"/);
  });

  it("meloloskan alt lewat esc() — alt datang dari isian bebas", () => {
    const html = cardHTML(mobil, { media: { "/gambar/x.png": { alt: '"><img onerror=alert(1)>' } } });
    // Yang berbahaya bukan teksnya, melainkan tanda kutip dan kurung sudut yang
    // masih utuh: itu yang bisa keluar dari atribut alt jadi elemen baru.
    assert.doesNotMatch(html, /<img onerror/);
    assert.match(html, /alt="&quot;&gt;&lt;img onerror=alert\(1\)&gt;"/);
  });
});
