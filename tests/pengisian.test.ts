import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULTS,
  BATAS_AC_KW,
  BATAS_TAPER,
  EFISIENSI,
  modePengisian,
  hitungPengisian,
  menitKeTeks,
  teksDurasi,
  kwhKeTeks,
  kmKeTeks,
  teksRingkasPengisian,
  catatanHasil,
} from "../src/lib/pengisian.js";

/**
 * Kalkulator waktu & biaya pengisian.
 *
 * Yang diuji di sini bukan aritmetikanya — itu bagian yang paling mudah.
 * Yang diuji adalah tempat-tempat kalkulator ini seharusnya BERHENTI menjawab:
 * isian kosong yang terbaca nol, persentase terbalik yang menghasilkan angka
 * negatif, dan lama pengisian yang disajikan seolah-olah satu angka pasti.
 */

const dasar = {
  batteryKwh: 100,
  socAwal: 20,
  socAkhir: 80,
  dayaKw: 50,
  tarif: 2000,
};

describe("modePengisian", () => {
  it("memisahkan AC dari DC di batas praktisnya", () => {
    assert.equal(modePengisian(2.2), "ac");
    assert.equal(modePengisian(BATAS_AC_KW), "ac");
    assert.equal(modePengisian(BATAS_AC_KW + 0.1), "dc");
    assert.equal(modePengisian(150), "dc");
  });

  it("tidak menebak DC dari isian yang kosong", () => {
    assert.equal(modePengisian(""), "ac");
    assert.equal(modePengisian(null), "ac");
  });
});

describe("energi yang masuk dan yang dibayar", () => {
  it("menghitung energi dari bagian baterai yang diisi", () => {
    const h = hitungPengisian(dasar);
    assert.equal(h.energiMasuk, 60);
    assert.equal(h.selisihSoc, 60);
  });

  it("selalu menagih lebih banyak daripada yang masuk ke baterai", () => {
    const h = hitungPengisian(dasar);
    assert.ok(h.energiDitagih > h.energiMasuk);
    assert.equal(h.energiDitagih, 60 / EFISIENSI.dc);
  });

  it("memakai efisiensi AC saat dayanya AC", () => {
    const h = hitungPengisian({ ...dasar, dayaKw: 7 });
    assert.equal(h.mode, "ac");
    assert.equal(h.efisiensi, EFISIENSI.ac);
    assert.equal(h.energiDitagih, 60 / EFISIENSI.ac);
  });

  it("menagih atas energi yang dibayar, bukan yang masuk", () => {
    // Menagih atas energi yang masuk ke baterai akan melaporkan biaya yang
    // lebih murah daripada yang benar-benar keluar dari dompet.
    const h = hitungPengisian(dasar);
    assert.equal(h.biaya, (60 / EFISIENSI.dc) * 2000);
    assert.ok(h.biaya > 60 * 2000);
  });

  it("melaporkan biaya per kWh yang benar-benar masuk", () => {
    const h = hitungPengisian(dasar);
    assert.ok(h.biayaPerKwh > 2000);
    assert.equal(Math.round(h.biayaPerKwh), Math.round(2000 / EFISIENSI.dc));
  });
});

