import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInstructions,
  buildSchema,
  emptyFieldKeys,
  PRICE_FIELDS,
} from "../src/lib/ai-prompt.js";
import { bersihkanUsulan, terapkanUsulan } from "../src/lib/ai-usulan.js";
import {
  CAR_BODY_TYPES,
  MOTOR_BODY_TYPES,
  NEVER_RESEARCHED,
  RANGE_STANDARDS,
  RESEARCHABLE_BY_KEY,
} from "../src/lib/vehicle-spec.js";

/**
 * Skema riset AI dan pembersih usulannya.
 *
 * Yang diuji di sini adalah janji-janji yang membuat fitur riset boleh
 * menyentuh katalog sama sekali: field yang dilarang tidak punya tempat untuk
 * ditulis, nilai di luar akal dibuang, teks dari halaman web tidak bisa
 * menyelinap ke formulir, dan tidak ada yang tercentang sendiri di atas data
 * yang sudah ada.
 */

const HARI_INI = "2026-08-28";

describe("skema JSON", () => {
  it("tipe bodi mobil persis sama dengan daftar dropdown, plus null", () => {
    const schema = buildSchema("mobil");
    assert.deepEqual(schema.properties.field.properties.bodyType.properties.nilai.enum, [
      ...CAR_BODY_TYPES,
      null,
    ]);
  });

  it("motor mendapat daftar tipe bodinya sendiri", () => {
    const schema = buildSchema("motor");
    assert.deepEqual(schema.properties.field.properties.bodyType.properties.nilai.enum, [
      ...MOTOR_BODY_TYPES,
      null,
    ]);
  });

  it("standar jarak menyertakan nilai kosong — \"tidak disebut\" harus bisa dinyatakan", () => {
    const schema = buildSchema("mobil");
    const pilihan = schema.properties.field.properties.rangeStandard.properties.nilai.enum;
    assert.equal(pilihan.includes(""), true);
    assert.deepEqual(pilihan, [...RANGE_STANDARDS, null]);
  });

  it("motor tidak ditanyai jumlah kursi maupun penggerak roda", () => {
    const props = buildSchema("motor").properties.field.properties;
    assert.equal("seats" in props, false);
    assert.equal("driveType" in props, false);
    // Mobil tetap ditanyai keduanya.
    const mobil = buildSchema("mobil").properties.field.properties;
    assert.equal("seats" in mobil, true);
    assert.equal("driveType" in mobil, true);
  });

  it("TIDAK SATU PUN field terlarang punya tempat di dalam skema", () => {
    for (const kind of ["mobil", "motor"] as const) {
      const props = buildSchema(kind).properties.field.properties;
      for (const key of Object.keys(NEVER_RESEARCHED)) {
        assert.equal(key in props, false, `${key} bocor ke skema ${kind}`);
      }
    }
  });

  it("tiap field membawa sumber dan keyakinannya sendiri", () => {
    const props = buildSchema("mobil").properties.field.properties;
    for (const [key, def] of Object.entries<any>(props)) {
      assert.deepEqual(def.required, ["nilai", "keyakinan", "sumber", "catatan"], key);
      assert.equal(def.additionalProperties, false, key);
    }
  });

  it("skema menolak properti yang tidak dideklarasikan", () => {
    const schema = buildSchema("mobil");
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.field.additionalProperties, false);
  });

  it("`only` mempersempit skema ke field yang diminta saja", () => {
    const props = buildSchema("mobil", PRICE_FIELDS).properties.field.properties;
    assert.deepEqual(Object.keys(props).sort(), [...PRICE_FIELDS].sort());
  });
});

describe("instruksi", () => {
  it("menyebut kendaraannya, tanggalnya, dan pasar Indonesia", () => {
    const teks = buildInstructions({
      kind: "mobil",
      brand: "Hyundai",
      name: "Ioniq 5",
      today: HARI_INI,
    });
    assert.match(teks, /Hyundai Ioniq 5/);
    assert.match(teks, /2026-08-28/);
    assert.match(teks, /Indonesia/);
  });

  it("melarang menebak secara eksplisit", () => {
    const teks = buildInstructions({ kind: "motor", brand: "Alva", name: "Cervo", today: HARI_INI });
    assert.match(teks, /JANGAN menebak/);
    assert.match(teks, /null/);
  });

  it("menyertakan batas nilai wajar tiap field angka", () => {
    const teks = buildInstructions({ kind: "mobil", brand: "BYD", name: "Atto 1", today: HARI_INI });
    const batas = RESEARCHABLE_BY_KEY.get("batteryKwh");
    assert.match(teks, new RegExp(`${batas.min} dan ${batas.max} kWh`));
  });

  it("mode sebagian memberi tahu model bahwa sisanya tidak boleh disentuh", () => {
    const teks = buildInstructions({
      kind: "mobil",
      brand: "BYD",
      name: "Atto 1",
      today: HARI_INI,
      only: PRICE_FIELDS,
    });
    assert.match(teks, /tidak boleh diubah/);
    assert.equal(teks.includes("batteryKwh"), false);
  });
});

