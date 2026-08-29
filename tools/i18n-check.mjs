#!/usr/bin/env node
/**
 * Penjaga terjemahan panel admin.
 *
 * Setiap kali ada teks baru di panel — halaman baru, tombol baru, pesan toast
 * baru — teks itu harus punya kunci di ketiga kamus. Kalau hanya `id.js` yang
 * diisi, panel Bahasa Inggris dan Mandarin diam-diam kembali berbahasa
 * Indonesia dan tak ada yang menyadarinya sampai ada pengguna yang mengeluh.
 *
 * Skrip ini menutup celah itu. Jalankan lewat `npm run i18n:check`; skrip ini
 * juga dipanggil otomatis oleh `npm run build`.
 *
 * Yang membuat gagal (exit 1):
 *   1. Ada kunci di id.js yang tidak ada di en.js atau zh.js (atau sebaliknya).
 *   2. Ada `t("...")` di kode yang kuncinya tidak ada di kamus.
 *   3. Ada terjemahan yang masih persis sama dengan teks Indonesianya padahal
 *      teksnya mengandung huruf — biasanya tanda hasil salin-tempel yang lupa
 *      diterjemahkan. Kecualikan lewat daftar SAMA_SENGAJA di bawah.
 *   4. Ada kalimat yang ditulis LANGSUNG di kode panel, tanpa pernah menjadi
 *      kunci. Kecualikan lewat KONSTAN_DATA / ABAIKAN_LITERAL di bawah.
 *
 * Yang hanya jadi peringatan: kunci yang tidak pernah dipakai di kode.
 *
 * Catatan soal pemeriksaan nomor 4: selama pemeriksaan ini belum ada, tiga
 * kalimat berhasil lolos ke panel tanpa terjemahan — "Galeri masih kosong.",
 * "Cepat tambah:", dan teks pembuka pencarian global. Memeriksa kunci saja
 * tidak cukup: teks yang tidak pernah menjadi kunci tidak akan pernah muncul
 * sebagai kunci yang hilang.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const I18N_DIR = path.join(ROOT, "src", "lib", "i18n");
const SCAN_DIRS = [path.join(ROOT, "src")];
const SCAN_EXT = new Set([".js", ".ts", ".astro", ".mjs"]);

/**
 * Terjemahan yang memang identik dengan Bahasa Indonesia — nama merek, satuan,
 * istilah teknis yang tidak diterjemahkan. Ditulis sebagai `locale:kunci`.
 */
const SAMA_SENGAJA = new Set([
  "en:common.edit",
  "en:field.id",
  "en:field.status",
  "en:col.spklu",
  "en:nav.media",
  "en:media.searchPh",
  "en:field.spklu.name.ph",
  "en:field.berita.source.ph",
  "en:sort.az",
  "en:sort.za",
  "en:common.grid",
  "en:view.media.title",
  "en:editor.section.media",
  "en:editor.editTitle",
  "en:field.tagline",
  "en:field.spklu.operator",
  "en:combo.label.operator",
  "en:combo.label.area",
  "en:field.phone.ph",
  "en:profile.email",
  "en:users.role.admin",
  "en:users.role.editor",
  "en:site.hero",
  "en:site.seo",
  "en:site.contactEmail",
  "en:site.footer",
  // Nama merek, sama di semua bahasa.
  "en:site.contactWhatsapp",
  "zh:site.contactWhatsapp",
  "zh:site.seo",
  "zh:field.id",
  "en:tampilan.header",
  "en:tampilan.bgPattern.aurora",
  "en:tampilan.customCss.ph",
  "zh:tampilan.customCss.ph",
  // "Total" memang kata yang sama di kedua bahasa.
  "en:ai.balance.total",
]);

/**
 * Awalan kunci yang dirakit saat program berjalan, mis. `t("col." + col)`.
 * Kunci dengan awalan ini tidak dianggap "tidak terpakai".
 */
