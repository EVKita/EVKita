import fs from "node:fs";
import path from "node:path";
import type { User } from "./users";
import { readJson, writeJsonAtomic } from "./jsonfile";
import type { Perubahan } from "./perubahan";

/**
 * Log aktivitas panel admin: siapa mengubah apa, kapan.
 *
 * Begitu panel punya lebih dari satu akun, "kenapa data ini berubah?" jadi
 * pertanyaan yang tidak bisa dijawab konten itu sendiri. Berkas ini
 * menjawabnya. Isinya sengaja dibatasi supaya tidak tumbuh tanpa batas.
 *
 * Pesan TIDAK disimpan sebagai kalimat jadi, melainkan sebagai kode aksi plus
 * data pendukung — supaya bisa ditampilkan dalam bahasa apa pun yang sedang
 * dipilih pembacanya.
 */

const DATA_DIR = () => path.resolve(process.cwd(), "data");
const FILE = () => path.join(DATA_DIR(), "activity.json");
const MAX_ENTRIES = 200;

/**
 * Jendela penggabungan penyimpanan beruntun.
 *
 * Simpan otomatis berjalan 1,2 detik setelah ketikan berhenti, dan SETIAP
 * ketikan di Pengaturan Situs memicunya. Sebelum ada penggabungan ini,
 * menggeser tiga penggeser warna sudah cukup untuk menulis belasan baris yang
 * isinya sama — dan dengan batas 200 entri, satu sesi menyunting tampilan
 * sanggup mengubur jejak audit seminggu ke berkas arsip.
 *
 * Sepuluh menit, angka yang sama dengan jarak minimum antar cadangan di
 * `store.ts`: keduanya menjawab pertanyaan yang sama, yaitu "berapa lama
 * sekumpulan penyimpanan masih pantas disebut satu pekerjaan?".
 */
const GABUNG_MS = 10 * 60 * 1000;

/**
 * Berapa item dalam satu koleksi yang masih dicatat satu per satu.
 *
 * Menerbitkan dua belas motor sekaligus adalah SATU tindakan di mata orang
 * yang melakukannya. Menuliskannya sebagai dua belas baris membuat log
 * bercerita salah, dan sekaligus mengusir sebelas baris lain dari daftar.
 */
const BATAS_RINCI = 3;

export type ActivityAction =
  | "login"
  | "content.save"
  | "backup.restore"
  /** Satu item dikembalikan dari cadangan, tanpa menyentuh sisanya. */
  | "backup.restoreItem"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "profile.update"
  | "password.change"
  | "update.start"
  | "sessions.revoke"
  /** Dua faktor dipasang, dimatikan, atau kode cadangannya diganti. */
  | "2fa.on"
  | "2fa.off"
  | "2fa.codes"
  | "login.blocked"
  /**
   * Kunci API DeepSeek dipasang atau dihapus. Yang dicatat hanya SIAPA dan
   * KAPAN — kuncinya sendiri tidak pernah masuk ke sini, dan
   * `data/activity.json` bukan tempat yang tepat untuk menyimpannya.
   *
   * Dua aksi terpisah, bukan satu aksi dengan `meta.aksi`: nilai di `meta`
   * disisipkan ke kalimat terjemahan apa adanya, jadi "pasang"/"hapus" yang
   * ditulis di sana akan muncul dalam Bahasa Indonesia di panel berbahasa
   * Inggris dan Mandarin.
   */
  | "ai.keySet"
  | "ai.keyRemoved"
  /** Model bawaan diganti — ia menentukan berapa mahal setiap riset. */
  | "ai.modelSet"
  /** Riset AI dijalankan, dan usulannya diterapkan ke formulir. */
  | "ai.run"
  | "ai.apply"
  /**
   * Integrasi Google diubah — dinyalakan, dimatikan, atau idnya diganti.
   *
   * `meta.layanan` berisi nama layanannya (Analytics, AdSense, Search
   * Console), bukan id atau tokennya: yang perlu dijawab log ini adalah "sejak
   * kapan iklan menyala di situs ini", bukan berapa nomornya.
   */
  | "integrasi.update"
  /**
   * Perubahan konten, dirinci.
   *
   * `content.save` di atas tetap ada dan tidak boleh dihapus: berkas log yang
   * sudah ada di server penuh berisi aksi itu, dan menghapus kuncinya membuat
   * seluruh riwayat lama tampil sebagai baris kosong. Ia hanya berhenti
   * ditulis untuk kejadian baru.
   */
  | "content.add"
  | "content.edit"
  | "content.remove"
  | "content.reorder"
  | "content.site"
  | "content.media"
  /** Satu tindakan yang menyentuh banyak item sekaligus — lihat BATAS_RINCI. */
  | "content.bulkAdd"
  | "content.bulkEdit"
  | "content.bulkRemove";

