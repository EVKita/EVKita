import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mulaiJalan, selesaiJalan, sedangJalan } from "../src/lib/kunci-jalan.js";

/**
 * Penanda "sedang jalan" mesin otomatis. `jalan: true` yang tertinggal di
 * disk sesudah aplikasi dimulai ulang tidak boleh lagi mengunci mesinnya
 * selamanya — yang dipercaya hanya putaran di proses ini, dan hanya selama
 * belum melewati batasnya.
 */
describe("kunci-jalan", () => {
  it("tanpa putaran di proses ini, tidak sedang jalan (sisa disk diabaikan)", () => {
    assert.equal(sedangJalan("uji-kosong", 60_000), false);
  });

  it("mulai → jalan, selesai → tidak", () => {
    mulaiJalan("uji-a");
    assert.equal(sedangJalan("uji-a", 60_000), true);
    selesaiJalan("uji-a");
    assert.equal(sedangJalan("uji-a", 60_000), false);
  });

  it("putaran yang melewati batas dianggap mati", () => {
    mulaiJalan("uji-b", 1_000);
    assert.equal(sedangJalan("uji-b", 5_000, 3_000), true);
    assert.equal(sedangJalan("uji-b", 5_000, 7_000), false);
    selesaiJalan("uji-b");
  });

  it("tiap mesin punya kuncinya sendiri", () => {
    mulaiJalan("uji-c");
    assert.equal(sedangJalan("uji-d", 60_000), false);
    selesaiJalan("uji-c");
  });
});
