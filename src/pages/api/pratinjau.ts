import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { readContent } from "../../lib/store";
import { isPreviewCollection, previewPath } from "../../lib/pratinjau";
import { apiError } from "../../lib/api";

/**
 * Menerbitkan tautan pratinjau, lalu langsung mengantar ke sana.
 *
 * Endpoint ini menjawab dengan pengalihan, bukan dengan JSON berisi alamat.
 * Bedanya terasa di panel: tombolnya cukup jadi tautan biasa dengan
 * `target="_blank"`, tanpa perlu membuka jendela kosong lebih dulu lalu
 * mengarahkannya setelah jawaban tiba — urutan yang selalu berkelahi dengan
 * penghadang popup.
 *
 * Token diterbitkan di sini, bukan di panel, karena tanda tangannya memakai
 * `SESSION_SECRET`. Rahasia itu tidak pernah boleh sampai ke browser.
 */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const me = currentUser(cookies);
  // Halaman, bukan permintaan fetch: sesi yang habis harus berakhir di layar
  // masuk, bukan di tab berisi JSON 401.
  if (!me) return redirect("/admin/login", 302);

  const col = url.searchParams.get("col");
  const id = String(url.searchParams.get("id") || "");
  if (!isPreviewCollection(col) || !id) return apiError("err.previewBadTarget", 400);

  const content = readContent();
  const item = (content[col] || []).find((x: any) => x.id === id);
  if (!item) return apiError("err.previewBadTarget", 404);

  const path = previewPath(col, id);
  if (!path) return apiError("err.previewNoSecret", 500);

  return redirect(path, 302);
};