describe("isian yang kosong dan yang keliru", () => {
  it("tidak membaca tarif kosong sebagai nol", () => {
    // Number("") bernilai 0, dan "Rp 0" adalah jawaban yang kelihatan pasti
    // untuk pertanyaan yang belum ditanyakan siapa pun.
    const h = hitungPengisian({ ...dasar, tarif: "" });
    assert.equal(h.biaya, null);
    assert.equal(h.biayaPerKwh, null);
    // Tapi energi dan waktunya tetap terjawab — keduanya tidak butuh tarif.
    assert.equal(h.energiMasuk, 60);
    assert.ok(h.menitCepat > 0);
  });

  it("tetap menjawab biaya walau daya stasiunnya belum diisi", () => {
    // Berapa kWh yang masuk sama sekali tidak bergantung pada daya stasiun.
    const h = hitungPengisian({ ...dasar, dayaKw: "" });
    assert.equal(h.energiMasuk, 60);
    assert.ok(h.biaya > 0);
    assert.equal(h.menitCepat, null);
    assert.equal(h.menitLambat, null);
    assert.equal(teksDurasi(h), "—");
  });

  it("menolak persentase yang terbalik alih-alih menjawab negatif", () => {
    const h = hitungPengisian({ ...dasar, socAwal: 80, socAkhir: 20 });
    assert.equal(h.socSalah, true);
    assert.equal(h.energiMasuk, null);
    assert.equal(h.biaya, null);
    assert.equal(h.menitCepat, null);
    assert.match(teksRingkasPengisian(h), /harus lebih besar/);
  });

  it("menolak persentase yang sama besar — tidak ada yang diisi", () => {
    const h = hitungPengisian({ ...dasar, socAwal: 50, socAkhir: 50 });
    assert.equal(h.socSalah, true);
    assert.equal(h.energiMasuk, null);
  });

  it("menolak persentase di luar 0–100", () => {
    assert.equal(hitungPengisian({ ...dasar, socAkhir: 120 }).energiMasuk, null);
    assert.equal(hitungPengisian({ ...dasar, socAwal: -10 }).energiMasuk, null);
  });

  it("tidak meledak pada masukan kosong seluruhnya", () => {
    const h = hitungPengisian({} as any);
    assert.equal(h.ok, false);
    assert.equal(h.energiMasuk, null);
    assert.equal(h.socSalah, false);
    assert.equal(teksDurasi(h), "—");
    assert.match(teksRingkasPengisian(h), /Isi kapasitas baterai/);
  });

  it("menerima angka bertanda koma seperti yang diketik orang Indonesia", () => {
    const h = hitungPengisian({ ...dasar, batteryKwh: "82,6" });
    assert.ok(Math.abs(h.energiMasuk - 49.56) < 0.001);
  });
});

describe("lama pengisian", () => {
  it("tidak pernah menjawab dengan satu angka", () => {
    const h = hitungPengisian(dasar);
    assert.ok(h.menitLambat > h.menitCepat);
    assert.match(teksDurasi(h), / – /);
  });

  it("mengurung waktu yang sebenarnya di dalam rentangnya", () => {
    // Ioniq 5 (77,4 kWh) 20–80% di stasiun 50 kW memakan waktu sekitar 60
    // menit di dunia nyata. Rentangnya harus memuat angka itu, kalau tidak
    // rentang itu bukan kejujuran melainkan hiasan.
    const h = hitungPengisian({ batteryKwh: 77.4, socAwal: 20, socAkhir: 80, dayaKw: 50 });
    assert.ok(h.menitCepat <= 60 && h.menitLambat >= 60, `${h.menitCepat}–${h.menitLambat} tidak memuat 60`);
  });

  it("mengurung waktu yang sebenarnya di stasiun yang jauh lebih kencang", () => {
    // Mobil yang sama di stasiun 150 kW: sekitar 21 menit.
    const h = hitungPengisian({ batteryKwh: 77.4, socAwal: 20, socAkhir: 80, dayaKw: 150 });
    assert.ok(h.menitCepat <= 21 && h.menitLambat >= 21, `${h.menitCepat}–${h.menitLambat} tidak memuat 21`);
  });

  it("mengurung waktu pengisian AC semalaman, RUGI PENGISIAN IKUT DIHITUNG", () => {
    // 60 kWh ke baterai lewat wallbox 7 kW. Pembagian polos memberi 8 jam 34
    // menit — dan itu salah: 7 kW adalah daya di COLOKAN, sedangkan rugi
    // pengisi bawaan mobil terjadi sesudah titik itu. Yang harus mengalir
    // sebenarnya sekitar 68 kWh, jadi hampir sepuluh jam.
    //
    // Uji ini yang menemukannya. Selisihnya lebih dari satu jam, persis di
    // angka yang dipakai orang memutuskan apakah mobilnya sempat terisi
    // semalaman.
    const h = hitungPengisian({ batteryKwh: 100, socAwal: 20, socAkhir: 80, dayaKw: 7 });
    const polos = (60 / 7) * 60;
    assert.ok(h.menitCepat > polos + 30, `${h.menitCepat} menit terlalu dekat dengan pembagian polos`);
    assert.ok(h.menitCepat <= 585 && h.menitLambat >= 585, `${h.menitCepat}–${h.menitLambat} tidak memuat 585`);
  });

  it("melebar drastis saat pengisian DC menembus batas taper", () => {
    // Inilah pernyataan bahwa dua puluh persen terakhir paling sulit ditebak:
    // rentangnya sendiri yang mengatakannya, bukan cuma catatan di bawah.
    const sampai80 = hitungPengisian({ ...dasar, socAkhir: BATAS_TAPER });
    const sampai100 = hitungPengisian({ ...dasar, socAkhir: 100 });
    const lebar = (h: any) => h.menitLambat - h.menitCepat;
    assert.equal(sampai80.lewatiTaper, false);
    assert.equal(sampai100.lewatiTaper, true);
    assert.ok(lebar(sampai100) > lebar(sampai80) * 2);
  });

  it("membuat dua puluh persen terakhir lebih lama daripada enam puluh persen sebelumnya", () => {
    // 20→80 adalah 60% baterai; 80→100 hanya 20%. Kalau yang kedua tidak
    // memakan waktu lebih lama, model tapernya tidak menggambarkan apa pun.
    const bawah = hitungPengisian({ ...dasar, socAwal: 20, socAkhir: 80, dayaKw: 150 });
    const atas = hitungPengisian({ ...dasar, socAwal: 80, socAkhir: 100, dayaKw: 150 });
    assert.ok(atas.menitLambat > bawah.menitLambat);
  });

  it("tidak menukik untuk pengisian AC — dayanya memang rata", () => {
    const sampai80 = hitungPengisian({ ...dasar, dayaKw: 7, socAkhir: 80 });
    const sampai100 = hitungPengisian({ ...dasar, dayaKw: 7, socAkhir: 100 });
    // 80% baterai berbanding 60%: paling banyak sepertiga lebih lama.
    assert.ok(sampai100.menitLambat < sampai80.menitLambat * 1.5);
  });

  it("menyebut satu angka saja kalau kedua ujungnya membulat sama", () => {
    // "20 menit – 20 menit" bukan kejujuran, itu cuma berisik.
    const h = { menitCepat: 19.6, menitLambat: 20.2 };
    assert.equal(teksDurasi(h as any), "20 menit");
  });
});

