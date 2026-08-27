import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { getEnv } from "../../lib/env";
import { fetchReleases, compareVersions } from "../../lib/releases";
import { json, unauthorized, forbidden } from "../../lib/api";

/**
 * Dipakai panel untuk menyalakan titik "ada versi baru" di sidebar tanpa
 * membuka halaman Pembaruan lebih dulu.
 *
 * `fetchReleases` punya cache lima menit di level modul, jadi memanggil ini
 * setiap kali panel dibuka tidak menghabiskan jatah GitHub API.
 */
export const GET: APIRoute = async ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "update")) return forbidden();

  let current = "dev";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    current = String(pkg.version || "dev");
  } catch {
    /* paket tanpa package.json — anggap versi pengembangan */
  }

  const { releases } = await fetchReleases(getEnv("GITHUB_REPO", "EVKita/EVKita"));
  const latest = releases[0]?.tag_name || "";

  return json({
    ok: true,
    current,
    latest,
    updateAvailable: !!latest && compareVersions(latest, current) > 0,
  });
};
