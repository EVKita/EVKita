import fs from "node:fs";
import path from "node:path";

/**
 * Baca-tulis berkas JSON yang tahan mati mendadak.
 *
 * Seluruh data aplikasi ini hidup di berkas JSON: konten, akun, log aktivitas.
 * Sebelumnya semuanya ditulis dengan `fs.writeFileSync` langsung ke berkas
 * tujuan. Penulisan seperti itu tidak atomik — kalau proses mati di tengahnya
 * (PM2 me-reload seluruh pohon proses setiap kali pembaruan dipasang), yang
 * tersisa adalah berkas terpotong.
 *
 * Yang membuatnya berbahaya bukan berkas rusaknya, melainkan apa yang terjadi
 * sesudahnya: pembacaan yang gagal mem-parse mengembalikan "kosong", dan
 * "kosong" tidak bisa dibedakan dari "belum pernah ada". Di `users.json` itu
 * berarti seluruh daftar akun ditulis ulang dari nol tanpa satu pun pesan.
 *
 * Dua hal yang diperbaiki berkas ini:
 *   1. Tulis ke berkas sementara di direktori yang sama, lalu `rename()` —
 *      operasi atomik di POSIX. Pembaca hanya akan melihat isi lama yang utuh
 *      atau isi baru yang utuh, tidak pernah setengah jadi.
 *   2. Bedakan "tidak ada" dari "rusak" saat membaca, supaya pemanggil bisa
 *      menolak bertindak ketika berkasnya ada tapi tidak terbaca.
 */

export type ReadResult<T> =
  | { status: "ok"; data: T }
  /** Berkasnya memang belum pernah ada — aman untuk memulai dari nol. */
  | { status: "missing" }
  /** Berkasnya ADA tapi tidak bisa dibaca/di-parse. Jangan pernah menimpanya. */
  | { status: "corrupt"; error: string };

export function readJson<T = unknown>(file: string): ReadResult<T> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return { status: "missing" };
    return { status: "corrupt", error: String(err?.message || err) };
  }

  // BOM dari editor Windows membuat JSON.parse gagal pada karakter pertama.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  try {
    return { status: "ok", data: JSON.parse(raw) as T };
  } catch (err: any) {
    return { status: "corrupt", error: String(err?.message || err) };
  }
}

/**
 * Menulis JSON secara atomik. Berkas sementaranya sengaja dibuat di direktori
 * yang sama: `rename()` hanya atomik di dalam satu sistem berkas, dan /tmp
 * sering berada di partisi lain.
 */
export function writeJsonAtomic(file: string, value: unknown): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    // Berkas sementara yang tertinggal akan membingungkan siapa pun yang
    // melihat isi direktori data nanti.
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* sudah hilang duluan */
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Cache berkunci waktu-ubah
 * ------------------------------------------------------------------ */

interface CacheEntry {
  key: string;
  value: unknown;
}

const caches = new Map<string, CacheEntry>();

/**
 * Menyimpan hasil olahan sebuah berkas sampai berkasnya berubah.
 *
 * Dipakai `readContent()` dan daftar pengguna. Sebelum ada ini, SETIAP
 * permintaan halaman publik membaca `data/content.json` dari disk, mem-parse
 * 57 KB JSON, lalu menormalkan 85 entri — hanya untuk menghasilkan objek yang
 * persis sama dengan permintaan sebelumnya. `listUsers()` bahkan dipanggil dua
 * sampai tiga kali dalam satu permintaan.
 *
 * Kuncinya `mtime` + ukuran, bukan durasi: penyimpanan dari panel langsung
 * membatalkannya, tanpa jeda apa pun. Biayanya satu `statSync` per permintaan.
 *
 * `compute` menerima hasil pembacaan, bukan jalur berkas, supaya pemanggil
 * tetap bisa membedakan "belum ada" dari "rusak".
 */
export function readCached<T>(file: string, compute: (res: ReadResult<unknown>) => T): T {
  let key = "kosong";
  try {
    const st = fs.statSync(file);
    key = `${st.mtimeMs}:${st.size}`;
  } catch {
    // Berkas belum ada. Kuncinya tetap stabil, jadi hasil "kosong" pun dicache.
  }

  const hit = caches.get(file);
  if (hit && hit.key === key) return hit.value as T;

  const value = compute(readJson(file));
  caches.set(file, { key, value });
  return value;
}

/** Membuang cache satu berkas. Dipakai sesudah menulis, sebagai pengaman. */
export function invalidateCache(file: string): void {
  caches.delete(file);
}
