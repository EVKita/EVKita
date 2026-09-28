/**
 * Penyimpanan suara VoteKita — `data/votes.json`, ikut .gitignore.
 *
 * Bentuknya `{ cars: { <id>: { s, v } }, motors: { ... } }`: `s` jumlah
 * bintang yang terkumpul, `v` jumlah suara. Rata-rata tidak disimpan —
 * selalu `s / v` — supaya tidak ada dua angka yang bisa berselisih.
 *
 * Satu pengunjung boleh mengubah suaranya (tombol bintang selalu aktif):
 * browser mengingat suara terakhir di `localStorage` dan mengirimnya sebagai
 * `prev`, lalu server menggeser jumlahnya tanpa menambah hitungan suara.
 * Tanpa pengenal akun, `prev` memang dipercaya dari klien — sama seperti
 * seluruh situs publik yang memang tidak punya akun.
 */

import fs from "node:fs";
import path from "node:path";

const BERKAS = () => path.join(path.resolve(process.cwd(), "data"), "votes.json");

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
