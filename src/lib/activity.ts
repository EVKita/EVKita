import path from "node:path";
import type { User } from "./users";
import { readJson, writeJsonAtomic } from "./jsonfile";

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

export type ActivityAction =
  | "login"
  | "content.save"
  | "backup.restore"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "profile.update"
  | "password.change"
  | "update.start";

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

export function logActivity(
  user: Pick<User, "id" | "name" | "username"> | null,
  action: ActivityAction,
  meta: Record<string, string | number> = {}
): void {
  try {
    const entry: ActivityEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      userId: user?.id || "",
      userName: user?.name || user?.username || "",
      action,
      meta,
    };
    const all = [entry, ...listActivity(MAX_ENTRIES + 1)];
    const entries = all.slice(0, MAX_ENTRIES);
    const overflow = all.slice(MAX_ENTRIES);
    if (overflow.length) archive(overflow);
    writeJsonAtomic(FILE(), { version: 1, entries });
  } catch {
    // Pencatatan bersifat best-effort — kegagalannya tidak boleh menggagalkan aksi utama.
  }
}
