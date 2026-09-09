import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hintRisetWizard,
  kendaraanSama,
  normalisasiDrafWizard,
} from "../src/lib/ai-wizard.js";

describe("draf wizard AI", () => {
  it("hanya menyimpan identitas yang dibutuhkan untuk menyambung ulang", () => {
    assert.deepEqual(
      normalisasiDrafWizard({
        col: "motors",
        brand: "  Maka   Motors ",
        name: " Cavalry ",
        year: "2026",
        hint: " varian   Indonesia ",
        jobId: "job-1",
        hasil: { price: 1 },
      }),
      {
        col: "motors",
        brand: "Maka Motors",
        name: "Cavalry",
        year: 2026,
        hint: "varian Indonesia",
        jobId: "job-1",
      },
    );
  });

  it("membuang tahun yang tidak masuk akal", () => {
    assert.equal(normalisasiDrafWizard({ year: 1900 }).year, null);
  });

  it("menyatukan tahun dan keterangan untuk prompt", () => {
    assert.equal(
      hintRisetWizard({ year: 2026, hint: "varian Signature" }),
      "tahun model 2026, varian Signature",
    );
  });
});

describe("peringatan kendaraan kembar", () => {
  const list = [
    { id: "byd-seal", brand: "BYD", name: "Seal" },
    { id: "ioniq-5", brand: "Hyundai", name: "Ioniq 5" },
  ];

  it("mengabaikan kapital dan spasi ganda", () => {
    assert.equal(kendaraanSama(list, " byd ", "  SEAL")?.id, "byd-seal");
  });

  it("tidak menebak dari nama yang hanya mirip", () => {
    assert.equal(kendaraanSama(list, "BYD", "Seal Performance"), null);
  });
});
