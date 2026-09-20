import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ekstrakGambar, ekstrakVideo, ekstrakMedia } from "../src/lib/media-ambil.js";

const HALAMAN = `<!doctype html><html><head>
  <meta property="og:image" content="/media/atto3-utama.jpg" />
  <meta name="twitter:image" content="https://cdn.contoh.test/atto3-twitter.jpg" />
  <script type="application/ld+json">{"@type":"Car","image":["https://cdn.contoh.test/atto3-ld.jpg"]}</script>
</head><body>
  <img src="/aset/logo-byd.svg" />
  <img src="/media/atto3-interior.jpg" />
  <img srcset="/media/atto3-kecil.jpg 400w, /media/atto3-besar.jpg 1600w" />
  <img src="data:image/png;base64,AAAA" />
  <iframe src="https://www.youtube.com/embed/abcd1234"></iframe>
  <a href="https://youtu.be/xyz987">Video lain</a>
  <a href="https://contoh.test/tentang">Tentang</a>
</body></html>`;

describe("ekstrakGambar", () => {
  it("mendahulukan og:image, lalu twitter, JSON-LD, dan img terbesar", () => {
    const g = ekstrakGambar(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.equal(g[0], "https://www.byd.com/media/atto3-utama.jpg");
    assert.ok(g.includes("https://cdn.contoh.test/atto3-twitter.jpg"));
    assert.ok(g.includes("https://cdn.contoh.test/atto3-ld.jpg"));
    assert.ok(g.includes("https://www.byd.com/media/atto3-besar.jpg"));
  });

  it("membuang logo, svg, dan data URI", () => {
    const g = ekstrakGambar(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.ok(!g.some((u) => /logo|\.svg|^data:/i.test(u)));
    assert.ok(!g.includes("https://www.byd.com/media/atto3-kecil.jpg"), "srcset terbesar yang dipakai");
  });

  it("mengubah alamat relatif jadi absolut", () => {
    const g = ekstrakGambar(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.ok(g.every((u) => u.startsWith("https://")));
  });
});

describe("ekstrakVideo", () => {
  it("mengambil embed YouTube dan tautan pendek", () => {
    const v = ekstrakVideo(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.ok(v.includes("https://www.youtube.com/embed/abcd1234"));
    assert.ok(v.includes("https://youtu.be/xyz987"));
  });

  it("tidak membawa tautan biasa", () => {
    const v = ekstrakVideo(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.ok(!v.includes("https://contoh.test/tentang"));
  });
});

describe("ekstrakMedia", () => {
  it("mengembalikan gambar dan video sekaligus", () => {
    const m = ekstrakMedia(HALAMAN, "https://www.byd.com/id/car/atto3");
    assert.ok(m.gambar.length >= 3);
    assert.ok(m.video.length >= 1);
  });

  it("halaman kosong menghasilkan daftar kosong", () => {
    const m = ekstrakMedia("<html><body>Halo</body></html>", "https://contoh.test/");
    assert.deepEqual(m, { gambar: [], video: [] });
  });
});
