import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bersihSitusId, cmsSite } from "../src/lib/i18n/pub.js";
import { terjemahContent } from "../src/lib/terjemahan.js";

const SISIH = fs.mkdtempSync(path.join(os.tmpdir(), "situs-bersih-"));
after(() => {
  try {
    fs.rmSync(SISIH, { recursive: true, force: true });
  } catch {
    /* sudah hilang */
  }
});

let urut = 0;
function berkasBaru() {
  return path.join(SISIH, `en-${++urut}.json`);
}

/**
 * Jaring pengaman bocoran edisi regional di `site.*`.
 *
 * `site.*` adalah setelan global milik edisi Indonesia; teks edisi
 * Amerika/China di sana adalah cemaran komitmen yang membuat beranda
 * Indonesia menampilkan "Panduan Kendaraan Listrik Amerika". Kalau uji ini
 * merah, berarti ada teks regional baru yang belum masuk daftar bocoran.
 */

const BOCOR = {
  heroEyebrow: "Basis Data Kendaraan Listrik Amerika",
  heroTitle: "Panduan Kendaraan Listrik Amerika",
  heroSub: "Katalog, berita, dan artikel seputar EV di Amerika.",
  katalogTitle: "Katalog Kendaraan Listrik China",
  katalogNote: "",
  spkluTitle: "Stasiun Pengisian China",
  spkluNote: "",
  bengkelTitle: "Bengkel & Servis EV China",
  bengkelNote: "",
};

describe("bersihSitusId", () => {
  it("mengembalikan teks bocoran Amerika/China ke kanon Indonesia", () => {
    const hasil: any = bersihSitusId({ ...BOCOR });
    assert.equal(hasil.heroTitle, "Kendaraan Listrik Indonesia");
    assert.equal(hasil.heroSub, "Panduan Lengkap Kendaraan Listrik");
    assert.equal(hasil.heroEyebrow, "Basis data kendaraan listrik Indonesia");
    assert.equal(hasil.katalogTitle, "Katalog Kendaraan Listrik");
    assert.equal(hasil.spkluTitle, "SPKLU Indonesia");
    assert.equal(hasil.bengkelTitle, "Bengkel & Servis EV");
    // Catatan yang dikosongkan timpaan regional ikut pulih.
    assert.equal(hasil.katalogNote, "Bandingkan spesifikasi dan harga");
    assert.equal(hasil.spkluNote, "Jaringan pengisian daya publik");
    assert.equal(hasil.bengkelNote, "Mobil & motor listrik");
  });

  it("tidak menyentuh suntingan admin yang asli", () => {
    const situs = { heroTitle: "Promo Akhir Tahun", katalogNote: "" };
    const hasil: any = bersihSitusId(situs);
    assert.equal(hasil.heroTitle, "Promo Akhir Tahun");
    // Catatan yang dikosongkan pemiliknya sendiri dibiarkan kosong.
    assert.equal(hasil.katalogNote, "");
  });

  it("tidak mengubah masukan dan lolos untuk bukan-objek", () => {
    const situs = { ...BOCOR };
    bersihSitusId(situs);
    assert.equal(situs.heroTitle, BOCOR.heroTitle);
    assert.equal(bersihSitusId(null), null);
    assert.equal(bersihSitusId(undefined), undefined);
  });
});

describe("cmsSite + bersih", () => {
  it("beranda Indonesia selalu dapat objek baru yang sudah bersih", () => {
    const situs = { ...BOCOR, brandText: "EVKita" };
    const hasil: any = cmsSite(situs, "id");
    assert.notEqual(hasil, situs);
    assert.equal(hasil.heroTitle, "Kendaraan Listrik Indonesia");
    // Menimpa hasil tidak merembes ke cache bersama.
    hasil.heroTitle = "Sudah ditimpa edisi";
    assert.equal(situs.heroTitle, BOCOR.heroTitle);
  });

  it("bendera Inggris tetap menerjemahkan kanon yang dipulihkan", () => {
    const hasil: any = cmsSite({ ...BOCOR }, "en");
    assert.equal(hasil.heroTitle, "Electric Vehicles in Indonesia");
    assert.equal(hasil.katalogTitle, "Electric Vehicle Catalogue");
  });

  it("bendera Mandarin tetap menerjemahkan kanon yang dipulihkan", () => {
    const hasil: any = cmsSite({ ...BOCOR }, "zh");
    assert.equal(hasil.heroTitle, "印度尼西亚电动汽车");
    assert.equal(hasil.spkluTitle, "印度尼西亚充电站");
  });
});

describe("terjemahContent + bersih", () => {
  it("tidak meminta AI menerjemahkan teks bocoran", async () => {
    const diminta: string[] = [];
    const terjemah = async (daftar: string[]) => {
      diminta.push(...daftar);
      return daftar.map((t) => `[EN] ${t}`);
    };
    const hasil: any = await terjemahContent({ site: { ...BOCOR }, cars: [] }, "en", {
      terjemah,
      berkas: berkasBaru(),
    });
    assert.ok(!diminta.some((t) => /Amerika|China/.test(t)));
    assert.equal(hasil.site.heroTitle, "[EN] Kendaraan Listrik Indonesia");
  });
});
