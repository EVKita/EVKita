import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isAuthed } from "../../lib/auth";
import { json, apiError, unauthorized } from "../../lib/api";
import { sniffImage, IMAGE_EXT, MAX_UPLOAD_BYTES, isSupportedMime } from "../../lib/imagefile";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

/**
 * Unggah gambar untuk panel.
 *
 * Tiga hal yang dijaga di sini, semuanya pernah terbuka:
 *
 *   1. UKURAN. `request.formData()` memuat seluruh badan permintaan ke memori
 *      sebelum ada satu pun pemeriksaan. Satu permintaan besar cukup untuk
 *      menjatuhkan proses Node di VPS, jadi Content-Length ditolak lebih dulu.
 *   2. ISI. `file.type` datang dari klien. Yang menentukan tipe adalah byte
 *      pertama berkasnya, bukan apa yang diakui pengunggahnya.
 *   3. SVG. Sengaja tidak didukung: SVG boleh berisi <script>, dan berkas
 *      unggahan disajikan dari domain yang sama dengan /admin — satu berkas
 *      dari peran Editor bisa berjalan dengan hak panel begitu ada admin yang
 *      membukanya.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return unauthorized();

  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return apiError("err.uploadTooBig", 413, { mb: Math.round(MAX_UPLOAD_BYTES / 1048576) });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("err.badJson");
  }

  const file = form.get("image");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return apiError("err.uploadNoFile");
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Content-Length bisa berbohong atau tidak dikirim sama sekali; panjang
  // buffer adalah kebenarannya.
  if (buf.length > MAX_UPLOAD_BYTES) {
    return apiError("err.uploadTooBig", 413, { mb: Math.round(MAX_UPLOAD_BYTES / 1048576) });
  }
  if (!buf.length) return apiError("err.uploadNoFile");

  const kind = sniffImage(buf);
  if (!kind) {
    // Dua kegagalan yang berbeda, dan pesannya harus ikut berbeda: memilih
    // berkas PDF bukan hal yang sama dengan memilih gambar yang rusak.
    const declaredType = String(file.type || "");
    return isSupportedMime(declaredType)
      ? apiError("err.uploadNotImage")
      : apiError("err.uploadType", 400, { type: declaredType || "?" });
  }

  const name = crypto.randomBytes(8).toString("hex") + IMAGE_EXT[kind];
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  return json({ ok: true, url: `/api/uploads/${name}` });
};
