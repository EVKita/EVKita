import crypto from "node:crypto";
import path from "node:path";
import { getEnv } from "./env";
import { readJson, writeJsonAtomic, readCached, invalidateCache } from "./jsonfile";
import { normalizeLocale as i18nNormalizeLocale } from "./i18n/index.js";

/**
 * Penyimpanan pengguna panel admin.
 *
 * Sebelumnya panel hanya mengenal satu kredensial dari `.env`, dengan kata
 * sandi tersimpan sebagai teks polos. Berkas `data/users.json` menggantikannya:
 * banyak akun, kata sandi ter-hash (scrypt), dan tiap akun punya nama, peran,
 * serta preferensi tampilannya sendiri.
 *
 * `data/users.json` ikut tercadangkan oleh `deploy.sh` (yang menyalin semua
 * `data/*.json`), jadi daftar pengguna selamat melewati pembaruan versi.
 */

const DATA_DIR = () => path.resolve(process.cwd(), "data");
const USERS_FILE = () => path.join(DATA_DIR(), "users.json");

export const ROLES = ["owner", "admin", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ["id", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  role: Role;
  password: string;
  locale: Locale;
  /** Preferensi tampilan per pengguna. "auto" mengikuti setelan sistem. */
  theme: "auto" | "light" | "dark";
  density: "comfortable" | "compact";
  homeView: string;
  createdAt: string;
  lastLoginAt: string;
  /**
   * Waktu masuk SEBELUM yang sekarang. Dipakai sapaan dasbor: `lastLoginAt`
   * sudah diperbarui saat halaman itu dibuka, jadi tanpa nilai ini sapaannya
   * selalu berbunyi "kunjungan terakhirmu: sekarang".
   */
  previousLoginAt: string;
  /**
   * Sesi yang terbit sebelum waktu ini ditolak.
   *
   * Inilah yang membuat "ganti kata sandi" benar-benar berarti sesuatu:
   * sebelum ada nilai ini, mengganti kata sandi sama sekali tidak mengeluarkan
   * sesi lain, dan satu-satunya cara mencabut sesi yang bocor adalah mengganti
   * SESSION_SECRET — yang mengeluarkan semua orang sekaligus. Kosong berarti
   * belum pernah ada pencabutan.
   */
  sessionsValidFrom: string;
  /**
   * Rahasia TOTP dalam base32, kosong berarti dua faktor belum dipasang.
   *
   * Disimpan apa adanya, TIDAK di-hash — dan itu memang satu-satunya cara:
   * server harus bisa menghitung kode yang sama dengan yang muncul di ponsel,
   * jadi ia harus memegang rahasianya. Yang menjaganya adalah `data/users.json`
   * yang tidak pernah terkirim ke browser dan tidak pernah masuk ke commit.
   */
  totpSecret: string;
  /**
   * Sudah DIVERIFIKASI, bukan sekadar sudah dibuatkan rahasia.
   *
   * Rahasia dibuat saat orangnya menekan "Pasang", tapi baru berlaku setelah
   * ia berhasil memasukkan satu kode dari ponselnya. Tanpa pemisahan ini,
   * seseorang yang salah memindai bisa mengunci dirinya sendiri keluar dari
   * akunnya di percobaan masuk berikutnya.
   */
  totpEnabled: boolean;
  /** Kode cadangan ter-hash, sekali pakai. Kosong berarti sudah habis dipakai. */
  backupCodes: string[];
}

/**
 * Bentuk pengguna yang aman dikirim ke browser.
 *
 * Tiga hal yang dibuang, dan alasannya berbeda-beda:
 *   - `password`: hash yang bisa dicoba tebak di luar jangkauan pembatasan laju.
 *   - `totpSecret`: rahasianya SENDIRI. Mengirimkannya ke browser membuat dua
 *     faktor tidak berarti apa-apa — siapa pun yang bisa membaca DOM panel bisa
 *     menghitung kodenya sendiri, selamanya.
 *   - `backupCodes`: kode masuk sekali pakai, sama berbahayanya.
 *
 * Yang tersisa dari kode cadangan hanya JUMLAHNYA, karena halaman Profil harus
 * bisa berkata "tinggal 3 kode" tanpa pernah menyebut kodenya.
 */
export type PublicUser = Omit<User, "password" | "totpSecret" | "backupCodes"> & {
  backupCodesLeft: number;
};

/* ------------------------------------------------------------------ *
 * Kata sandi
 * ------------------------------------------------------------------ */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(plain, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hex] = parts;
  try {
    const expected = Buffer.from(hex, "hex");
    const actual = crypto.scryptSync(plain, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Kekuatan minimum kata sandi, dipakai server maupun panel. */
export const PASSWORD_MIN = 8;

/* ------------------------------------------------------------------ *
 * Baca / tulis
 * ------------------------------------------------------------------ */

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function normalizeRole(v: unknown): Role {
  const s = str(v);
  return (ROLES as readonly string[]).includes(s) ? (s as Role) : "editor";
}

/**
 * Menormalkan kode bahasa.
 *
 * Meneruskan ke `src/lib/i18n/index.js` alih-alih memeriksa sendiri: dulu ada
 * DUA fungsi bernama sama dengan perilaku berbeda — yang di i18n menerima
 * bentuk lengkap seperti "en-US", yang di sini menolaknya dan diam-diam jatuh
 * ke Bahasa Indonesia. Keduanya membaca nilai yang datang dari tempat yang
 * sama (cookie `evkita_lang`), jadi perbedaan itu tidak punya alasan untuk ada.
 */
export function normalizeLocale(v: unknown): Locale {
  return i18nNormalizeLocale(v) as Locale;
}

function normalizeUser(raw: any): User {
  return {
    id: str(raw?.id) || crypto.randomUUID(),
    username: str(raw?.username).trim(),
    name: str(raw?.name).trim() || str(raw?.username).trim(),
    email: str(raw?.email).trim(),
    avatar: str(raw?.avatar),
    role: normalizeRole(raw?.role),
    password: str(raw?.password),
    locale: normalizeLocale(raw?.locale),
    theme: raw?.theme === "light" || raw?.theme === "dark" ? raw.theme : "auto",
    density: raw?.density === "compact" ? "compact" : "comfortable",
    homeView: str(raw?.homeView) || "dashboard",
    createdAt: str(raw?.createdAt) || new Date().toISOString(),
    lastLoginAt: str(raw?.lastLoginAt),
    previousLoginAt: str(raw?.previousLoginAt),
    sessionsValidFrom: str(raw?.sessionsValidFrom),
    totpSecret: str(raw?.totpSecret),
    totpEnabled: !!raw?.totpEnabled && !!str(raw?.totpSecret),
    backupCodes: Array.isArray(raw?.backupCodes) ? raw.backupCodes.map((x: unknown) => str(x)).filter(Boolean) : [],
  };
}

/**
 * Dinaikkan kalau berkas akun ADA tapi tidak terbaca. Nilainya sengaja disimpan
 * di modul, bukan dilempar dari `readFile()`: hampir semua pemanggil hanya
 * ingin daftar akun, dan yang berhak memutuskan "berhenti" cuma jalur tulis.
 */
let usersFileCorrupt = "";

function readFile(): User[] {
  // Dicache sampai berkasnya berubah: `currentUser()` memanggil rantai ini di
  // SETIAP permintaan panel, dan beberapa endpoint dua sampai tiga kali dalam
  // satu permintaan (usernameTaken, ownerCount, listPublicUsers).
  return readCached(USERS_FILE(), (res) => parseUsers(res));
}

function parseUsers(res: ReturnType<typeof readJson>): User[] {
  if (res.status === "corrupt") {
    // JANGAN mengembalikan daftar kosong diam-diam. "Kosong" akan memicu
    // seedFromEnv() dan menulis ulang berkasnya berisi satu akun saja —
    // seluruh akun lain lenyap tanpa satu pun pesan.
    usersFileCorrupt = res.error;
    console.error(
      `[evkita] data/users.json ada tapi tidak bisa dibaca (${res.error}). ` +
        `Semua penulisan akun dihentikan supaya berkasnya tidak tertimpa. ` +
        `Pulihkan dari .backup-* lalu jalankan ulang aplikasi.`
    );
    return [];
  }

  usersFileCorrupt = "";
  if (res.status === "missing") return [];

  const data = res.data as any;
  const list = Array.isArray(data) ? data : data?.users;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeUser).filter((u) => u.username && u.password);
}

/** Berkas akun sedang rusak? Selama benar, tidak ada yang boleh menulisinya. */
export function usersFileIsUnreadable(): boolean {
  // Sengaja melewati cache: pemeriksaan kesehatan harus melihat keadaan
  // berkasnya sekarang, bukan keadaan saat terakhir dibaca.
  parseUsers(readJson(USERS_FILE()));
  return usersFileCorrupt !== "";
}

function writeFile(users: User[]): void {
  if (usersFileCorrupt) {
    throw new Error(
      `data/users.json tidak terbaca (${usersFileCorrupt}); penulisan dibatalkan agar isinya tidak hilang.`
    );
  }
  writeJsonAtomic(USERS_FILE(), { version: 1, users });
  // Cache dibuang eksplisit: menulis lalu membaca dalam milidetik yang sama
  // bisa menghasilkan mtime yang identik di sebagian sistem berkas, dan sesi
  // yang baru saja dicabut harus langsung berlaku.
  invalidateCache(USERS_FILE());
}

/**
 * Memindahkan kredensial `.env` lama menjadi akun pemilik yang pertama.
 * Dijalankan sekali, saat `data/users.json` belum ada — pemasangan yang sudah
 * berjalan tidak perlu instal ulang dan kata sandinya langsung ter-hash.
 *
 * `.env` sengaja tidak diubah: kalau `data/users.json` hilang, jalur pemulihan
 * lama masih ada. Selama berkas itu ada, isi `.env` diabaikan sepenuhnya.
 */
function seedFromEnv(): User[] {
  const username = getEnv("ADMIN_USERNAME", "").trim();
  const password = getEnv("ADMIN_PASSWORD", "");
  if (!username || !password) return [];

  const now = new Date().toISOString();
  const owner: User = {
    id: crypto.randomUUID(),
    username,
    name: username.charAt(0).toUpperCase() + username.slice(1),
    email: "",
    avatar: "",
    role: "owner",
    password: hashPassword(password),
    locale: "id",
    theme: "auto",
    density: "comfortable",
    homeView: "dashboard",
    createdAt: now,
    lastLoginAt: "",
    previousLoginAt: "",
    sessionsValidFrom: "",
  };

  try {
    writeFile([owner]);
  } catch {
    /* Kalau data/ tidak bisa ditulis, akun tetap dipakai di memori. */
  }
  return [owner];
}

export function listUsers(): User[] {
  const existing = readFile();
  if (existing.length) return existing;
  // Pemindahan dari .env hanya untuk berkas yang memang belum pernah ada.
  // Berkas yang rusak tidak boleh memicunya — itu persis skenario kehilangan
  // data yang dijaga readFile() di atas.
  if (usersFileCorrupt) return [];
  return seedFromEnv();
}

export function publicUser(u: User): PublicUser {
  const { password, totpSecret, backupCodes, ...rest } = u;
  return { ...rest, backupCodesLeft: Array.isArray(backupCodes) ? backupCodes.length : 0 };
}

export function listPublicUsers(): PublicUser[] {
  return listUsers().map(publicUser);
}

/**
 * Apakah pemasangan ini sudah punya akun?
 *
 * Dipakai wizard `/install` sebagai syarat kedua di samping `SESSION_SECRET`:
 * kalau `.env` hilang tapi `data/users.json` selamat, wizard TIDAK boleh
 * terbuka lagi — pengunjung pertama yang menemukannya bisa membuat akun
 * pemilik baru di pemasangan yang sudah berisi konten. Kunci sesi yang
 * benar-benar hilang harus dipulihkan lewat SSH, bukan lewat halaman publik.
 *
 * Sengaja membaca berkas langsung, bukan lewat `listUsers()`: yang terakhir
 * ikut menjalankan `seedFromEnv()`, dan pertanyaan di sini adalah tentang
 * berkas yang benar-benar ada di disk.
 */
export function hasAnyUser(): boolean {
  const found = readFile().length > 0;
  // Berkas yang rusak dihitung SEBAGAI ADA. Kalau tidak, satu berkas akun yang
  // terpotong akan membuka kembali wizard pemasangan untuk publik — tepat pada
  // saat pemilik paling tidak berdaya.
  return found || usersFileCorrupt !== "";
}

export function findById(id: string): User | null {
  return listUsers().find((u) => u.id === id) || null;
}

export function findByUsername(username: string): User | null {
  const key = str(username).trim().toLowerCase();
  if (!key) return null;
  return listUsers().find((u) => u.username.toLowerCase() === key) || null;
}

export function usernameTaken(username: string, exceptId = ""): boolean {
  const key = str(username).trim().toLowerCase();
  return listUsers().some((u) => u.username.toLowerCase() === key && u.id !== exceptId);
}

export function saveUser(user: User): User {
  const users = listUsers();
  const i = users.findIndex((u) => u.id === user.id);
  if (i === -1) users.push(user);
  else users[i] = user;
  writeFile(users);
  return user;
}

export function createUser(input: Partial<User> & { username: string; password: string }): User {
  const now = new Date().toISOString();
  const user = normalizeUser({
    ...input,
    id: crypto.randomUUID(),
    password: hashPassword(input.password),
    createdAt: now,
    lastLoginAt: "",
  });
  const users = listUsers();
  users.push(user);
  writeFile(users);
  return user;
}

export function deleteUser(id: string): boolean {
  const users = listUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  writeFile(next);
  return true;
}

/**
 * Mencabut seluruh sesi milik satu akun, termasuk yang sedang aktif.
 *
 * Dipanggil saat kata sandi berubah — baik oleh pemiliknya sendiri maupun oleh
 * admin — dan saat seseorang menekan "keluar dari semua perangkat". Pemanggil
 * yang mencabut sesinya sendiri harus menerbitkan cookie baru sesudah ini,
 * kalau tidak ia ikut terlempar keluar.
 */
export function revokeSessions(id: string): void {
  const users = listUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return;
  u.sessionsValidFrom = new Date().toISOString();
  writeFile(users);
}

/**
 * Memakai satu kode cadangan, kalau kode yang diberikan memang salah satunya.
 *
 * Kode yang cocok LANGSUNG DIHAPUS, sebelum sesi apa pun terbit. Kode cadangan
 * yang bisa dipakai dua kali bukan kode cadangan melainkan kata sandi kedua
 * yang lebih pendek.
 *
 * Perbandingannya lewat `verifyPassword` karena kodenya memang disimpan
 * ter-hash: berkas `data/users.json` yang bocor tidak boleh langsung menjadi
 * delapan tiket masuk.
 */
export function pakaiKodeCadangan(id: string, kode: unknown): boolean {
  const bersih = String(kode ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (bersih.length < 6) return false;

  const users = listUsers();
  const u = users.find((x) => x.id === id);
  if (!u || !u.backupCodes.length) return false;

  const i = u.backupCodes.findIndex((h) => verifyPassword(bersih, h));
  if (i < 0) return false;

  u.backupCodes.splice(i, 1);
  writeFile(users);
  return true;
}

export function touchLogin(id: string): void {
  const users = listUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return;
  u.previousLoginAt = u.lastLoginAt;
  u.lastLoginAt = new Date().toISOString();
  writeFile(users);
}

/* ------------------------------------------------------------------ *
 * Peran & izin
 * ------------------------------------------------------------------ */

/**
 * Kemampuan yang dibatasi peran. Semua yang tidak disebut di sini (konten,
 * pengaturan situs, media) terbuka untuk ketiga peran.
 */
export type Capability =
  | "users"
  | "update"
  | "backups"
  | "activity"
  | "media.delete"
  | "ai"
  | "ai.run"
  | "integrasi"
  | "kontak";

/**
 * Peran mana yang boleh melakukan apa, ditulis lengkap.
 *
 * Sebelumnya `can()` mengabaikan argumen `capability` dan hanya memeriksa
 * "admin atau pemilik?" — ketiga kemampuan runtuh jadi satu. Tidak ada celah
 * saat itu, tapi kemampuan keempat yang ditambahkan nanti akan otomatis
 * terbuka untuk admin tanpa seorang pun memutuskannya. Dengan peta ini,
 * menambah kemampuan berarti menuliskan siapa yang boleh memakainya.
 */
const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  users: ["owner", "admin"],
  update: ["owner", "admin"],
  backups: ["owner", "admin"],

  /*
   * Log aktivitas PENUH — saringan, halaman, dan arsip bulan-bulan sebelumnya.
   * Ia alat audit, satu golongan dengan Pengguna dan Cadangan.
   *
   * Yang TIDAK ditutup adalah dua belas baris terakhir di dasbor. Itu bukan
   * alat audit melainkan rasa kehadiran orang lain — berguna justru bagi
   * Editor, yang paling sering bekerja berbarengan dengan orang lain di
   * katalog yang sama.
   */
  activity: ["owner", "admin"],

  /*
   * Menghapus berkas unggahan dari disk.
   *
   * Mengurus Media adalah pekerjaan Editor, dan mereka tetap bisa melihat
   * seluruh pustakanya. Yang ditutup hanya penghapusannya: berkas unggahan
   * TIDAK ikut ke dalam cadangan konten, jadi ini satu-satunya tindakan di
   * panel yang benar-benar tidak punya tombol urung.
   */
  "media.delete": ["owner", "admin"],

  /*
   * Dua kemampuan berbeda untuk fitur AI, dan pemisahannya disengaja.
   *
   * `ai` memegang kunci API dan pengaturan yang menentukan berapa mahal setiap
   * riset — itu keputusan pemilik akun, bukan penyunting.
   *
   * `ai.run` justru terbuka untuk Editor. Merekalah yang paling sering mengisi
   * katalog; menutup fitur ini untuk mereka berarti membangunnya untuk orang
   * yang paling jarang memakainya. Yang menahan pengeluaran adalah KUOTA
   * HARIAN per akun, bukan peran — karena peran hanya bisa menjawab "boleh atau
   * tidak", sementara pertanyaan sebenarnya adalah "seberapa banyak".
   */
  ai: ["owner", "admin"],
  "ai.run": ["owner", "admin", "editor"],

  /*
   * Halaman Integrasi: kode Analytics, AdSense, dan Search Console.
   *
   * Ditutup untuk Editor karena isinya bukan konten melainkan kode pihak ketiga
   * yang berjalan di SETIAP halaman publik, plus ads.txt yang menentukan siapa
   * yang berhak menjual iklan atas nama situs ini. Keduanya keputusan pemilik
   * situs, dan salah pasang di sana tidak terlihat di panel mana pun.
   *
   * Panel Analitik sengaja TIDAK punya kemampuan sendiri: ia cuma angka
   * kunjungan, dan penyunting yang tahu halaman mana yang dibaca orang menulis
   * hal yang lebih berguna. Yang ditutup adalah pengaturannya, bukan bacaannya.
   */
  integrasi: ["owner", "admin"],

  /*
   * Pengaturan SMTP untuk formulir kontak. Berisi kata sandi SMTP — rahasia
   * yang menentukan dari alamat mana surat situs ini dikirim, jadi setara
   * dengan `ai` (kunci API), bukan sesuatu yang boleh dipegang Editor.
   */
  kontak: ["owner", "admin"],
};

export function can(user: { role: Role } | null, capability: Capability): boolean {
  if (!user) return false;
  const allowed = CAPABILITY_ROLES[capability];
  // Kemampuan yang tidak dikenal ditolak, bukan diizinkan. Salah ketik nama
  // kemampuan harus menutup pintu, bukan membukanya.
  if (!allowed) return false;
  return allowed.includes(user.role);
}

/** Hanya pemilik yang boleh menyentuh akun pemilik. */
export function canManage(actor: User | PublicUser | null, target: User | PublicUser): boolean {
  if (!actor) return false;
  if (actor.role !== "owner" && actor.role !== "admin") return false;
  if (target.role === "owner") return actor.id === target.id;
  return true;
}

export function ownerCount(): number {
  return listUsers().filter((u) => u.role === "owner").length;
}
