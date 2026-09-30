/**
 * Penyimpanan suara VoteKita — `data/votes.json`, ikut .gitignore.
 *
 * Bentuknya `{ cars: { <id>: { s, v } }, motors: { ... }, voters: { ... } }`:
 * `s` jumlah bintang yang terkumpul, `v` jumlah suara. Rata-rata tidak
 * disimpan — selalu `s / v` — supaya tidak ada dua angka yang bisa berselisih.
 *
 * Satu pengunjung satu favorit per jenis (satu mobil + satu motor, ala
 * Shining Awards): browser mengingat favoritnya di `localStorage`
 * (`evkita_fav_mobil` / `evkita_fav_motor`) dan server mengingatnya di
 * `voters[<vid>]` lewat cookie `evkita_vid`. Memilih kendaraan lain dalam
 * jenis yang sama MEMINDAHKAN suaranya: suara lama dicabut (`v - 1`) dan
 * suara baru masuk — jumlah suara pengunjung itu tetap satu per jenis.
 *
 * Tanpa pengenal akun wajib, `vid` memang cookie acak yang dipercaya dari
 * klien — sama seperti seluruh situs publik. Pengunjung yang masuk lewat
 * akun (MemberGate, Google) tetap memakai cookie yang sama, jadi satu
 * akun satu suara selama memakai peramban yang sama.
 */

import fs from "node:fs";
import path from "node:path";

const BERKAS = () => path.join(path.resolve(process.cwd(), "data"), "votes.json");

/** Nama cookie identitas pemilih. Dibaca server dari cookie, bukan dari isi. */
export const VOTER_COOKIE = "evkita_vid";

/** Batas catatan pemilih supaya berkas tidak tumbuh tanpa henti. */
const BATAS_PEMILIH = 50000;

/** Nama jenis dari API (`mobil`/`motor`) maupun nama koleksi dipetakan ke embernya. */
const EMBER = { mobil: "cars", motor: "motors", cars: "cars", motors: "motors" };

function emberKosong() {
  return { cars: {}, motors: {} };
}

/** Saring satu ember: hanya catatan `{ s, v }` yang masuk akal yang lolos. */
function saringEmber(obj) {
  const keluar = {};
  if (!obj || typeof obj !== "object") return keluar;
  for (const [id, stat] of Object.entries(obj)) {
    const s = Number(stat && stat.s);
    const v = Number(stat && stat.v);
    if (!id || !Number.isFinite(s) || !Number.isFinite(v) || v < 1 || s < 0) continue;
    keluar[id] = { s, v: Math.floor(v) };
  }
  return keluar;
}

/** Baca seluruh agregat. Berkas rusak atau hilang berarti mulai dari kosong. */
export function bacaVotes() {
  try {
    const data = JSON.parse(fs.readFileSync(BERKAS(), "utf8"));
    return { cars: saringEmber(data && data.cars), motors: saringEmber(data && data.motors) };
  } catch {
    return emberKosong();
  }
}

/** Baca dokumen penuh termasuk peta pemilih (untuk API dan endpoint). */
export function bacaDokumen() {
  try {
    const data = JSON.parse(fs.readFileSync(BERKAS(), "utf8"));
    return {
      cars: saringEmber(data && data.cars),
      motors: saringEmber(data && data.motors),
      voters: saringPemilih(data && data.voters),
    };
  } catch {
    return { ...emberKosong(), voters: {} };
  }
}

/** Pilihan favorit satu pemilih: `{ mobil: { id, stars } | null, motor: ... }`. */
export function bacaPilihan(vid) {
  const kunci = String(vid || "");
  if (!sahVid(kunci)) return { mobil: null, motor: null };
  const dok = bacaDokumen();
  return normalPilihan(dok.voters[kunci]);
}

