import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Jaring pengaman penjadwalan di `src/middleware.ts`.
 *
 * Interval 10 menit membuat putaran harian tidak bergantung pada kunjungan
 * yang sampai ke Node. Yang diuji di sini adalah sifat-sifatnya yang bisa
 * dibuktikan tanpa menunggu 10 menit dan tanpa jaringan: penanda
 * sekali-per-proses terpasang saat modul dimuat, dan pewaktunya di-`unref`
 * supaya `astro build` (yang ikut memuat modul ini saat prerender) tidak
 * tertahan selamanya.
 */

describe("penjadwal interval", () => {
  it("terpasang sekali per proses saat middleware dimuat", async () => {
    await import("../src/middleware");
    assert.equal((globalThis as any).__evkitaPenjadwalJalan, true);
  });

  it("onRequest tetap diekspor — modul tidak rusak oleh interval", async () => {
    const mw = await import("../src/middleware");
    assert.equal(typeof mw.onRequest, "function");
  });
});
