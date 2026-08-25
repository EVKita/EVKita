#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
APP_NAME="evkita"

echo "======================================"
echo "  EVKita Installer"
echo "======================================"

# --- 1. Node.js -------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "! Node.js tidak ditemukan. Instal Node.js v18/v20/v22 dulu."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "! Node.js $(node -v) terlalu lama. Butuh minimal v18."
  exit 1
fi
echo "Node.js: $(node -v)"

# --- 2. Hasil build -----------------------------------------------------------
# Paket rilis sudah membawa dist/ yang mandiri: dependensi runtime dibundel
# ke dalamnya, jadi node_modules tidak diperlukan untuk menjalankan aplikasi.
if [ ! -f dist/server/entry.mjs ]; then
  if [ -f astro.config.mjs ]; then
    echo ">> dist/ belum ada, memasang dependensi dan menjalankan build..."
    npm install
    npm run build
  else
    echo "! dist/server/entry.mjs tidak ditemukan dan tidak ada sumber untuk di-build."
    echo "  Pakai paket rilis (evkita.zip) atau jalankan 'npm run build' dulu."
    exit 1
  fi
fi

# --- 3. PM2 -----------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo ">> Menginstal PM2..."
  npm install -g pm2 || { echo "! Gagal instal PM2. Coba: sudo npm install -g pm2"; exit 1; }
fi

# --- 4. Tentukan port yang benar-benar bebas --------------------------------
# Server bisa saja sudah menjalankan aplikasi Node lain di port 4321.
# Kalau port yang diminta sudah dipakai proses lain, cari port bebas berikutnya.
read_env() {
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -1 | tr -d '"'"'"'\r'
}

ENV_PORT="$(read_env PORT)"
BIND_HOST="${HOST:-$(read_env HOST)}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"

if [ -n "${PORT:-}" ]; then
  # Port dipaksa lewat variabel lingkungan: pakai apa adanya.
  PORT_TO_USE="$PORT"
elif [ -n "$ENV_PORT" ]; then
  # Sudah pernah diinstal: pertahankan port yang tercatat di .env supaya
  # konfigurasi reverse proxy yang sudah dibuat tetap cocok.
  PORT_TO_USE="$ENV_PORT"
else
  # Instalasi baru: cari port bebas, karena 4321 bisa saja sudah dipakai
  # aplikasi Node lain di server yang sama.
  PORT_TO_USE="$(WANT=4321 node -e '
const net = require("node:net");
const start = Number(process.env.WANT) || 4321;
const free = (p) => new Promise((res) => {
  const s = net.createServer();
  s.once("error", () => res(false));
  s.once("listening", () => s.close(() => res(true)));
  s.listen(p, "127.0.0.1");
});
(async () => {
  for (let p = start; p < start + 50; p++) {
    if (await free(p)) { console.log(p); return; }
  }
  process.exit(1);
})();
')" || { echo "! Tidak menemukan port bebas mulai dari 4321."; exit 1; }

  if [ "$PORT_TO_USE" != "4321" ]; then
    echo "!! Port 4321 sudah dipakai proses lain di server ini."
    echo "   EVKita akan memakai port $PORT_TO_USE."
  fi
fi

# --- 5. Tulis .env (tanpa menimpa konfigurasi yang sudah ada) ---------------
touch .env
chmod 600 .env
set_env() {
  local key="$1" val="$2"
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" .env; then
    node -e '
      const fs = require("node:fs");
      const [file, key, val] = process.argv.slice(1);
      const out = fs.readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => (new RegExp("^\\s*" + key + "\\s*=").test(l) ? key + "=" + val : l))
        .join("\n");
      fs.writeFileSync(file, out);
    ' .env "$key" "$val"
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
set_env PORT "$PORT_TO_USE"
set_env HOST "$BIND_HOST"

mkdir -p data
chmod 775 data 2>/dev/null || true

# --- 6. Jalankan / muat ulang -----------------------------------------------
echo ">> Menjalankan aplikasi (port $PORT_TO_USE, host $BIND_HOST)..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

# --- 7. Pastikan aplikasi benar-benar merespons ------------------------------
echo ">> Memeriksa aplikasi..."
if ! PROBE_PORT="$PORT_TO_USE" PROBE_HOST="$BIND_HOST" node -e '
const host = process.env.PROBE_HOST === "0.0.0.0" ? "127.0.0.1" : process.env.PROBE_HOST;
const url = `http://${host}:${process.env.PROBE_PORT}/install`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) process.exit(0);
    } catch { /* belum siap */ }
    await wait(1000);
  }
  process.exit(1);
})();
'; then
  echo ""
  echo "! Aplikasi tidak merespons di http://${BIND_HOST}:${PORT_TO_USE}/"
  echo "  Lihat penyebabnya dengan:  pm2 logs ${APP_NAME} --lines 50"
  exit 1
fi

echo ""
echo "OK! Aplikasi berjalan di http://${BIND_HOST}:${PORT_TO_USE}"
echo ""

if [ "$BIND_HOST" = "127.0.0.1" ] || [ "$BIND_HOST" = "localhost" ]; then
  cat <<EOF
PENTING: aplikasi sengaja hanya mendengarkan di localhost, jadi
http://IP-SERVER:${PORT_TO_USE} TIDAK bisa dibuka dari luar.

Arahkan domain kamu ke port ini lewat reverse proxy dulu.
CyberPanel/OpenLiteSpeed -> Websites -> Manage -> Config -> vHost Conf,
tambahkan blok berikut lalu Save dan restart LiteSpeed:

  extprocessor evkitanode {
    type                    proxy
    address                 127.0.0.1:${PORT_TO_USE}
    maxConns                100
    pcKeepAliveTimeout      60
    initTimeout             60
    retryTimeout            0
    respBuffer              0
  }

  context / {
    type                    proxy
    handler                 evkitanode
    addDefaultCharset       off
  }

Setelah itu buka wizard instalasi di:

   https://DOMAIN-KAMU/install

EOF
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "Buka wizard instalasi di:"
  echo ""
  echo "   http://${IP:-127.0.0.1}:${PORT_TO_USE}/install"
  echo ""
fi

echo "Tips: agar otomatis menyala saat server reboot, jalankan:"
echo "   pm2 startup   (lalu ikuti perintah yang muncul)"
