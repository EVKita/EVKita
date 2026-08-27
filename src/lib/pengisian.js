import { rupiahPenuh } from "./hemat.js";

/**
 * Hitungan waktu dan biaya sekali mengisi daya.
 *
 * Pasangan alami bagi direktori SPKLU: situs ini sudah menyebut di mana bisa
 * mengisi, tapi belum pernah menjawab berapa lama dan habis berapa.
 *
 * Semua di sini fungsi murni tanpa API khusus Node, supaya berkas yang sama
 * dipakai dua sisi — frontmatter `.astro` yang merender hasil di server dan
 * skrip di browser yang menghitung ulang setiap angka diubah. Pola yang sama
 * dengan `hemat.js`.
 *
 * SIKAPNYA JUGA SAMA: berhenti menjawab saat tidak punya jawaban. Isian kosong
 * bukan nol, dan yang paling penting — lama pengisian TIDAK PERNAH disajikan
 * sebagai satu angka. Pengisian tidak linear, kurvanya berbeda tiap kendaraan,
 * dan "37 menit" untuk sesuatu yang sebenarnya antara setengah jam dan satu jam
 * adalah kepastian palsu. Yang keluar dari sini selalu rentang.
 *
 * Teksnya Bahasa Indonesia dan memang tidak diterjemahkan — situs publik ini
 * berbahasa Indonesia.
 */

/** Nilai awal formulir. Semuanya perkiraan yang bisa diubah pembaca. */
export const DEFAULTS = {
  socAwal: 20,
  socAkhir: 80,
  dayaKw: 50,
  /** Rupiah per kWh, sekelas tarif SPKLU. */
  tarif: 2466,
};

/**
 * Daya yang lazim ditemui, sebagai tombol pintas.
 *
 * Angkanya nominal papan nama; yang benar-benar mengalir hampir selalu lebih
 * kecil, dan itulah yang membuat hasilnya berupa rentang.
 */
export const DAYA_PRESETS = [
  { id: "rumah", label: "Colokan rumah", value: 2.2, note: "AC, 10 A" },
  { id: "wallbox", label: "Wallbox", value: 7, note: "AC, 1 fase" },
  { id: "ac-publik", label: "AC publik", value: 22, note: "AC, 3 fase" },
  { id: "dc-spklu", label: "DC SPKLU", value: 50, note: "isi cepat" },
  { id: "dc-ultra", label: "DC ultra", value: 150, note: "isi sangat cepat" },
];

/**
 * Batas praktis pengisian AC di Indonesia, dalam kW.
 *
 * Di atas ini pasti DC. Pembeda ini bukan kerewelan istilah: AC melewati
 * pengisi bawaan mobil yang dayanya rata sepanjang pengisian, sedangkan DC
 * masuk langsung ke baterai dan menukik tajam mendekati penuh. Dua perilaku
 * yang berbeda tidak boleh dihitung dengan rumus yang sama.
 */
export const BATAS_AC_KW = 22;

/**
 * Persentase tempat pengisian DC mulai menukik.
 *
 * Inilah alasan hampir semua klaim pabrik berbunyi "10–80% dalam sekian menit"
 * dan berhenti di situ: dua puluh persen terakhir bisa memakan waktu selama
 * enam puluh persen sebelumnya.
 */
export const BATAS_TAPER = 80;

/**
 * Efisiensi pengisian: berapa bagian energi yang dibayar benar-benar sampai
 * ke baterai. Sisanya jadi panas di kabel, pengisi, dan sel baterainya.
 *
 * AC lebih rugi karena pengisi bawaan mobil yang mengubah AC jadi DC ikut
 * memanas. Keduanya perkiraan — tidak ada satu pun angka di katalog yang bisa
 * dipakai menghitungnya, dan halamannya wajib mengatakan itu.
 */
export const EFISIENSI = { ac: 0.88, dc: 0.96 };

/**
 * Berapa bagian daya papan nama yang benar-benar bertahan, sebagai RENTANG
 * [paling lambat, paling cepat].
 *
 * Bukan satu angka, karena tidak ada satu angka yang benar: daya yang mengalir
 * bergantung pada kurva pengisian tiap kendaraan, suhu baterai, dan berapa
 * kendaraan lain yang sedang berbagi stasiun yang sama. Yang bisa dikatakan
 * jujur hanyalah rentangnya — dan rentang yang melebar saat mendekati penuh
 * ITULAH pernyataan bahwa bagian itu paling sulit ditebak.
 */
export const SUSTAIN = {
  ac: { bawah: [0.95, 1.0], atas: [0.85, 1.0] },
  dc: { bawah: [0.65, 1.0], atas: [0.2, 0.45] },
};

