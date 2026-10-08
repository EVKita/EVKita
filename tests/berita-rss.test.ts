import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFeed, gabungBerita, urlKunci, tanggalIso } from "../src/lib/berita-rss.js";
import { relevanBerita, judulBersih, SUMBER_BERITA } from "../src/lib/berita-sumber.js";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[BYD Rilis Mobil Listrik Baru]]></title>
    <link>https://contoh.test/byd-baru/</link>
    <pubDate>Sun, 20 Sep 2026 06:12:27 +0000</pubDate>
    <description><![CDATA[<p>Ringkasan berita <b>BYD</b> yang relevan.</p>]]></description>
  </item>
  <item>
    <title>Harga Bensin Naik</title>
    <link>https://contoh.test/bensin/</link>
    <pubDate>Sat, 19 Sep 2026 03:00:00 +0000</pubDate>
    <description>Bukan soal listrik.</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Tes Motor Listrik</title>
    <link href="https://contoh.test/tes-ev"/>
    <updated>2026-09-18T10:00:00Z</updated>
    <summary>Skuter listrik anyar meluncur.</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("membaca RSS 2.0, membuka CDATA, dan membuang tag", () => {
    const items = parseFeed(RSS);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "BYD Rilis Mobil Listrik Baru");
    assert.equal(items[0].link, "https://contoh.test/byd-baru/");
    assert.equal(items[0].date, "2026-09-20");
    assert.match(items[0].excerpt, /BYD/);
    assert.doesNotMatch(items[0].excerpt, /<b>|<p>/);
  });

  it("membaca Atom dengan tautan di atribut href", () => {
    const items = parseFeed(ATOM);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Tes Motor Listrik");
    assert.equal(items[0].link, "https://contoh.test/tes-ev");
    assert.equal(items[0].date, "2026-09-18");
  });

  it("membuang item tanpa judul atau tautan", () => {
    const items = parseFeed(`<rss><channel><item><title>Hanya judul</title></item></channel></rss>`);
    assert.equal(items.length, 0);
  });
});

describe("relevanBerita", () => {
  it("menerima kabar kendaraan listrik", () => {
    assert.equal(relevanBerita("BYD luncurkan mobil listrik baru"), true);
    assert.equal(relevanBerita("SPKLU baru di rest area"), true);
    assert.equal(relevanBerita("Motor listrik ini pakai baterai 3 kWh"), true);
    assert.equal(relevanBerita("Hyundai IONIQ 5 dapat pembaruan"), true);
  });

  it("menolak kabar yang jelas bukan soal listrik", () => {
    assert.equal(relevanBerita("Harga bensin naik bulan ini"), false);
    assert.equal(relevanBerita("Tips ganti oli mesin diesel"), false);
    assert.equal(relevanBerita(""), false);
  });
});

