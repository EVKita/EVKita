import { getEnv } from "./env";

export interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

const TTL = 5 * 60 * 1000;

/**
 * Cache di level modul, bukan di dalam frontmatter halaman: kode frontmatter
 * .astro dijalankan ulang setiap request, jadi cache yang dideklarasikan di
 * sana tidak pernah kena dan setiap kunjungan menembak GitHub API (yang
 * dibatasi 60 permintaan/jam tanpa token).
 */
let cache: { repo: string; at: number; data: Release[] } | null = null;

export async function fetchReleases(
  repo: string,
): Promise<{ releases: Release[]; error: string | null }> {
  if (cache && cache.repo === repo && Date.now() - cache.at < TTL) {
    return { releases: cache.data, error: null };
  }

  const token = getEnv("GITHUB_TOKEN", "");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "evkita-cms",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
      headers,
    });
    if (!res.ok) {
      return { releases: [], error: `GitHub API merespons status ${res.status}.` };
    }
    const releases = (await res.json()) as Release[];
    cache = { repo, at: Date.now(), data: releases };
    return { releases, error: null };
  } catch {
    return { releases: [], error: "Tidak dapat terhubung ke GitHub API." };
  }
}

/**
 * Bandingkan dua versi semver sederhana (tanpa pra-rilis).
 * Mengembalikan angka positif kalau `a` lebih baru dari `b`.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}
