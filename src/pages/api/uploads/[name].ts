import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
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

  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    // Tanpa ini peramban boleh menebak tipe isi dan mengabaikan Content-Type di
    // atas — berkas yang tersimpan sebagai .jpg tapi isinya HTML bisa berakhir
    // dijalankan sebagai halaman.
    "X-Content-Type-Options": "nosniff",
  };

  // SVG tidak lagi bisa diunggah (lihat api/upload.ts), tapi berkas yang
  // terlanjur ada dari sebelum aturan itu tetap tersaji. `sandbox` tanpa
  // `allow-scripts` memberinya origin buram dan mematikan skrip di dalamnya,
  // jadi logo lama tetap tampil sementara isinya kehilangan gigi.
  if (ext === ".svg") {
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  }

  return new Response(buf, { status: 200, headers });
};
