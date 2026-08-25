import type { APIRoute } from "astro";
import { isAuthed } from "../../lib/auth";
import { listBackups, readBackup, writeContent } from "../../lib/store";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = ({ cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, backups: listBackups() });
};

/** Memulihkan satu cadangan menjadi konten aktif. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON tidak valid" }, 400);
  }

  const snapshot = readBackup(String(body?.name || ""));
  if (!snapshot) return json({ ok: false, error: "Cadangan tidak ditemukan" }, 404);

  // writeContent mencadangkan isi saat ini lebih dulu, jadi pemulihan pun bisa dibatalkan.
  return json({ ok: true, content: writeContent(snapshot) });
};
