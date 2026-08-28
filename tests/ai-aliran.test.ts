import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSseParser, jsonData } from "../src/lib/sse.js";
import { PembacaRiset } from "../src/lib/deepseek";
import { biayaDari, jamSibuk, perkiraanBiaya, MODEL_BAWAAN } from "../src/lib/ai-biaya.js";
import { tanggalWib } from "../src/lib/ai-jobs";

/**
 * Aliran peristiwa DeepSeek, linimasa yang dibangun darinya, dan biayanya.
 *
 * Seluruhnya diuji tanpa jaringan dan tanpa kunci API: peristiwanya dibuat
 * sendiri di sini. Itu bukan kompromi — justru satu-satunya cara menguji
 * kasus yang sulit ditemui secara alami, seperti aliran yang terputus di
 * tengah JSON atau jawaban yang terpotong karena kehabisan token.
 */

function sse(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("pengurai SSE", () => {
  it("membaca satu peristiwa utuh", () => {
    const p = createSseParser();
    const hasil = p.feed(sse("response.created", { a: 1 }));
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].event, "response.created");
    assert.deepEqual(jsonData(hasil[0]), { a: 1 });
  });

  it("menyatukan peristiwa yang terbelah di tengah antar potongan", () => {
    const p = createSseParser();
    const utuh = sse("response.output_text.delta", { delta: "halo" });
    const belah = Math.floor(utuh.length / 2);

    assert.deepEqual(p.feed(utuh.slice(0, belah)), []);
    const hasil = p.feed(utuh.slice(belah));
    assert.equal(hasil.length, 1);
    assert.deepEqual(jsonData(hasil[0]), { delta: "halo" });
  });

  it("melewati komentar keep-alive tanpa menghasilkan peristiwa", () => {
    const p = createSseParser();
    assert.deepEqual(p.feed(": keep-alive\n\n: keep-alive\n\n"), []);
    // Dan aliran sesudahnya tetap terbaca normal.
    assert.equal(p.feed(sse("response.created", {})).length, 1);
  });

  it("menerima pemisah baris CRLF", () => {
    const p = createSseParser();
    const hasil = p.feed('event: x\r\ndata: {"n":1}\r\n\r\n');
    assert.equal(hasil.length, 1);
    assert.deepEqual(jsonData(hasil[0]), { n: 1 });
  });

  it("membuang tepat satu spasi sesudah titik dua, bukan semuanya", () => {
    const p = createSseParser();
    const hasil = p.feed("event: x\ndata:  dua spasi\n\n");
    assert.equal(hasil[0].data, " dua spasi");
  });

  it("beberapa peristiwa dalam satu potongan terbaca semua", () => {
    const p = createSseParser();
    const hasil = p.feed(sse("a", {}) + sse("b", {}) + sse("c", {}));
    assert.deepEqual(hasil.map((h) => h.event), ["a", "b", "c"]);
  });

  it("data yang bukan JSON menghasilkan null, bukan pengecualian", () => {
    const p = createSseParser();
    const hasil = p.feed("event: x\ndata: bukan json\n\n");
    assert.equal(jsonData(hasil[0]), null);
  });
});

/* ---------- Linimasa ---------- */

function aliranBerhasil(hasilJson: any) {
  return [
    ["response.created", {}],
    ["response.output_item.added", { item: { id: "r1", type: "reasoning" } }],
    ["response.reasoning_text.delta", { item_id: "r1", delta: "Perlu harga OTR Jakarta." }],
    ["response.reasoning_text.done", { item_id: "r1" }],
    ["response.output_item.added", { item: { id: "w1", type: "web_search_call" } }],
    ["response.web_search_call.searching", { item_id: "w1" }],
    ["response.web_search_call.completed", { item_id: "w1" }],
    [
      "response.output_item.done",
      { item: { id: "w1", type: "web_search_call", action: { type: "search", query: "harga Ioniq 5 2026" } } },
    ],
    ["response.output_item.added", { item: { id: "w2", type: "web_search_call" } }],
    [
      "response.output_item.done",
      { item: { id: "w2", type: "web_search_call", action: { type: "open_page", url: "https://hyundai.co.id/ioniq-5" } } },
    ],
    ["response.output_item.added", { item: { id: "m1", type: "message" } }],
    ["response.output_text.delta", { item_id: "m1", delta: JSON.stringify(hasilJson) }],
    [
      "response.completed",
      { response: { usage: { input_tokens: 120_000, input_tokens_details: { cached_tokens: 90_000 }, output_tokens: 8_000 } } },
    ],
  ] as [string, any][];
}

