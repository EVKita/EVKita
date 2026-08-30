import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { safeUrl } from "../src/lib/url.js";

/**
 * Gambar kendaraan yang disimpan sendiri.
 *
 * Selama gambar di-hotlink dari domain pabrikan, tidak ada satu pun uji yang
 * bisa menjaganya: berkas di server orang lain bisa hilang kapan saja tanpa
 * ada yang tahu, dan memang sudah terjadi — dua di antaranya mati hari ini.
 *
 * Begitu gambarnya jadi berkas sendiri, keadaannya berbalik: alamat yang
 * menunjuk berkas yang tidak ada adalah kesalahan yang BISA dicegat sebelum
 * terbit. Itu yang dijaga di sini. Mengganti nama satu berkas di
 * `public/gambar/` tanpa memperbarui `content.json` akan menggagalkan build.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "data/content.json"), "utf8"));

const kendaraan: any[] = [
  ...(content.cars || []).map((v: any) => ({ ...v, koleksi: "cars" })),
  ...(content.motors || []).map((v: any) => ({ ...v, koleksi: "motors" })),
];

const lokal = (v: any) => typeof v.image === "string" && v.image.startsWith("/gambar/");

describe("gambar kendaraan", () => {
  it("setiap alamat /gambar/ menunjuk berkas yang benar-benar ada", () => {
    const hilang = kendaraan
      .filter(lokal)
      .filter((v) => !fs.existsSync(path.join(ROOT, "public", v.image)))
      .map((v) => `${v.id} -> ${v.image}`);
    assert.deepEqual(hilang, [], `alamat gambar tanpa berkasnya: ${hilang.join(", ")}`);
  });

  it("tidak menyimpan berkas yang tidak dipakai siapa pun", () => {
    // Kebalikan dari uji di atas. Berkas yatim ikut ke setiap rilis dan
    // diunduh setiap kali situs diperbarui, tanpa pernah tampil di layar.
    const dipakai = new Set(kendaraan.filter(lokal).map((v) => path.join(ROOT, "public", v.image)));
    const ada: string[] = [];
    for (const sub of ["mobil", "motor"]) {
      const dir = path.join(ROOT, "public/gambar", sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) ada.push(path.join(dir, f));
    }
    const yatim = ada.filter((f) => !dipakai.has(f)).map((f) => path.relative(ROOT, f));
    assert.deepEqual(yatim, [], `berkas gambar yang tidak dirujuk: ${yatim.join(", ")}`);
  });

  it("hanya menyimpan WebP, dan tidak ada yang berukuran tak wajar", () => {
    for (const v of kendaraan.filter(lokal)) {
      const file = path.join(ROOT, "public", v.image);
      assert.ok(v.image.endsWith(".webp"), `${v.id} bukan .webp`);
      const kb = fs.statSync(file).size / 1024;
      // Berkas 0 byte artinya konversinya gagal separuh jalan; di atas 400 KB
      // artinya ada yang lolos tanpa dikecilkan, dan itu ikut ke setiap rilis.
      assert.ok(kb > 1, `${v.id} kosong`);
      assert.ok(kb < 400, `${v.id} terlalu besar: ${kb.toFixed(0)} KB`);
    }
  });

  it("alamatnya lolos penyaring skema yang dipakai atribut src", () => {
    // `/gambar/...` harus lolos sebagai tautan internal, bukan tersaring
    // bersama skema berbahaya — kalau tersaring, seluruh gambar jadi kosong.
    for (const v of kendaraan.filter(lokal)) {
      assert.equal(safeUrl(v.image), v.image, `${v.id} tersaring safeUrl`);
    }
  });

  it("tidak ada satu pun gambar kendaraan yang di-hotlink", () => {
    /*
     * NOL, bukan "sedikit". Inti PERF-4 bukan mengurangi jumlah domain,
     * melainkan menghapus ketergantungan pada berkas yang bisa hilang tanpa
     * pemberitahuan — dan yang memang sudah terjadi sekali: gambar Mitsubishi
     * L100 EV sudah tidak bisa dibuka umum lagi dan tampil rusak di setiap
     * kunjungan sampai hari ini.
     *
     * Kendaraan tanpa gambar sama sekali TIDAK melanggar aturan ini: kartunya
     * jatuh ke ilustrasi SVG bawaan situs, yang selalu tampil.
     */
    const luar = kendaraan.filter((v) => /^https?:\/\//i.test(v.image || "")).map((v) => v.id);
    assert.deepEqual(
      luar.sort(),
      [],
      "Ada kendaraan yang gambarnya di-hotlink dari domain lain. Simpan " +
        "berkasnya ke public/gambar/ lalu tunjuk lewat /gambar/..., atau " +
        "kosongkan field-nya supaya jatuh ke ilustrasi bawaan."
    );
  });

  it("kendaraan tanpa gambar jatuh ke ilustrasi, bukan ke kotak rusak", () => {
    // Satu kendaraan memang tidak punya gambar: Alessa Forte, yang belum punya
    // berkasnya. Field kosong itu yang membuat `visualHTML()` memilih `carSVG()`
    // — kalau URL matinya dibiarkan, yang tampil kotak rusak.
    const kosong = kendaraan.filter((v) => !v.image).map((v) => v.id);
    assert.deepEqual(kosong, ["alessa-forte"]);
  });
});
