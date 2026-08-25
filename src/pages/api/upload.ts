import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isAuthed } from "../../lib/auth";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Data tidak valid" }, 400);
  }

  const file = form.get("image");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return json({ ok: false, error: "Tidak ada file gambar" }, 400);
  }

  const type = file.type || "image/jpeg";
  const ext = MIME_EXT[type] || ".jpg";
  const name = crypto.randomBytes(8).toString("hex") + ext;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  return json({ ok: true, url: `/api/uploads/${name}` });
};