describe("batas daya kendaraan", () => {
  it("memakai daya kendaraan saat stasiunnya lebih kencang", () => {
    const h = hitungPengisian({ ...dasar, dayaKw: 150, dayaMaksKendaraan: 50 });
    assert.equal(h.dayaEfektif, 50);
    assert.equal(h.dibatasiKendaraan, true);
    const tanpaBatas = hitungPengisian({ ...dasar, dayaKw: 150 });
    assert.ok(h.menitCepat > tanpaBatas.menitCepat);
  });

  it("memakai daya stasiun saat kendaraannya sanggup lebih", () => {
    const h = hitungPengisian({ ...dasar, dayaKw: 50, dayaMaksKendaraan: 150 });
    assert.equal(h.dayaEfektif, 50);
    assert.equal(h.dibatasiKendaraan, false);
  });

  it("mengaku saat katalog belum mencatat batas kendaraannya", () => {
    // Seluruh 40 kendaraan di katalog memang belum punya angka ini. Diam-diam
    // menganggap seluruh daya stasiun terpakai berarti menjanjikan pengisian
    // yang lebih cepat daripada yang mungkin terjadi.
    const h = hitungPengisian({ ...dasar, dayaKw: 150 });
    assert.equal(h.batasTakDiketahui, true);
    assert.ok(catatanHasil(h).some((c: string) => /belum mencatat daya pengisian maksimum/.test(c)));
  });

  it("tidak menyebut batas yang tidak diketahui saat waktunya memang tak terhitung", () => {
    const h = hitungPengisian({ ...dasar, dayaKw: "" });
    assert.ok(!catatanHasil(h).some((c: string) => /belum mencatat/.test(c)));
  });
});