/** Jumlah seluruh suara per jenis — untuk persen ala Shining Awards. */
export function totalSuara(ember) {
  let n = 0;
  if (ember && typeof ember === "object") {
    for (const stat of Object.values(ember)) n += Number(stat && stat.v) || 0;
  }
  return Math.floor(n);
}

/** Id pemilih yang sah: acak 8–64 karakter, tanpa spasi. */
export function sahVid(vid) {
  return typeof vid === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(vid);
}

/** Satu pilihan `{ id, stars }` yang sah, atau null. */
function saringSatu(pil) {
  if (!pil || typeof pil !== "object") return null;
  const id = String(pil.id || "");
  const stars = Number(pil.stars);
  if (!id || id.length > 200) return null;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return null;
  return { id, stars };
}

/** Normalkan pilihan pemilih menjadi `{ mobil, motor }` berisi saringan. */
function normalPilihan(pil) {
  if (!pil || typeof pil !== "object") return { mobil: null, motor: null };
  return { mobil: saringSatu(pil.mobil), motor: saringSatu(pil.motor) };
}

/** Saring peta pemilih; kelebihan di atas batas dibuang dari depan. */
function saringPemilih(obj) {
  const keluar = {};
  if (!obj || typeof obj !== "object") return keluar;
  for (const [vid, pil] of Object.entries(obj)) {
    if (!sahVid(vid)) continue;
    const normal = normalPilihan(pil);
    if (!normal.mobil && !normal.motor) continue;
    keluar[vid] = normal;
  }
  const kunci = Object.keys(keluar);
  if (kunci.length > BATAS_PEMILIH) {
    for (const k of kunci.slice(0, kunci.length - BATAS_PEMILIH)) delete keluar[k];
  }
  return keluar;
}

function tulisAtomik(file, teks) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sementara = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(sementara, teks, "utf8");
  fs.renameSync(sementara, file);
}

/**
 * Terapkan satu suara ke sebuah catatan — murni, tanpa sentuhan disk.
 *
 * `entri` catatan lama `{ s, v }` (atau kosong bila belum ada suara),
 * `stars` bintang baru 1–5, `prev` suara pengunjung ini sebelumnya 0–5
 * (0 = belum pernah). Aturannya: yang sudah pernah voting hanya MENGGESER
 * jumlah (`s += stars - prev`, `v` tetap); yang baru MENAMBAH
 * (`s += stars`, `v += 1`). Jumlah yang jatuh di bawah nol dijepit ke nol,
 * dan catatan tanpa suara dikembalikan sebagai `null` (tanda untuk dihapus).
 */
export function terapkanVote(entri, stars, prev) {
  const sAwal = Number(entri && entri.s) || 0;
  const vAwal = Number(entri && entri.v) || 0;
  const baru = Number(stars);
  const lalu = Number(prev) || 0;
  let s;
  let v;
  if (lalu > 0) {
    s = sAwal + baru - lalu;
    v = vAwal;
  } else {
    s = sAwal + baru;
    v = vAwal + 1;
  }
  if (s < 0) s = 0;
  if (!(v > 0)) return null;
  return { s, v };
}

/**
 * Simpan satu suara: baca berkas, terapkan, tulis atomik (tmp + rename),
 * kembalikan `{ avg, votes }` untuk jawaban API. Melempar bila jenis, id,
 * atau angkanya di luar bentuk yang sah — pemanggil (endpoint `/api/vote`)
 * sudah menyaringnya lebih dulu, ini jaring pengaman terakhir.
 */
