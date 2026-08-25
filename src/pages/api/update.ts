import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isAuthed } from "../../lib/auth";
import { getEnv } from "../../lib/env";

/**
 * Berkas status pembaruan sengaja disimpan di `.update/` di root aplikasi,
 * bukan di dalam `data/`: deploy.sh mem-backup lalu memulihkan `data/` di
 * tengah proses, sehingga log yang ditulis ke sana akan tertimpa snapshot
 * lama. `.update/` tidak ikut di dalam evkita.zip, jadi aman dari `unzip -o`.
 */
const root = () => process.cwd();
const stateDir = () => path.resolve(root(), ".update");
const logFile = () => path.join(stateDir(), "update.log");
const statusFile = () => path.join(stateDir(), "status.json");
const exitFile = () => path.join(stateDir(), "exit");
const deployScript = () => path.resolve(root(), "deploy.sh");

const STALE_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function installedVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(root(), "package.json"), "utf8"));
    return String(pkg.version || "dev");
  } catch {
    return "dev";
  }
}

function readStatus(): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(statusFile(), "utf8"));
  } catch {
    return null;
  }
}

function readExitCode(): number | null {
  try {
    const raw = fs.readFileSync(exitFile(), "utf8").trim();
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readLogTail(maxBytes = 16000): string {
  try {
    const { size } = fs.statSync(logFile());
    const start = Math.max(0, size - maxBytes);
    const fd = fs.openSync(logFile(), "r");
    try {
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

/** Menyatukan status.json dengan berkas exit code jadi satu keadaan. */
function currentState() {
  const status = readStatus();
  const version = installedVersion();

  if (!status) return { state: "idle" as const, version };

  const code = readExitCode();
  if (code !== null) {
    return {
      state: code === 0 ? ("done" as const) : ("failed" as const),
      version,
      exitCode: code,
      startedAt: status.startedAt,
      fromVersion: status.fromVersion,
    };
  }

  // Proses induk bisa saja mati saat PM2 memuat ulang aplikasi di tengah
  // pembaruan; tanpa batas waktu, statusnya akan "running" selamanya.
  if (Date.now() - Number(status.startedAt || 0) > STALE_MS) {
    return { state: "failed" as const, version, stale: true, startedAt: status.startedAt };
  }

  return { state: "running" as const, version, startedAt: status.startedAt, fromVersion: status.fromVersion };
}

export const GET: APIRoute = ({ cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, ...currentState(), log: readLogTail() });
};

export const POST: APIRoute = ({ cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);

  if (!fs.existsSync(deployScript())) {
    return json(
      { ok: false, error: "deploy.sh tidak ditemukan. Pembaruan otomatis hanya tersedia pada instalasi dari paket rilis." },
      400,
    );
  }

  if (currentState().state === "running") {
    return json({ ok: false, error: "Pembaruan sedang berjalan." }, 409);
  }

  fs.mkdirSync(stateDir(), { recursive: true });
  fs.rmSync(exitFile(), { force: true });
  fs.writeFileSync(logFile(), "");
  fs.writeFileSync(
    statusFile(),
    JSON.stringify({ startedAt: Date.now(), fromVersion: installedVersion() }),
  );

  // Tidak ada satu pun nilai dari klien yang masuk ke perintah ini: deploy.sh
  // selalu dijalankan tanpa argumen, yang berarti "pasang rilis terbaru".
  const token = getEnv("GITHUB_TOKEN", "");
  const child = spawn(
    "bash",
    ["-c", 'bash "$0" >> "$1" 2>&1; echo $? > "$2"', deployScript(), logFile(), exitFile()],
    {
      cwd: root(),
      detached: true, // grup proses sendiri, supaya selamat saat PM2 me-restart aplikasi
      stdio: "ignore",
      env: token ? { ...process.env, GITHUB_TOKEN: token } : process.env,
    },
  );
  child.unref();

  return json({ ok: true, state: "running" });
};
