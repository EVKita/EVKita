import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { json } from "../../lib/api";

const BERKAS = () => path.join(process.cwd(), "data", "notifikasi-harga.json");

function baca() {
  try { return JSON.parse(fs.readFileSync(BERKAS(), "utf8")); } catch { return []; }
}

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const email = String(body?.email || "").trim();
  const vehicleId = String(body?.vehicleId || "").trim();
  const targetPrice = body?.targetPrice != null ? Number(body.targetPrice) : null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !vehicleId) {
    return json({ ok: false }, 400);
  }
  const daftar = Array.isArray(baca()) ? baca() : [];
  daftar.push({ email, vehicleId, targetPrice, createdAt: new Date().toISOString() });
  try {
    fs.mkdirSync(path.dirname(BERKAS()), { recursive: true });
    fs.writeFileSync(BERKAS(), JSON.stringify(daftar, null, 2), "utf8");
  } catch {
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
};