export interface ActivityEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  /** Detail bebas untuk mengisi placeholder di teks terjemahan. */
  meta: Record<string, string | number>;
}

export function listActivity(limit = 50): ActivityEntry[] {
  const res = readJson<any>(FILE());
  if (res.status !== "ok") return [];
  const list = Array.isArray(res.data) ? res.data : res.data?.entries;
  if (!Array.isArray(list)) return [];
  return list.slice(0, Math.max(0, limit));
}

/**
 * Memindahkan log yang penuh ke berkas arsip per bulan, bukan membuangnya.
 *
 * Batas 200 entri masuk akal untuk menjaga ukuran berkas, tapi begitu ada
 * pencatatan yang ramai — percobaan masuk yang gagal, misalnya — jejak audit
 * yang sesungguhnya bisa terkubur dalam hitungan menit.
 */
function archive(entries: ActivityEntry[]): void {
  if (!entries.length) return;
  const month = String(entries[0].at || "").slice(0, 7) || "arsip";
  const file = path.join(DATA_DIR(), `activity-${month}.json`);
  const before = readJson<any>(file);
  const existing = before.status === "ok" && Array.isArray(before.data?.entries) ? before.data.entries : [];
  writeJsonAtomic(file, { version: 1, entries: [...entries, ...existing].slice(0, 5000) });
}

type Pelaku = Pick<User, "id" | "name" | "username"> | null;

function buatEntri(user: Pelaku, action: ActivityAction, meta: Record<string, string | number>): ActivityEntry {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    userId: user?.id || "",
    userName: user?.name || user?.username || "",
    action,
    meta,
  };
}

/** Daftar `fields` disimpan sebagai teks dipisah koma supaya `meta` tetap datar. */
const pisahField = (v: unknown) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Apakah entri baru ini sebenarnya kelanjutan dari entri terakhir?
 *
 * Syaratnya sengaja ketat: orang yang sama, aksi yang sama, sasaran yang sama,
 * dan masih di dalam jendela waktu. Dua orang yang menyunting mobil yang sama
 * TIDAK digabung — pertanyaan "siapa yang mengubah ini" adalah alasan utama
 * log ini ada, dan menggabungkan dua orang jadi satu baris menghapus
 * jawabannya.
 */
function bisaDigabung(lama: ActivityEntry | undefined, baru: ActivityEntry): boolean {
  if (!lama) return false;
  if (!GABUNGKAN.has(baru.action)) return false;
  if (lama.action !== baru.action) return false;
  if (lama.userId !== baru.userId) return false;
  if (String(lama.meta?.col || "") !== String(baru.meta?.col || "")) return false;
  if (String(lama.meta?.id || "") !== String(baru.meta?.id || "")) return false;
  const jarak = Date.parse(baru.at) - Date.parse(lama.at);
  return Number.isFinite(jarak) && jarak >= 0 && jarak <= GABUNG_MS;
}

/** Aksi yang boleh digabung. Penambahan dan penghapusan tidak — keduanya peristiwa sekali jadi. */
const GABUNGKAN = new Set<ActivityAction>(["content.edit", "content.site", "content.media"]);

function gabung(lama: ActivityEntry, baru: ActivityEntry): ActivityEntry {
  const fields = [...new Set([...pisahField(lama.meta?.fields), ...pisahField(baru.meta?.fields)])];
  return {
    ...lama,
    // Waktu yang ditampilkan adalah sentuhan TERAKHIR: itu yang dicari orang
    // saat bertanya "kapan terakhir ini diubah?".
    at: baru.at,
    meta: { ...lama.meta, ...baru.meta, fields: fields.join(","), n: fields.length },
  };
}

