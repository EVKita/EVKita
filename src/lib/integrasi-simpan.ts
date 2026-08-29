import path from "node:path";
import { readCached, invalidateCache, writeJsonAtomic } from "./jsonfile";
import { normalisasi } from "./integrasi.js";

/**
 * Tempat tinggal pengaturan integrasi: `data/integrasi.json`.
 *
 * SENGAJA bukan bagian dari `content.json`. Dua alasan:
 *
 *   1. `content.json` disimpan ulang seluruhnya setiap kali panel menyimpan
 *      otomatis, dan setiap penyimpanan membawa nomor revisi baru. Id
 *      pengukuran yang berubah sekali setahun tidak punya urusan dengan
 *      mekanisme itu — dan halaman Integrasi memang tidak memuat CMS-nya.
 *   2. Berkasnya dibaca di SETIAP permintaan halaman publik (untuk menyisipkan
 *      tag) dan di middleware (untuk menyusun CSP). Berkas kecil sendiri jauh
 *      lebih murah dibaca daripada dokumen konten 54 KB.
 *
 * Ia ikut selamat melewati pembaruan versi: `deploy.sh` mencadangkan seluruh
 * berkas JSON di `data/`, dan `data/` sendiri tidak pernah ditimpa paket rilis.
 */

const BERKAS = () => path.resolve(process.cwd(), "data", "integrasi.json");

export type Integrasi = ReturnType<typeof normalisasi>;

/**
 * Pengaturan yang berlaku sekarang. Hasil normalisasinya yang di-cache, bukan
 * cuma hasil parse — pemeriksaan pola ikut terlewati untuk pembacaan berikutnya.
 */
export function bacaIntegrasi(): Integrasi {
  return readCached(BERKAS(), (res) => normalisasi(res.status === "ok" ? res.data : {}));
}

export function tulisIntegrasi(nilai: unknown): Integrasi {
  const bersih = normalisasi(nilai);
  writeJsonAtomic(BERKAS(), bersih);
  // mtime baru sudah cukup, kecuali kalau menulis dan membaca terjadi dalam
  // milidetik yang sama — lihat catatan serupa di store.ts.
  invalidateCache(BERKAS());
  return bersih;
}
