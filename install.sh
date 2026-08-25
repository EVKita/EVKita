#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "======================================"
echo "  EVKita Installer"
echo "======================================"

if ! command -v node >/dev/null 2>&1; then
  echo "! Node.js tidak ditemukan. Instal Node.js v18/v20/v22 dulu."
  exit 1
fi
echo "Node.js: $(node -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo ">> Menginstal PM2..."
  npm install -g pm2 || { echo "! Gagal instal PM2. Coba: sudo npm install -g pm2"; exit 1; }
fi

echo ">> Menjalankan aplikasi..."
pm2 start ecosystem.config.cjs
pm2 save

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "OK! Aplikasi sudah berjalan."
echo "Sekarang buka browser dan kunjungi:"
echo ""
echo "   http://${IP:-127.0.0.1}:4321/install"
echo ""
echo "lalu ikuti wizard instalasi step-by-step."
echo ""
echo "Tips: agar otomatis menyala saat server reboot, jalankan:"
echo "   pm2 startup   (lalu ikuti perintah yang muncul)"
