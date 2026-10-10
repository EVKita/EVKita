import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { cari, siap, status, jadwalkanGeoip, urlDbip } from "../src/lib/geoip";

/**
 * Pencarian geografi untuk Analitik.
 *
 * Tanpa basis DB-IP di `data/geo/`, semuanya berarti "tidak diketahui" —
 * dan itu keadaan yang sah, bukan galat: panel menampilkan statusnya apa
 * adanya sampai basis terunduh.
 */

before(async () => {
  // Direktori sementara supaya unduhan otomatis server sungguhan (yang juga
  // tinggal di data/geo/) tidak membuat uji "tanpa basis" ini lolos-tidak —
  // dan unduhan dimatikan total supaya suite tidak mengunduh 140 MB tiap jalan.
  process.env.EVKITA_TANPA_GEO = "1";
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "evkita-geoip-")));
});

describe("cari tanpa basis", () => {
  it("IP publik tanpa basis berarti tidak diketahui, bukan galat", async () => {
    assert.deepEqual(await cari("8.8.8.8"), { negara: "", provinsi: "", kota: "", jaringan: "" });
  });

  it("IP pribadi, lokal, dan sampah tidak pernah dicari", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "::1", "", "bukan-ip", "999.999.999.999"]) {
      assert.deepEqual(await cari(ip), { negara: "", provinsi: "", kota: "", jaringan: "" }, ip);
    }
  });
});

describe("status dan penjadwalan", () => {
  it("status selalu berbentuk lengkap walau basis belum ada", () => {
    const s = status();
    for (const k of ["country", "city", "asn"]) {
      assert.equal(typeof s[k].ada, "boolean");
      assert.ok(s[k].umurHari === null || typeof s[k].umurHari === "number");
    }
  });

  it("siap() boolean dan penjadwalan tidak pernah melempar", () => {
    assert.equal(typeof siap(), "boolean");
    assert.doesNotThrow(() => jadwalkanGeoip());
  });

  it("alamat unduhan DB-IP berbentuk bulan berjalan", () => {
    assert.equal(urlDbip("dbip-country-lite", 2026, 10), "https://download.db-ip.com/free/dbip-country-lite-2026-10.mmdb.gz");
    assert.equal(urlDbip("dbip-city-lite", 2026, 1), "https://download.db-ip.com/free/dbip-city-lite-2026-01.mmdb.gz");
  });
});
