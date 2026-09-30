import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { avgOf, rankVotes, saringKendaraan, voteRowHtml } from "../src/lib/vote-html.js";
import { bacaVotes, sahVid, terapkanVote, totalSuara } from "../src/lib/vote-store.js";

/**
 * Inti VoteKita: rata-rata, urutan peringkat, dan delta suara.
 *
 * Semuanya luring — tidak ada yang menyentuh `data/votes.json` maupun
 * jaringan. `simpanVote()` sengaja tidak diuji di sini: ia menulis berkas,
 * dan pengujian tidak boleh meninggalkan berkas di repo.
 */

/* Terjemah palsu yang meniru `t` asli: kunci + nilai peubahnya. */
const tPalsu = (kunci, vars) =>
  vars === undefined ? kunci : `${kunci}(${Object.values(vars).join(",")})`;

describe("avgOf", () => {
  it("tanpa suara berarti nol, bukan NaN", () => {
    assert.equal(avgOf({ s: 0, v: 0 }), 0);
    assert.equal(avgOf(undefined), 0);
    assert.equal(avgOf(null), 0);
    assert.equal(avgOf({}), 0);
  });

  it("menghitung jumlah dibagi suara", () => {
    assert.equal(avgOf({ s: 9, v: 2 }), 4.5);
    assert.equal(avgOf({ s: 5, v: 1 }), 5);
  });
});

describe("rankVotes", () => {
  const armada = [
    { id: "a", kind: "mobil", brand: "Merek", name: "A" },
    { id: "b", kind: "mobil", brand: "Merek", name: "B" },
    { id: "c", kind: "mobil", brand: "Merek", name: "C" },
    { id: "d", kind: "mobil", brand: "Merek", name: "D" },
  ];

  it("suara terbanyak dulu — yang paling banyak dipilih di atas", () => {
    const agg = { a: { s: 9, v: 2 }, b: { s: 5, v: 1 } };
    const urut = rankVotes(armada, agg, 10).map((r) => r.v.id);
    assert.deepEqual(urut, ["a", "b", "c", "d"]);
  });

  it("seri suara dimenangkan oleh rata-rata tertinggi", () => {
    const agg = { a: { s: 4, v: 1 }, b: { s: 5, v: 1 } };
    const urut = rankVotes(armada, agg, 10).map((r) => r.v.id);
    assert.equal(urut[0], "b");
    assert.equal(urut[1], "a");
  });

  it("seri penuh mempertahankan urutan asal dan limit dipatuhi", () => {
    const urut = rankVotes(armada, {}, 10).map((r) => r.v.id);
    assert.deepEqual(urut, ["a", "b", "c", "d"]);
    assert.equal(rankVotes(armada, {}, 2).length, 2);
    assert.deepEqual(rankVotes(armada, {}, 2).map((r) => r.v.id), ["a", "b"]);
  });

  it("mengembalikan rata-rata dan hitungan tiap butir", () => {
    const [satu] = rankVotes([armada[0]], { a: { s: 9, v: 2 } }, 10);
    assert.equal(satu.avg, 4.5);
    assert.equal(satu.votes, 2);
  });
});

describe("terapkanVote", () => {
  it("suara baru menambah jumlah dan hitungan", () => {
    assert.deepEqual(terapkanVote(undefined, 5, 0), { s: 5, v: 1 });
  });

  it("suara ulang hanya menggeser jumlah, hitungan tetap", () => {
    assert.deepEqual(terapkanVote({ s: 8, v: 2 }, 5, 4), { s: 9, v: 2 });
  });

  it("jumlah negatif dijepit ke nol, bukan dibiarkan minus", () => {
    assert.deepEqual(terapkanVote({ s: 1, v: 1 }, 1, 5), { s: 0, v: 1 });
  });

  it("tanpa catatan dan ada suara lama berarti hapus (null)", () => {
    assert.equal(terapkanVote(undefined, 3, 4), null);
  });

  it("tidak mengubah catatan asal (murni)", () => {
    const asal = { s: 8, v: 2 };
    terapkanVote(asal, 5, 4);
    assert.deepEqual(asal, { s: 8, v: 2 });
  });
});

