#!/usr/bin/env bash
set -euo pipefail

# Deploy script for the EVKita Astro app on CyberPanel/Linux.
# Usage:
#   ./deploy.sh            # install latest release
#   ./deploy.sh 1.2.3      # install specific version (tag v1.2.3)

REPO="${GITHUB_REPO:-EVKita/EVKita}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/evkita.zip"
  LABEL="latest"
else
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/evkita.zip"
  LABEL="v${VERSION}"
fi

echo "==> Deploy ${LABEL} dari ${REPO}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Mengunduh $URL"
curl -L --fail --retry 3 -o "$TMP/evkita.zip" "$URL"

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
