/**
 * Logika murni pembaruan data kendaraan otomatis.
 *
 * Bagian dari fitur "auto update" katalog: server meriset kendaraan lewat AI
 * sekali sehari lalu menerapkan hasilnya langsung — TANPA menunggu persetujuan
 * manusia. Karena itu aturan di sini sengaja lebih ketat daripada usulan
 * manual yang ada di editor:
 *
 *   1. Hanya nilai dengan keyakinan minimum tertentu yang boleh diterapkan
 *      (bawaannya "tinggi", yang oleh instruksi riset hanya dipakai untuk
 *      nilai dari situs resmi pabrikan).
 *   2. Nilai yang KOSONG (AI tidak menemukan apa-apa) tidak pernah diterapkan
 *      — dan karena null sudah dibuang `ai-usulan.js` sebelum sampai ke sini,
 *      "tidak ada data baru" otomatis berarti "data lama dipertahankan".
 *   3. Nilai yang SAMA PERSIS dengan yang sudah ada juga tidak diterapkan,
 *      supaya `updatedAt` tidak berubah tanpa perubahan isi.
 *
 * Berkas ini JavaScript polos tanpa API khusus Node, supaya aturannya bisa
 * diuji langsung tanpa menyentuh disk — pola yang sama dengan `theme.js`,
 * `footer.js`, dan `peluncuran.js`.
 */

import { isFilled } from "./vehicle-spec.js";

/** Urutan tingkat keyakinan, dari yang paling tepercaya. */
export const KEYAKINAN_URUT = ["tinggi", "sedang", "rendah"];

/** Nilai bawaan pengaturan. Ditulis di sini, bukan di dua tempat sekaligus. */
export const PEMBARUAN_DEFAULTS = {
  aktif: false,
  /** Berapa kendaraan paling banyak diriset dalam satu hari. */
  batasHarian: 5,
  /** Kalau menyala, hanya kendaraan bertanda `stale` yang diriset. */
  hanyaBasi: false,
  /** Keyakinan minimum agar sebuah nilai boleh diterapkan otomatis. */
  keyakinanMin: "tinggi",
  /** Riset harian pertama dijalankan setelah jam ini (WIB). */
  mulaiJam: 4,
};

export const BATAS_HARIAN_MIN = 1;
export const BATAS_HARIAN_MAKS = 50;

function bool(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return !!v;
}

function num(v, min, max, fallback) {
  const s = String(v == null ? "" : v).trim();
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pick(v, list, fallback) {
  const s = String(v == null ? "" : v).trim();
  return list.includes(s) ? s : fallback;
}

/** Membaca pengaturan apa adanya dan mengembalikan nilai yang sudah aman. */
export function normalkanPengaturan(raw) {
  const s = raw || {};
  return {
    aktif: bool(s.aktif, PEMBARUAN_DEFAULTS.aktif),
    batasHarian: num(s.batasHarian, BATAS_HARIAN_MIN, BATAS_HARIAN_MAKS, PEMBARUAN_DEFAULTS.batasHarian),
    hanyaBasi: bool(s.hanyaBasi, PEMBARUAN_DEFAULTS.hanyaBasi),
    keyakinanMin: pick(s.keyakinanMin, KEYAKINAN_URUT, PEMBARUAN_DEFAULTS.keyakinanMin),
    mulaiJam: num(s.mulaiJam, 0, 23, PEMBARUAN_DEFAULTS.mulaiJam),
  };
}

/**
 * Kendaraan mana yang diriset hari ini.
 *
 * Urutannya sengaja stabil dan berputar: yang `stale` selalu didahulukan, lalu
 * yang paling lama tidak diperbarui (atau tidak pernah diperbarui). Dengan
 * `batasHarian` yang lebih kecil dari jumlah kendaraan, seluruh katalog
 * berputar pelan-pelan tanpa pernah ada yang terlupa.
 *
 * Kendaraan draf dan yang tidak punya merek/nama dilewati: tanpa keduanya
 * riset tidak punya pegangan untuk dicari.
 *
 * @param {object} content Dokumen konten yang sudah dinormalkan.
 * @param {object} pengaturan Pengaturan yang sudah dinormalkan.
 */
export function pilihKendaraan(content, pengaturan) {
  const p = normalkanPengaturan(pengaturan);
  const daftar = [];

  for (const col of ["cars", "motors"]) {
    const kind = col === "motors" ? "motor" : "mobil";
    for (const v of (content && content[col]) || []) {
      if (!v || !v.brand || !v.name) continue;
      if (v.status === "draft") continue;
      daftar.push({
        col,
        kind,
        id: String(v.id || ""),
        brand: String(v.brand),
        name: String(v.name),
        stale: !!v.stale,
        updatedAt: String(v.updatedAt || ""),
      });
    }
  }

  const dipilih = p.hanyaBasi ? daftar.filter((v) => v.stale) : daftar;

  dipilih.sort((a, b) => {
    if (!!a.stale !== !!b.stale) return a.stale ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt.localeCompare(b.updatedAt);
    return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
  });

  return dipilih.slice(0, p.batasHarian);
}

/**
 * Apakah dua nilai benar-benar berbeda?
 *
 * Daftar dibandingkan elemen demi elemen, angka sebagai angka, sisanya sebagai
 * teks. Alasan fungsi ini ada: tanpa membandingkan, nilai yang "ditemukan" AI
 * tapi sebenarnya sama persis dengan yang lama tetap akan dianggap perubahan —
 * dan `updatedAt` ikut berganti tanpa isi yang berganti.
 */
export function berbeda(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return true;
    return a.some((x, i) => String(x ?? "").trim() !== String(b[i] ?? "").trim());
  }
  if (Array.isArray(a) || Array.isArray(b)) return true;

  const ta = typeof a;
  const tb = typeof b;
  if (ta === "number" || tb === "number") {
    return Number(a) !== Number(b);
  }
  return String(a ?? "").trim() !== String(b ?? "").trim();
}

/**
 * Membangun tambalan (patch) otomatis dari usulan yang sudah dibersihkan.
 *
 * Satu-satunya jalan nilai AI masuk ke `content.json` tanpa persetujuan
 * manusia, jadi pagarnya ditulis ketat dan tidak bisa diakali panel:
 *
 *   - keyakinan harus memenuhi ambang `keyakinanMin` (bawaan "tinggi");
 *   - nilai harus terisi (null sudah dibuang lebih dulu oleh `ai-usulan.js`);
 *   - nilai harus BERBEDA dari yang sekarang — kalau tidak, tidak ada yang
 *     berubah dan data lama dipertahankan apa adanya.
 *
 * @param {any[]} usulan Daftar usulan dari `bersihkanUsulan()`.
 * @param {object} vehicle Isi kendaraan sekarang (untuk membandingkan).
 * @param {string} keyakinanMin Salah satu dari `KEYAKINAN_URUT`.
 */
export function patchOtomatis(usulan, vehicle, keyakinanMin) {
  const ambang = KEYAKINAN_URUT.indexOf(keyakinanMin);
  const patch = {};

  for (const u of usulan || []) {
    const yakin = KEYAKINAN_URUT.indexOf(u && u.keyakinan);
    if (yakin === -1 || yakin > ambang) continue;
    if (!isFilled(u && u.nilai)) continue;
    if (!berbeda(u.nilai, vehicle ? vehicle[u.key] : null)) continue;
    patch[u.key] = u.nilai;
  }

  return patch;
}
