import fs from "node:fs";
import path from "node:path";

const ENV_FILE = () => path.resolve(process.cwd(), ".env");

let cache: { at: number; vars: Record<string, string> } | null = null;

export function readEnvFile(): Record<string, string> {
  const now = Date.now();
  if (cache && now - cache.at < 2000) return cache.vars;

  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(ENV_FILE(), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* belum ada .env */
  }

  cache = { at: now, vars: out };
  return out;
}

export function getEnv(key: string, fallback = ""): string {
  const fromFile = readEnvFile()[key];
  if (fromFile !== undefined && fromFile !== "") return fromFile;
  const fromProc = process.env[key];
  if (fromProc !== undefined && fromProc !== "") return fromProc;
  return fallback;
}

/**
 * Menulis ulang `.env`.
 *
 * Nilai `null` MENGHAPUS kuncinya dari berkas, bukan menulisnya sebagai baris
 * kosong. Bedanya nyata: `KEY=` yang kosong tetap menutupi nilai bernama sama
 * di lingkungan proses, sedangkan barisnya yang hilang membuat `getEnv()`
 * jatuh ke `process.env` seperti seharusnya. Dipakai tombol "Hapus kunci" di
 * Pengaturan AI.
 */
export function writeEnvFile(vars: Record<string, string | null>): void {
  const pending = new Map<string, string | null>(Object.entries(vars));
  const lines: string[] = [];

  let existing = "";
  try {
    existing = fs.readFileSync(ENV_FILE(), "utf8");
  } catch {
    /* belum ada — seluruh isi berasal dari `vars` */
  }

  /*
   * Berkasnya disunting BARIS PER BARIS, bukan dirakit ulang dari hasil parse.
   *
   * Versi sebelumnya membaca `.env` jadi objek lalu menulisnya kembali sebagai
   * daftar `kunci=nilai` — yang berarti setiap komentar di dalamnya hilang.
   * Dulu itu nyaris tidak terasa: satu-satunya penulis adalah wizard
   * pemasangan, yang jalan sekali seumur hidup pemasangan. Sejak halaman
   * Pengaturan AI ada, menyimpan kunci API menulis ulang berkas ini kapan saja
   * — dan catatan yang ditulis pemilik server di sana tidak boleh ikut terhapus
   * hanya karena seseorang menekan Simpan.
   */
  if (existing) {
    for (const raw of existing.split(/\r?\n/)) {
      const line = raw.trim();
      const eq = line.indexOf("=");

      // Komentar, baris kosong, dan apa pun yang bukan `kunci=nilai` lewat
      // begitu saja.
      if (!line || line.startsWith("#") || eq === -1) {
        lines.push(raw);
        continue;
      }

      const key = line.slice(0, eq).trim();
      if (!pending.has(key)) {
        lines.push(raw);
        continue;
      }

      const next = pending.get(key);
      pending.delete(key);
      // `null` berarti hapus: barisnya tidak ditulis ulang sama sekali.
      if (next === null || next === undefined) continue;
      lines.push(`${key}=${next}`);
    }
  }

  /*
   * Baris kosong di ujung dibuang SEBELUM kunci baru ditambahkan, bukan
   * sesudah. Baris terakhir setiap berkas teks yang berakhir dengan newline
   * terbaca sebagai baris kosong, jadi menambahkan kunci baru lebih dulu akan
   * menyelipkannya di bawah baris kosong itu — dan menyimpan berkali-kali
   * menumpuk satu baris kosong setiap kali.
   */
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  // Kunci yang belum pernah ada ditambahkan di ujung, mengikuti urutan
  // pemanggil.
  for (const [key, value] of pending) {
    if (value === null || value === undefined) continue;
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE(), lines.join("\n") + "\n", "utf8");

  /*
   * `.env` memuat SESSION_SECRET dan — sejak halaman Pengaturan AI ada — kunci
   * API DeepSeek yang bisa dibelanjakan siapa pun yang memegangnya. Berkasnya
   * dibuat dengan izin bawaan 0644, yang di server CyberPanel berarti setiap
   * proses milik akun lain di mesin yang sama bisa membacanya.
   *
   * `mode` pada `writeFileSync` hanya berlaku saat berkas BARU dibuat, jadi
   * pemasangan lama tidak akan pernah ikut diperbaiki olehnya. Karena itu
   * chmod dipanggil terpisah, setiap kali menulis.
   */
  try {
    fs.chmodSync(ENV_FILE(), 0o600);
  } catch {
    // Sistem berkas yang tidak mengenal izin POSIX (mis. beberapa volume di
    // Windows) tidak boleh menggagalkan penyimpanan.
  }

  cache = null;
}

export function isInstalled(): boolean {
  const secret = getEnv("SESSION_SECRET", "");
  const placeholder = "ubah-dengan-string-acak-yang-panjang-dan-rahasia";
  return secret !== "" && secret !== placeholder && secret !== "dev-secret-change-me";
}
