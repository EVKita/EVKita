/**
 * Pembersih usulan AI — pagar terakhir sebelum apa pun sampai ke layar.
 *
 * Skema JSON sudah memaksa BENTUK jawaban, tapi ia tidak bisa memaksa isinya
 * masuk akal: `batteryKwh: 3500` cocok dengan skema dan tetap mustahil. Dan
 * yang lebih penting, seluruh isi jawaban berasal dari halaman web yang tidak
 * kita kendalikan. Seseorang bisa menaruh teks di halamannya yang menyuruh
 * model menulis harga 1, atau menyisipkan `javascript:` sebagai alamat sumber.
 *
 * Berkas ini yang menutupnya, dan ia bekerja dengan satu aturan tunggal:
 *
 *   Nilai yang tidak lolos DIBUANG, bukan diperbaiki.
 *
 * Menebak maksud model ("mungkin dia maksud 350 kWh?") adalah menambah satu
 * lapis tebakan di atas tebakan. Yang dibuang dicatat sebagai peringatan,
 * supaya penyunting tahu ada yang dibuang dan kenapa.
 *
 * Sengaja JavaScript polos tanpa API khusus Node.
 */

import { safeUrl } from "./url.js";
import { CONFIDENCE, RESEARCHABLE_BY_KEY, enumFor, fieldsFor, isFilled } from "./vehicle-spec.js";

/** Batas panjang teks bebas yang kita terima, apa pun kata skemanya. */
const MAX_TEKS = 200;
const MAX_CATATAN = 300;

function teks(value, batas) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, batas || MAX_TEKS);
}

/**
 * Semua pembacaan yang MUNGKIN dari sebuah angka bertuliskan pemisah.
 *
 * Model diminta menulis angka polos, tapi jawaban yang datang tetap sesekali
 * membawa pemisah dari halaman aslinya — dan pemisah itu tidak punya arti
 * tunggal. `"799.000.000"` jelas 799 juta. `"84.5"` jelas 84,5. Tapi
 * `"4.500"` bisa berarti empat ribu lima ratus (cara Indonesia) atau empat
 * setengah (cara Inggris), dan tidak ada di dalam string itu yang bisa
 * memutuskan.
 *
 * Jadi fungsi ini tidak memutuskan. Ia mengembalikan seluruh kemungkinan, dan
 * pemanggilnya yang memilih memakai batas nilai wajar milik field itu —
 * 4.500 kWh mustahil, 4,5 kWh biasa saja, jadi jawabannya jelas tanpa perlu
 * seorang pun menebak. Kalau kedua pembacaan sama-sama masuk akal, nilainya
 * dibuang; angka yang salah faktor seribu di halaman harga adalah persis jenis
 * kesalahan yang tidak boleh lolos diam-diam.
 */
function kandidatAngka(value) {
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];

  const s = String(value === null || value === undefined ? "" : value)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!s) return [];

  const out = [];
  const tambah = (teks) => {
    const n = Number(teks);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  };

  const titik = (s.match(/\./g) || []).length;
  const koma = (s.match(/,/g) || []).length;

  // Dua jenis pemisah sekaligus: yang muncul TERAKHIR adalah desimalnya, yang
  // lain pemisah ribuan. Tidak ada yang ambigu di sini.
  if (titik && koma) {
    const desimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const ribuan = desimal === "." ? "," : ".";
    tambah(s.split(ribuan).join("").replace(desimal, "."));
    return out;
  }

  const pemisah = titik ? "." : koma ? "," : "";
  if (!pemisah) {
    tambah(s);
    return out;
  }

  const bagian = s.split(pemisah);
  const ekor = bagian.slice(1);

  // Pembacaan "pemisah ribuan" hanya masuk akal kalau tiap kelompok setelahnya
  // benar-benar tiga digit.
  if (ekor.every((b) => /^\d{3}$/.test(b))) tambah(bagian.join(""));
  // Pembacaan "desimal" hanya masuk akal kalau pemisahnya cuma satu.
  if (ekor.length === 1) tambah(s.replace(pemisah, "."));

  return out;
}

function keyakinan(value) {
  const v = teks(value, 20).toLowerCase();
  return CONFIDENCE.includes(v) ? v : "rendah";
}

/**
 * Satu nilai yang sudah dibersihkan, atau alasan kenapa ia dibuang.
 *
 * @returns {{ nilai: any } | { tolak: string }}
 */
function bersihkanNilai(field, raw, kind) {
  if (raw === null || raw === undefined || raw === "") return { nilai: null };

  if (field.type === "enum") {
    const pilihan = enumFor(field.key, kind);
    const v = teks(raw, 60);
    // Dicocokkan tanpa peduli besar-kecil huruf, tapi yang DISIMPAN selalu
    // ejaan resmi dari daftar kita — bukan ejaan model.
    const cocok = pilihan.find((p) => p.toLowerCase() === v.toLowerCase());
    if (cocok === undefined) return { tolak: "diluarPilihan" };
    return { nilai: cocok };
  }

  if (field.type === "number" || field.type === "integer") {
    const kandidat = kandidatAngka(raw);
    if (!kandidat.length) return { tolak: "bukanAngka" };

    const masukAkal = kandidat.filter((n) => n >= field.min && n <= field.max);
    if (!masukAkal.length) return { tolak: "diluarBatas" };
    if (masukAkal.length > 1) return { tolak: "ambigu" };

    const n = masukAkal[0];
    return { nilai: field.type === "integer" ? Math.round(n) : n };
  }

  if (field.type === "list") {
    if (!Array.isArray(raw)) return { tolak: "bukanDaftar" };
    const isi = raw
      .map((x) => teks(x, field.maxLen || 60))
      .filter(Boolean)
      .slice(0, field.maxItems || 20);
    /*
     * Duplikat dibuang: model kadang mengembalikan varian yang sama dua kali
     * dengan ejaan berbeda tipis, dan panel menghitung jumlah varian dari
     * panjang daftar ini. Yang DISIMPAN adalah kemunculan pertama — daftar
     * varian biasanya diurutkan dari yang paling resmi, jadi ejaan pertama
     * yang paling mungkin benar.
     */
    const unik = [];
    const sudahAda = new Set();
    for (const x of isi) {
      const kunci = x.toLowerCase();
      if (sudahAda.has(kunci)) continue;
      sudahAda.add(kunci);
      unik.push(x);
    }
    return unik.length ? { nilai: unik } : { nilai: null };
  }

  const v = teks(raw, field.max || MAX_TEKS);
  return v ? { nilai: v } : { nilai: null };
}