describe("jarak yang didapat", () => {
  it("sebanding dengan bagian baterai yang diisi", () => {
    const h = hitungPengisian({ ...dasar, rangeKm: 500 });
    assert.equal(h.kmDidapat, 300);
    assert.equal(kmKeTeks(h.kmDidapat), "± 300 km");
  });

  it("diam saat jarak tempuhnya tidak diketahui", () => {
    assert.equal(hitungPengisian(dasar).kmDidapat, null);
    assert.equal(kmKeTeks(null), "—");
  });
});

describe("teks", () => {
  it("menulis durasi dalam jam dan menit", () => {
    assert.equal(menitKeTeks(48), "48 menit");
    assert.equal(menitKeTeks(80), "1 jam 20 menit");
    assert.equal(menitKeTeks(420), "7 jam");
    assert.equal(menitKeTeks(0), "0 menit");
  });

  it("tidak membaca null sebagai nol menit", () => {
    // Number(null) bernilai 0, sehingga "belum bisa dihitung" akan terbaca
    // "selesai seketika".
    assert.equal(menitKeTeks(null), "");
    assert.equal(menitKeTeks(undefined), "");
    assert.equal(menitKeTeks(NaN), "");
  });

  it("menulis kWh dengan satu desimal", () => {
    assert.equal(kwhKeTeks(49.56), "49,6 kWh");
    assert.equal(kwhKeTeks(60), "60 kWh");
    assert.equal(kwhKeTeks(null), "—");
  });

  it("menyusun kalimat ringkas dari apa yang benar-benar diketahui", () => {
    const lengkap = teksRingkasPengisian(hitungPengisian({ ...dasar }));
    assert.match(lengkap, /60% baterai/);
    assert.match(lengkap, /memakan waktu/);
    assert.match(lengkap, /Rp /);

    const tanpaTarif = teksRingkasPengisian(hitungPengisian({ ...dasar, tarif: "" }));
    assert.match(tanpaTarif, /Isi tarifnya/);
    assert.doesNotMatch(tanpaTarif, /Rp /);

    const tanpaDaya = teksRingkasPengisian(hitungPengisian({ ...dasar, dayaKw: "" }));
    assert.match(tanpaDaya, /Isi daya stasiunnya/);
    assert.doesNotMatch(tanpaDaya, /memakan waktu/);
  });

  it("hanya menyebut catatan yang benar-benar berlaku", () => {
    const ac = catatanHasil(hitungPengisian({ ...dasar, dayaKw: 7, socAkhir: 100 }));
    assert.ok(!ac.some((c: string) => /menukik/.test(c)));
    assert.ok(ac.some((c: string) => /dayanya rata/.test(c)));

    const dc = catatanHasil(hitungPengisian({ ...dasar, socAkhir: 100 }));
    assert.ok(dc.some((c: string) => /menukik/.test(c)));
  });

  it("selalu menyebut bahwa yang dibayar lebih besar daripada yang masuk", () => {
    assert.ok(catatanHasil(hitungPengisian(dasar)).some((c: string) => /jadi panas/.test(c)));
  });

  it("mengaku menebak mode saat daya stasiunnya belum diisi", () => {
    // Tanpa daya, bukan cuma waktunya yang tak terhitung: AC dan DC punya rugi
    // pengisian yang berbeda, jadi BIAYA-nya pun bersandar pada tebakan.
    const h = hitungPengisian({ ...dasar, dayaKw: "" });
    assert.equal(h.dayaTakDiketahui, true);
    assert.ok(catatanHasil(h).some((c: string) => /terpaksa menganggapnya pengisian AC/.test(c)));

    const berdaya = hitungPengisian(dasar);
    assert.equal(berdaya.dayaTakDiketahui, false);
    assert.ok(!catatanHasil(berdaya).some((c: string) => /terpaksa/.test(c)));
  });
});

describe("nilai bawaan", () => {
  it("memakai jendela yang memang dipakai klaim pabrik", () => {
    assert.equal(DEFAULTS.socAwal, 20);
    assert.equal(DEFAULTS.socAkhir, BATAS_TAPER);
    // Bawaannya tidak boleh melewati batas taper: pembaca yang belum menyentuh
    // apa pun harus melihat angka yang paling bisa dipertanggungjawabkan.
    assert.ok(hitungPengisian({ ...DEFAULTS, batteryKwh: 60 }).lewatiTaper === false);
  });
});
