import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isAuthed } from "../../lib/auth";
import { json, apiError, unauthorized } from "../../lib/api";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

/**
 * Tipe berkas yang boleh diunggah.
 *
 * `image/svg+xml` SENGAJA TIDAK ADA di sini. SVG boleh berisi `<script>`, dan
 * berkas unggahan disajikan kembali dari domain yang sama dengan `/admin` —
 * jadi satu berkas SVG yang diunggah peran Editor bisa berjalan dengan hak
 * panel begitu ada admin yang membukanya, lalu memanggil `/api/users` atas
 * namanya. Cookie `httpOnly` tidak menolong: skripnya tidak perlu membaca
 * cookie, cukup memanggil API dari origin yang sudah terautentikasi.
 */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return unauthorized();

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

  // Tipe yang tidak dikenali DITOLAK, bukan disimpan diam-diam sebagai .jpg.
  // Nilai bawaan yang lama membuat berkas apa pun — termasuk SVG yang baru saja
  // dikeluarkan dari daftar di atas — tetap tersimpan, cuma dengan nama lain.
  const type = String(file.type || "").toLowerCase();
  const ext = MIME_EXT[type];
  if (!ext) {
    return apiError("err.uploadType", 400, { type: type || "?" });
  }

  const name = crypto.randomBytes(8).toString("hex") + ext;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  return json({ ok: true, url: `/api/uploads/${name}` });
};
