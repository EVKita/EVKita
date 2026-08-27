import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { listBackups, readBackup, writeContent } from "../../lib/store";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "backups")) return forbidden();
  return json({ ok: true, backups: listBackups() });
};

/** Memulihkan satu cadangan menjadi konten aktif. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "backups")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const name = String(body?.name || "");
  const snapshot = readBackup(name);
  if (!snapshot) return apiError("backups.failTitle", 404);

  // writeContent mencadangkan isi saat ini lebih dulu, jadi pemulihan pun bisa dibatalkan.
  const content = writeContent(snapshot);
  logActivity(me, "backup.restore", { name });
  return json({ ok: true, content });
};
