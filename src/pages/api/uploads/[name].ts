import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export const GET: APIRoute = ({ params }) => {
  const name = String(params.name || "");
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(name).toLowerCase();
  const mime = MIME_BY_EXT[ext] || "application/octet-stream";
  const buf = fs.readFileSync(file);

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
