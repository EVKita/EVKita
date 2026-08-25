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
APP_DIR="${EVKITA_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
VERSION="${1:-}"

# Skrip ini mengganti seluruh isi direktori aplikasi — termasuk berkas skrip
# ini sendiri. Bash membaca skrip sambil menjalankannya, jadi menimpa
# berkasnya di tengah proses membuat sisa perintah tidak pernah dijalankan:
# pembaruan berhenti diam-diam setelah berkas tersalin, sebelum data/ dan
# .env sempat dipulihkan. Karena itu jalankan dari salinan di luar APP_DIR.
if [ -z "${EVKITA_DEPLOY_REEXEC:-}" ]; then
  SELF_COPY="$(mktemp)"
  cp "${BASH_SOURCE[0]}" "$SELF_COPY"
  EVKITA_DEPLOY_REEXEC=1 EVKITA_APP_DIR="$APP_DIR" bash "$SELF_COPY" "$@"
  CODE=$?
  rm -f "$SELF_COPY"
  exit "$CODE"
fi

echo "==> Deploy dari ${REPO} (${VERSION:-latest})"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Mengunduh paket rilis"
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

echo "==> Memeriksa isi paket"
unzip -o -q "$TMP/evkita.zip" -d "$TMP/extract"
if [ ! -f "$TMP/extract/dist/server/entry.mjs" ]; then
  echo "! Paket rilis tidak berisi dist/server/entry.mjs. Pembaruan dibatalkan;"
  echo "  aplikasi yang sedang berjalan tidak disentuh."
  exit 1
fi

echo "==> Mencadangkan data dan konfigurasi"
BACKUP_DIR="$APP_DIR/.backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -d "$APP_DIR/data" ]; then cp -a "$APP_DIR/data" "$BACKUP_DIR/data"; fi
if [ -f "$APP_DIR/.env" ]; then cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"; fi
if [ -d "$APP_DIR/dist" ]; then cp -a "$APP_DIR/dist" "$BACKUP_DIR/dist"; fi

echo "==> Memasang berkas baru"
# dist/ diganti utuh, bukan ditimpa. Nama berkas chunk berubah setiap build,
# jadi `unzip -o` akan meninggalkan chunk versi lama yang menumpuk terus.
rm -rf "$APP_DIR/dist"
cp -a "$TMP/extract/." "$APP_DIR/"

# data/ dan .env milik server, bukan paket rilis: selalu kembalikan.
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