function jalankan(peristiwa: [string, any][]): PembacaRiset {
  const p = new PembacaRiset();
  for (const [nama, data] of peristiwa) p.terima(nama, data);
  return p;
}

describe("linimasa riset", () => {
  it("merangkai langkah sesuai urutan kejadiannya", () => {
    const p = jalankan(aliranBerhasil({ field: {} }));
    assert.deepEqual(p.langkah.map((l) => l.jenis), ["mulai", "pikir", "cari", "buka", "susun"]);
  });

  it("menampilkan apa yang dicari dan halaman apa yang dibuka", () => {
    const p = jalankan(aliranBerhasil({ field: {} }));
    const cari = p.langkah.find((l) => l.jenis === "cari");
    const buka = p.langkah.find((l) => l.jenis === "buka");
    assert.equal(cari?.teks, "harga Ioniq 5 2026");
    assert.equal(buka?.teks, "https://hyundai.co.id/ioniq-5");
  });

  it("langkah pencarian berubah dari jalan ke selesai", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "w1", type: "web_search_call" } });
    assert.equal(p.langkah[0].status, "jalan");
    p.terima("response.web_search_call.completed", { item_id: "w1" });
    assert.equal(p.langkah[0].status, "selesai");
  });

  it("kutipan pemikiran dirangkai dari potongan dan dipotong panjangnya", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "r1", type: "reasoning" } });
    for (let i = 0; i < 60; i++) {
      p.terima("response.reasoning_text.delta", { item_id: "r1", delta: "kalimat panjang " });
    }
    const pikir = p.langkah.find((l) => l.jenis === "pikir")!;
    assert.equal(pikir.teks.length <= 400, true);
    assert.equal(pikir.teks.endsWith("…"), true);
  });

  it("mengambil hasil dan pemakaian token saat selesai", () => {
    const isi = { ringkasan: "ok", peringatan: [], field: { rangeKm: { nilai: 481 } } };
    const p = jalankan(aliranBerhasil(isi));
    assert.equal(p.selesai, true);
    assert.equal(p.errorKey, "");
    assert.deepEqual(p.hasil, isi);
    assert.equal(p.usage.output_tokens, 8_000);
  });

  it("seluruh langkah ditandai selesai begitu jawabannya lengkap", () => {
    const p = jalankan(aliranBerhasil({ field: {} }));
    assert.equal(p.langkah.every((l) => l.status === "selesai"), true);
  });

  it("membaca hasil dari objek response kalau delta teksnya tidak pernah datang", () => {
    const p = new PembacaRiset();
    p.terima("response.completed", {
      response: {
        output: [
          { type: "reasoning", content: [{ type: "reasoning_text", text: "…" }] },
          { type: "message", content: [{ type: "output_text", text: '{"ringkasan":"dari response"}' }] },
        ],
      },
    });
    assert.equal(p.hasil.ringkasan, "dari response");
  });

  it("membuang pembungkus markdown kalau model tetap menambahkannya", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "m1", type: "message" } });
    p.terima("response.output_text.delta", { item_id: "m1", delta: '```json\n{"ringkasan":"x"}\n```' });
    p.terima("response.completed", { response: {} });
    assert.equal(p.hasil.ringkasan, "x");
  });

  it("jawaban yang terpotong DITOLAK, bukan diterima sebagiannya", () => {
    const p = new PembacaRiset();
    p.terima("response.incomplete", {
      response: { incomplete_details: { reason: "max_output_tokens" }, usage: { output_tokens: 16_000 } },
    });
    assert.equal(p.errorKey, "err.ai.jawabanTerpotong");
    assert.equal(p.hasil, null);
  });

  it("penyaringan konten dilaporkan sebagai penolakan, bukan kerusakan", () => {
    const p = new PembacaRiset();
    p.terima("response.incomplete", { response: { incomplete_details: { reason: "content_filter" } } });
    assert.equal(p.errorKey, "err.ai.ditolak");
  });

  it("jawaban yang bukan JSON dilaporkan sebagai tidak terbaca", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "m1", type: "message" } });
    p.terima("response.output_text.delta", { item_id: "m1", delta: "maaf, saya tidak menemukan apa pun" });
    p.terima("response.completed", { response: {} });
    assert.equal(p.errorKey, "err.ai.jawabanTidakTerbaca");
  });

  it("jawaban bukan-JSON disimpan mentah, supaya bisa dirapikan panggilan kedua", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "m1", type: "message" } });
    p.terima("response.output_text.delta", {
      item_id: "m1",
      delta: "Harga OTR Jakarta Rp 415 juta, baterai 50,6 kWh.",
    });
    p.terima("response.completed", { response: {} });

    assert.equal(p.errorKey, "err.ai.jawabanTidakTerbaca");
    assert.match(p.mentah, /415 juta/);
  });

  it("tidak menjawab sama sekali dibedakan dari menjawab tapi bukan JSON", () => {
    const p = new PembacaRiset();
    p.terima("response.created", {});
    p.terima("response.completed", { response: {} });

    assert.equal(p.errorKey, "err.ai.tanpaJawaban");
    assert.equal(p.mentah, "");
    // Jejak peristiwa jadi satu-satunya bahan telusur saat tidak ada teks.
    assert.deepEqual(p.jejak, ["response.created", "response.completed"]);
  });

  it("teks akhir yang datang sekaligus lewat .done ikut terbaca", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "m1", type: "message" } });
    p.terima("response.output_text.done", { item_id: "m1", text: '{"ringkasan":"dari done"}' });
    p.terima("response.completed", { response: {} });
    assert.equal(p.hasil.ringkasan, "dari done");
  });

  it("delta yang lebih panjang menang atas .done yang lebih pendek", () => {
    const p = new PembacaRiset();
    p.terima("response.output_item.added", { item: { id: "m1", type: "message" } });
    p.terima("response.output_text.delta", { item_id: "m1", delta: '{"ringkasan":"dari delta yang panjang"}' });
    p.terima("response.output_text.done", { item_id: "m1", text: "{}" });
    p.terima("response.completed", { response: {} });
    assert.equal(p.hasil.ringkasan, "dari delta yang panjang");
  });

  it("peristiwa yang tidak dikenal diabaikan tanpa merusak apa pun", () => {
    const p = jalankan([
      ["response.created", {}],
      ["response.sesuatu.yang.baru", { apa: "saja" }],
      ["response.output_item.added", { item: { id: "w1", type: "web_search_call" } }],
    ]);
    assert.deepEqual(p.langkah.map((l) => l.jenis), ["mulai", "cari"]);
  });
});

