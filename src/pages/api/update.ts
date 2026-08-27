import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { logActivity } from "../../lib/activity";
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
const pidFile = () => path.join(stateDir(), "pid");
const deployScript = () => path.resolve(root(), "deploy.sh");

/** Batas mutlak; deteksi proses mati di bawah biasanya jauh lebih cepat. */
const STALE_MS = 10 * 60 * 1000;
/** Jeda wajar sebelum berkas PID dianggap seharusnya sudah ada. */
const PID_GRACE_MS = 10 * 1000;

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

function readPid(): number | null {
  try {
    const n = Number.parseInt(fs.readFileSync(pidFile(), "utf8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Sinyal 0 tidak mengirim apa pun, hanya menanyakan apakah proses masih ada. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === "EPERM"; // ada, tapi milik user lain
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

/** Menyatukan status.json, PID, dan berkas exit code jadi satu keadaan. */
function currentState() {
  const status = readStatus();
  const version = installedVersion();

  if (!status) return { state: "idle" as const, version };

  const startedAt = Number(status.startedAt || 0);
  const base = { version, startedAt: status.startedAt, fromVersion: status.fromVersion };

  const code = readExitCode();
  if (code !== null) {
    return { state: code === 0 ? ("done" as const) : ("failed" as const), exitCode: code, ...base };
  }

  const age = Date.now() - startedAt;
  const pid = readPid();
  const alive = pid !== null && isAlive(pid);

  // Jaring pengaman kalau proses deploy mati tanpa sempat menulis exit code:
  // kalau versi yang terpasang sudah berubah, berkas versi baru jelas sudah
  // masuk dan aplikasi sudah dimuat ulang dengannya — itu berhasil, bukan
  // gagal. Sengaja hanya berlaku saat prosesnya sudah tidak hidup: package.json
  // sempat berganti beberapa detik sebelum PM2 restart, dan tanpa syarat ini
  // pembaruan yang normal akan dilaporkan selesai terlalu dini.
  //
  // Aturan ini juga yang menyelamatkan satu pembaruan berikutnya: pembaruan itu
  // masih dijalankan oleh kode versi lama yang belum punya perbaikan double-fork
  // di bawah, jadi prosesnya tetap akan terbunuh PM2 di tengah jalan.
  if (!alive && status.fromVersion && version !== status.fromVersion) {
    return { state: "done" as const, exitCode: 0, ...base };
  }

  // Tanpa pengecekan ini, proses deploy yang mati mendadak membuat panel
  // menunggu sampai batas waktunya — pembaruannya sendiri sudah lama selesai
  // atau gagal, tapi tidak ada yang melaporkannya.
  if (pid === null) {
    if (age > PID_GRACE_MS) {
      return { state: "failed" as const, reason: "no-start" as const, ...base };
    }
  } else if (!alive) {
    return { state: "failed" as const, reason: "process-gone" as const, ...base };
  }

  if (age > STALE_MS) return { state: "failed" as const, reason: "stale" as const, ...base };

  return { state: "running" as const, ...base };
}

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return json({ ok: false, errorKey: "err.unauthorized", error: "Unauthorized" }, 401);
  if (!can(me, "update")) return json({ ok: false, errorKey: "err.forbidden", error: "Forbidden" }, 403);
  return json({ ok: true, ...currentState(), log: readLogTail() });
};

export const POST: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return json({ ok: false, errorKey: "err.unauthorized", error: "Unauthorized" }, 401);
  if (!can(me, "update")) return json({ ok: false, errorKey: "err.forbidden", error: "Forbidden" }, 403);

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
  fs.rmSync(pidFile(), { force: true });
  fs.writeFileSync(logFile(), "");
  fs.writeFileSync(
    statusFile(),
    JSON.stringify({ startedAt: Date.now(), fromVersion: installedVersion() }),
  );

  logActivity(me, "update.start", { version: installedVersion() });

  // PM2 mematikan SELURUH pohon proses aplikasi lama setiap kali memuat ulang
  // (opsi `treekill`, aktif secara bawaan). Proses deploy adalah anak dari
  // aplikasi, jadi ia ikut mati persis saat `pm2 startOrReload` dijalankan:
  // skrip berhenti tepat di tahap "Restart PM2", berkas exit code tidak pernah
  // ditulis, dan panel menunggu sia-sia sampai batas waktu — padahal berkas
  // versi baru sudah terpasang beberapa detik sebelumnya. `detached: true`
  // saja tidak menolong: itu memisahkan grup proses, bukan hubungan induk-anak
  // yang ditelusuri PM2.
  //
  // Solusinya double-fork: bash pembungkus menjalankan deploy di latar lalu
  // langsung keluar, sehingga proses deploy diadopsi init dan tidak lagi
  // berada di pohon proses aplikasi. `setsid` menambah lapisan kedua dengan
  // memberinya sesi sendiri, kebal sinyal yang dikirim ke grup proses lama.
  const inner =
    'echo $$ > "$EVKITA_PID"; ' +
    'bash "$EVKITA_SCRIPT" >> "$EVKITA_LOG" 2>&1; ' +
    'echo $? > "$EVKITA_EXIT"';
  const runner =
    'if command -v setsid >/dev/null 2>&1; then SETSID=setsid; else SETSID=; fi; ' +
    `$SETSID bash -c '${inner}' </dev/null >/dev/null 2>&1 &`;

  // Tidak ada satu pun nilai dari klien yang masuk ke perintah ini: deploy.sh
  // selalu dijalankan tanpa argumen, yang berarti "pasang rilis terbaru".
  const token = getEnv("GITHUB_TOKEN", "");
  const child = spawn("bash", ["-c", runner], {
    cwd: root(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...(token ? { GITHUB_TOKEN: token } : {}),
      EVKITA_SCRIPT: deployScript(),
      EVKITA_LOG: logFile(),
      EVKITA_EXIT: exitFile(),
      EVKITA_PID: pidFile(),
    },
  });
  child.unref();

  return json({ ok: true, state: "running" });
};
