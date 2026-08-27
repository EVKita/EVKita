import id from "./id.js";
import en from "./en.js";
import zh from "./zh.js";

/**
 * Lapisan multibahasa panel admin.
 *
 * Berkas ini sengaja JavaScript polos tanpa API khusus Node, supaya kamus yang
 * sama bisa dipakai dua tempat: di frontmatter `.astro` (dirender server) dan
 * di dalam `admin.js` (dijalankan browser). Kalau keduanya punya kamus
 * sendiri-sendiri, cepat atau lambat keduanya akan berbeda isi.
 */

export const DEFAULT_LOCALE = "id";

/** Daftar bahasa yang tersedia, sekaligus isi pemilih bahasa di panel. */
export const LOCALES = [
  { code: "id", label: "Bahasa Indonesia", short: "ID", intl: "id-ID", html: "id" },
  { code: "en", label: "English", short: "EN", intl: "en-US", html: "en" },
  { code: "zh", label: "中文", short: "中", intl: "zh-CN", html: "zh-Hans" },
];

const DICTS = { id, en, zh };

/** Nama cookie tempat pilihan bahasa disimpan agar halaman server ikut tahu. */
export const LOCALE_COOKIE = "evkita_lang";

export function normalizeLocale(value) {
  const s = String(value || "").toLowerCase();
  if (DICTS[s]) return s;
  // Terima juga bentuk lengkap seperti "en-US" atau "zh-Hans".
  const base = s.split(/[-_]/)[0];
  return DICTS[base] ? base : DEFAULT_LOCALE;
}

export function localeMeta(locale) {
  const code = normalizeLocale(locale);
  return LOCALES.find((l) => l.code === code) || LOCALES[0];
}

export function intlLocale(locale) {
  return localeMeta(locale).intl;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}

/**
 * Menerjemahkan satu kunci. Kalau terjemahannya belum ada, teks Bahasa
 * Indonesia yang dipakai — halaman tetap terbaca, bukan menampilkan nama kunci.
 */
export function translate(locale, key, vars) {
  const dict = DICTS[normalizeLocale(locale)] || id;
  const text = dict[key] !== undefined ? dict[key] : id[key];
  if (text === undefined) return key;
  return interpolate(text, vars);
}

/** Membuat fungsi `t` yang sudah terikat ke satu bahasa. */
export function makeT(locale) {
  const code = normalizeLocale(locale);
  return (key, vars) => translate(code, key, vars);
}

/* ------------------------------------------------------------------ *
 * Format tanggal & angka
 * ------------------------------------------------------------------ */

export function formatDate(locale, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(locale, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(locale, n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString(intlLocale(locale));
}

const RELATIVE_STEPS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * "2 jam lalu" / "2 hours ago" / "2小时前". Dipakai untuk sapaan dasbor dan
 * log aktivitas, di mana waktu persis kurang penting daripada rasa "baru saja".
 */
export function formatRelative(locale, iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), "second");
}
