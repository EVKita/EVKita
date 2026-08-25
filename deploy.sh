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

# Setiap tahap diberi cap waktu relatif. Log ini tampil apa adanya di panel
# Admin → Pembaruan, jadi kalau suatu saat pembaruan terasa lambat, angka di
# sini langsung menunjukkan tahap mana yang memakan waktu — tidak perlu menebak.
START_TS="$(date +%s)"
step() { printf '[%4ss] ==> %s\n' "$(( $(date +%s) - START_TS ))" "$1"; }

step "Deploy dari ${REPO} (${VERSION:-latest})"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

step "Mengunduh paket rilis"
REPO="$REPO" VERSION="$VERSION" GITHUB_TOKEN="${GITHUB_TOKEN:-}" OUT="$TMP/evkita.zip" node - <<'NODE'
const fs = require("node:fs");
const repo = process.env.REPO;
const version = process.env.VERSION;
const token = process.env.GITHUB_TOKEN || "";
const auth = token ? { "User-Agent": "evkita-deploy", Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } : { "User-Agent": "evkita-deploy", Accept: "application/vnd.github+json" };
const relUrl = version
  ? `https://api.github.com/repos/${repo}/releases/tags/v${version}`
  : `https://api.github.com/repos/${repo}/releases/latest`;
// Tanpa batas waktu, satu koneksi yang menggantung (mis. IPv6 yang tidak bisa
// keluar di VPS) membuat pembaruan diam tanpa kabar sampai berpuluh menit.
const timeout = (ms) => AbortSignal.timeout(ms);
(async () => {
  const relRes = await fetch(relUrl, { headers: auth, signal: timeout(20000) });
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
  const res = await fetch(asset.url, { headers: dl, signal: timeout(120000) });
  if (!res.ok) {
    console.error(`Download gagal (HTTP ${res.status}).`);
    process.exit(1);
  }
  fs.writeFileSync(process.env.OUT, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${rel.tag_name} (${fs.statSync(process.env.OUT).size} bytes)`);
})().catch((e) => {
  console.error(e.name === "TimeoutError" ? "Koneksi ke GitHub kehabisan waktu." : e.message);
  process.exit(1);
});
NODE

step "Memeriksa isi paket"
unzip -o -q "$TMP/evkita.zip" -d "$TMP/extract"
if [ ! -f "$TMP/extract/dist/server/entry.mjs" ]; then
  echo "! Paket rilis tidak berisi dist/server/entry.mjs. Pembaruan dibatalkan;"
  echo "  aplikasi yang sedang berjalan tidak disentuh."
  exit 1
fi

# data/ di paket rilis hanya berisi konten awal untuk instalasi baru. Di server
# yang sudah jalan, direktori itu milik server: berisi content.json dan seluruh
# gambar yang diunggah admin. Membuangnya dari payload berarti data/ tidak
# perlu dicadangkan lalu dikembalikan — dua kali salin seluruh unggahan
# (bisa ratusan MB) hilang dari setiap pembaruan.
FRESH_INSTALL=0
if [ -f "$APP_DIR/data/content.json" ]; then
  rm -rf "$TMP/extract/data"
else
  FRESH_INSTALL=1
fi

step "Mencadangkan konfigurasi"
BACKUP_DIR="$APP_DIR/.backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -f "$APP_DIR/.env" ]; then cp -a "$APP_DIR/.env" "$BACKUP_DIR/.env"; fi
if [ -d "$APP_DIR/dist" ]; then cp -a "$APP_DIR/dist" "$BACKUP_DIR/dist"; fi
# Hanya berkas JSON kecil yang dicadangkan, bukan data/uploads: gambar tidak
# pernah disentuh pembaruan, jadi menyalinnya cuma membuang waktu dan disk.
if [ -d "$APP_DIR/data" ]; then
  mkdir -p "$BACKUP_DIR/data"
  find "$APP_DIR/data" -maxdepth 1 -type f -name '*.json' -exec cp -a {} "$BACKUP_DIR/data/" \; 2>/dev/null || true
fi

step "Memasang berkas baru"
# dist/ diganti utuh, bukan ditimpa. Nama berkas chunk berubah setiap build,
# jadi `unzip -o` akan meninggalkan chunk versi lama yang menumpuk terus.
rm -rf "$APP_DIR/dist"
cp -a "$TMP/extract/." "$APP_DIR/"

# .env milik server, bukan paket rilis. Paket memang tidak membawanya, tapi
# pemulihan ini murah dan menjaga kredensial admin kalau suatu saat terbawa.
if [ -f "$BACKUP_DIR/.env" ]; then
  cp -a "$BACKUP_DIR/.env" "$APP_DIR/.env"
fi

if [ "$FRESH_INSTALL" = "1" ]; then
  mkdir -p "$APP_DIR/data"
  chmod -R 775 "$APP_DIR/data" 2>/dev/null || true
fi

# Cadangan lama menumpuk selamanya kalau tidak dibersihkan — tiap pembaruan
# menambah satu salinan dist/. Simpan tiga terakhir saja, cukup untuk mundur.
step "Membersihkan cadangan lama"
# `|| true`: tanpa itu, `ls` yang tidak menemukan apa pun akan menjatuhkan
# seluruh skrip karena `set -o pipefail`.
{ ls -1dt "$APP_DIR"/.backup-* 2>/dev/null || true; } | tail -n +4 | while IFS= read -r old; do
  rm -rf "$old"
done

step "Restart PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env
  pm2 save >/dev/null 2>&1 || true
else
  echo "! PM2 tidak ditemukan. Jalankan: node dist/server/entry.mjs"
fi

step "Selesai dalam $(( $(date +%s) - START_TS )) detik. Backup: $BACKUP_DIR"