const DYNAMIC_PREFIXES = [
  "col.",
  "nav.",
  "view.",
  "filter.",
  "sort.",
  "status.",
  "field.",
  "editor.section.",
  "issue.",
  "activity.",
  "users.role.",
  "profile.theme.",
  "profile.density.",
  "dash.hello.",
  "dash.stat.",
  "dash.quick.",
  // Dirakit saat berjalan: pintasan panel Kesehatan memilih kuncinya dari
  // sebuah tabel, dan peringatan nilai janggal memilihnya dari arah selisihnya.
  "dash.health.show",
  "warn.",
  "err.",
  "save.",
  "update.step.",
  "update.note.",
  "users.cannot",
  "tampilan.",
  "site.themeMode.",
  "combo.label.",
  // Dirakit saat berjalan: t(`ai.step.${jenis}`), t(`ai.conf.${keyakinan}`),
  // t(`ai.model.${id}`).
  "ai.step.",
  "ai.conf.",
  "ai.model.",
];

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;

async function loadDict(locale) {
  const mod = await import(path.join(I18N_DIR, `${locale}.js`));
  return mod.default;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "i18n") continue;
      walk(p, out);
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      out.push(p);
    }
  }
  return out;
}

/** Mengumpulkan kunci yang dipakai sebagai literal: t("x"), tt("x"), data-i18n="x". */
function collectUsedKeys(files) {
  const used = new Map();
  const patterns = [
    /\bt\(\s*"([^"]+)"/g,
    /\bt\(\s*'([^']+)'/g,
    /\btt\(\s*"([^"]+)"/g,
    /\btranslate\(\s*[^,]+,\s*"([^"]+)"/g,
    /\bapiMessage\([^,]+,\s*"([^"]+)"/g,
    /data-i18n="([^"]+)"/g,
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const key = m[1];
        if (!/^[a-zA-Z][\w.]*$/.test(key)) continue;
        if (!used.has(key)) used.set(key, new Set());
        used.get(key).add(path.relative(ROOT, file));
      }
    }
  }
  return used;
}

const dicts = {
  id: await loadDict("id"),
  en: await loadDict("en"),
  zh: await loadDict("zh"),
};

const errors = [];
const warnings = [];

/* 1. Kunci harus sama persis di ketiga kamus. */
const idKeys = Object.keys(dicts.id);
const idSet = new Set(idKeys);

for (const locale of ["en", "zh"]) {
  const keys = new Set(Object.keys(dicts[locale]));
  const missing = idKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !idSet.has(k));
  for (const k of missing) errors.push(`${locale}.js kehilangan kunci: ${k}`);
  for (const k of extra) errors.push(`${locale}.js punya kunci yang tidak ada di id.js: ${k}`);
}

/* 2. Kunci kosong. */
for (const [locale, dict] of Object.entries(dicts)) {
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== "string" || v.trim() === "") errors.push(`${locale}.js: nilai kosong untuk ${k}`);
  }
}

/* 3. Placeholder harus sama di semua bahasa. */
const holders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of idKeys) {
  const want = holders(dicts.id[k]);
  for (const locale of ["en", "zh"]) {
    if (dicts[locale][k] === undefined) continue;
    const got = holders(dicts[locale][k]);
    if (got !== want) {
      errors.push(`${locale}.js: placeholder ${k} tidak cocok — id punya {${want}}, ${locale} punya {${got}}`);
    }
  }
}

/* 4. Terjemahan yang belum diterjemahkan. */
for (const locale of ["en", "zh"]) {
  for (const k of idKeys) {
    const src = dicts.id[k];
    const dst = dicts[locale][k];
    if (dst === undefined || src !== dst) continue;
    if (!/\p{Letter}{3}/u.test(src)) continue;
    if (SAMA_SENGAJA.has(`${locale}:${k}`)) continue;
    errors.push(`${locale}.js: "${k}" masih sama persis dengan teks Indonesia ("${src}")`);
  }
}

/* 5. Kunci yang dipakai kode tapi tidak ada di kamus. */
const files = SCAN_DIRS.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));
const used = collectUsedKeys(files);
for (const [key, where] of used) {
  if (!idSet.has(key)) {
    errors.push(`Kunci "${key}" dipakai di ${[...where].join(", ")} tapi tidak ada di id.js`);
  }
}

