import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { isInstalled, writeEnvFile, getEnv } from "../../lib/env";
import { createUser, hasAnyUser, PASSWORD_MIN } from "../../lib/users";

/**
 * Terpasang kalau kunci sesi ADA, ATAU sudah ada akun di data/users.json.
 * Dua syarat, bukan satu: `.env` yang hilang setelah pembaruan tidak boleh
 * membuka kembali wizard di pemasangan yang sudah berisi konten dan akun.
 */
function alreadyInstalled(): boolean {
  return isInstalled() || hasAnyUser();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dataWritable(): boolean {
  try {
    const p = path.resolve(process.cwd(), "data");
    fs.mkdirSync(p, { recursive: true });
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async () => {
  return json({
    installed: alreadyInstalled(),
    node: process.version,
    writable: dataWritable(),
    port: getEnv("PORT", "4321"),
    repo: getEnv("GITHUB_REPO", "EVKita/EVKita"),
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (alreadyInstalled()) {
    return json({ ok: false, error: "Aplikasi sudah terinstal." }, 400);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const secret = String(body?.secret || "").trim();

  if (username.length < 3) return json({ ok: false, error: "Username minimal 3 karakter." }, 400);
  if (password.length < PASSWORD_MIN) {
    return json({ ok: false, error: `Password minimal ${PASSWORD_MIN} karakter.` }, 400);
  }
  if (secret.length < 16) return json({ ok: false, error: "Kunci keamanan minimal 16 karakter." }, 400);

  // Kata sandi TIDAK ikut ke .env lagi. Akun pertama langsung dibuat di
  // data/users.json dengan kata sandi ter-hash; .env hanya menyimpan kunci
  // sesi dan setelan server.
  writeEnvFile({
    SESSION_SECRET: secret,
    GITHUB_REPO: getEnv("GITHUB_REPO", "EVKita/EVKita"),
    PORT: getEnv("PORT", "4321"),
    HOST: getEnv("HOST", "127.0.0.1"),
  });

  createUser({
    username,
    password,
    name: username.charAt(0).toUpperCase() + username.slice(1),
    role: "owner",
  });

  return json({ ok: true });
};
