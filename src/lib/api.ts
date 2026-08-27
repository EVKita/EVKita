import { translate } from "./i18n/index.js";

/**
 * Pembungkus respons JSON untuk seluruh endpoint panel.
 *
 * Pesan galat dikirim sebagai KUNCI terjemahan, bukan kalimat jadi: panel bisa
 * berbahasa Indonesia, Inggris, atau Mandarin, dan server tidak selalu tahu
 * bahasa mana yang sedang dipakai pembacanya. `error` diisi versi Bahasa
 * Indonesia sebagai cadangan untuk klien yang tidak mengenali kuncinya.
 */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function apiError(key: string, status = 400, vars?: Record<string, string | number>): Response {
  return json(
    { ok: false, errorKey: key, errorVars: vars || {}, error: translate("id", key, vars) },
    status
  );
}

export const unauthorized = () => apiError("err.unauthorized", 401);
export const forbidden = () => apiError("err.forbidden", 403);