/** Menulis beberapa entri sekaligus — satu kali baca, satu kali tulis. */
function tulisEntri(baru: ActivityEntry[]): void {
  if (!baru.length) return;
  try {
    let entries = listActivity(MAX_ENTRIES + 1);
    for (const entri of baru) {
      if (bisaDigabung(entries[0], entri)) entries[0] = gabung(entries[0], entri);
      else entries = [entri, ...entries];
    }
    const disimpan = entries.slice(0, MAX_ENTRIES);
    const luber = entries.slice(MAX_ENTRIES);
    if (luber.length) archive(luber);
    writeJsonAtomic(FILE(), { version: 1, entries: disimpan });
  } catch {
    // Pencatatan bersifat best-effort — kegagalannya tidak boleh menggagalkan aksi utama.
  }
}

export function logActivity(
  user: Pelaku,
  action: ActivityAction,
  meta: Record<string, string | number> = {}
): void {
  try {
    tulisEntri([buatEntri(user, action, meta)]);
  } catch {
    // Pencatatan bersifat best-effort — kegagalannya tidak boleh menggagalkan aksi utama.
  }
}

/* ------------------------------------------------------------------ *
 * Perubahan konten
 * ------------------------------------------------------------------ */

/**
 * Menuliskan hasil `bandingkanKonten()` ke log.
 *
 * Satu penyimpanan bisa menghasilkan nol sampai puluhan perubahan, dan
 * bentuknya di log tidak boleh mengikuti bentuk permintaannya. Dua aturan yang
 * mengubah bentuk itu:
 *
 *   - Perubahan yang menyentuh lebih dari `BATAS_RINCI` item dalam satu
 *     koleksi diringkas jadi satu baris. Menerbitkan dua belas motor adalah
 *     satu tindakan, bukan dua belas.
 *   - Penyuntingan beruntun pada sasaran yang sama digabung oleh `tulisEntri()`.
 *
 * Yang TIDAK diringkas adalah penghapusan tunggal dan penambahan tunggal:
 * keduanya peristiwa yang orang cari satu per satu.
 */
export function logContentChanges(user: Pelaku, perubahan: Perubahan[]): void {
  if (!perubahan.length) return;

  const AKSI_BULK: Record<string, ActivityAction> = {
    tambah: "content.bulkAdd",
    ubah: "content.bulkEdit",
    hapus: "content.bulkRemove",
  };
  const AKSI_SATUAN: Record<string, ActivityAction> = {
    tambah: "content.add",
    ubah: "content.edit",
    hapus: "content.remove",
  };

  const urut: ActivityEntry[] = [];
  const grup = new Map<string, Perubahan[]>();

  for (const p of perubahan) {
    if (p.col === "site" || p.col === "media" || p.jenis === "urut") continue;
    const kunci = `${p.col}|${p.jenis}`;
    if (!grup.has(kunci)) grup.set(kunci, []);
    grup.get(kunci)!.push(p);
  }

  for (const [kunci, daftar] of grup) {
    const [col, jenis] = kunci.split("|");
    if (daftar.length > BATAS_RINCI) {
      urut.push(buatEntri(user, AKSI_BULK[jenis], { col, n: daftar.length }));
      continue;
    }
    for (const p of daftar) {
      urut.push(
        buatEntri(user, AKSI_SATUAN[jenis], {
          col,
          id: p.id,
          title: p.title,
          fields: p.fields.join(","),
          n: p.fields.length,
        })
      );
    }
  }

  for (const p of perubahan) {
    if (p.jenis === "urut") urut.push(buatEntri(user, "content.reorder", { col: p.col }));
  }
  for (const p of perubahan) {
    if (p.col === "site") urut.push(buatEntri(user, "content.site", { col: "site", fields: p.fields.join(","), n: p.fields.length }));
    if (p.col === "media") urut.push(buatEntri(user, "content.media", { col: "media", fields: p.fields.join(","), n: p.fields.length }));
  }

  // Dibalik karena `tulisEntri()` menaruh tiap entri di puncak daftar: yang
  // terakhir masuk jadi yang pertama terbaca.
  tulisEntri(urut.reverse());
}

/* ------------------------------------------------------------------ *
 * Membaca log
 * ------------------------------------------------------------------ */