describe("field yang masih kosong", () => {
  it("hanya menyebut yang benar-benar belum terisi", () => {
    const kosong = emptyFieldKeys("mobil", { rangeKm: 481, batteryKwh: null, price: 0 });
    assert.equal(kosong.includes("rangeKm"), false);
    assert.equal(kosong.includes("batteryKwh"), true);
    // Nol adalah jawaban, bukan ketiadaan jawaban.
    assert.equal(kosong.includes("price"), false);
  });
});

/* ---------- Pembersih usulan ---------- */

function jawaban(field: Record<string, any>, extra: Record<string, any> = {}) {
  return { ringkasan: "Riset dari situs resmi.", peringatan: [], field, ...extra };
}

function isi(nilai: any, keyakinan = "tinggi", sumber = "https://hyundai.co.id/ioniq-5") {
  return { nilai, keyakinan, sumber, catatan: "Per 28 Agustus 2026." };
}

describe("pembersih usulan", () => {
  it("meloloskan nilai yang wajar", () => {
    const { usulan } = bersihkanUsulan(jawaban({ batteryKwh: isi(84) }), { kind: "mobil" });
    assert.equal(usulan.length, 1);
    assert.equal(usulan[0].key, "batteryKwh");
    assert.equal(usulan[0].nilai, 84);
    assert.equal(usulan[0].sumber, "https://hyundai.co.id/ioniq-5");
  });

  it("membuang angka di luar batas akal dan mencatat alasannya", () => {
    const { usulan, peringatan } = bersihkanUsulan(jawaban({ batteryKwh: isi(3500) }), { kind: "mobil" });
    assert.equal(usulan.length, 0);
    assert.deepEqual(peringatan, ["batteryKwh: diluarBatas"]);
  });

  it("membuang harga yang mustahil murah", () => {
    const { usulan } = bersihkanUsulan(jawaban({ price: isi(1) }), { kind: "mobil" });
    assert.equal(usulan.length, 0);
  });

  it("menerima harga yang ditulis dengan pemisah ribuan", () => {
    const { usulan } = bersihkanUsulan(jawaban({ price: isi("799.000.000") }), { kind: "mobil" });
    assert.equal(usulan[0].nilai, 799000000);
  });

  it("membaca titik desimal sebagai desimal saat itu satu-satunya pembacaan yang masuk akal", () => {
    // "84.5" tidak mungkin berarti delapan puluh empat ribu lima ratus kWh.
    const { usulan } = bersihkanUsulan(jawaban({ batteryKwh: isi("84.5") }), { kind: "mobil" });
    assert.equal(usulan[0].nilai, 84.5);
  });

  it("batas nilai memutuskan pembacaan yang ambigu, tanpa menebak", () => {
    // "4.500" bisa berarti 4500 atau 4,5. Untuk baterai, hanya satu yang mungkin.
    const { usulan } = bersihkanUsulan(jawaban({ batteryKwh: isi("4.500") }), { kind: "motor" });
    assert.equal(usulan[0].nilai, 4.5);
  });

  it("kalau kedua pembacaan sama-sama masuk akal, nilainya dibuang", () => {
    // Torsi menerima 1 sampai 2500 Nm, jadi "1.500" bisa sah-sah saja berarti
    // 1500 Nm maupun 1,5 Nm. Tidak ada yang boleh memilih salah satunya.
    const { usulan, peringatan } = bersihkanUsulan(jawaban({ torqueNm: isi("1.500") }), { kind: "mobil" });
    assert.equal(usulan.length, 0);
    assert.deepEqual(peringatan, ["torqueNm: ambigu"]);
  });

  it("batas bawah ikut menyingkirkan pembacaan yang mustahil", () => {
    // "7.000" pada daya pengisian AC: 7000 kW mustahil, 7 kW biasa.
    const { usulan } = bersihkanUsulan(jawaban({ chargeAcKw: isi("7.000") }), { kind: "mobil" });
    assert.equal(usulan[0].nilai, 7);
  });

  it("titik dan koma bersamaan tidak pernah ambigu — yang terakhir desimalnya", () => {
    const { usulan } = bersihkanUsulan(jawaban({ price: isi("799.000.000,00") }), { kind: "mobil" });
    assert.equal(usulan[0].nilai, 799000000);
  });

  it("membakukan ejaan tipe bodi ke ejaan resmi kita", () => {
    const { usulan } = bersihkanUsulan(jawaban({ bodyType: isi("suv") }), { kind: "mobil" });
    assert.equal(usulan[0].nilai, "SUV");
  });

  it("menolak tipe bodi yang tidak ada di dropdown", () => {
    const { usulan, peringatan } = bersihkanUsulan(
      jawaban({ bodyType: isi("Sedan Listrik") }),
      { kind: "mobil" }
    );
    assert.equal(usulan.length, 0);
    assert.deepEqual(peringatan, ["bodyType: diluarPilihan"]);
  });

  it("membuang alamat sumber yang skemanya berbahaya", () => {
    const { usulan } = bersihkanUsulan(
      jawaban({ rangeKm: { ...isi(481), sumber: "javascript:alert(1)" } }),
      { kind: "mobil" }
    );
    assert.equal(usulan.length, 1);
    assert.equal(usulan[0].sumber, "");
  });

  it("membuang field terlarang tanpa jejak, bahkan kalau model menulisnya", () => {
    const { usulan, peringatan } = bersihkanUsulan(
      jawaban({
        description: isi("Mobil listrik paling revolusioner tahun ini!"),
        status: isi("published"),
        image: isi("https://situs-lain.test/foto.jpg"),
        rangeKm: isi(481),
      }),
      { kind: "mobil" }
    );
    assert.deepEqual(usulan.map((u: any) => u.key), ["rangeKm"]);
    // Tidak muncul di peringatan pun — teks dari halaman asing tidak diberi
    // jalur ke layar.
    assert.deepEqual(peringatan, []);
  });

  it("membuang field yang tidak berlaku untuk motor", () => {
    const { usulan } = bersihkanUsulan(jawaban({ seats: isi(5), rangeKm: isi(125) }), { kind: "motor" });
    assert.deepEqual(usulan.map((u: any) => u.key), ["rangeKm"]);
  });

  it("membuang varian yang sama yang tertulis dua kali", () => {
    const { usulan } = bersihkanUsulan(
      jawaban({ variantNames: isi(["Prime", "prime", "Signature"]) }),
      { kind: "mobil" }
    );
    assert.deepEqual(usulan[0].nilai, ["Prime", "Signature"]);
  });

  it("urutannya mengikuti urutan field, bukan urutan jawaban model", () => {
    const { usulan } = bersihkanUsulan(
      jawaban({ price: isi(799000000), rangeKm: isi(481), bodyType: isi("SUV") }),
      { kind: "mobil" }
    );
    assert.deepEqual(usulan.map((u: any) => u.key), ["bodyType", "rangeKm", "price"]);
  });
});

