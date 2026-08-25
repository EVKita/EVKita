import fs from "node:fs";
import path from "node:path";

const ENV_FILE = () => path.resolve(process.cwd(), ".env");

let cache: { at: number; vars: Record<string, string> } | null = null;

export function readEnvFile(): Record<string, string> {
  const now = Date.now();
  if (cache && now - cache.at < 2000) return cache.vars;

  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(ENV_FILE(), "utf8");
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
  } catch {
    /* belum ada .env */
  }

  cache = { at: now, vars: out };
  return out;
}

export function getEnv(key: string, fallback = ""): string {
  const fromFile = readEnvFile()[key];
  if (fromFile !== undefined && fromFile !== "") return fromFile;
  const fromProc = process.env[key];
  if (fromProc !== undefined && fromProc !== "") return fromProc;
  return fallback;
}

export function writeEnvFile(vars: Record<string, string>): void {
  const merged = { ...readEnvFile(), ...vars };
  const lines: string[] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null) continue;
    lines.push(`${k}=${v}`);
  }
  fs.writeFileSync(ENV_FILE(), lines.join("\n") + "\n", "utf8");
  cache = null;
}

export function isInstalled(): boolean {
  const secret = getEnv("SESSION_SECRET", "");
  const placeholder = "ubah-dengan-string-acak-yang-panjang-dan-rahasia";
  return secret !== "" && secret !== placeholder && secret !== "dev-secret-change-me";
}
