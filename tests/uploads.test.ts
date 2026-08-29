import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { urlDipakai, urlTerpakai, namaBerkasAman } from "../src/lib/uploads";

/**
 * Penjaga penghapusan berkas unggahan.
 *
 * Kesalahan di sini tidak simetris. Salah menganggap sebuah berkas TERPAKAI
 * hanya berarti satu berkas tetap tersimpan — beberapa kilobita yang tidak
 * merugikan siapa pun. Salah menganggapnya YATIM berarti gambar hilang dari
 * halaman yang sedang tayang, dan berkas unggahan tidak ikut ke dalam cadangan
 * (`data/backups/` hanya menyimpan content.json), jadi tidak ada jalan pulang.
 *
 * Karena itu setiap tempat yang bisa merujuk sebuah gambar punya ujinya
 * sendiri di bawah ini.
 */

const U = "/api/uploads/abc123.webp";

const dok = (extra: any = {}) => ({
  site: {},
  cars: [],
  motors: [],
  spklu: [],
  bengkel: [],
  berita: [],
  media: {},
  ...extra,
});

describe("namaBerkasAman", () => {
  it("menerima nama berkas unggahan yang wajar", () => {
    assert.equal(namaBerkasAman("abc123.webp"), true);
    assert.equal(namaBerkasAman("foto-1_2.JPG"), true);
  });

  it("menolak apa pun yang bisa keluar dari direktorinya", () => {
    for (const buruk of ["../rahasia.json", "a/b.png", "/etc/passwd", "..", ".env", "", null, undefined]) {
      assert.equal(namaBerkasAman(buruk), false, String(buruk));
    }
  });
});

describe("urlDipakai", () => {
  it("gambar utama kendaraan dihitung terpakai", () => {
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", image: U }] }), U), true);
  });

  it("galeri kendaraan ikut dihitung", () => {
    assert.equal(urlDipakai(dok({ motors: [{ id: "m", gallery: ["/lain.png", U] }] }), U), true);
  });

  it("gambar berita dihitung terpakai", () => {
    assert.equal(urlDipakai(dok({ berita: [{ id: "n", image: U }] }), U), true);
  });

  it("logo, hero, gambar OG, dan latar dari Pengaturan Situs dihitung terpakai", () => {
    for (const field of ["logoImage", "heroImage", "seoOgImage", "bgImage"]) {
      assert.equal(urlDipakai(dok({ site: { [field]: U } }), U), true, field);
    }
  });

  it("kendaraan berstatus draf tetap menghitung gambarnya", () => {
    // Draf belum tayang, tapi ia pekerjaan yang sedang berjalan — menghapus
    // gambarnya berarti merusak sesuatu yang justru sedang dikerjakan.
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", status: "draft", image: U }] }), U), true);
  });

  it("metadata media saja sudah cukup untuk menahannya", () => {
    assert.equal(urlDipakai(dok({ media: { [U]: { alt: "Tampak depan" } } }), U), true);
  });

  it("foto profil dihitung terpakai walau tidak ada di content.json", () => {
    // Tanpa ini setiap foto profil jadi berkas yatim, dan wajah orang
    // menghilang dari panelnya sendiri.
    assert.equal(urlDipakai(dok(), U), false);
    assert.equal(urlDipakai(dok(), U, [U]), true);
  });

  it("penanda cache di belakang alamat tidak membuatnya dianggap berkas lain", () => {
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", image: `${U}?v=2` }] }), U), true);
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", image: U }] }), `${U}?v=2`), true);
  });

  it("berkas yang tidak dirujuk siapa pun memang yatim", () => {
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", image: "/api/uploads/lain.webp" }] }), U), false);
  });

  it("alamat kosong tidak pernah dianggap terpakai", () => {
    assert.equal(urlDipakai(dok({ cars: [{ id: "a", image: "" }] }), ""), false);
  });

  it("dokumen rusak tidak membuatnya meledak", () => {
    assert.equal(urlDipakai(null, U), false);
    assert.equal(urlDipakai({ cars: "bukan larik", media: 7 }, U), false);
  });
});

describe("urlTerpakai", () => {
  it("mengumpulkan dari seluruh koleksi sekaligus", () => {
    const set = urlTerpakai(
      dok({
        site: { logoImage: "/logo.png" },
        cars: [{ id: "a", image: "/a.png", gallery: ["/g1.png"] }],
        spklu: [{ id: "s" }],
        berita: [{ id: "n", image: "/n.png" }],
        media: { "/meta.png": {} },
      }),
      ["/avatar.png"]
    );
    assert.deepEqual([...set].sort(), ["/a.png", "/avatar.png", "/g1.png", "/logo.png", "/meta.png", "/n.png"]);
  });
});
