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

  // Pemulihan SELALU mencadangkan isi saat ini lebih dulu, mengabaikan jeda
  // antar-cadangan — kalau tidak, memulihkan versi yang salah tidak bisa
  // dibatalkan karena isi sebelumnya tidak pernah tersimpan.
  const content = writeContent(snapshot, { snapshotAlways: true });
  logActivity(me, "backup.restore", { name });
  return json({ ok: true, content });
};