export function simpanVote(kind, id, stars, prev) {
  const ember = EMBER[kind];
  const kunci = String(id || "");
  const bintang = Number(stars);
  const lalu = Number(prev);
  if (!ember) throw new RangeError(`jenis suara tidak dikenal: ${String(kind)}`);
  if (!kunci || kunci.length > 200) throw new RangeError("id kendaraan tidak sah");
  if (!Number.isInteger(bintang) || bintang < 1 || bintang > 5) {
    throw new RangeError("bintang harus bilangan bulat 1–5");
  }
  if (!Number.isInteger(lalu) || lalu < 0 || lalu > 5) {
    throw new RangeError("suara sebelumnya harus bilangan bulat 0–5");
  }
  const semua = bacaVotes();
  const hasil = terapkanVote(semua[ember][kunci], bintang, lalu);
  if (hasil) semua[ember][kunci] = hasil;
  else delete semua[ember][kunci];
  tulisAtomik(BERKAS(), JSON.stringify(semua, null, 2));
  return { avg: hasil ? hasil.s / hasil.v : 0, votes: hasil ? hasil.v : 0 };
}

/**
 * Simpan satu favorit: satu pengunjung satu pilihan per jenis.
 *
 * `vid` identitas pemilih dari cookie. Aturannya:
 * - belum pernah memilih jenis ini → suara baru (`s += stars`, `v += 1`);
 * - memilih kendaraan yang SAMA → geser bintang (`s += stars - lama`);
 * - memilih kendaraan LAIN → cabut suara lama (`s -= lama.stars`, `v -= 1`,
 *   hapus bila habis) lalu masukkan suara baru.
 *
 * Mengembalikan `{ hasil, lama, favorit }`: agregat baru, agregat lama yang
 * dicabut (atau null), dan pilihan pemilih kini. `prev` dari klien hanya
 * dipakai sebagai petunjuk bila catatan server hilang (cookie baru) — dalam
 * hal itu suara selalu dihitung BARU supaya jumlah tidak bisa negatif.
 */
export function simpanFavorit(kind, id, stars, vid) {
  const ember = EMBER[kind];
  const kunci = String(id || "");
  const bintang = Number(stars);
  if (!ember) throw new RangeError(`jenis suara tidak dikenal: ${String(kind)}`);
  if (!kunci || kunci.length > 200) throw new RangeError("id kendaraan tidak sah");
  if (!Number.isInteger(bintang) || bintang < 1 || bintang > 5) {
    throw new RangeError("bintang harus bilangan bulat 1–5");
  }
  if (!sahVid(String(vid || ""))) throw new RangeError("identitas pemilih tidak sah");
  const idPemilih = String(vid);

  const dok = bacaDokumen();
  const agg = dok[ember];
  const field = ember === "motors" ? "motor" : "mobil";
  const lama = (dok.voters[idPemilih] && dok.voters[idPemilih][field]) || null;

  let cabut = null;
  if (lama && lama.id !== kunci) {
    const cat = agg[lama.id];
    if (cat) {
      const s = Number(cat.s) - lama.stars;
      const v = Number(cat.v) - 1;
      if (v > 0) {
        agg[lama.id] = { s: Math.max(0, s), v };
        cabut = { id: lama.id, avg: agg[lama.id].s / agg[lama.id].v, votes: agg[lama.id].v };
      } else {
        delete agg[lama.id];
        cabut = { id: lama.id, avg: 0, votes: 0 };
      }
    } else {
      cabut = { id: lama.id, avg: 0, votes: 0 };
    }
  }

  let hasil;
  if (lama && lama.id === kunci) {
    hasil = terapkanVote(agg[kunci], bintang, lama.stars);
  } else {
    hasil = terapkanVote(agg[kunci], bintang, 0);
  }
  if (hasil) agg[kunci] = hasil;
  else delete agg[kunci];

  if (!dok.voters[idPemilih]) dok.voters[idPemilih] = { mobil: null, motor: null };
  dok.voters[idPemilih][field] = { id: kunci, stars: bintang };

  tulisAtomik(BERKAS(), JSON.stringify(dok, null, 2));
  return {
    hasil: { avg: hasil ? hasil.s / hasil.v : 0, votes: hasil ? hasil.v : 0 },
    lama: cabut,
    favorit: normalPilihan(dok.voters[idPemilih]),
  };
}