describe("saringKendaraan", () => {
  const peringkat = [
    { v: { id: "byd-atto-3", brand: "BYD", name: "Atto 3" }, avg: 5, votes: 2 },
    { v: { id: "wuling-cloud", brand: "Wuling", name: "Cloud EV" }, avg: 5, votes: 1 },
    { v: { id: "alva-cervo", brand: "Alva", name: "Cervo" }, avg: 5, votes: 1 },
  ];

  it("kueri kosong mengembalikan daftar apa adanya", () => {
    assert.equal(saringKendaraan(peringkat, "").length, 3);
    assert.equal(saringKendaraan(peringkat, "   ").length, 3);
  });

  it("merek yang diketik langsung ketemu", () => {
    const hasil = saringKendaraan(peringkat, "byd");
    assert.deepEqual(hasil.map((r) => r.v.id), ["byd-atto-3"]);
  });

  it("tidak peka huruf besar dan mendukung banyak kata", () => {
    assert.equal(saringKendaraan(peringkat, "WULING cloud").length, 1);
    assert.equal(saringKendaraan(peringkat, "tesla").length, 0);
  });
});

describe("sahVid dan totalSuara", () => {
  it("vid acak sah, yang pendek atau berspasi tidak", () => {
    assert.equal(sahVid("abcdef1234567890"), true);
    assert.equal(sahVid("pendek"), false);
    assert.equal(sahVid("ada spasi di sini 123"), false);
    assert.equal(sahVid(""), false);
  });

  it("menjumlahkan seluruh suara sejenis", () => {
    assert.equal(totalSuara({ a: { s: 9, v: 2 }, b: { s: 5, v: 1 } }), 3);
    assert.equal(totalSuara({}), 0);
    assert.equal(totalSuara(undefined), 0);
  });
});
describe("bacaVotes", () => {
  it("selalu berbentuk { cars, motors } walau berkasnya tidak ada", () => {
    const semua = bacaVotes();
    assert.equal(typeof semua.cars, "object");
    assert.equal(typeof semua.motors, "object");
  });
});

describe("voteRowHtml", () => {
  const v = { id: "byd-atto-3", kind: "mobil", brand: "BYD", name: "Atto 3", image: "" };

  it("memuat kontrak data: kind+id baris, lima tombol, baris jumlah", () => {
    const html = voteRowHtml(v, { s: 9, v: 2 }, { t: tPalsu, href: "/mobil/byd-atto-3", lang: "id", rank: 1 });
    assert.match(html, /data-vote-kind="mobil"/);
    assert.match(html, /data-vote-id="byd-atto-3"/);
    assert.equal((html.match(/data-vote-stars="/g) || []).length, 5);
    assert.match(html, /class="vote-count"/);
    assert.match(html, /class="vote-rank">1</);
  });

  it("tanpa suara menampilkan kalimat belum-ada-suara", () => {
    const html = voteRowHtml(v, undefined, { t: tPalsu, lang: "id", rank: 2 });
    assert.match(html, /pub\.vote\.belum/);
  });

  it("tanpa foto memakai lencana huruf, suara sendiri ditandai", () => {
    const html = voteRowHtml(v, { s: 5, v: 1 }, { t: tPalsu, lang: "id", myVote: 4 });
    assert.match(html, /vote-huruf/);
    assert.equal((html.match(/vote-btn on/g) || []).length, 4);
  });

  it("favorit sendiri memakai lencana, persen muncul bila ada total", () => {
    const html = voteRowHtml(v, { s: 9, v: 2 }, { t: tPalsu, lang: "id", favorit: true, totalSuara: 4 });
    assert.match(html, /vote-fav/);
    assert.match(html, /vote-bar/);
    assert.match(html, /vote-persen/);
  });

  it("tanpa total tidak ada bilah persen", () => {
    const html = voteRowHtml(v, { s: 9, v: 2 }, { t: tPalsu, lang: "id" });
    assert.doesNotMatch(html, /vote-bar/);
  });
});