/**
 * Membaca satu isian jadi angka, atau null.
 *
 * Isian yang KOSONG harus jadi null, bukan nol — pelajaran yang sama dengan
 * `hemat.js`. Di sini akibatnya: tarif yang belum diisi akan membuat biaya
 * sekali mengisi dilaporkan "Rp 0", dan itu jawaban yang kelihatan pasti untuk
 * pertanyaan yang belum ditanyakan siapa pun.
 */
function angka(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const teks = String(v).trim();
  if (teks === "") return null;
  const n = Number(teks.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Angka yang harus lebih dari nol: kapasitas, daya, tarif. */
function positif(v) {
  const n = angka(v);
  return n !== null && n > 0 ? n : null;
}

/** Persentase yang sah: 0–100. Di luar itu bukan angka yang lebih kecil/besar, melainkan salah. */
function persen(v) {
  const n = angka(v);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}

/** AC atau DC, diputuskan dari dayanya. */
export function modePengisian(dayaKw) {
  const kw = positif(dayaKw);
  return kw !== null && kw > BATAS_AC_KW ? "dc" : "ac";
}

/** Bagian jendela SoC yang jatuh di bawah dan di atas batas taper, dalam persen. */
function potongJendela(awal, akhir) {
  return {
    bawah: Math.max(0, Math.min(akhir, BATAS_TAPER) - Math.min(awal, BATAS_TAPER)),
    atas: Math.max(0, akhir - Math.max(awal, BATAS_TAPER)),
  };
}

/**
 * @typedef {object} PengisianInput
 * @property {number|string} batteryKwh kapasitas baterai
 * @property {number|string} socAwal persentase awal
 * @property {number|string} socAkhir persentase akhir
 * @property {number|string} dayaKw daya stasiun
 * @property {number|string} [tarif] rupiah per kWh
 * @property {number|string} [dayaMaksKendaraan] daya maksimum yang diterima kendaraan
 * @property {number|string} [rangeKm] jarak tempuh klaim, untuk "setara berapa km"
 */

/**
 * Setiap keluaran dihitung SENDIRI-SENDIRI dari isian yang dibutuhkannya saja.
 *
 * Itu disengaja: berapa kWh yang masuk sama sekali tidak bergantung pada daya
 * stasiun, dan berapa lama sama sekali tidak bergantung pada tarif. Halaman
 * yang mematikan seluruh jawabannya karena satu isian kosong menyembunyikan
 * jawaban yang sebenarnya sudah dimilikinya.
 *
 * @param {PengisianInput} input
 */
export function hitungPengisian(input) {
  const batteryKwh = positif(input.batteryKwh);
  const socAwal = persen(input.socAwal);
  const socAkhir = persen(input.socAkhir);
  const dayaStasiun = positif(input.dayaKw);
  const tarif = positif(input.tarif);
  const dayaMaksKendaraan = positif(input.dayaMaksKendaraan);
  const rangeKm = positif(input.rangeKm);

  /* Mengisi "dari 80% ke 20%" bukan pengisian yang lebih kecil, melainkan
     pertanyaan yang salah. Menjawabnya dengan angka negatif jauh lebih buruk
     daripada mengatakan bahwa isiannya keliru. */
  const socSalah = socAwal !== null && socAkhir !== null && socAkhir <= socAwal;
  const selisihSoc = socAwal !== null && socAkhir !== null && !socSalah ? socAkhir - socAwal : null;

  const mode = modePengisian(dayaStasiun);
  const efisiensi = EFISIENSI[mode];

  const energiMasuk = batteryKwh !== null && selisihSoc !== null ? (batteryKwh * selisihSoc) / 100 : null;
  const energiDitagih = energiMasuk !== null ? energiMasuk / efisiensi : null;

  const biaya = energiDitagih !== null && tarif !== null ? energiDitagih * tarif : null;
  const biayaPerKwh = energiMasuk !== null && biaya !== null && energiMasuk > 0 ? biaya / energiMasuk : null;

  /* Jarak yang didapat sebanding lurus dengan bagian baterai yang diisi —
     turunan angka klaim pabrik, jadi ia mewarisi seluruh keoptimisannya. */
  const kmDidapat = rangeKm !== null && selisihSoc !== null ? (rangeKm * selisihSoc) / 100 : null;

  /**
   * Stasiun tidak bisa memberi lebih dari yang diterima kendaraan. Menancapkan
   * mobil ber-batas 50 kW ke stasiun 150 kW tetap mengisi dengan 50 kW — kejutan
   * mahal yang sering baru disadari setelah menunggu satu jam.
   */
  const dayaEfektif =
    dayaStasiun === null
      ? null
      : dayaMaksKendaraan !== null
        ? Math.min(dayaStasiun, dayaMaksKendaraan)
        : dayaStasiun;

  const dibatasiKendaraan = dayaMaksKendaraan !== null && dayaStasiun !== null && dayaMaksKendaraan < dayaStasiun;

  const jendela = socAwal !== null && socAkhir !== null && !socSalah ? potongJendela(socAwal, socAkhir) : null;
  const lewatiTaper = !!jendela && jendela.atas > 0;

  let menitCepat = null;
  let menitLambat = null;
  if (batteryKwh !== null && jendela !== null && dayaEfektif !== null) {
    const s = SUSTAIN[mode];
    /*
     * Yang dibagi dengan daya adalah energi YANG DITAGIH, bukan yang masuk ke
     * baterai.
     *
     * Daya papan nama stasiun adalah daya di colokan, dan rugi pengisian
     * terjadi SESUDAH titik itu. Membagi energi yang masuk ke baterai dengan
     * daya colokan berarti menganggap rugi itu tidak memakan waktu sama sekali:
     * 60 kWh lewat wallbox 7 kW jadi terbaca 8 jam 34 menit, padahal yang
     * sebenarnya harus mengalir adalah 68 kWh dan itu makan waktu hampir sepuluh
     * jam. Selisih satu jam lebih, di angka yang justru dipakai orang untuk
     * memutuskan apakah mobilnya sempat terisi semalaman.
     */
    const perPersen = batteryKwh / 100 / efisiensi;
    const kwhBawah = perPersen * jendela.bawah;
    const kwhAtas = perPersen * jendela.atas;
    // Ujung cepat memakai bagian daya TERBESAR yang bertahan, ujung lambat
    // yang terkecil — kebalikannya menghasilkan rentang yang terbalik.
    const jam = (fBawah, fAtas) => kwhBawah / (dayaEfektif * fBawah) + kwhAtas / (dayaEfektif * fAtas);
    menitCepat = jam(s.bawah[1], s.atas[1]) * 60;
    menitLambat = jam(s.bawah[0], s.atas[0]) * 60;
  }

  return {
    ok: energiMasuk !== null,
    socSalah,
    selisihSoc,
    mode,
    efisiensi,
    energiMasuk,
    energiDitagih,
    biaya,
    biayaPerKwh,
    kmDidapat,
    dayaEfektif,
    dibatasiKendaraan,
    /** Katalog belum mencatat batas kendaraannya, jadi hitungan menganggap seluruh daya stasiun terpakai. */
    batasTakDiketahui: dayaMaksKendaraan === null,
    /**
     * Daya stasiunnya belum diisi. Bukan cuma berarti waktunya tak terhitung:
     * AC dan DC punya rugi pengisian yang berbeda, jadi tanpa daya itu bahkan
     * BIAYA-nya bersandar pada tebakan mode — dan itu harus dikatakan.
     */
    dayaTakDiketahui: dayaStasiun === null,
    lewatiTaper,
    menitCepat,
    menitLambat,
  };
}

/** "48 menit", "1 jam 20 menit", "7 jam". Dibulatkan ke menit penuh. */
export function menitKeTeks(menit) {
  // `Number(null)` bernilai 0, jadi null harus dicegat SEBELUM diubah jadi
  // angka — kalau tidak, "belum bisa dihitung" terbaca "selesai seketika".
  if (menit === null || menit === undefined) return "";
  const n = Number(menit);
  if (!Number.isFinite(n) || n < 0) return "";
  const m = Math.round(n);
  if (m < 60) return `${m} menit`;
  const jam = Math.floor(m / 60);
  const sisa = m % 60;
  return sisa ? `${jam} jam ${sisa} menit` : `${jam} jam`;
}

/**
 * Lama pengisian sebagai RENTANG, tidak pernah sebagai satu angka.
 *
 * Kalau kedua ujungnya membulat ke teks yang sama, satu teks saja yang keluar —
 * "20 menit – 20 menit" bukan kejujuran, itu cuma berisik.
 */
export function teksDurasi(hasil) {
  const cepat = menitKeTeks(hasil.menitCepat);
  const lambat = menitKeTeks(hasil.menitLambat);
  if (!cepat || !lambat) return "—";
  return cepat === lambat ? cepat : `${cepat} – ${lambat}`;
}

/** "46,4 kWh" — satu desimal; kWh bulat menyembunyikan selisih yang berarti. */
export function kwhKeTeks(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${(Math.round(Number(n) * 10) / 10).toLocaleString("id-ID")} kWh`;
}

/** "≈ 372 km" atau "—". */
export function kmKeTeks(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `± ${Math.round(Number(n)).toLocaleString("id-ID")} km`;
}

/**
 * Kalimat ringkas di atas kartu hasil.
 *
 * Ditaruh di sini, bukan di halaman dan skripnya masing-masing: kalimat yang
 * berbeda antara render server dan render browser sama merusaknya dengan angka
 * yang berbeda.
 */
export function teksRingkasPengisian(hasil) {
  if (hasil.socSalah) {
    return "Persentase akhir harus lebih besar daripada persentase awal — kalau tidak, tidak ada yang diisi.";
  }
  if (!hasil.ok) return "Isi kapasitas baterai dan rentang pengisiannya untuk melihat hasilnya.";

  const energi = kwhKeTeks(hasil.energiMasuk);
  const durasi = hasil.menitCepat !== null ? teksDurasi(hasil) : null;

  if (hasil.biaya !== null && durasi) {
    return `Mengisi ${hasil.selisihSoc}% baterai berarti memasukkan ${energi}, memakan waktu ${durasi}, dan menghabiskan ${rupiahPenuh(hasil.biaya)}.`;
  }
  if (hasil.biaya !== null) {
    return `Mengisi ${hasil.selisihSoc}% baterai berarti memasukkan ${energi} dan menghabiskan ${rupiahPenuh(hasil.biaya)}. Isi daya stasiunnya untuk tahu berapa lama.`;
  }
  if (durasi) {
    return `Mengisi ${hasil.selisihSoc}% baterai berarti memasukkan ${energi} dan memakan waktu ${durasi}. Isi tarifnya untuk tahu habis berapa.`;
  }
  return `Mengisi ${hasil.selisihSoc}% baterai berarti memasukkan ${energi} ke dalamnya.`;
}

/**
 * Peringatan yang menyertai hasil — bukan hiasan, melainkan bagian dari
 * jawabannya. Yang disebut di sini hanya yang benar-benar berlaku untuk
 * angka yang sedang ditampilkan.
 *
 * @returns {string[]}
 */
export function catatanHasil(hasil) {
  const out = [];

  if (hasil.dibatasiKendaraan) {
    out.push(
      `Stasiunnya lebih kencang daripada yang bisa diterima kendaraan ini. Yang dipakai menghitung adalah ${hasil.dayaEfektif} kW, bukan daya stasiunnya — sisanya tidak terpakai.`
    );
  } else if (hasil.batasTakDiketahui && hasil.menitCepat !== null) {
    out.push(
      "Katalog belum mencatat daya pengisian maksimum kendaraan ini, jadi hitungan di atas menganggap seluruh daya stasiun benar-benar diterima. Kalau batas kendaraannya lebih rendah, waktunya lebih lama."
    );
  }

  if (hasil.lewatiTaper && hasil.mode === "dc") {
    out.push(
      `Pengisian DC menukik tajam di atas ${BATAS_TAPER}%. Bagian terakhir itulah yang paling sulit ditebak, dan itu sebabnya rentang di atas melebar — hampir semua klaim pabrik berhenti di ${BATAS_TAPER}% justru karena ini.`
    );
  }

  if (hasil.menitCepat !== null) {
    out.push(
      hasil.mode === "dc"
        ? "Angka waktunya rentang, bukan satu angka: daya yang benar-benar mengalir bergantung pada kurva pengisian tiap kendaraan, suhu baterai, dan berapa kendaraan lain yang berbagi stasiun yang sama."
        : "Pengisian AC dayanya rata sepanjang pengisian, jadi rentangnya sempit — yang membatasi biasanya pengisi bawaan kendaraan, bukan stasiunnya."
    );
  }

  if (hasil.energiDitagih !== null) {
    out.push(
      hasil.dayaTakDiketahui
        ? `Yang dibayar lebih besar daripada yang masuk ke baterai: sebagian energi jadi panas. Karena daya stasiunnya belum diisi, hitungan ini terpaksa menganggapnya pengisian AC dengan efisiensi ${Math.round(hasil.efisiensi * 100)}% — pengisian DC lebih sedikit rugi, jadi biayanya akan sedikit lebih murah daripada yang tertulis.`
        : `Yang dibayar lebih besar daripada yang masuk ke baterai: sebagian energi jadi panas. Hitungan ini memakai efisiensi ${Math.round(hasil.efisiensi * 100)}% untuk pengisian ${hasil.mode.toUpperCase()}, dan itu perkiraan — tidak ada angkanya di katalog.`
    );
  }

  return out;
}