describe("centang awal", () => {
  it("field kosong dengan keyakinan cukup tercentang sendiri", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481, "sedang") }), {
      kind: "mobil",
      vehicle: {},
    });
    assert.equal(usulan[0].pilih, true);
  });

  it("field yang SUDAH terisi tidak pernah tercentang sendiri", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481, "tinggi") }), {
      kind: "mobil",
      vehicle: { rangeKm: 450 },
    });
    assert.equal(usulan[0].pilih, false);
    assert.equal(usulan[0].sekarang, 450);
  });

  it("keyakinan rendah tidak pernah tercentang sendiri", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481, "rendah") }), {
      kind: "mobil",
      vehicle: {},
    });
    assert.equal(usulan[0].pilih, false);
  });

  it("keyakinan yang tidak dikenal jatuh ke \"rendah\", bukan ke \"tinggi\"", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481, "sangat yakin sekali") }), {
      kind: "mobil",
      vehicle: {},
    });
    assert.equal(usulan[0].keyakinan, "rendah");
    assert.equal(usulan[0].pilih, false);
  });
});

describe("penerapan usulan", () => {
  it("hanya yang dicentang yang ikut", () => {
    const { usulan } = bersihkanUsulan(
      jawaban({ rangeKm: isi(481), batteryKwh: isi(84), powerHp: isi(228) }),
      { kind: "mobil" }
    );
    const patch = terapkanUsulan(usulan, ["rangeKm", "powerHp"]);
    assert.deepEqual(patch, { rangeKm: 481, powerHp: 228 });
  });

  it("tanpa centang, tidak ada yang berubah", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481) }), { kind: "mobil" });
    assert.deepEqual(terapkanUsulan(usulan, []), {});
  });

  it("kunci yang tidak ada di usulan tidak bisa diselundupkan lewat daftar centang", () => {
    const { usulan } = bersihkanUsulan(jawaban({ rangeKm: isi(481) }), { kind: "mobil" });
    assert.deepEqual(terapkanUsulan(usulan, ["rangeKm", "status", "description"]), { rangeKm: 481 });
  });
});

describe("jawaban yang rusak", () => {
  it("objek kosong tidak meledak", () => {
    const hasil = bersihkanUsulan({}, { kind: "mobil" });
    assert.deepEqual(hasil.usulan, []);
    assert.equal(hasil.ringkasan, "");
  });

  it("null tidak meledak", () => {
    assert.deepEqual(bersihkanUsulan(null, { kind: "mobil" }).usulan, []);
  });

  it("field yang bukan objek dilewati", () => {
    const hasil = bersihkanUsulan({ field: { rangeKm: "481" } }, { kind: "mobil" });
    assert.deepEqual(hasil.usulan, []);
  });
});
