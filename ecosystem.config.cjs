const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const dotenv = loadEnvFile(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "evkita",
      script: "./dist/server/entry.mjs",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        PORT: dotenv.PORT || "4321",
        HOST: dotenv.HOST || "127.0.0.1",
        ADMIN_USERNAME: dotenv.ADMIN_USERNAME || "",
        ADMIN_PASSWORD: dotenv.ADMIN_PASSWORD || "",
        SESSION_SECRET: dotenv.SESSION_SECRET || "",
        GITHUB_REPO: dotenv.GITHUB_REPO || "EVKita/EVKita",
      },
    },
  ],
};
