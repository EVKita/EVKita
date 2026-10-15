import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { istilahCas } from "../src/lib/region.js";
import { makePubT } from "../src/lib/i18n/pub.js";

/**
 * Tetapan istilah direktori pengisian.
 *
 * Di edisi Amerika dan China kata "SPKLU" tidak boleh muncul — Amerika memakai
 * istilah "Charging...", China memakai "充电站...". Auto-update (berita,
 * artikel, riset, penjualan) hanya menulis `data/content.json`, jadi tetapan
 * di kode + kamus ini tidak bisa dibalikkan mesin. Kalau uji ini merah,
 * berarti ada label baru yang memakai kunci Indonesia di edisi regional.
 */

const BENTUK = ["nav", "peta", "semua"];

describe("istilahCas", () => {
  it("memetakan tiga bentuk ke kunci edisinya masing-masing", () => {
    assert.equal(istilahCas("id", "nav"), "pub.nav.spklu");
    assert.equal(istilahCas("us", "nav"), "pub.region.usCharging");
    assert.equal(istilahCas("cn", "nav"), "pub.region.cnBadge");
    assert.equal(istilahCas("id", "peta"), "pub.dir.lokasiSpklu");
    assert.equal(istilahCas("us", "peta"), "pub.region.usChargingMap");
    assert.equal(istilahCas("cn", "peta"), "pub.region.cnChargingMap");
    assert.equal(istilahCas("id", "semua"), "pub.dir.semuaSpklu");
    assert.equal(istilahCas("us", "semua"), "pub.region.usSemuaCharging");
    assert.equal(istilahCas("cn", "semua"), "pub.region.cnSemuaCharging");
  });

  it("edisi asing jatuh ke Indonesia, bentuk asing jatuh ke nav", () => {
    assert.equal(istilahCas("xx", "nav"), "pub.nav.spklu");
    assert.equal(istilahCas("us", "takdikenal"), "pub.region.usCharging");
    assert.equal(istilahCas(undefined, "peta"), "pub.dir.lokasiSpklu");
  });
});

describe("tetapan tanpa-SPKLU di edisi regional", () => {
  const KUNCI_TETAP = [
    "pub.region.usCharging",
    "pub.region.usChargingMap",
    "pub.region.usSemuaCharging",
    "pub.region.cnChargingMap",
    "pub.region.cnSemuaCharging",
    "pub.region.cnBadge",
    "pub.region.cnWorkshop",
    "pub.region.spkluTitle",
    "pub.region.cnSpkluTitle",
    "pub.region.spkluLead",
    "pub.region.cnSpkluLead",
    "pub.region.badge",
    "pub.kalk.descBiayaUs",
    "pub.kalk.descBiayaCn",
    "pub.kalk.keywordBiayaUs",
    "pub.kalk.keywordBiayaCn",
    "pub.kalk.tidakDihitungIsi4Us",
    "pub.kalk.tidakDihitungIsi4Cn",
  ];

  for (const lang of ["id", "en", "zh"]) {
    it(`tidak satu pun istilah edisi us/cn berbunyi SPKLU (${lang})`, () => {
      const t = makePubT(lang);
      for (const kunci of KUNCI_TETAP) {
        const teks = t(kunci);
        assert.ok(
          !teks.includes("SPKLU"),
          `${kunci}@${lang} masih memuat SPKLU: ${teks}`
        );
      }
    });

    it(`semua titik label lewat helper, bukan kunci mentah (${lang})`, () => {
      const t = makePubT(lang);
      for (const bentuk of BENTUK) {
        assert.ok(!t(istilahCas("us", bentuk)).includes("SPKLU"), `us/${bentuk}@${lang}`);
        assert.ok(!t(istilahCas("cn", bentuk)).includes("SPKLU"), `cn/${bentuk}@${lang}`);
      }
    });
  }

  it("istilah Amerika berbunyi charging, China berbunyi 充电站", () => {
    const t = makePubT("en");
    // Nilai harus terisi sungguhan, bukan kunci yang lolos tanpa terjemahan.
    for (const kunci of [
      "pub.region.usCharging",
      "pub.region.usChargingMap",
      "pub.region.usSemuaCharging",
      "pub.region.cnBadge",
      "pub.region.cnChargingMap",
    ]) {
      assert.notEqual(t(kunci), kunci, `${kunci} tidak ada di kamus`);
    }
    assert.match(t("pub.region.usCharging"), /charging/i);
    assert.match(t("pub.region.usChargingMap"), /charging/i);
    assert.match(t("pub.region.usSemuaCharging"), /charging/i);
    assert.ok(t("pub.region.cnBadge").includes("充电站"));
    assert.ok(t("pub.region.cnChargingMap").includes("充电站"));
  });
});