describe("sumber Kompas.com", () => {
  it("terdaftar dengan feed pencarian yang dibatasi ke kompas.com", () => {
    const kompas = SUMBER_BERITA.find((s: any) => s.id === "kompas");
    assert.ok(kompas);
    assert.equal(kompas.nama, "Kompas.com");
    assert.match(String(kompas.feed), /^https:\/\//);
    assert.match(String(kompas.feed), /kompas\.com/);
  });

  it("membuang akhiran ' - Kompas.com' dari judul Google News", () => {
    const kompas = SUMBER_BERITA.find((s: any) => s.id === "kompas");
    assert.equal(
      judulBersih(kompas, "Mobil Listrik Seharusnya Tetap Kena Ganjil Genap - Kompas.com"),
      "Mobil Listrik Seharusnya Tetap Kena Ganjil Genap"
    );
  });

  it("membiarkan judul sumber lain apa adanya", () => {
    const detik = SUMBER_BERITA.find((s: any) => s.id === "detikoto");
    assert.equal(judulBersih(detik, "BYD Rilis Mobil Listrik Baru"), "BYD Rilis Mobil Listrik Baru");
    assert.equal(judulBersih(undefined, "Judul apa adanya"), "Judul apa adanya");
  });
});

describe("gambar dan video dari isi feed", () => {
  const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Mobil Listrik Baru Meluncur</title>
    <link>https://contoh.test/ev-baru/</link>
    <pubDate>Mon, 05 Oct 2026 06:00:00 +0000</pubDate>
    <description><![CDATA[<p><img src="https://contoh.test/foto/mobil.jpg"/>Ringkasan.</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>]]></description>
  </item>
  <item>
    <title>Logo Situs Saja</title>
    <link>https://contoh.test/logo/</link>
    <pubDate>Mon, 05 Oct 2026 05:00:00 +0000</pubDate>
    <description><![CDATA[<p><img src="https://contoh.test/assets/logo.png"/>Bukan foto berita.</p>]]></description>
  </item>
</channel></rss>`;

  it("mengambil foto dari img di deskripsi dan video YouTube dari iframe", () => {
    const items = parseFeed(FEED);
    assert.equal(items[0].image, "https://contoh.test/foto/mobil.jpg");
    assert.match(items[0].video || "", /youtube\.com/);
  });

  it("membuang gambar hiasan seperti logo", () => {
    const items = parseFeed(FEED);
    assert.equal(items[1].image, "");
  });
});

describe("urlKunci", () => {
  it("menyamakan http/https, www, query, dan garis miring akhir", () => {
    assert.equal(urlKunci("https://www.Contoh.test/berita/?utm=1"), urlKunci("http://contoh.test/berita"));
  });
});

describe("tanggalIso", () => {
  it("mengubah tanggal feed jadi YYYY-MM-DD, kosong kalau tak terbaca", () => {
    assert.equal(tanggalIso("Sun, 20 Sep 2026 06:12:27 +0000"), "2026-09-20");
    assert.equal(tanggalIso(""), "");
    assert.equal(tanggalIso("bukan tanggal"), "");
  });
});

describe("gabungBerita", () => {
  it("membuang duplikat berdasarkan tautan dan mengurutkan dari terbaru", () => {
    const lama = [{ id: "lama", url: "https://a.test/1", date: "2026-09-10" }];
    const baru = [
      { id: "a", url: "https://a.test/1/", date: "2026-09-11" },
      { id: "b", url: "https://b.test/2", date: "2026-09-20" },
    ];
    const { daftar, ditambah } = gabungBerita(lama, baru, 30);
    assert.equal(ditambah, 1);
    assert.equal(daftar.length, 2);
    assert.equal(daftar[0].url, "https://b.test/2");
  });

  it("memotong pada batas maksimum", () => {
    const lama = Array.from({ length: 5 }, (_, i) => ({ url: `https://a.test/${i}`, date: `2026-09-0${i + 1}` }));
    const { daftar } = gabungBerita(lama, [], 3);
    assert.equal(daftar.length, 3);
  });

  it("tidak pernah membuang berita yang ditambahkan redaksi", () => {
    const manual = { url: "https://redaksi.test/lama", date: "2026-01-01", updatedBy: "Kevin" };
    const unggulan = { url: "https://a.test/unggul", date: "2026-01-02", featured: true };
    const rss = Array.from({ length: 10 }, (_, i) => ({ url: `https://rss.test/${i}`, date: `2026-09-${10 + i}`, updatedBy: "" }));
    const { daftar } = gabungBerita([manual, unggulan], rss, 6);
    assert.ok(daftar.some((b) => b.url === manual.url));
    assert.ok(daftar.some((b) => b.url === unggulan.url));
    // Sisa jatah diisi berita RSS terbaru.
    assert.equal(daftar.length, 6);
    assert.ok(daftar.some((b) => b.url === "https://rss.test/9"));
    assert.ok(!daftar.some((b) => b.url === "https://rss.test/0"));
  });

  it("berita RSS tetap kebagian minimal separuh jatah walau redaksi menyimpan banyak", () => {
    const manual = Array.from({ length: 8 }, (_, i) => ({ url: `https://redaksi.test/${i}`, date: "2026-01-01", updatedBy: "Ed" }));
    const rss = Array.from({ length: 10 }, (_, i) => ({ url: `https://rss.test/${i}`, date: `2026-09-${10 + i}` }));
    const { daftar } = gabungBerita(manual, rss, 6);
    assert.equal(daftar.filter((b) => b.url.startsWith("https://rss.test/")).length, 3);
    assert.equal(daftar.filter((b) => b.url.startsWith("https://redaksi.test/")).length, 8);
  });
});