const POLA_ARSIP = /^activity-(\d{4}-\d{2})\.json$/;

/**
 * Bulan-bulan yang punya catatan, terbaru lebih dulu.
 *
 * Diambil dari dua tempat sekaligus: berkas arsip di disk, DAN bulan yang
 * masih terwakili di log aktif. Tanpa yang kedua, bulan berjalan tidak pernah
 * muncul sebagai pilihan sampai log pertama kali penuh dan diarsipkan.
 */
export function listActivityMonths(): string[] {
  const bulan = new Set<string>();
  try {
    for (const nama of fs.readdirSync(DATA_DIR())) {
      const cocok = POLA_ARSIP.exec(nama);
      if (cocok) bulan.add(cocok[1]);
    }
  } catch {
    /* direktori data belum ada */
  }
  for (const e of listActivity(MAX_ENTRIES)) {
    const b = String(e.at || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(b)) bulan.add(b);
  }
  return [...bulan].sort().reverse();
}

function bacaArsip(month: string): ActivityEntry[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const res = readJson<any>(path.join(DATA_DIR(), `activity-${month}.json`));
  if (res.status !== "ok") return [];
  return Array.isArray(res.data?.entries) ? res.data.entries : [];
}

/**
 * Golongan aksi untuk saringan.
 *
 * Bukan daftar dua puluh lima aksi mentah: pilihan sebanyak itu memaksa
 * pembacanya tahu nama internal setiap aksi sebelum bisa memakainya, dan
 * pertanyaan yang benar-benar dibawa orang ke halaman ini jauh lebih kasar —
 * "siapa yang menyentuh konten minggu ini", "ada percobaan masuk yang gagal?".
 */
export const GOLONGAN_AKSI: Record<string, (aksi: string) => boolean> = {
  konten: (a) => a.startsWith("content."),
  akun: (a) => a.startsWith("user.") || a.startsWith("profile.") || a === "password.change" || a === "sessions.revoke",
  masuk: (a) => a === "login" || a === "login.blocked",
  sistem: (a) => a === "backup.restore" || a === "update.start" || a === "integrasi.update",
  ai: (a) => a.startsWith("ai."),
};

export interface ActivityQuery {
  /** "YYYY-MM". Kosong berarti log aktif — yang terbaru, apa pun bulannya. */
  month?: string;
  userId?: string;
  action?: string;
  page?: number;
  perPage?: number;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  total: number;
  page: number;
  pages: number;
}

/**
 * Membaca log dengan saringan dan halaman.
 *
 * Saat sebuah bulan diminta, arsipnya digabung dengan entri bulan itu yang
 * MASIH ada di log aktif, lalu dibersihkan dari kembar. Tanpa penggabungan
 * itu, memilih bulan berjalan akan menampilkan potongan lama saja dan
 * menyembunyikan yang baru saja terjadi — hasil yang terlihat benar dan justru
 * karena itu menyesatkan.
 */
export function queryActivity(q: ActivityQuery = {}): ActivityPage {
  const perPage = Math.min(100, Math.max(1, q.perPage || 25));
  const page = Math.max(1, q.page || 1);

  let semua: ActivityEntry[];
  if (q.month) {
    const terlihat = new Set<string>();
    semua = [...listActivity(MAX_ENTRIES).filter((e) => String(e.at || "").startsWith(q.month!)), ...bacaArsip(q.month)]
      .filter((e) => (terlihat.has(e.id) ? false : (terlihat.add(e.id), true)))
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  } else {
    semua = listActivity(MAX_ENTRIES);
  }

  // Nama golongan kalau dikenali; kalau tidak, dicocokkan sebagai nama aksi
  // persis — supaya menautkan satu jenis aksi lewat alamat tetap mungkin.
  const cocokAksi = q.action ? GOLONGAN_AKSI[q.action] || ((a: string) => a === q.action) : null;

  const tersaring = semua.filter(
    (e) => (!q.userId || e.userId === q.userId) && (!cocokAksi || cocokAksi(e.action))
  );

  const total = tersaring.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const aman = Math.min(page, pages);
  return {
    entries: tersaring.slice((aman - 1) * perPage, aman * perPage),
    total,
    page: aman,
    pages,
  };
}
