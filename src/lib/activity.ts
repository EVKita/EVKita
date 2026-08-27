import fs from "node:fs";
import path from "node:path";
import type { User } from "./users";

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
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(list)) return [];
    return list.slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
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
    const entries = [entry, ...listActivity(MAX_ENTRIES)].slice(0, MAX_ENTRIES);
    fs.mkdirSync(DATA_DIR(), { recursive: true });
    fs.writeFileSync(FILE(), JSON.stringify({ version: 1, entries }, null, 2), "utf8");
  } catch {
    // Pencatatan bersifat best-effort — kegagalannya tidak boleh menggagalkan aksi utama.
  }
}
