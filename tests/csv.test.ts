import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, bacaTabel, tebakPemisah, tebakPemetaan, bakukan } from "../src/lib/csv.js";

/**
 * Pembaca CSV.
 *
 * Berkas yang akan sampai ke sini datang dari Excel dan Google Sheets orang
 * lain, bukan dari sistem ini — jadi yang harus dijaga bukan bentuk yang rapi
 * melainkan bentuk yang berantakan: titik koma sebagai pemisah, koma di dalam
 * alamat, tanda kutip di dalam nama, baris kosong di akhir berkas, dan BOM
 * yang ditempelkan Excel di awal.
 */

describe("tebakPemisah", () => {
  it("mengenali koma", () => {
    assert.equal(tebakPemisah("nama,area,daya"), ",");
  });

  it("mengenali titik koma — bentuk yang dipakai Excel berbahasa Indonesia", () => {
    // Di sana koma sudah dipakai sebagai pemisah desimal, jadi CSV-nya
    // memakai titik koma. Membacanya sebagai koma menghasilkan satu kolom
    // raksasa, yang terlihat seperti "impornya rusak".
    assert.equal(tebakPemisah("nama;area;daya"), ";");
  });

  it("mengenali tab", () => {
    assert.equal(tebakPemisah("nama\tarea\tdaya"), "\t");
  });

  it("koma di dalam tanda kutip tidak ikut dihitung", () => {
    assert.equal(tebakPemisah('nama;alamat;area\n"Jl. Sudirman, Jakarta";x;y'), ";");
  });

  it("satu kolom tanpa pemisah apa pun tetap terbaca sebagai koma", () => {
    assert.equal(tebakPemisah("nama"), ",");
  });
});

describe("parseCsv", () => {
  it("membaca tabel sederhana", () => {
    assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  });

  it("menghormati tanda kutip dan koma di dalamnya", () => {
    assert.deepEqual(parseCsv('nama,alamat\n"SPKLU Senayan","Jl. Asia Afrika, Jakarta"'), [
      ["nama", "alamat"],
      ["SPKLU Senayan", "Jl. Asia Afrika, Jakarta"],
    ]);
  });

  it("kutip ganda di dalam kutip berarti satu tanda kutip", () => {
    assert.deepEqual(parseCsv('nama\n"Bengkel ""Maju"" Jaya"'), [["nama"], ['Bengkel "Maju" Jaya']]);
  });

  it("baris baru di dalam sel tidak memutus barisnya", () => {
    assert.deepEqual(parseCsv('nama,catatan\nA,"baris satu\nbaris dua"'), [
      ["nama", "catatan"],
      ["A", "baris satu\nbaris dua"],
    ]);
  });

  it("CRLF dibaca sama seperti LF", () => {
    assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
  });

  it("BOM dari Excel tidak ikut jadi bagian judul kolom", () => {
    // Tanpa ini judul kolom pertama menjadi "﻿nama" dan tidak pernah
    // cocok dengan field mana pun — impornya jalan, tapi kolom pertamanya
    // selalu terlewat.
    const hasil = parseCsv("﻿nama,area\nA,B");
    assert.equal(hasil[0][0], "nama");
  });

  it("baris kosong di akhir berkas dibuang", () => {
    assert.deepEqual(parseCsv("a,b\n1,2\n\n\n"), [["a", "b"], ["1", "2"]]);
  });

  it("spasi di luar kutip dipangkas, di dalam kutip tidak", () => {
    assert.deepEqual(parseCsv('a,b\n  x  ,"  y  "'), [["a", "b"], ["x", "  y  "]]);
  });

  it("teks kosong menghasilkan daftar kosong", () => {
    assert.deepEqual(parseCsv(""), []);
    assert.deepEqual(parseCsv("   \n  "), []);
  });
});

describe("bacaTabel", () => {
  it("memisahkan kepala dari isi dan menyamakan panjang tiap baris", () => {
    const { header, rows } = bacaTabel("nama,area,daya\nA,Jakarta\nB,Bandung,50 kW");
    assert.deepEqual(header, ["nama", "area", "daya"]);
    assert.deepEqual(rows, [["A", "Jakarta", ""], ["B", "Bandung", "50 kW"]]);
  });

  it("kolom tanpa judul diberi nomor, bukan dibiarkan kosong", () => {
    const { header } = bacaTabel("nama,,daya\nA,B,C");
    assert.deepEqual(header, ["nama", "#2", "daya"]);
  });
});

describe("tebakPemetaan", () => {
  const defs = [
    { k: "name", l: "Nama SPKLU" },
    { k: "operator", l: "Operator" },
    { k: "area", l: "Area / Kota" },
    { k: "price", l: "Harga (Rupiah, angka)" },
  ];

  it("mencocokkan lewat nama kunci maupun labelnya", () => {
    assert.deepEqual(tebakPemetaan(["operator", "Area / Kota"], defs), ["operator", "area"]);
  });

  it("mengabaikan beda huruf besar, spasi, dan tanda baca", () => {
    assert.deepEqual(tebakPemetaan(["OPERATOR", "area/kota"], defs), ["operator", "area"]);
  });

  it("mencocokkan label tanpa keterangan dalam kurungnya", () => {
    assert.deepEqual(tebakPemetaan(["Harga"], defs), ["price"]);
  });

  it("kolom yang tidak dikenali dibiarkan kosong, bukan ditebak asal", () => {
    assert.deepEqual(tebakPemetaan(["entah apa"], defs), [""]);
  });

  it("judul kolom yang lebih pendek daripada labelnya tetap ketemu", () => {
    // Judul yang ditulis orang hampir selalu lebih pendek: "Nama" untuk
    // "Nama SPKLU", "Jenis" untuk "Jenis Bengkel". Tanpa ini kolom yang paling
    // sering ada di spreadsheet justru yang paling sering tidak terpetakan.
    assert.deepEqual(tebakPemetaan(["Nama"], defs), ["name"]);
  });

  it("kecocokan persis menang atas kecocokan awalan", () => {
    const dua = [{ k: "name", l: "Nama SPKLU" }, { k: "operator", l: "Nama" }];
    assert.deepEqual(tebakPemetaan(["Nama"], dua), ["operator"]);
  });

  it("judul yang terlalu pendek tidak pernah ditebak", () => {
    // "id" dan "no" cocok dengan terlalu banyak hal untuk bisa ditebak aman.
    assert.deepEqual(tebakPemetaan(["id", "no"], defs), ["", ""]);
  });

  it("satu field hanya diisi satu kolom", () => {
    // Dua kolom yang memetakan ke field yang sama akan membuat yang belakangan
    // diam-diam menimpa yang depan.
    assert.deepEqual(tebakPemetaan(["operator", "Operator"], defs), ["operator", ""]);
  });
});

describe("bakukan", () => {
  it("membuang segala yang bukan huruf dan angka", () => {
    assert.equal(bakukan("Area / Kota"), "areakota");
    assert.equal(bakukan("  Daya (kW) "), "dayakw");
    assert.equal(bakukan(null), "");
  });
});