/**
 * Mengubah jawaban mentah model jadi daftar usulan yang siap ditampilkan.
 *
 * @param {any} raw Objek hasil parse dari model.
 * @param {object} opts
 * @param {"mobil"|"motor"} opts.kind
 * @param {object} [opts.vehicle] Isi kendaraan sekarang, untuk kolom "sekarang"
 *   dan untuk memutuskan centang awal.
 * @param {string[]} [opts.only] Batasi ke field tertentu.
 * @returns {{ ringkasan: string, peringatan: string[], usulan: any[] }}
 */
export function bersihkanUsulan(raw, opts) {
  const kind = opts && opts.kind === "motor" ? "motor" : "mobil";
  const vehicle = (opts && opts.vehicle) || {};
  const wanted = opts && opts.only && opts.only.length ? new Set(opts.only) : null;

  const peringatan = [];
  const usulan = [];

  const sumberField = raw && typeof raw.field === "object" && raw.field ? raw.field : {};

  for (const [key, isi] of Object.entries(sumberField)) {
    const field = RESEARCHABLE_BY_KEY.get(key);

    /*
     * Kunci yang tidak dikenal DIBUANG DIAM-DIAM, tanpa peringatan.
     *
     * Ini bukan kelalaian. Kalau halaman web berhasil membujuk model menulis
     * `"description"` atau `"status"` ke dalam jawaban, menampilkan namanya di
     * layar berarti memberi teks dari halaman itu satu jalur ke mata
     * penyunting. Yang penting bukan memberi tahu bahwa ada yang mencoba —
     * yang penting kuncinya tidak pernah sampai ke formulir.
     */
    if (!field) continue;
    if (wanted && !wanted.has(key)) continue;
    // Field yang tidak berlaku untuk jenis ini (mis. jumlah kursi pada motor).
    if (!fieldsFor(kind).some((f) => f.key === key)) continue;
    if (!isi || typeof isi !== "object") continue;

    const hasil = bersihkanNilai(field, isi.nilai, kind);
    if (hasil.tolak) {
      peringatan.push(`${key}: ${hasil.tolak}`);
      continue;
    }
    if (hasil.nilai === null) continue;

    const yakin = keyakinan(isi.keyakinan);
    const sekarang = vehicle[key];
    const terisi = isFilled(sekarang);

    usulan.push({
      key,
      nilai: hasil.nilai,
      sekarang: terisi ? sekarang : null,
      keyakinan: yakin,
      // `safeUrl` di titik ini, bukan saat menampilkan: alamat yang skemanya
      // tidak aman lebih baik hilang sama sekali daripada ikut berkeliling
      // sebagai string yang "nanti disaring".
      sumber: safeUrl(isi.sumber),
      catatan: teks(isi.catatan, MAX_CATATAN),

      /*
       * Centang awal. Aturannya cuma satu dan sengaja tidak pintar-pintar:
       * AI boleh MENGISI yang kosong tanpa diminta, tapi tidak pernah boleh
       * MENGGANTI yang sudah ada tanpa seseorang memutuskannya. Nilai dengan
       * keyakinan rendah juga tidak pernah tercentang sendiri.
       */
      pilih: !terisi && yakin !== "rendah",
    });
  }

  // Urutan field mengikuti urutan di vehicle-spec, bukan urutan jawaban model:
  // panel usulan harus terbaca sama setiap kali, apa pun urutan yang dikirim.
  const urutan = fieldsFor(kind).map((f) => f.key);
  usulan.sort((a, b) => urutan.indexOf(a.key) - urutan.indexOf(b.key));

  const dariModel = Array.isArray(raw && raw.peringatan)
    ? raw.peringatan.map((p) => teks(p, MAX_CATATAN)).filter(Boolean).slice(0, 8)
    : [];

  return {
    ringkasan: teks(raw && raw.ringkasan, 400),
    peringatan: [...dariModel, ...peringatan],
    usulan,
  };
}

/**
 * Mengubah usulan yang dicentang jadi tambalan untuk formulir.
 *
 * Sengaja terpisah dari `bersihkanUsulan`: yang satu memutuskan apa yang boleh
 * DITAMPILKAN, yang satu lagi apa yang benar-benar DIPAKAI. Panel bisa
 * mengubah centangnya berkali-kali di antara keduanya.
 */
export function terapkanUsulan(usulan, pilihan) {
  const dipilih = new Set(pilihan || []);
  const patch = {};
  for (const u of usulan || []) {
    if (!dipilih.has(u.key)) continue;
    patch[u.key] = u.nilai;
  }
  return patch;
}