/* ---------- Biaya ---------- */

describe("jam sibuk DeepSeek", () => {
  it("Senin 02.00 UTC — pukul 09.00 WIB — masuk jam sibuk", () => {
    assert.equal(jamSibuk(new Date("2026-08-31T02:00:00Z")), true);
  });

  it("Senin 05.00 UTC — pukul 12.00 WIB, jam istirahat — tarif sepi", () => {
    assert.equal(jamSibuk(new Date("2026-08-31T05:00:00Z")), false);
  });

  it("Senin 11.00 UTC — pukul 18.00 WIB, lewat jam kerja — tarif sepi", () => {
    assert.equal(jamSibuk(new Date("2026-08-31T11:00:00Z")), false);
  });

  it("akhir pekan selalu tarif sepi", () => {
    assert.equal(jamSibuk(new Date("2026-08-29T02:00:00Z")), false); // Sabtu
    assert.equal(jamSibuk(new Date("2026-08-30T07:00:00Z")), false); // Minggu
  });
});

describe("biaya riset", () => {
  const usage = {
    input_tokens: 400_000,
    input_tokens_details: { cached_tokens: 300_000 },
    output_tokens: 20_000,
  };

  it("token yang kena cache dihitung jauh lebih murah", () => {
    const semuaBaru = biayaDari(
      { input_tokens: 400_000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20_000 },
      "deepseek-v4-flash",
      new Date("2026-08-31T02:00:00Z")
    );
    const sebagianCache = biayaDari(usage, "deepseek-v4-flash", new Date("2026-08-31T02:00:00Z"));
    assert.equal(sebagianCache.usd < semuaBaru.usd, true);
  });

  it("tarif sepi tepat separuh tarif sibuk", () => {
    const sibuk = biayaDari(usage, "deepseek-v4-flash", new Date("2026-08-31T02:00:00Z"));
    const sepi = biayaDari(usage, "deepseek-v4-flash", new Date("2026-08-31T20:00:00Z"));
    assert.equal(Math.abs(sibuk.usd / 2 - sepi.usd) < 1e-9, true);
  });

  it("pro tepat tiga kali lipat flash untuk token yang tidak kena cache", () => {
    const saat = new Date("2026-08-31T02:00:00Z");
    const tanpaCache = {
      input_tokens: 400_000,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 20_000,
    };
    const flash = biayaDari(tanpaCache, "deepseek-v4-flash", saat);
    const pro = biayaDari(tanpaCache, "deepseek-v4-pro", saat);
    assert.equal(Math.abs(pro.usd / flash.usd - 3) < 1e-9, true);
  });

  it("tarif cache hit pro TIDAK tepat tiga kali flash — itu memang harga DeepSeek", () => {
    // $0,044 berbanding $0,014 ≈ 3,14×. Diuji supaya perbandingan yang tepat
    // tiga kali di atas tidak diam-diam digeneralisasi ke seluruh tarif kalau
    // suatu hari angkanya diperbarui.
    const saat = new Date("2026-08-31T02:00:00Z");
    const cacheSaja = {
      input_tokens: 100_000,
      input_tokens_details: { cached_tokens: 100_000 },
      output_tokens: 0,
    };
    const flash = biayaDari(cacheSaja, "deepseek-v4-flash", saat);
    const pro = biayaDari(cacheSaja, "deepseek-v4-pro", saat);
    assert.equal(Math.abs(pro.usd / flash.usd - 3) > 0.1, true);
  });

  it("cached_tokens yang lebih besar dari input tidak menghasilkan biaya negatif", () => {
    const aneh = biayaDari(
      { input_tokens: 1_000, input_tokens_details: { cached_tokens: 999_999 }, output_tokens: 0 },
      "deepseek-v4-flash",
      new Date("2026-08-31T02:00:00Z")
    );
    assert.equal(aneh.usd >= 0, true);
  });

  it("usage kosong berarti nol, bukan NaN", () => {
    const nol = biayaDari({}, MODEL_BAWAAN, new Date("2026-08-31T02:00:00Z"));
    assert.equal(nol.usd, 0);
    assert.equal(nol.rupiah, 0);
  });

  it("perkiraan cek harga jauh lebih murah daripada riset lengkap", () => {
    const saat = new Date("2026-08-31T02:00:00Z");
    assert.equal(
      perkiraanBiaya("harga", MODEL_BAWAAN, saat).rupiah < perkiraanBiaya("lengkap", MODEL_BAWAAN, saat).rupiah,
      true
    );
  });

  it("perkiraan riset lengkap dengan flash masih di bawah dua ribu rupiah", () => {
    const { rupiah } = perkiraanBiaya("lengkap", "deepseek-v4-flash", new Date("2026-08-31T02:00:00Z"));
    assert.equal(rupiah > 0 && rupiah < 2000, true);
  });
});

describe("tanggal kuota", () => {
  it("dihitung menurut WIB, bukan UTC", () => {
    // 17.30 UTC adalah pukul 00.30 keesokan harinya di Jakarta.
    assert.equal(tanggalWib(new Date("2026-08-28T17:30:00Z")), "2026-08-29");
    // Dan 16.30 UTC masih hari yang sama.
    assert.equal(tanggalWib(new Date("2026-08-28T16:30:00Z")), "2026-08-28");
  });
});