/* 6. Kunci yang tidak pernah dipakai — peringatan saja. */
for (const key of idKeys) {
  if (used.has(key)) continue;
  if (DYNAMIC_PREFIXES.some((p) => key.startsWith(p))) continue;
  warnings.push(`Kunci "${key}" tidak terpakai di kode mana pun`);
}

/* 7. Kalimat yang ditulis langsung di kode panel. */

/**
 * Berkas yang teksnya WAJIB berasal dari kamus. Situs publik sengaja tidak
 * ikut: ia memang hanya berbahasa Indonesia.
 */
const PANEL_FILES = [
  "src/scripts/admin.js",
  "src/scripts/admin-shell.js",
  "src/pages/admin/index.astro",
  "src/pages/admin/login.astro",
  "src/pages/admin/update.astro",
];

/**
 * Deklarasi yang isinya DATA, bukan antarmuka: nilainya tersimpan apa adanya
 * ke content.json dan ikut tampil di situs publik yang berbahasa Indonesia.
 * Menerjemahkannya akan mengubah isi database. Baris di dalamnya dilewati.
 */
const KONSTAN_DATA = new Set([
  // CAR_BODY_TYPES, MOTOR_BODY_TYPES, RANGE_STANDARDS, dan DRIVE_TYPES tidak
  // lagi ditulis di panel — mereka pindah ke src/lib/vehicle-spec.js, yang
  // bukan berkas panel dan karena itu tidak diperiksa di sini.
  "BRAND_SUGGESTIONS",
  "SPEC_PRESETS",
  "DIR_SUGGESTIONS",
  "HEADING_WEIGHTS",
]);

/** Kalimat yang memang tidak diterjemahkan, ditulis persis apa adanya. */
const ABAIKAN_LITERAL = new Set([
  "Rp 22 jt",
  "Rp 415 jt",
]);

/* Dua bentuk yang benar-benar berisiko: teks di antara dua tag, dan string
   yang seluruhnya berupa kalimat. Keduanya sengaja menolak karakter kode
   (<, >, =, {, $, kutip) supaya regex dan potongan markup tidak ikut tertangkap. */
const TEKS_ANTAR_TAG = />([^<>{}$`"'=]*[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}[^<>{}$`"'=]*)</g;
const KALIMAT_UTUH = /(["'])([A-ZÀ-Ý][A-Za-zÀ-ÿ]+(?:[ ,.…]+[A-Za-zÀ-ÿ0-9]+)+[.!?…]?)\1/g;

for (const rel of PANEL_FILES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;

  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
  let konstanSekarang = "";

  lines.forEach((line, i) => {
    // Lacak deklarasi yang sedang dibuka, supaya daftar data multi-baris
    // (BRAND_SUGGESTIONS, SPEC_PRESETS) ikut terlewati seluruhnya.
    const buka = line.match(/^const\s+(\w+)/);
    if (buka) konstanSekarang = buka[1];
    else if (/^[}\]);]/.test(line) || line.trim() === "") konstanSekarang = "";
    if (KONSTAN_DATA.has(konstanSekarang)) return;

    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;

    for (const re of [TEKS_ANTAR_TAG, KALIMAT_UTUH]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const teks = (m[1] === '"' || m[1] === "'" ? m[2] : m[1]).trim();
        if (!teks || ABAIKAN_LITERAL.has(teks)) continue;
        errors.push(
          `${rel}:${i + 1} menulis teks panel langsung di kode: "${teks}" — ` +
            `beri kunci di ketiga kamus lalu panggil lewat t()`
        );
      }
    }
  });
}

for (const w of warnings) console.log(YELLOW("peringatan: ") + w);
for (const e of errors) console.log(RED("galat: ") + e);

console.log(
  `\n${idKeys.length} kunci · ${files.length} berkas dipindai · ` +
    `${errors.length} galat · ${warnings.length} peringatan`
);

if (errors.length) {
  console.log(RED("\nPeriksaan terjemahan GAGAL. Perbaiki galat di atas sebelum melanjutkan.\n"));
  process.exit(1);
}
console.log(GREEN("Terjemahan sinkron di ketiga bahasa.\n"));
