import { RESEARCHABLE_BY_KEY, kindOfCollection } from "./vehicle-spec.js";
import { consumptionKwhPer100 } from "./hemat.js";

/**
 * Pemeriksa mutu data kendaraan.
 *
 * Panel Kesehatan Konten di dasbor selama ini hanya memeriksa KETIADAAN:
 * tidak ada gambar, tidak ada harga, tidak ada deskripsi. Ia tidak pernah
 * memeriksa apakah nilai yang ADA masuk akal. Jarak tempuh 4.500 km, baterai
 * 0,58 kWh, atau harga Rp 415.000 lolos tanpa sepatah kata pun, lalu tayang di
 * situs publik dan ikut ke tabel perbandingan — tempat angka janggal paling
 * merusak, karena di sana ia dibandingkan berdampingan dengan angka yang benar.
 *
 * Batas kewajarannya TIDAK ditulis ulang di sini. `vehicle-spec.js` sudah
 * memilikinya untuk keperluan riset AI, dan dua daftar batas yang sama untuk
 * data yang sama pasti berselisih cepat atau lambat. Yang ditambahkan berkas
 * ini hanyalah pemakaian batas itu ke arah sebaliknya: dari manusia ke data,
 * bukan dari AI ke formulir.
 *
 * Sikapnya MEMPERINGATKAN, bukan menolak. Angka aneh kadang benar — ada motor
 * listrik berbaterai 1,2 kWh dan ada mobil seharga sepuluh miliar. Panel tidak
 * berhak memutuskan itu; ia hanya berhak memastikan tidak ada yang lolos tanpa
 * pernah dilihat.
 */

/** Berapa hari sebelum sebuah entri dianggap perlu ditinjau ulang. */
export const HARI_BASI = 180;

/**
 * Konsumsi listrik yang wajar, kWh per 100 km.
 *
 * Ini pemeriksaan SILANG: `rangeKm` dan `batteryKwh` bisa dua-duanya berada di
 * dalam batasnya sendiri dan tetap mustahil kalau dipasangkan. Mobil listrik
 * yang beredar di Indonesia berkisar 12-25 kWh/100 km; motor 2-6. Batas di
 * bawah ini sengaja jauh lebih longgar daripada kenyataan — yang dicari cuma
 * yang mustahil, bukan yang tidak biasa.
 */
const KONSUMSI = {
  mobil: { min: 8, max: 40 },
  motor: { min: 1, max: 12 },
};

const angka = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Nilai di luar batas wajar pada satu kendaraan.
 *
 * @returns {{key: string, jenis: "rendah"|"tinggi", nilai: number, batas: number}[]}
 */
export function nilaiJanggal(item, col) {
  const kind = kindOfCollection(col);
  const out = [];
  if (!item) return out;

  for (const [key, def] of RESEARCHABLE_BY_KEY) {
    if (def.type !== "number" && def.type !== "integer") continue;
    if (kind === "motor" && !def.motor) continue;
    if (kind === "mobil" && !def.car) continue;

    const n = angka(item[key]);
    if (n === null || !Number.isFinite(n)) continue;
    if (def.min !== undefined && n < def.min) out.push({ key, jenis: "rendah", nilai: n, batas: def.min });
    else if (def.max !== undefined && n > def.max) out.push({ key, jenis: "tinggi", nilai: n, batas: def.max });
  }

  return out;
}

/**
 * Pasangan jarak tempuh dan kapasitas baterai yang tidak mungkin bersamaan.
 *
 * @returns {{konsumsi: number, jenis: "rendah"|"tinggi", batas: number}|null}
 */
export function konsumsiJanggal(item, col) {
  const kind = kindOfCollection(col);
  const batas = KONSUMSI[kind];
  if (!batas || !item) return null;
  const k = consumptionKwhPer100(item);
  if (k === null) return null;
  if (k < batas.min) return { konsumsi: k, jenis: "rendah", batas: batas.min };
  if (k > batas.max) return { konsumsi: k, jenis: "tinggi", batas: batas.max };
  return null;
}

/** Nama yang dipakai untuk mencari kembaran — tanpa spasi ganda, tanpa beda huruf besar. */
function kunciNama(item) {
  return [item?.brand, item?.name]
    .map((s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Kendaraan yang merek dan namanya sama persis.
 *
 * Panel sudah punya pemeriksaan seperti ini untuk direktori
 * (`checkDirDuplicate()` di admin.js) tapi tidak untuk kendaraan — padahal di
 * sinilah dua entri kembar paling merugikan: keduanya muncul di katalog,
 * keduanya bisa dipilih untuk dibandingkan, dan pembacanya tidak punya cara
 * tahu mana yang datanya lebih baru.
 *
 * @returns Map<string, string[]> kunci nama → daftar id
 */
export function cariKembar(list) {
  const peta = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const kunci = kunciNama(item);
    if (!kunci) continue;
    if (!peta.has(kunci)) peta.set(kunci, []);
    peta.get(kunci).push(String(item.id || ""));
  }
  for (const [kunci, ids] of [...peta]) if (ids.length < 2) peta.delete(kunci);
  return peta;
}

/**
 * Sudah berapa lama entri ini tidak disentuh?
 *
 * Dihitung, bukan disimpan. Saklar `stale` yang sudah ada tetap milik manusia:
 * ia dipasang saat SESEORANG tahu datanya kedaluwarsa, dan menimpanya dengan
 * hitungan otomatis akan menghapus penilaian itu. Yang ini melengkapi, bukan
 * menggantikan.
 *
 * Nilainya sengaja tidak ikut ke situs publik. Menandai dua puluh mobil
 * "Data lama" hanya karena tidak ada yang menyentuhnya selama enam bulan
 * memberi tahu pembaca sesuatu tentang jadwal kerja redaksi, bukan tentang
 * mobilnya.
 */
export function basi(item, sekarang = Date.now(), hari = HARI_BASI) {
  const at = Date.parse(item?.updatedAt || "");
  if (!Number.isFinite(at)) return false;
  return sekarang - at > hari * 24 * 60 * 60 * 1000;
}
