import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFeed, gabungBerita, urlKunci, tanggalIso } from "../src/lib/berita-rss.js";
import { relevanBerita } from "../src/lib/berita-sumber.js";

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
});
