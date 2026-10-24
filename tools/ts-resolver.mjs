import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Penyelesai impor untuk pengujian.
 *
 * Node sudah bisa menjalankan TypeScript sendiri, tapi ia tidak menebak
 * ekstensi: `import { getEnv } from "./env"` gagal karena berkasnya bernama
 * `env.ts`. Bundler (Vite, yang dipakai Astro) menebaknya, jadi kode sumber
 * repo ini memang ditulis tanpa ekstensi — dan tidak ada alasan mengubah
 * puluhan berkas hanya supaya bisa diuji.
 *
 * Kait ini menutup jarak itu dalam belasan baris, tanpa menambah satu pun
 * dependensi. Dipakai lewat `node --import ./tools/ts-resolver.mjs`.
 */

const CANDIDATES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

    if (relative && context.parentURL?.startsWith("file:")) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      if (specifier.endsWith(".js")) {
        const tsCandidate = base.slice(0, -3) + ".ts";
        if (!fs.existsSync(base) && fs.existsSync(tsCandidate)) {
          return { url: pathToFileURL(tsCandidate).href, shortCircuit: true };
        }
      }
      if (!hasExtension) {
        for (const ext of CANDIDATES) {
          const candidate = base + ext;
          if (fs.existsSync(candidate)) {
            return { url: pathToFileURL(candidate).href, shortCircuit: true };
          }
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
