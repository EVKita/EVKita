#!/usr/bin/env bash
set -euo pipefail

# Deploy script for the EVKita Astro app on CyberPanel/Linux.
# Usage:
#   bash deploy.sh            # install latest release
#   bash deploy.sh 1.2.3      # install specific version (tag v1.2.3)
#
# If the repo is private, export GITHUB_TOKEN with a token that has
# "Contents: read" access before running.

REPO="${GITHUB_REPO:-EVKita/EVKita}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-}"

echo "==> Deploy dari ${REPO} (${VERSION:-latest})"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REPO="$REPO" VERSION="$VERSION" GITHUB_TOKEN="${GITHUB_TOKEN:-}" OUT="$TMP/evkita.zip" node - <<'NODE'
const fs = require("node:fs");
const repo = process.env.REPO;
const version = process.env.VERSION;
const token = process.env.GITHUB_TOKEN || "";
const auth = token ? { "User-Agent": "evkita-deploy", Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } : { "User-Agent": "evkita-deploy", Accept: "application/vnd.github+json" };
const relUrl = version
  ? `https://api.github.com/repos/${repo}/releases/tags/v${version}`
  : `https://api.github.com/repos/${repo}/releases/latest`;
(async () => {
  const relRes = await fetch(relUrl, { headers: auth });
  if (!relRes.ok) {
    console.error(`Release tidak ditemukan (HTTP ${relRes.status}). Cek nama repo/versi atau GITHUB_TOKEN.`);
    process.exit(1);
  }
  const rel = await relRes.json();
  const asset = rel.assets.find((a) => a.name === "evkita.zip");
  if (!asset) {
    console.error("Asset evkita.zip tidak ditemukan pada rilis ini.");
    process.exit(1);
  }
  const dl = token
    ? { "User-Agent": "evkita-deploy", Accept: "application/octet-stream", Authorization: `Bearer ${token}` }
    : { "User-Agent": "evkita-deploy", Accept: "application/octet-stream" };
  const res = await fetch(asset.url, { headers: dl });
  if (!res.ok) {
    console.error(`Download gagal (HTTP ${res.status}).`);
    process.exit(1);
  }
  fs.writeFileSync(process.env.OUT, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${rel.tag_name} (${fs.statSync(process.env.OUT).size} bytes)`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
NODE

BACKUP_DIR="$APP_DIR/.backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -d "$APP_DIR/data" ]; then cp -a "$APP_DIR/data" "$BACKUP_DIR/data"; fi
if [ -f "$APP_DIR/.env" ]; then cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"; fi

echo "==> Mengekstrak ke $APP_DIR"
unzip -o -q "$TMP/evkita.zip" -d "$APP_DIR"

if [ -d "$BACKUP_DIR/data" ]; then
  rm -rf "$APP_DIR/data"
  cp -a "$BACKUP_DIR/data" "$APP_DIR/data"
fi
if [ -f "$BACKUP_DIR/.env" ]; then
  cp -a "$BACKUP_DIR/.env" "$APP_DIR/.env"
fi

chmod -R 775 "$APP_DIR/data" 2>/dev/null || true

echo "==> Restart PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload "$APP_DIR/ecosystem.config.cjs"
  pm2 save
else
  echo "! PM2 tidak ditemukan. Jalankan: node dist/server/entry.mjs"
fi

echo "==> Selesai. Backup tersimpan di $BACKUP_DIR"
