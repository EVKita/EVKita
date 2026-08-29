"use strict";

import {
  makeT,
  normalizeLocale,
  intlLocale,
  localeMeta,
  LOCALES,
  LOCALE_COOKIE,
  formatDate as i18nDate,
  formatDateTime as i18nDateTime,
  formatRelative,
} from "../lib/i18n/index.js";
import { safeUrl } from "../lib/url.js";
import { konfirmasi } from "./konfirmasi.js";
import { mediaEntry, MEDIA_LIMITS } from "../lib/media.js";
import {
  MAX_MENU_COLS,
  MAX_MENU_LINKS,
  MAX_LEGAL_LINKS,
  blankMenuColumn,
  normalizeLinks,
  normalizeMenus,
} from "../lib/footer.js";
import {
  jamSibuk,
  perkiraanBiaya,
  MODEL_BAWAAN,
  MODEL_PILIHAN,
} from "../lib/ai-biaya.js";
import {
  CAR_BODY_TYPES,
  MOTOR_BODY_TYPES,
  RANGE_STANDARDS,
  DRIVE_TYPES,
} from "../lib/vehicle-spec.js";
import {
  THEME_PRESETS,
  PRESET_FIELDS,
  APPEARANCE_DEFAULTS,
  APPEARANCE_FLAGS,
  findPreset,
  resolveTheme,
  themeStyle,
  themeBodyClass,
} from "../lib/theme.js";

/* =============================================================================
 * EVKita — Logika Panel Admin
 *
 * Struktur berkas: konfigurasi (data) → helper → jaringan/riwayat → render →
 * modal → event. Definisi field ditulis sebagai DATA, bukan markup berulang,
 * supaya menambah field cukup satu baris dan tidak ada markup yang tercecer.
 *
 * Semua markup yang dibangun dari data pengguna WAJIB lewat esc().
 *
 * BAHASA: panel ini tiga bahasa (id/en/zh). Karena itu daftar yang mengandung
 * teks — label field, nama filter, pilihan urutan — ditulis sebagai FUNGSI,
 * bukan konstanta: isinya harus dibaca ulang setiap kali dirender, supaya
 * berganti bahasa tidak perlu memuat ulang halaman. Setiap teks baru wajib
 * punya kunci di src/lib/i18n/*.js; `npm run i18n:check` menjaga itu.
 * ========================================================================== */

/* ------------------------------------------------------------------ *
 * 1. Konfigurasi
 * ------------------------------------------------------------------ */

/* Bahasa aktif panel. Diisi dari profil pengguna saat init(), dan diganti
   lewat pemilih bahasa di bilah atas. */
let locale = "id";
let t = makeT(locale);

/* "editor", "profile", dan "users" adalah halaman penuh tanpa butir sidebar
   sendiri di kelompok koleksi. */
const VIEWS = ["dashboard", "cars", "motors", "spklu", "bengkel", "berita", "tampilan", "site", "media", "ai", "backups", "editor", "profile", "users", "activity"];

/* Dua form yang isinya sama-sama field `site`: Pengaturan Situs dan Tampilan.
   Keduanya ditangani mesin yang sama supaya menambah field cukup satu baris
   markup, tanpa penangan baru. */
const SITE_FORMS = ["site-form", "tampilan-form"];
const COLLECTIONS = ["cars", "motors", "spklu", "bengkel", "berita"];
const VEHICLE_COLS = ["cars", "motors"];
const DIR_COLS = ["spklu", "bengkel", "berita"];

const colLabel = (col) => t(`col.${col}`);
const colOne = (col) => t(`col.${col}.one`);

const PAGE_SIZE = 24;
const AUTOSAVE_MS = 1200;
const HISTORY_MAX = 40;

/* Tipe bodi, standar jarak, dan tipe penggerak sekarang tinggal di
   src/lib/vehicle-spec.js — dibaca formulir ini DAN skema JSON yang dikirim ke
   DeepSeek, supaya keduanya tidak bisa berbeda. Lihat catatan di berkas itu. */

/* Statusnya sendiri tetap "published"/"draft"; hanya labelnya yang berbahasa. */
const statusOpts = () => [["published", t("status.published")], ["draft", t("status.draft")]];

/* Saran merek untuk field Merek. Digabung dengan merek yang sudah ada di data
   lalu ditampilkan sebagai daftar pilihan yang bisa dicari. Field-nya tetap
   teks bebas: merek yang belum ada di daftar boleh diketik langsung. */
const BRAND_SUGGESTIONS = {
  cars: ["Aion", "BMW", "BYD", "Chery", "Citroen", "Denza", "DFSK", "Geely", "Honda", "Hyundai", "Jetour", "Kia", "Lexus", "Maxus", "Mercedes-Benz", "MG", "Mini", "Mitsubishi", "Neta", "Nissan", "Polestar", "Seres", "Tesla", "Toyota", "VinFast", "Volvo", "Wuling"],
  motors: ["Alva", "Charged", "Davigo", "Electrum", "Exotic", "Gesits", "Honda", "Maka Motors", "Niu", "Polytron", "Rakata", "Selis", "Smoot", "United", "Uwinfly", "Viar", "Volta", "Yamaha"],
};

/* Label spesifikasi yang lazim tapi tidak punya field baku. Tampil sebagai chip
   di tab Spesifikasi supaya baris tambahan cukup satu klik. Sama seperti tipe
   bodi, teksnya ikut tersimpan ke data jadi tidak diterjemahkan. */
const SPEC_PRESETS = {
  cars: ["Dimensi (P×L×T)", "Jarak Sumbu Roda", "Ground Clearance", "Bobot Kosong", "Kapasitas Bagasi", "Ukuran Ban", "Tipe Baterai", "Jumlah Airbag", "Fitur Keselamatan", "Layar Infotainment", "Radius Putar"],
  motors: ["Bobot", "Tipe Baterai", "Baterai Bisa Ditukar", "Daya Motor (Watt)", "Waktu Pengisian Penuh", "Rem Depan / Belakang", "Ukuran Ban", "Kapasitas Bagasi", "Mode Berkendara", "Suspensi", "Beban Maksimum"],
};

/* Urutan bagian di halaman editor, sekaligus isi navigasi sampingnya. */
const SECTION_KEYS = ["dasar", "spesifikasi", "media", "varian", "lanjutan"];
const editorSections = () =>
  SECTION_KEYS.map((k) => ({ k, l: t(`editor.section.${k}`), d: t(`editor.section.${k}.desc`) }));

/**
 * Field kendaraan per pane modal. `t` = tipe kontrol, `full` = selebar grid,
 * `src` = kunci daftar saran untuk kontrol `combo`.
 *
 * Dibuat per koleksi karena mobil dan motor tidak berbagi seluruh spesifikasi:
 * motor tidak punya penggerak roda maupun jumlah kursi, dan pilihan tipe
 * bodinya berbeda. Field yang tidak ditampilkan juga tidak ikut ditulis saat
 * simpan, sehingga nilai lama pada item yang sudah ada tetap utuh.
 */
function vehicleFields(col) {
  const motor = col === "motors";
  const one = colOne(col).toLowerCase();
  return {
    dasar: [
      { k: "brand", l: t("field.brand"), t: "combo", req: true, ph: motor ? t("field.brand.phMotor") : t("field.brand.phCar"), src: "brand", hint: t("field.brand.hint") },
      { k: "name", l: t("field.name"), t: "text", req: true, ph: motor ? t("field.name.phMotor") : t("field.name.phCar") },
      { k: "bodyType", l: motor ? t("field.bodyTypeMotor") : t("field.bodyTypeCar"), t: "select", opts: motor ? MOTOR_BODY_TYPES : CAR_BODY_TYPES },
      { k: "year", l: t("field.year"), t: "number", ph: "2025" },
      { k: "status", l: t("field.status"), t: "select", opts: statusOpts(), hint: t("field.status.hint") },
      { k: "tagline", l: t("field.tagline"), t: "text", ph: t("field.tagline.ph") },
      { k: "description", l: t("field.description"), t: "textarea", full: true, rows: 5, ph: t("field.description.ph", { one }) },
      { k: "tags", l: t("field.tags"), t: "tags", full: true, hint: t("field.tags.hint") },
      { k: "featured", l: t("field.featured"), t: "switch" },
      { k: "stale", l: t("field.stale"), t: "switch", hint: t("field.stale.hint") },
    ],
    spesifikasi: [
      { k: "rangeKm", l: t("field.rangeKm"), t: "number", ph: motor ? "80" : "450" },
      { k: "rangeStandard", l: t("field.rangeStandard"), t: "select", opts: RANGE_STANDARDS },
      { k: "batteryKwh", l: t("field.batteryKwh"), t: "number", step: "0.1", ph: motor ? "2,4" : "58" },
      { k: "powerHp", l: t("field.powerHp"), t: "number" },
      { k: "torqueNm", l: t("field.torqueNm"), t: "number" },
      { k: "topSpeedKph", l: t("field.topSpeedKph"), t: "number" },
      { k: "accelSec", l: motor ? t("field.accelSecMotor") : t("field.accelSecCar"), t: "number", step: "0.1" },
      ...(motor
        ? []
        : [
          { k: "seats", l: t("field.seats"), t: "number" },
          { k: "driveType", l: t("field.driveType"), t: "select", opts: DRIVE_TYPES },
        ]),
      { k: "chargeDcKw", l: t("field.chargeDcKw"), t: "number" },
      { k: "chargeAcKw", l: motor ? t("field.chargeAcKwMotor") : t("field.chargeAcKwCar"), t: "number" },
      { k: "chargeTime", l: t("field.chargeTime"), t: "text", ph: motor ? t("field.chargeTime.phMotor") : t("field.chargeTime.phCar") },
      { k: "warranty", l: t("field.warranty"), t: "text", ph: motor ? t("field.warranty.phMotor") : t("field.warranty.phCar") },
      { k: "price", l: t("field.price"), t: "number", ph: motor ? "22000000" : "415000000", hint: t("field.price.hint") },
      { k: "priceText", l: t("field.priceText"), t: "text", ph: motor ? "Rp 22 jt" : "Rp 415 jt" },
    ],
  };
}

/* Saran isi untuk field direktori. Sama seperti tipe bodi dan nama merek,
   nilainya tersimpan apa adanya ke content.json dan ikut tampil di situs
   publik yang berbahasa Indonesia — jadi sengaja tidak diterjemahkan. */
const DIR_SUGGESTIONS = {
  spkluOperator: ["PLN", "Starvo", "Utomo Charge+", "Charge+", "Voltron", "Casion"],
  spkluConnector: ["CCS2", "CHAdeMO", "AC Type 2", "CCS2 + CHAdeMO", "GB/T"],
  spkluPower: ["7 kW", "11 kW", "22 kW", "25 kW", "50 kW", "60 kW", "120 kW", "200 kW"],
  hoursSpklu: ["24 jam", "06.00-22.00", "08.00-20.00", "Mengikuti jam mal"],
  hoursBengkel: ["Senin-Sabtu 08.00-17.00", "Senin-Jumat 08.00-16.30", "Setiap hari 09.00-18.00"],
  bengkelType: ["Resmi", "Umum", "Spesialis"],
};

/**
 * Field direktori, dikelompokkan per bagian.
 *
 * Pengelompokannya bukan hiasan. Formulir SPKLU punya 13 field, dan tiga belas
 * kotak beruntun tanpa jeda tidak memberi tahu apa pun soal urutan pengisian
 * maupun mana yang boleh dilewati. Bagian bernama menjawab keduanya sekaligus,
 * dan membuat field yang saling berhubungan terlihat berhubungan.
 *
 * `src` menyalakan kontrol combo — daftar saran yang isinya diambil dari data
 * yang sudah ada. Untuk field yang ikut menjadi filter (area, operator, jenis
 * bengkel, sumber berita) ini bukan sekadar kemudahan mengetik: filter
 * mencocokkan nilai **persis**, jadi "Jakarta Pusat" dan "Jakarta pusat"
 * berakhir sebagai dua pilihan filter yang berbeda.
 */
function dirGroups(col) {
  const urlPh = "https://maps.google.com/…";

  if (col === "spklu") {
    return [
      {
        l: t("dir.spklu.sec.identitas"), d: t("dir.spklu.sec.identitas.d"), f: [
          { k: "name", l: t("field.spklu.name"), t: "text", req: true, full: true, ph: t("field.spklu.name.ph") },
          { k: "operator", l: t("field.spklu.operator"), t: "combo", src: "spkluOperator", ph: t("field.spklu.operator.ph") },
          { k: "area", l: t("field.area"), t: "combo", src: "area", ph: t("field.area.ph"), hint: t("field.area.hint") },
        ],
      },
      {
        l: t("dir.spklu.sec.lokasi"), d: t("dir.spklu.sec.lokasi.d"), f: [
          { k: "address", l: t("field.address"), t: "textarea", full: true, rows: 2 },
          { k: "mapUrl", l: t("field.mapUrl"), t: "url", full: true, ph: urlPh, hint: t("field.mapUrl.hint") },
        ],
      },
      {
        l: t("dir.spklu.sec.pengisian"), d: t("dir.spklu.sec.pengisian.d"), f: [
          { k: "power", l: t("field.spklu.power"), t: "combo", src: "spkluPower", ph: t("field.spklu.power.ph") },
          { k: "connector", l: t("field.spklu.connector"), t: "combo", src: "spkluConnector", ph: t("field.spklu.connector.ph") },
          { k: "count", l: t("field.spklu.count"), t: "number", ph: "2" },
          { k: "hours", l: t("field.hours"), t: "combo", src: "hours", ph: t("field.hours.phSpklu") },
          { k: "price", l: t("field.spklu.price"), t: "text", full: true, ph: t("field.spklu.price.ph") },
        ],
      },
      {
        l: t("dir.sec.lainnya"), d: t("dir.sec.lainnya.d"), f: [
          { k: "website", l: t("field.website"), t: "url", full: true, ph: "https://" },
          { k: "note", l: t("field.note"), t: "textarea", full: true, rows: 2, ph: t("field.note.ph") },
          { k: "featured", l: t("field.featured"), t: "switch", full: true, hint: t("field.featured.hint") },
        ],
      },
    ];
  }

  if (col === "bengkel") {
    return [
      {
        l: t("dir.bengkel.sec.identitas"), d: t("dir.bengkel.sec.identitas.d"), f: [
          { k: "name", l: t("field.bengkel.name"), t: "text", req: true, full: true, ph: t("field.bengkel.name.ph") },
          { k: "type", l: t("field.bengkel.type"), t: "combo", src: "bengkelType", ph: t("field.bengkel.type.ph") },
          { k: "brand", l: t("field.bengkel.brand"), t: "combo", src: "bengkelBrand", ph: t("field.bengkel.brand.ph") },
        ],
      },
      {
        l: t("dir.bengkel.sec.kontak"), d: t("dir.bengkel.sec.kontak.d"), f: [
          { k: "area", l: t("field.area"), t: "combo", src: "area", ph: t("field.area.ph"), hint: t("field.area.hint") },
          { k: "phone", l: t("field.phone"), t: "tel", ph: t("field.phone.ph") },
          { k: "hours", l: t("field.hours"), t: "combo", src: "hours", full: true, ph: t("field.hours.phBengkel") },
          { k: "address", l: t("field.address"), t: "textarea", full: true, rows: 2 },
          { k: "mapUrl", l: t("field.mapUrl"), t: "url", full: true, ph: urlPh, hint: t("field.mapUrl.hint") },
        ],
      },
      {
        l: t("dir.bengkel.sec.layanan"), d: t("dir.bengkel.sec.layanan.d"), f: [
          { k: "services", l: t("field.bengkel.services"), t: "textarea", full: true, rows: 3, ph: t("field.bengkel.services.ph") },
        ],
      },
      {
        l: t("dir.sec.lainnya"), d: t("dir.sec.lainnya.d"), f: [
          { k: "website", l: t("field.website"), t: "url", full: true, ph: "https://" },
          { k: "note", l: t("field.note"), t: "textarea", full: true, rows: 2, ph: t("field.note.ph") },
          { k: "featured", l: t("field.featured"), t: "switch", full: true, hint: t("field.featured.hint") },
        ],
      },
    ];
  }

  return [
    {
      l: t("dir.berita.sec.artikel"), d: t("dir.berita.sec.artikel.d"), f: [
        { k: "title", l: t("field.berita.title"), t: "text", req: true, full: true, ph: t("field.berita.title.ph") },
        { k: "source", l: t("field.berita.source"), t: "combo", src: "beritaSource", ph: t("field.berita.source.ph") },
        { k: "date", l: t("field.berita.date"), t: "date" },
        { k: "url", l: t("field.berita.url"), t: "url", full: true, ph: "https://", hint: t("field.berita.url.hint") },
      ],
    },
    {
      l: t("dir.berita.sec.tampilan"), d: t("dir.berita.sec.tampilan.d"), f: [
        { k: "image", l: t("field.berita.image"), t: "image", full: true, hint: t("field.berita.image.hint") },
        { k: "excerpt", l: t("field.berita.excerpt"), t: "textarea", full: true, rows: 3, ph: t("field.berita.excerpt.ph") },
      ],
    },
    {
      l: t("dir.berita.sec.penayangan"), d: t("dir.berita.sec.penayangan.d"), f: [
        { k: "featured", l: t("field.featured"), t: "switch", full: true, hint: t("field.featured.hint") },
      ],
    },
  ];
}

/* Daftar rata semua field direktori — dipakai saat membaca dan menyimpan. */
function dirFields(col) {
  return dirGroups(col).flatMap((g) => g.f);
}

/* Filter dropdown per koleksi. `options` menghasilkan daftar dari data aktual. */
const uniqVals = (items, key) =>
  [...new Set(items.map((i) => String(i[key] || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, intlLocale(locale))
  );

const vehicleStatusFilter = () => ({
  id: "status",
  label: t("filter.allStatus"),
  options: () => [
    ["published", t("filter.published")],
    ["draft", t("filter.draft")],
    ["featured", t("filter.featured")],
    ["stale", t("filter.stale")],
    ["noimage", t("filter.noImage")],
    ["noprice", t("filter.noPrice")],
  ],
  match: (it, v) =>
    v === "featured" ? !!it.featured
      : v === "stale" ? !!it.stale
        : v === "noimage" ? !it.image
          : v === "noprice" ? it.price == null && !it.priceText
            : it.status === v,
});

const featuredFilter = () => ({
  id: "featured",
  label: t("filter.allItems"),
  options: () => [["1", t("filter.onlyFeatured")], ["0", t("filter.notFeatured")]],
  match: (i, v) => (v === "1" ? !!i.featured : !i.featured),
});

function filtersFor(col) {
  const byBrand = { id: "brand", label: t("filter.allBrands"), options: (it) => uniqVals(it, "brand"), match: (i, v) => i.brand === v };
  const byArea = { id: "area", label: t("filter.allAreas"), options: (it) => uniqVals(it, "area"), match: (i, v) => i.area === v };

  if (col === "cars") {
    return [byBrand, { id: "bodyType", label: t("filter.allBodyTypes"), options: (it) => uniqVals(it, "bodyType"), match: (i, v) => i.bodyType === v }, vehicleStatusFilter()];
  }
  if (col === "motors") {
    return [byBrand, { id: "bodyType", label: t("filter.allTypes"), options: (it) => uniqVals(it, "bodyType"), match: (i, v) => i.bodyType === v }, vehicleStatusFilter()];
  }
  if (col === "spklu") {
    return [byArea, { id: "operator", label: t("filter.allOperators"), options: (it) => uniqVals(it, "operator"), match: (i, v) => i.operator === v }, featuredFilter()];
  }
  if (col === "bengkel") {
    return [byArea, { id: "type", label: t("filter.allKinds"), options: (it) => uniqVals(it, "type"), match: (i, v) => i.type === v }, byBrand];
  }
  if (col === "berita") {
    return [{ id: "source", label: t("filter.allSources"), options: (it) => uniqVals(it, "source"), match: (i, v) => i.source === v }, featuredFilter()];
  }
  return [];
}

const cmpText = (a, b) => String(a || "").localeCompare(String(b || ""), intlLocale(locale), { sensitivity: "base" });
const cmpNum = (a, b, dir) => {
  const av = a == null ? null : Number(a);
  const bv = b == null ? null : Number(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nilai kosong selalu di bawah, apa pun arah urutannya
  if (bv == null) return -1;
  return dir * (av - bv);
};

function sortsFor(col) {
  const common = [["manual", t("sort.manual")], ["az", t("sort.az")], ["za", t("sort.za")]];
  if (col === "cars" || col === "motors") {
    return [...common, ["price-asc", t("sort.priceAsc")], ["price-desc", t("sort.priceDesc")], ["range-desc", t("sort.rangeDesc")], ["updated", t("sort.updated")]];
  }
  if (col === "berita") return [...common, ["date-desc", t("sort.dateDesc")], ["date-asc", t("sort.dateAsc")]];
  return common;
}

const shortcuts = () => [
  ["Ctrl / ⌘ + K", t("shortcut.search")],
  ["Ctrl / ⌘ + S", t("shortcut.save")],
  ["Ctrl / ⌘ + Z", t("shortcut.undo")],
  ["Ctrl / ⌘ + Shift + Z", t("shortcut.redo")],
  ["N", t("shortcut.add")],
  ["Esc", t("shortcut.close")],
];

/* ------------------------------------------------------------------ *
 * 2. Status aplikasi
 * ------------------------------------------------------------------ */

let content = null;
let dirty = false;
let savingNow = false;
let savePending = false;
let saveTimer = null;

let history = [];
let historyIndex = -1;
let historyStamp = 0;
let historyKey = "";

const ui = {};
for (const col of COLLECTIONS) {
  ui[col] = { q: "", filters: {}, sort: "manual", mode: "list", page: 1, sel: new Set() };
}

let activeView = "dashboard";
let vehicleCtx = null; // { col, id, draft:{ image, gallery[] } }
let dirCtx = null;     // { col, id, draft:{ [key]: url } }
let mediaUploads = [];
let editorTouched = false;
const modalStack = [];

/* ------------------------------------------------------------------ *
 * 3. Helper umum
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function numOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitList(v) {
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function splitLines(v) {
  return String(v || "").split("\n").map((s) => s.trim()).filter(Boolean);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueId(col, base) {
  const root = base || col.replace(/s$/, "") || "item";
  const taken = new Set((content[col] || []).map((x) => x.id));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

/**
 * Singkatan "jt"/"M"/"T" hanya dimengerti pembaca Indonesia. Untuk bahasa lain
 * dipakai notasi ringkas bawaan Intl, yang menangani sistem angka masing-masing
 * dengan benar (mis. 4,15亿 di Mandarin, bukan "415 jt").
 */
function formatRupiah(n) {
  if (n == null) return "";
  if (locale === "id") {
    if (n >= 1e12) return "Rp " + (n / 1e12).toFixed(2).replace(".", ",") + " T";
    if (n >= 1e9) return "Rp " + (n / 1e9).toFixed(2).replace(/\.?0+$/, "").replace(".", ",") + " M";
    if (n >= 1e6) return "Rp " + Math.round(n / 1e6) + " jt";
    return "Rp " + new Intl.NumberFormat("id-ID").format(n);
  }
  return "Rp " + new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/* Menerjemahkan teks harga bebas ("Rp 415 jt", "415 juta") jadi angka rupiah. */
/**
 * Rupiah untuk angka KECIL — biaya riset AI, yang berkisar ratusan sampai
 * belasan ribu.
 *
 * `formatRupiah()` di atas dirancang untuk harga kendaraan dan meringkasnya
 * jadi "Rp 415 jt". Aturan yang sama pada angka biaya menghasilkan "Rp 1,23K",
 * yang bukan cara siapa pun menulis seribu dua ratus rupiah.
 */
function formatRupiahKecil(n) {
  if (n == null) return "";
  return "Rp " + new Intl.NumberFormat(intlLocale(locale)).format(Math.round(n));
}

function parseRupiah(text) {
  const s = String(text || "").toLowerCase().replace(/\./g, "").replace(/,/g, ".");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/\b(m|milyar|miliar)\b/.test(s)) n *= 1e9;
  else if (/\b(jt|juta)\b/.test(s)) n *= 1e6;
  else if (/\brb\b|ribu/.test(s)) n *= 1e3;
  return Math.round(n);
}

const formatDate = (iso) => i18nDate(locale, iso);
const formatDateTime = (iso) => i18nDateTime(locale, iso);
const formatAgo = (iso) => formatRelative(locale, iso);

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  const num = (v, digits) => v.toLocaleString(intlLocale(locale), { maximumFractionDigits: digits });
  if (n >= 1048576) return num(n / 1048576, 1) + " MB";
  if (n >= 1024) return num(Math.round(n / 1024), 0) + " KB";
  return num(n, 0) + " B";
}

function initials(text) {
  return String(text || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
}

function isVehicle(col) {
  return VEHICLE_COLS.includes(col);
}

function titleOf(col, item) {
  if (!item) return "";
  if (col === "berita") return item.title || t("common.noTitle");
  if (isVehicle(col)) return `${item.brand || ""} ${item.name || ""}`.trim() || t("common.noName");
  return item.name || t("common.noName");
}

function metaOf(col, item) {
  if (isVehicle(col)) {
    const parts = [item.bodyType];
    if (item.variantNames && item.variantNames.length) parts.push(t("meta.variants", { n: item.variantNames.length }));
    parts.push(item.priceText || formatRupiah(item.price) || t("meta.noPrice"));
    if (item.rangeKm) parts.push(t("meta.range", { n: item.rangeKm }));
    return parts.filter(Boolean).join(" · ");
  }
  if (col === "spklu") return [item.operator, item.area, item.power, item.count ? t("meta.units", { n: item.count }) : ""].filter(Boolean).join(" · ") || t("meta.noDetail");
  if (col === "bengkel") return [item.type, item.brand, item.area].filter(Boolean).join(" · ") || t("meta.noDetail");
  if (col === "berita") return [item.source, formatDate(item.date)].filter(Boolean).join(" · ") || t("meta.noDetail");
  return "";
}

function imageOf(col, item) {
  return item && item.image ? item.image : "";
}

function findItem(col, id) {
  return (content[col] || []).find((x) => x.id === id) || null;
}

/**
 * Menerjemahkan galat dari API. Server mengirim `errorKey` (kunci terjemahan)
 * karena ia tidak selalu tahu bahasa yang sedang dipakai panel; `error` yang
 * berbahasa Indonesia hanya cadangan untuk respons lama.
 */
function apiMessage(data, fallbackKey) {
  if (data && data.errorKey) return t(data.errorKey, data.errorVars || {});
  if (data && data.error) return data.error;
  return t(fallbackKey);
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ------------------------------------------------------------------ *
 * 4. Toast
 * ------------------------------------------------------------------ */

function toast(message, kind, action) {
  const stack = $("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast toast-" + (kind || "info");
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action && action.label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      remove();
      try { action.onClick(); } catch (e) { /* aksi toast tidak boleh mematikan UI */ }
    });
    el.appendChild(btn);
  }
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  let done = false;
  function remove() {
    if (done) return;
    done = true;
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }
  setTimeout(remove, action ? 7000 : 3200);
}

/* ------------------------------------------------------------------ *
 * 5. Modal & konfirmasi
 * ------------------------------------------------------------------ */

/**
 * Mengunci guliran halaman selama modal terbuka.
 *
 * Tanpa ini, memutar roda tetikus di atas modal ikut menggulir daftar di
 * belakangnya — isi yang tidak sedang dikerjakan bergerak sendiri, dan posisi
 * daftar hilang begitu modal ditutup. `--modal-scrollgap` mengganti lebar
 * batang gulir yang menghilang, supaya halaman tidak melompat beberapa piksel
 * di peramban yang batang gulirnya memakan tempat (Windows, Linux).
 */
function lockPageScroll(on) {
  // Dipasang di <html>, bukan <body> — persis alasan yang sama seperti di situs
  // publik: di <body> ia menjadikan <body> kontainer gulir dan seluruh elemen
  // `position: sticky` (bilah alat daftar, bilah simpan editor) lepas.
  const root = document.documentElement;
  if (on) {
    if (root.classList.contains("modal-open")) return;
    const gap = window.innerWidth - root.clientWidth;
    if (gap > 0) root.style.setProperty("--modal-scrollgap", gap + "px");
    root.classList.add("modal-open");
    return;
  }
  if (modalStack.length) return; // masih ada modal lain di bawahnya
  root.classList.remove("modal-open");
  root.style.removeProperty("--modal-scrollgap");
}

function openModal(el) {
  if (!el) return;
  el.classList.add("open");
  el.removeAttribute("hidden");
  if (!modalStack.includes(el)) modalStack.push(el);
  lockPageScroll(true);
}

function closeModal(el) {
  if (!el) return;
  el.classList.remove("open");
  const i = modalStack.indexOf(el);
  if (i >= 0) modalStack.splice(i, 1);
  if (el.id === "dir-modal") { dirCtx = null; editorTouched = false; }
  // Grid disegarkan saat modal tutup, bukan pada tiap ketikan: menggambar ulang
  // kartu di belakang modal sambil mengetik alt hanya membuang kerja.
  if (el.id === "media-modal") { mediaCtx = null; renderMedia(); }
  lockPageScroll(false);
}

/** Menutup modal editor: kalau formulir sudah disentuh, minta konfirmasi dulu. */
async function requestCloseModal(modal) {
  if (!modal) return;
  const isEditor = modal.id === "dir-modal";
  if (isEditor && editorTouched) {
    const ok = await confirmDialog({
      title: t("confirm.discardTitle"),
      text: t("confirm.discardText"),
      okText: t("confirm.discardOk"),
      tone: "warning",
    });
    if (!ok) return;
  }
  editorTouched = false;
  closeModal(modal);
}

/**
 * Pembungkus tipis di atas `konfirmasi()`.
 *
 * Yang ditambahkan di sini hanya dua hal yang memang milik panel ini: teks
 * bawaan yang sudah diterjemahkan, dan penerjemahan bendera `danger` lama
 * menjadi nada. Dialognya sendiri tinggal di `konfirmasi.js`, yang tidak
 * mengenal kamus sama sekali — halaman Pembaruan memakai dialog yang sama
 * tanpa pernah memuat kamus itu.
 */
function confirmDialog(opts) {
  const o = opts || {};
  return konfirmasi({
    title: o.title || t("common.confirm"),
    text: o.text || "",
    detail: o.detail || "",
    okText: o.okText || t("common.delete"),
    cancelText: o.cancelText || t("common.cancel"),
    tone: o.tone || (o.danger === false ? "question" : "danger"),
  });
}

/* ------------------------------------------------------------------ *
 * 6. Riwayat (undo/redo) & penyimpanan
 * ------------------------------------------------------------------ */

function snapshotNow() {
  return JSON.stringify(content);
}

function resetHistory() {
  history = [snapshotNow()];
  historyIndex = 0;
}

/**
 * `key` menggabungkan perubahan beruntun yang sejenis (mis. mengetik di satu
 * field) jadi satu langkah undo, supaya riwayat tidak habis oleh keystroke.
 */
function pushHistory(key) {
  const snap = snapshotNow();
  const now = Date.now();
  if (history[historyIndex] === snap) return;
  const merge = key && key === historyKey && now - historyStamp < 900 && historyIndex > 0;
  historyKey = key || "";
  historyStamp = now;
  if (merge) {
    history[historyIndex] = snap;
    return;
  }
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  if (history.length > HISTORY_MAX) history.shift();
  historyIndex = history.length - 1;
}

function applyHistory(step) {
  const next = historyIndex + step;
  if (next < 0 || next >= history.length) {
    toast(step < 0 ? t("toast.nothingToUndo") : t("toast.nothingToRedo"), "info");
    return;
  }
  historyIndex = next;
  historyKey = "";
  content = JSON.parse(history[historyIndex]);
  markDirty();
  renderAll();
  scheduleSave();
  toast(step < 0 ? t("toast.undone") : t("toast.redone"), "info");
}

function setSaveState(state) {
  const el = $("save-state");
  if (!el) return;
  const key = state === "saving" ? "save.saving" : state === "dirty" ? "save.dirty" : "save.saved";
  el.className = "save-state " + state;
  // Kunci ikut diperbarui, bukan cuma teksnya: applyStaticI18n() menggambar
  // ulang elemen ber-`data-i18n` saat bahasa berganti, dan tanpa ini status
  // simpan akan melompat kembali ke "Siap" setiap kali itu terjadi.
  el.setAttribute("data-i18n", key);
  el.textContent = t(key);
}

function markDirty() {
  dirty = true;
  setSaveState("dirty");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
}

/** Satu titik masuk untuk semua perubahan konten: riwayat → tandai kotor → render → autosave. */
function commit(options) {
  const o = options || {};
  pushHistory(o.key);
  markDirty();
  if (o.render !== false) renderAll();
  else renderNavCounts();
  scheduleSave();
}

async function saveNow() {
  clearTimeout(saveTimer);
  if (!content) return;
  if (savingNow) { savePending = true; return; }
  savingNow = true;
  setSaveState("saving");
  try {
    const res = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (res.status === 401) { location.href = "/admin/login"; return; }

    const data = await res.json();

    // Orang lain menyimpan lebih dulu. Menimpanya diam-diam berarti menghapus
    // pekerjaan mereka tanpa ada yang tahu — jadi keputusannya diserahkan.
    if (res.status === 409 && data && data.conflict) {
      savingNow = false;
      savePending = false;
      await resolveConflict(data.content);
      return;
    }

    if (!data || !data.ok) throw new Error(apiMessage(data, "toast.serverRejected"));
    content = data.content;
    dirty = false;
    setSaveState("saved");
    renderAll();
  } catch (err) {
    setSaveState("dirty");
    toast(t("toast.saveFailed", { error: err && err.message ? err.message : t("toast.networkError") }), "error");
  } finally {
    savingNow = false;
    if (savePending) { savePending = false; saveNow(); }
  }
}

/**
 * Menawarkan pilihan saat dokumen sudah berganti di server.
 *
 * Dua-duanya kehilangan sesuatu, dan itu memang tidak bisa dihindari — yang
 * bisa dihindari adalah kehilangan itu terjadi tanpa seorang pun tahu.
 */
async function resolveConflict(serverContent) {
  const timpa = await confirmDialog({
    title: t("conflict.title"),
    text: t("conflict.text"),
    okText: t("conflict.overwrite"),
    cancelText: t("conflict.reload"),
    cancelKey: "conflict.reload",
    danger: true,
  });

  if (timpa) {
    // Pakai revisi terbaru dari server, lalu kirim ulang dengan izin eksplisit.
    content.revision = serverContent.revision;
    try {
      const res = await fetch("/api/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...content, force: true }),
      });
      const data = await res.json();
      if (!data || !data.ok) throw new Error(apiMessage(data, "toast.serverRejected"));
      content = data.content;
      dirty = false;
      setSaveState("saved");
      renderAll();
      toast(t("conflict.overwritten"), "success");
    } catch (err) {
      setSaveState("dirty");
      toast(err.message, "error");
    }
    return;
  }

  // Membuang perubahan sendiri dan memakai isi terbaru dari server.
  content = serverContent;
  dirty = false;
  resetHistory();
  setSaveState("saved");
  renderAll();
  toast(t("conflict.reloaded"), "info");
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (res.status === 401) { location.href = "/admin/login"; throw new Error(t("toast.sessionExpired")); }
  const data = await res.json();
  if (!data || !data.ok) throw new Error(apiMessage(data, "toast.uploadRejected"));
  return data.url;
}

/* ------------------------------------------------------------------ *
 * 7. Field generik (dipakai modal kendaraan & direktori)
 * ------------------------------------------------------------------ */

function optionsHtml(opts, current) {
  const list = (opts || []).map((o) => (Array.isArray(o) ? o : [o, o || t("common.choose")]));
  const cur = current === null || current === undefined ? "" : String(current);
  if (cur && !list.some(([v]) => String(v) === cur)) list.push([cur, cur]);
  return list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === cur ? " selected" : ""}>${esc(l)}</option>`).join("");
}

function fieldHtml(def, value, prefix) {
  const id = (prefix || "f") + "-" + def.k;
  const cls = "field" + (def.full || def.t === "textarea" ? " full" : "");
  const hint = def.hint ? `<div class="hint">${esc(def.hint)}</div>` : "";
  const ph = def.ph ? ` placeholder="${esc(def.ph)}"` : "";
  const req = def.req ? " *" : "";
  const label = `<label for="${esc(id)}">${esc(def.l)}${req}</label>`;

  if (def.t === "switch") {
    return `<div class="${cls}" data-field="${esc(def.k)}">
      <div class="switch-row">
        <span>${esc(def.l)}</span>
        <label class="switch"><input type="checkbox" id="${esc(id)}" name="${esc(def.k)}"${value ? " checked" : ""} /><span></span></label>
      </div>${hint}
    </div>`;
  }

  if (def.t === "image") {
    return `<div class="${cls}" data-field="${esc(def.k)}">
      ${label}
      <div class="dropzone" data-dzone="${esc(def.k)}">${imagePreviewHtml(value, `data-img-del="${esc(def.k)}"`)}</div>${hint}
    </div>`;
  }

  let control = "";
  if (def.t === "textarea") {
    control = `<textarea id="${esc(id)}" name="${esc(def.k)}" rows="${def.rows || 4}"${ph}>${esc(value)}</textarea>`;
  } else if (def.t === "select") {
    control = `<select id="${esc(id)}" name="${esc(def.k)}">${optionsHtml(def.opts, value)}</select>`;
  } else if (def.t === "number") {
    control = `<input type="number" step="${esc(def.step || "any")}" id="${esc(id)}" name="${esc(def.k)}" value="${esc(value === null || value === undefined ? "" : value)}"${ph} />`;
  } else if (def.t === "combo") {
    control = comboHtml(id, def, value);
  } else if (def.t === "tags") {
    const v = Array.isArray(value) ? value.join(", ") : value;
    control = `<input type="text" id="${esc(id)}" name="${esc(def.k)}" value="${esc(v)}"${ph} />`;
  } else {
    const type = def.t === "url" ? "url" : def.t === "date" ? "date" : def.t === "tel" ? "tel" : "text";
    // Papan ketik ponsel langsung berupa tombol angka untuk nomor telepon.
    const mode = def.t === "tel" ? ' inputmode="tel"' : "";
    control = `<input type="${type}" id="${esc(id)}" name="${esc(def.k)}" value="${esc(value)}"${ph}${mode} />`;
  }
  return `<div class="${cls}" data-field="${esc(def.k)}">${label}${control}${hint}</div>`;
}

function readField(form, def) {
  const el = form.elements[def.k];
  if (!el) return def.t === "tags" ? [] : def.t === "switch" ? false : "";
  if (def.t === "switch") return !!el.checked;
  if (def.t === "number") return numOrNull(el.value);
  if (def.t === "tags") return splitList(el.value);
  return String(el.value || "").trim();
}

/* ------------------------------------------------------------------ *
 * 7b. Combobox: daftar pilihan yang bisa dicari + ketik bebas
 *
 * Dipakai field Merek. Isi daftarnya tidak ikut dicetak ke HTML melainkan
 * diambil dari `comboSources`, yang diisi ulang tiap kali editor dibuka
 * supaya merek yang baru ditambahkan langsung ikut muncul.
 *
 * Panel sengaja TIDAK terbuka saat field menerima fokus. Editor memfokuskan
 * Merek secara otomatis begitu halaman tambah kendaraan dibuka, dan panel
 * yang ikut terbuka sendiri di situ menutupi separuh formulir — persis
 * kelakuan `<datalist>` bawaan browser yang diganti kontrol ini.
 * ------------------------------------------------------------------ */

const comboSources = {};

/* Nama daftar, dipakai di teks kosong dan kaki panel ("3 dari 12 operator").
   Nilainya adalah KUNCI kamus, bukan teksnya. */
const COMBO_LABEL = {
  brand: "combo.label.brand",
  bengkelBrand: "combo.label.brand",
  area: "combo.label.area",
  spkluOperator: "combo.label.operator",
  spkluConnector: "combo.label.connector",
  spkluPower: "combo.label.power",
  hours: "combo.label.hours",
  bengkelType: "combo.label.workshopKind",
  beritaSource: "combo.label.source",
};

function comboLabel(key) {
  return t(COMBO_LABEL[key] || "combo.label.option");
}

function comboHtml(id, def, value) {
  const key = def.src || def.k;
  const ph = def.ph ? ` placeholder="${esc(def.ph)}"` : "";
  return `<div class="combo" data-combo="${esc(key)}" data-combo-filter="0">
    <input type="text" id="${esc(id)}" name="${esc(def.k)}" value="${esc(value)}"${ph}
      role="combobox" aria-expanded="false" aria-controls="${esc(id)}-pop" aria-autocomplete="list"
      autocomplete="off" spellcheck="false" data-combo-input />
    <button type="button" class="combo-caret" tabindex="-1" aria-hidden="true" data-combo-caret>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <div class="combo-pop" id="${esc(id)}-pop" role="listbox" data-combo-pop hidden></div>
  </div>`;
}

function comboItems(box) {
  const src = comboSources[box.getAttribute("data-combo")];
  return Array.isArray(src) ? src : [];
}

/* Yang diawali kata pencarian didahulukan, baru yang cocok di tengah teks. */
function comboMatches(box, q) {
  const s = String(q || "").trim().toLowerCase();
  const all = comboItems(box);
  if (!s) return all.slice();
  const head = [];
  const rest = [];
  all.forEach((o) => {
    const i = String(o).toLowerCase().indexOf(s);
    if (i === 0) head.push(o);
    else if (i > 0) rest.push(o);
  });
  return head.concat(rest);
}

/* Tandai potongan teks yang cocok supaya terlihat kenapa sebuah baris muncul. */
function comboMark(text, q) {
  const s = String(q || "").trim();
  if (!s) return esc(text);
  const i = String(text).toLowerCase().indexOf(s.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + s.length)) + "</mark>" + esc(text.slice(i + s.length));
}

function renderCombo(box) {
  const input = box.querySelector("[data-combo-input]");
  const pop = box.querySelector("[data-combo-pop]");
  if (!input || !pop) return;

  const label = comboLabel(box.getAttribute("data-combo"));
  const q = box.getAttribute("data-combo-filter") === "1" ? input.value : "";
  const cur = input.value.trim().toLowerCase();
  const list = comboMatches(box, q);
  const total = comboItems(box).length;

  if (!list.length) {
    pop.innerHTML = `<div class="combo-empty">
      <strong>${esc(t("combo.emptyTitle", { label }))}</strong>
      <span>${esc(t("combo.emptyHint", { q: input.value.trim() }))}</span>
    </div>`;
    input.removeAttribute("aria-activedescendant");
    return;
  }

  const popId = pop.id;
  pop.innerHTML = `<div class="combo-list" role="presentation">${list.map((o, i) => {
    const on = String(o).toLowerCase() === cur;
    return `<button type="button" class="combo-opt${on ? " is-on" : ""}" role="option" tabindex="-1"
      id="${esc(popId)}-o${i}" aria-selected="${on ? "true" : "false"}" data-combo-val="${esc(o)}">
      <span class="combo-opt-text">${comboMark(o, q)}</span>
      ${on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>' : ""}
    </button>`;
  }).join("")}</div>
  <div class="combo-foot">
    <span>${esc(t("combo.footCount", { n: list.length, total, label }))}</span>
    <span>${esc(t("combo.footHint", { label }))}</span>
  </div>`;

  setComboActive(box, pop.querySelector(".combo-opt.is-on") || pop.querySelector(".combo-opt"), true);
  placeCombo(box);
}

/**
 * Menentukan panel dibuka ke bawah atau ke atas.
 *
 * Yang memotong panel bukan selalu tepi jendela: di dalam modal, badan
 * formulir punya `overflow: auto` sendiri, jadi panel yang menjulur ke
 * bawahnya terpotong walau layarnya masih panjang. Batas yang dipakai di sini
 * adalah kotak penggulir terdekat kalau ada.
 */
function placeCombo(box) {
  const pop = box.querySelector("[data-combo-pop]");
  if (!pop) return;

  box.classList.remove("is-up");
  const scroller = box.closest(".modal-body");
  const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const r = box.getBoundingClientRect();
  const need = pop.offsetHeight + 12;

  // Hanya dibalik kalau ruang di atas benar-benar lebih lapang; membalik ke
  // tempat yang sama sempitnya cuma memindahkan masalahnya.
  if (r.bottom + need > bounds.bottom && r.top - need > bounds.top) box.classList.add("is-up");
}

function setComboActive(box, opt, instant) {
  const pop = box.querySelector("[data-combo-pop]");
  const input = box.querySelector("[data-combo-input]");
  if (!pop || !opt) return;
  pop.querySelectorAll(".combo-opt.is-active").forEach((el) => el.classList.remove("is-active"));
  opt.classList.add("is-active");
  opt.scrollIntoView({ block: "nearest", behavior: instant ? "auto" : "smooth" });
  if (input) input.setAttribute("aria-activedescendant", opt.id);
}

function moveCombo(box, delta) {
  const opts = [...box.querySelectorAll(".combo-opt")];
  if (!opts.length) return;
  const at = opts.findIndex((o) => o.classList.contains("is-active"));
  const next = at < 0 ? (delta > 0 ? 0 : opts.length - 1) : (at + delta + opts.length) % opts.length;
  setComboActive(box, opts[next]);
}

function openCombo(box, opts) {
  const input = box.querySelector("[data-combo-input]");
  if (!input) return;
  closeCombos(box);
  box.setAttribute("data-combo-filter", opts && opts.filter ? "1" : "0");
  box.classList.add("is-open");
  input.setAttribute("aria-expanded", "true");
  const pop = box.querySelector("[data-combo-pop]");
  if (pop) pop.hidden = false;
  renderCombo(box);
}

function closeCombo(box) {
  if (!box.classList.contains("is-open")) return;
  box.classList.remove("is-open");
  const input = box.querySelector("[data-combo-input]");
  const pop = box.querySelector("[data-combo-pop]");
  if (input) {
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  if (pop) { pop.hidden = true; pop.innerHTML = ""; }
}

function closeCombos(except) {
  $$(".combo.is-open").forEach((box) => { if (box !== except) closeCombo(box); });
}

function chooseCombo(box, value) {
  const input = box.querySelector("[data-combo-input]");
  if (!input) return;
  input.value = value;
  closeCombo(box);
  input.focus();
  /* Event buatan sendiri: penanganannya di bawah mengabaikan yang tidak
     berasal dari ketikan, jadi panel tidak terbuka lagi setelah memilih. */
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/* Dipanggil paling awal dari penanganan papan ketik global. `true` berarti
   tombolnya sudah dipakai combobox dan tidak boleh diteruskan. */
function comboKeydown(e) {
  const input = e.target.closest && e.target.closest("[data-combo-input]");
  if (!input) return false;
  const box = input.closest(".combo");
  if (!box) return false;
  const open = box.classList.contains("is-open");

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!open) openCombo(box, { filter: false });
    else moveCombo(box, e.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if (e.key === "Enter") {
    if (!open) return false; // biarkan Enter menyimpan formulir seperti biasa
    e.preventDefault();
    const act = box.querySelector(".combo-opt.is-active");
    if (act) chooseCombo(box, act.getAttribute("data-combo-val"));
    else closeCombo(box);
    return true;
  }
  if (e.key === "Escape") {
    if (!open) return false; // Escape berikutnya baru meninggalkan editor
    e.preventDefault();
    e.stopPropagation();
    closeCombo(box);
    return true;
  }
  if (e.key === "Tab" && open) closeCombo(box);
  return false;
}

/* Dipanggil paling awal dari penanganan klik global. Klik di luar combobox
   mana pun menutup panel yang sedang terbuka. */
function comboClick(e) {
  const opt = e.target.closest("[data-combo-val]");
  if (opt) {
    const box = opt.closest(".combo");
    if (box) { chooseCombo(box, opt.getAttribute("data-combo-val")); return true; }
  }

  const box = e.target.closest(".combo");
  if (!box) { closeCombos(null); return false; }

  if (e.target.closest("[data-combo-caret]")) {
    if (box.classList.contains("is-open")) closeCombo(box);
    else openCombo(box, { filter: false });
    const input = box.querySelector("[data-combo-input]");
    if (input) input.focus();
    return true;
  }
  if (e.target.closest("[data-combo-input]") && !box.classList.contains("is-open")) {
    openCombo(box, { filter: false });
    return true;
  }
  return false;
}

function imagePreviewHtml(url, extraAttr) {
  if (!url) {
    return `<div class="empty-state-text">${esc(t("upload.dropHere"))}</div>`;
  }
  return `<div class="media-item"><img src="${esc(url)}" alt="" loading="lazy" />
    <button type="button" class="media-remove" ${extraAttr || ""} title="${esc(t("common.removeImage"))}">&times;</button></div>`;
}

/* Repeater: barisnya dibaca langsung dari DOM saat simpan, jadi tidak perlu state ganda. */
function repeaterHtml(name, rows, kind) {
  const body = (rows || []).map((r, i) => repeaterRowHtml(name, r, kind, i)).join("");
  const addLabel = kind === "kv" ? t("editor.addSpecRow") : kind === "color" ? t("editor.addColor") : t("editor.addVariant");
  return `<div class="repeater" data-rep="${esc(name)}" data-kind="${esc(kind)}">
    <div data-rep-body>${body}</div>
    <button type="button" class="btn btn-outline btn-sm repeater-add" data-rep-add="${esc(name)}">+ ${esc(addLabel)}</button>
  </div>`;
}

function repeaterRowHtml(name, row, kind, index) {
  const move = `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-move="-1" title="${esc(t("common.moveUp"))}">&uarr;</button>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-move="1" title="${esc(t("common.moveDown"))}">&darr;</button>`;
  const del = `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-del title="${esc(t("common.removeRow"))}">&times;</button>`;

  if (kind === "kv") {
    const r = row || { label: "", value: "" };
    return `<div class="repeater-row">
      <input type="text" data-rk="label" value="${esc(r.label)}" placeholder="${esc(t("editor.specLabelPh"))}" />
      <input type="text" data-rk="value" value="${esc(r.value)}" placeholder="${esc(t("editor.specValuePh"))}" />
      ${move}${del}
    </div>`;
  }
  if (kind === "color") {
    const hex = /^#[0-9a-fA-F]{3,8}$/.test(String(row || "")) ? String(row) : "#ffffff";
    return `<div class="repeater-row">
      <div class="color-field">
        <input type="color" data-rk="color" value="${esc(hex)}" />
        <input type="text" data-rk="value" value="${esc(row || hex)}" placeholder="#ffffff" />
      </div>
      ${move}${del}
    </div>`;
  }
  return `<div class="repeater-row">
    <input type="text" data-rk="value" value="${esc(row || "")}" placeholder="${esc(t("editor.variantPh", { n: index + 1 }))}" />
    ${move}${del}
  </div>`;
}

/** Menggeser satu baris naik (dir < 0) atau turun (dir > 0) di antara saudaranya. */
function moveSibling(row, dir) {
  if (!row) return;
  if (dir < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
  if (dir > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
}

function readRepeater(root, name) {
  const rep = root.querySelector(`[data-rep="${CSS.escape(name)}"]`);
  if (!rep) return [];
  const kind = rep.getAttribute("data-kind");
  const rows = Array.from(rep.querySelectorAll(".repeater-row"));
  if (kind === "kv") {
    return rows
      .map((r) => ({
        label: (r.querySelector('[data-rk="label"]') || {}).value || "",
        value: (r.querySelector('[data-rk="value"]') || {}).value || "",
      }))
      .map((r) => ({ label: r.label.trim(), value: r.value.trim() }))
      .filter((r) => r.label || r.value);
  }
  return rows
    .map((r) => String(((r.querySelector('[data-rk="value"]') || {}).value) || "").trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * 8. Navigasi & shell
 * ------------------------------------------------------------------ */

function setView(view, opts) {
  if (!VIEWS.includes(view)) view = "dashboard";
  closeCombos(null);
  if (view !== "editor") { vehicleCtx = null; editorTouched = false; }
  activeView = view;
  syncQuickAdd();
  $$(".view").forEach((s) => {
    const match = s.getAttribute("data-view") === view;
    if (match) s.removeAttribute("hidden");
    else s.setAttribute("hidden", "");
  });
  const navView = (opts && opts.nav) || view;
  $$(".nav-item[data-view]").forEach((n) => n.classList.toggle("active", n.getAttribute("data-view") === navView));
  if (!opts || opts.hash !== false) {
    const target = "#/" + view;
    if (location.hash !== target) setHash(target);
  }
  const app = $("admin-app");
  if (app) app.classList.remove("sidebar-open");
  if (view === "backups") loadBackups();
  if (view === "profile") renderProfile();
  if (view === "users") loadUsers();
  if (view === "ai") loadAi();
  if (view === "activity") loadActivityPage();
  if (view !== "editor") window.scrollTo({ top: 0, behavior: "instant" });
}

/* ------------------------------------------------------------------ *
 * 8b. Rute berbasis hash
 *
 * Bentuk yang dikenali: `#/cars`, `#/cars/new`, `#/cars/edit/<id>`.
 * Editor kendaraan memakai alamat sendiri supaya tombol Kembali browser,
 * muat ulang halaman, dan berbagi tautan semuanya bekerja seperti halaman biasa.
 * ------------------------------------------------------------------ */

let lastHash = "";
let hashGuard = false;

function setHash(value) {
  hashGuard = true;
  lastHash = value;
  location.hash = value;
}

function parseRoute(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const head = parts[0] || "dashboard";
  if (VEHICLE_COLS.includes(head)) {
    if (parts[1] === "new") return { kind: "editor", col: head, id: null };
    if (parts[1] === "edit" && parts[2]) return { kind: "editor", col: head, id: parts[2] };
  }
  return { kind: "view", view: VIEWS.includes(head) && head !== "editor" ? head : "dashboard" };
}

function routeHash(col, id) {
  return id ? `#/${col}/edit/${encodeURIComponent(id)}` : `#/${col}/new`;
}

function applyRoute(hash) {
  const route = parseRoute(hash);
  if (route.kind === "editor") { openVehicle(route.col, route.id); return; }
  if (activeView !== route.view) setView(route.view, { hash: false });
}

/* Tombol tambah melayang (hanya tampil di layar sempit) selalu menunjuk ke
   koleksi yang sedang dibuka, jadi menambah item tidak perlu menggulir ke atas. */
function syncQuickAdd() {
  const fab = $("quick-add");
  if (!fab) return;
  if (COLLECTIONS.includes(activeView)) {
    fab.hidden = false;
    fab.setAttribute("data-add", activeView);
    fab.setAttribute("aria-label", t("common.addOne", { one: colOne(activeView) }));
    const label = fab.querySelector(".fab-label");
    if (label) label.textContent = t("common.addOne", { one: colOne(activeView) });
  } else {
    fab.hidden = true;
    fab.removeAttribute("data-add");
  }
}

function renderNavCounts() {
  $$(".nav-item[data-view]").forEach((n) => {
    const view = n.getAttribute("data-view");
    const badge = n.querySelector(".nav-item-count");
    if (!badge) return;
    if (content && COLLECTIONS.includes(view)) badge.textContent = String((content[view] || []).length);
    else badge.textContent = "";
  });
}

function applySidebarPref() {
  const app = $("admin-app");
  if (!app) return;
  if (localStorage.getItem("evkita.sidebar") === "collapsed") app.classList.add("sidebar-collapsed");
}

function toggleSidebar() {
  const app = $("admin-app");
  if (!app) return;
  if (window.matchMedia("(max-width: 900px)").matches) {
    app.classList.toggle("sidebar-open");
    return;
  }
  const collapsed = app.classList.toggle("sidebar-collapsed");
  localStorage.setItem("evkita.sidebar", collapsed ? "collapsed" : "expanded");
}

/* ------------------------------------------------------------------ *
 * 9. Dashboard
 * ------------------------------------------------------------------ */

function allVehicles() {
  return [...(content.cars || []), ...(content.motors || [])];
}

function renderDashboard() {
  renderDashHello();
  renderDashStats();
  renderDashCharts();
  renderDashRecent();
  renderDashHealth();
  renderDashActivity();
}

function renderDashStats() {
  const el = $("dash-stats");
  if (!el) return;
  const veh = allVehicles();
  const prices = veh.map((v) => v.price).filter((p) => p != null);
  const ranges = veh.map((v) => v.rangeKm).filter((r) => r != null);
  const brands = new Set(veh.map((v) => (v.brand || "").trim()).filter(Boolean));
  const variants = veh.reduce((n, v) => n + (v.variantNames ? v.variantNames.length : 0), 0);
  const drafts = veh.filter((v) => v.status === "draft").length;
  const featured = veh.filter((v) => v.featured).length;
  const noImage = veh.filter((v) => !v.image).length;
  const avgRange = ranges.length ? Math.round(ranges.reduce((a, b) => a + b, 0) / ranges.length) : null;

  const cards = [
    [t("dash.stat.cars"), (content.cars || []).length, "cars"],
    [t("dash.stat.motors"), (content.motors || []).length, "motors"],
    [t("dash.stat.spklu"), (content.spklu || []).length, "spklu"],
    [t("dash.stat.bengkel"), (content.bengkel || []).length, "bengkel"],
    [t("dash.stat.berita"), (content.berita || []).length, "berita"],
    [t("dash.stat.brands"), brands.size, ""],
    [t("dash.stat.variants"), variants, ""],
    [t("dash.stat.drafts"), drafts, ""],
    [t("dash.stat.featured"), featured, ""],
    [t("dash.stat.noImage"), noImage, ""],
    [t("dash.stat.minPrice"), prices.length ? formatRupiah(Math.min(...prices)) : "—", ""],
    [t("dash.stat.maxPrice"), prices.length ? formatRupiah(Math.max(...prices)) : "—", ""],
    [t("dash.stat.avgRange"), avgRange != null ? t("meta.range", { n: avgRange }) : "—", ""],
  ];

  el.innerHTML = `<div class="stat-grid">${cards
    .map(([label, value, view]) => `<div class="stat-card"${view ? ` data-goto="${esc(view)}"` : ""}>
      <div class="stat-num">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`)
    .join("")}</div>`;
}

function barChartHtml(rows) {
  const max = rows.reduce((m, r) => Math.max(m, r[1]), 0) || 1;
  return `<div class="bar-chart">${rows
    .map(([label, value]) => `<div class="bar-row">
      <div class="bar-label">${esc(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div>
      <div class="bar-value">${esc(value)}</div>
    </div>`)
    .join("")}</div>`;
}

function countBy(items, key) {
  const map = new Map();
  for (const it of items) {
    const k = String(it[key] || "").trim() || t("common.emptyValue");
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderDashCharts() {
  const el = $("dash-charts");
  if (!el) return;
  const veh = allVehicles();
  const byBrand = countBy(veh, "brand").slice(0, 10);
  const byBody = countBy(content.cars || [], "bodyType").slice(0, 10);

  const empty = !veh.length;
  el.innerHTML = `
    <div class="sub-head"><h4 class="panel-title">${esc(t("dash.charts.byBrand"))}</h4></div>
    ${empty ? emptyStateHtml(t("dash.charts.emptyTitle"), t("dash.charts.emptyText")) : barChartHtml(byBrand)}
    <div class="sub-head"><h4 class="panel-title">${esc(t("dash.charts.byBody"))}</h4></div>
    ${byBody.length ? barChartHtml(byBody) : emptyStateHtml(t("dash.charts.bodyEmptyTitle"), t("dash.charts.bodyEmptyText"))}
    <div class="sub-head"><h4 class="panel-title">${esc(t("dash.charts.shortcuts"))}</h4></div>
    <div class="stack">${shortcuts().map(([k, d]) => `<div class="row-meta"><span class="kbd">${esc(k)}</span> ${esc(d)}</div>`).join("")}</div>`;
}

function renderDashRecent() {
  const el = $("dash-recent");
  if (!el) return;
  const items = [];
  for (const col of VEHICLE_COLS) for (const it of content[col] || []) items.push({ col, it });
  items.sort((a, b) => String(b.it.updatedAt || "").localeCompare(String(a.it.updatedAt || "")));
  const recent = items.filter((x) => x.it.updatedAt).slice(0, 8);

  if (!recent.length) {
    el.innerHTML = emptyStateHtml(t("dash.recent.emptyTitle"), t("dash.recent.emptyText"));
    return;
  }
  el.innerHTML = `<div class="item-list">${recent
    .map(({ col, it }) => `<div class="item-row">
      <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
      <div class="row-main">
        <div class="row-title">${esc(titleOf(col, it))}</div>
        <div class="row-meta">${esc(t("dash.recent.changedAt", { col: colLabel(col), when: formatDateTime(it.updatedAt) }))}</div>
      </div>
      <div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(col)}:${esc(it.id)}">${esc(t("common.edit"))}</button></div>
    </div>`)
    .join("")}</div>`;
}

function healthIssues() {
  const issues = [];
  for (const col of VEHICLE_COLS) {
    for (const it of content[col] || []) {
      const why = [];
      if (!it.image) why.push("issue.noImage");
      if (it.price == null && !it.priceText) why.push("issue.noPrice");
      if (it.rangeKm == null) why.push("issue.noRange");
      if (!it.description) why.push("issue.noDescription");
      if (it.status === "draft") why.push("issue.draft");
      if (it.stale) why.push("issue.stale");
      if (why.length) issues.push({ col, id: it.id, title: titleOf(col, it), why });
    }
  }
  for (const col of ["spklu", "bengkel"]) {
    for (const it of content[col] || []) {
      const why = [];
      if (!it.website && !it.mapUrl) why.push("issue.noLink");
      if (!it.address) why.push("issue.noAddress");
      if (why.length) issues.push({ col, id: it.id, title: titleOf(col, it), why });
    }
  }
  for (const it of content.berita || []) {
    const why = [];
    if (!it.url) why.push("issue.noArticleUrl");
    if (!it.image) why.push("issue.noImage");
    if (why.length) issues.push({ col: "berita", id: it.id, title: titleOf("berita", it), why });
  }
  return issues;
}

function renderDashHealth() {
  const el = $("dash-health");
  if (!el) return;
  const issues = healthIssues();
  if (!issues.length) {
    el.innerHTML = emptyStateHtml(t("dash.health.emptyTitle"), t("dash.health.emptyText"), "✅");
    return;
  }
  const shown = issues.slice(0, 40);
  el.innerHTML = `<div class="item-list">${shown
    .map((x) => `<div class="item-row" data-open="${esc(x.col)}:${esc(x.id)}">
      <div class="row-main">
        <div class="row-title">${esc(x.title)}</div>
        <div class="row-meta">${esc(colLabel(x.col))} · ${esc(x.why.map((k) => t(k)).join(", "))}</div>
      </div>
      <div class="row-badges"><span class="badge badge-warn">${esc(x.why.length)}</span></div>
      <div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(x.col)}:${esc(x.id)}">${esc(t("dash.health.fix"))}</button></div>
    </div>`)
    .join("")}</div>${issues.length > shown.length ? `<div class="row-meta">${esc(t("dash.health.more", { n: issues.length - shown.length }))}</div>` : ""}`;
}

function emptyStateHtml(title, text, icon, cta) {
  const action = cta
    ? `<button type="button" class="btn btn-primary empty-state-cta" data-add="${esc(cta.col)}">${esc(cta.label)}</button>`
    : "";
  return `<div class="empty-state">
    <div class="empty-state-icon">${esc(icon || "📄")}</div>
    <div class="empty-state-title">${esc(title)}</div>
    <div class="empty-state-text">${esc(text || "")}</div>
    ${action}
  </div>`;
}

function thumbInnerHtml(url, label) {
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy" />`;
  return `<span>${esc(initials(label))}</span>`;
}

/* ------------------------------------------------------------------ *
 * 10. Daftar koleksi: toolbar + daftar
 * ------------------------------------------------------------------ */

function visibleItems(col) {
  const state = ui[col];
  const items = (content[col] || []).slice();
  const q = state.q.trim().toLowerCase();

  let list = items.filter((it) => {
    for (const f of filtersFor(col)) {
      const v = state.filters[f.id];
      if (v && !f.match(it, v)) return false;
    }
    if (!q) return true;
    const hay = Object.values(it)
      .map((v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? Object.values(x).join(" ") : x)).join(" ") : v))
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const s = state.sort;
  if (s === "az") list.sort((a, b) => cmpText(titleOf(col, a), titleOf(col, b)));
  else if (s === "za") list.sort((a, b) => cmpText(titleOf(col, b), titleOf(col, a)));
  else if (s === "price-asc") list.sort((a, b) => cmpNum(a.price, b.price, 1));
  else if (s === "price-desc") list.sort((a, b) => cmpNum(b.price, a.price, 1));
  else if (s === "range-desc") list.sort((a, b) => cmpNum(b.rangeKm, a.rangeKm, 1));
  else if (s === "updated") list.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  else if (s === "date-desc") list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  else if (s === "date-asc") list.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  return list;
}

function toolbarSignature(col) {
  return JSON.stringify(filtersFor(col).map((f) => f.options(content[col] || [])));
}

function toolbarHtml(col) {
  const state = ui[col];
  const items = content[col] || [];
  const filters = filtersFor(col)
    .map((f) => `<select class="select-mini" data-filter="${esc(f.id)}" data-col="${esc(col)}">
      <option value="">${esc(f.label)}</option>${optionsHtml(f.options(items), state.filters[f.id] || "")}
    </select>`)
    .join("");

  const sorts = `<select class="select-mini" data-sort data-col="${esc(col)}">${optionsHtml(sortsFor(col), state.sort)}</select>`;

  const bulk = isVehicle(col)
    ? `<button type="button" class="btn btn-ghost btn-sm" data-bulk="publish">${esc(t("toolbar.publish"))}</button>
       <button type="button" class="btn btn-ghost btn-sm" data-bulk="draft">${esc(t("toolbar.makeDraft"))}</button>`
    : "";

  return `<div class="toolbar">
    <div class="toolbar-search">
      <input type="search" class="search-input" data-search data-col="${esc(col)}" value="${esc(state.q)}" placeholder="${esc(t("toolbar.searchIn", { col: colLabel(col).toLowerCase() }))}" />
    </div>
    <div class="toolbar-filters">
      ${filters}${sorts}
      <div class="view-switch">
        <button type="button" data-mode="list" data-col="${esc(col)}" class="${state.mode === "list" ? "active" : ""}">${esc(t("common.list"))}</button>
        <button type="button" data-mode="grid" data-col="${esc(col)}" class="${state.mode === "grid" ? "active" : ""}">${esc(t("common.grid"))}</button>
      </div>
      <label class="check-row"><input type="checkbox" data-all data-col="${esc(col)}" /> <span>${esc(t("common.selectAll"))}</span></label>
    </div>
    <div class="toolbar-actions">
      <button type="button" class="btn btn-outline btn-sm" data-export="${esc(col)}">${esc(t("common.exportJson"))}</button>
      <button type="button" class="btn btn-outline btn-sm" data-import="${esc(col)}">${esc(t("common.importJson"))}</button>
    </div>
  </div>
  <div class="bulk-bar" data-bulkbar="${esc(col)}" hidden>
    <span class="bulk-count">${esc(t("common.selectedCount", { n: 0 }))}</span>
    ${bulk}
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="featured">${esc(t("toolbar.markFeatured"))}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="unfeatured">${esc(t("toolbar.unmarkFeatured"))}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="duplicate">${esc(t("common.duplicate"))}</button>
    <button type="button" class="btn btn-danger btn-sm" data-bulk="delete">${esc(t("common.delete"))}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="clear">${esc(t("toolbar.clearSelection"))}</button>
  </div>`;
}

function renderToolbar(col) {
  const el = $(col + "-toolbar");
  if (!el) return;
  const sig = toolbarSignature(col);
  if (el.getAttribute("data-sig") !== sig || !el.querySelector(".toolbar")) {
    el.setAttribute("data-sig", sig);
    el.innerHTML = toolbarHtml(col);
  }
  syncToolbar(col);
}

function syncToolbar(col) {
  const el = $(col + "-toolbar");
  if (!el) return;
  const state = ui[col];
  const search = el.querySelector("[data-search]");
  if (search && search.value !== state.q) search.value = state.q;
  el.querySelectorAll("[data-filter]").forEach((s) => {
    const v = state.filters[s.getAttribute("data-filter")] || "";
    if (s.value !== v) s.value = v;
  });
  const sortSel = el.querySelector("[data-sort]");
  if (sortSel && sortSel.value !== state.sort) sortSel.value = state.sort;
  el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-mode") === state.mode));

  const bar = el.querySelector("[data-bulkbar]");
  if (bar) {
    if (state.sel.size) {
      bar.removeAttribute("hidden");
      const count = bar.querySelector(".bulk-count");
      if (count) count.textContent = t("common.selectedCount", { n: state.sel.size });
    } else {
      bar.setAttribute("hidden", "");
    }
  }
  const all = el.querySelector("[data-all]");
  if (all) {
    const vis = visibleItems(col);
    all.checked = vis.length > 0 && vis.every((i) => state.sel.has(i.id));
  }
}

function rowHtml(col, it, dragEnabled) {
  const state = ui[col];
  const selected = state.sel.has(it.id);
  const badges = [];
  if (isVehicle(col) && it.status === "draft") badges.push(`<span class="badge badge-draft">${esc(t("badge.draft"))}</span>`);
  if (it.featured) badges.push(`<span class="badge badge-featured">${esc(t("badge.featured"))}</span>`);
  if (isVehicle(col) && it.stale) badges.push(`<span class="badge badge-warn">${esc(t("badge.stale"))}</span>`);
  if (isVehicle(col) && !it.image) badges.push(`<span class="badge badge-muted">${esc(t("badge.noImage"))}</span>`);

  /* Lewat /api/pratinjau, bukan langsung ke /mobil/<id>. Dua sebabnya: motor
     ikut kebagian tombol ini (dulu hanya mobil, karena hanya mobil yang punya
     halaman), dan barisnya yang berstatus draf tetap bisa dibuka — justru
     baris itu yang paling sering perlu dilihat. */
  const view = isVehicle(col)
    ? `<a class="btn btn-ghost btn-sm" href="${esc(previewHref(col, it.id))}" target="_blank" rel="noopener">${esc(t("common.view"))}</a>`
    : "";
  // Skema disaring lebih dulu: field ini teks bebas, dan esc() tidak menolak
  // `javascript:`. Tautan yang ditolak tidak dirender sama sekali.
  const itemUrl = col === "berita" ? safeUrl(it.url) : "";
  const itemMap = col === "spklu" || col === "bengkel" ? safeUrl(it.mapUrl) : "";
  const link = itemUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(itemUrl)}" target="_blank" rel="noopener">${esc(t("common.open"))}</a>` : "";
  const map = itemMap ? `<a class="btn btn-ghost btn-sm" href="${esc(itemMap)}" target="_blank" rel="noopener">${esc(t("common.map"))}</a>` : "";

  /* Jejak sentuhan terakhir. Stempelnya dipasang server saat isinya benar-benar
     berbeda, jadi baris ini menjawab "kapan ini terakhir diubah, dan oleh
     siapa" tanpa perlu membuka Log Aktivitas. */
  const stamp = it.updatedAt
    ? `<div class="row-meta row-stamp">${esc(
        it.updatedBy
          ? t("meta.changedBy", { who: it.updatedBy, when: formatAgo(it.updatedAt) })
          : t("meta.changedAt", { when: formatAgo(it.updatedAt) })
      )}</div>`
    : "";

  return `<div class="item-row${selected ? " selected" : ""}" data-col="${esc(col)}" data-id="${esc(it.id)}"${dragEnabled ? "" : ' data-nodrag="1"'}>
    <input type="checkbox" class="row-check" data-check data-col="${esc(col)}" data-id="${esc(it.id)}"${selected ? " checked" : ""} aria-label="${esc(t("common.selectItem", { name: titleOf(col, it) }))}" />
    <span class="drag-handle" title="${esc(dragEnabled ? t("common.dragToSort") : t("common.dragNeedsManual"))}">⋮⋮</span>
    <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
    <div class="row-main">
      <div class="row-title">${esc(titleOf(col, it))}</div>
      <div class="row-meta">${esc(metaOf(col, it))}</div>
      ${stamp}
    </div>
    <div class="row-badges">${badges.join("")}</div>
    <div class="row-actions">
      ${view}${link}${map}
      <button type="button" class="btn btn-ghost btn-sm" data-open="${esc(col)}:${esc(it.id)}">${esc(t("common.edit"))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-dup="${esc(col)}:${esc(it.id)}">${esc(t("common.duplicate"))}</button>
      <button type="button" class="btn btn-danger btn-sm" data-del="${esc(col)}:${esc(it.id)}">${esc(t("common.delete"))}</button>
    </div>
  </div>`;
}

function paginationHtml(col, total, page, pages) {
  if (pages <= 1) return "";
  const btns = [];
  for (let p = 1; p <= pages; p++) {
    if (pages > 9 && p !== 1 && p !== pages && Math.abs(p - page) > 2) {
      if (btns[btns.length - 1] !== "gap") btns.push("gap");
      continue;
    }
    btns.push(p);
  }
  return `<div class="pagination">
    <button type="button" data-page="${Math.max(1, page - 1)}" data-col="${esc(col)}"${page === 1 ? " disabled" : ""}>&larr;</button>
    ${btns.map((b) => (b === "gap" ? "<span>…</span>" : `<button type="button" data-page="${b}" data-col="${esc(col)}" class="${b === page ? "active" : ""}">${b}</button>`)).join("")}
    <button type="button" data-page="${Math.min(pages, page + 1)}" data-col="${esc(col)}"${page === pages ? " disabled" : ""}>&rarr;</button>
    <span class="row-meta">${esc(t("common.items", { n: total }))}</span>
  </div>`;
}

/* Paginasi ditaruh sebagai saudara di luar `.item-list`, supaya mode grid tidak
   ikut menata tombol halaman sebagai kartu. */
function setPagination(col, wrap, html) {
  const id = col + "-pagination";
  let el = document.getElementById(id);
  if (!html) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    wrap.insertAdjacentElement("afterend", el);
  }
  el.innerHTML = html;
}

function renderCollection(col) {
  renderToolbar(col);
  const wrap = $(col + "-list");
  if (!wrap) return;

  const state = ui[col];
  const total = (content[col] || []).length;
  const list = visibleItems(col);

  // Seleksi item yang sudah tidak ada (mis. setelah simpan) tidak boleh tertinggal.
  for (const id of [...state.sel]) if (!findItem(col, id)) state.sel.delete(id);

  if (!list.length) {
    wrap.className = "";
    setPagination(col, wrap, "");
    wrap.innerHTML = total
      ? emptyStateHtml(t("common.noResults"), t("common.noResultsHint"), "🔍")
      : emptyStateHtml(
        t("toolbar.emptyTitle", { col: colLabel(col).toLowerCase() }),
        t("toolbar.emptyText", { one: colOne(col).toLowerCase() }),
        "➕",
        { col, label: `+ ${t("common.addOne", { one: colOne(col) })}` },
      );
    syncToolbar(col);
    return;
  }

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);
  const dragEnabled = state.sort === "manual";

  wrap.className = "item-list" + (state.mode === "grid" ? " as-grid" : "");
  wrap.innerHTML = slice.map((it) => rowHtml(col, it, dragEnabled)).join("");
  setPagination(col, wrap, paginationHtml(col, list.length, state.page, pages));
  syncToolbar(col);
}

/* ------------------------------------------------------------------ *
 * 11. Aksi item (tambah, duplikat, hapus, urut, massal)
 * ------------------------------------------------------------------ */

function blankItem(col) {
  if (isVehicle(col)) {
    return {
      id: "", brand: "", name: "", bodyType: col === "motors" ? "Skuter" : "Hatchback", tagline: "", description: "",
      highlights: [], rangeKm: null, rangeStandard: null, batteryKwh: null, powerHp: null,
      torqueNm: null, topSpeedKph: null, accelSec: null, seats: null, year: null,
      driveType: "", chargeDcKw: null, chargeAcKw: null, chargeTime: "", warranty: "",
      variantNames: [], price: null, priceText: "", stale: false, featured: false,
      status: "published", tags: [], specs: [], colors: [], image: "", gallery: [], video: "", updatedAt: "",
    };
  }
  const item = { id: "" };
  for (const def of dirFields(col)) item[def.k] = def.t === "switch" ? false : def.t === "number" ? null : "";
  return item;
}

function duplicateItem(col, id) {
  const src = findItem(col, id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  const nameKey = col === "berita" ? "title" : "name";
  copy[nameKey] = String(copy[nameKey] || "") + t("common.copySuffix");
  copy.id = uniqueId(col, slugify(isVehicle(col) ? `${copy.brand} ${copy.name}` : copy[nameKey]) || col);
  if (isVehicle(col)) copy.status = "draft";
  const idx = (content[col] || []).findIndex((x) => x.id === id);
  content[col].splice(idx + 1, 0, copy);
  commit();
  toast(t("toast.duplicated"), "success");
}

async function deleteItem(col, id) {
  const item = findItem(col, id);
  if (!item) return;
  const ok = await confirmDialog({
    title: t("confirm.deleteTitle"),
    text: t("confirm.deleteText", { name: titleOf(col, item), col: colLabel(col) }),
    detail: t("confirm.undoHint"),
    okText: t("common.delete"),
  });
  if (!ok) return;
  const before = snapshotNow();
  content[col] = content[col].filter((x) => x.id !== id);
  ui[col].sel.delete(id);
  commit();
  toast(t("toast.deleted", { name: titleOf(col, item) }), "success", {
    label: t("toast.undo"),
    onClick: () => { content = JSON.parse(before); commit(); toast(t("toast.deleteUndone"), "info"); },
  });
}

async function bulkAction(col, action) {
  const state = ui[col];
  const ids = [...state.sel];
  if (!ids.length) return;

  if (action === "clear") { state.sel.clear(); renderCollection(col); return; }

  if (action === "delete") {
    const ok = await confirmDialog({ title: t("confirm.deleteBulkTitle"), text: t("confirm.deleteBulkText", { n: ids.length, col: colLabel(col) }), detail: t("confirm.undoHint"), okText: t("common.deleteAll") });
    if (!ok) return;
    const before = snapshotNow();
    content[col] = content[col].filter((x) => !state.sel.has(x.id));
    state.sel.clear();
    commit();
    toast(t("toast.deletedBulk", { n: ids.length }), "success", {
      label: t("toast.undo"),
      onClick: () => { content = JSON.parse(before); commit(); toast(t("toast.deleteUndone"), "info"); },
    });
    return;
  }

  if (action === "duplicate") {
    for (const id of ids) duplicateItem(col, id);
    state.sel.clear();
    renderCollection(col);
    return;
  }

  for (const id of ids) {
    const it = findItem(col, id);
    if (!it) continue;
    if (action === "publish") it.status = "published";
    else if (action === "draft") it.status = "draft";
    else if (action === "featured") it.featured = true;
    else if (action === "unfeatured") it.featured = false;
  }
  commit();
  toast(t("toast.updatedBulk", { n: ids.length }), "success");
}

function moveItem(col, dragId, targetId) {
  const list = content[col];
  const from = list.findIndex((x) => x.id === dragId);
  const to = list.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  commit();
}

/* ------------------------------------------------------------------ *
 * 12. Modal kendaraan
 * ------------------------------------------------------------------ */

/**
 * Alamat pratinjau satu kendaraan.
 *
 * Bukan `/mobil/<id>` langsung: kendaraan berstatus draf menjawab 404 di sana.
 * `/api/pratinjau` menandatangani tautan berumur pendek lebih dulu lalu
 * mengalihkan ke sana — lihat src/lib/pratinjau.ts. Untuk kendaraan yang sudah
 * tayang hasilnya sama saja dengan membuka halamannya langsung.
 */
function previewHref(col, id) {
  return `/api/pratinjau?col=${encodeURIComponent(col)}&id=${encodeURIComponent(id)}`;
}

/** Menyalakan tautan pratinjau di bilah editor, atau menyembunyikannya. */
function syncPreviewLink(col, id) {
  const link = $("editor-preview");
  if (!link) return;
  // Kendaraan yang belum pernah disimpan belum punya halaman untuk dilihat.
  link.hidden = !id;
  link.href = id ? previewHref(col, id) : "#";
}

/**
 * Menjaga agar pratinjau tidak pernah menampilkan isi yang sudah basi.
 *
 * Halaman pratinjau membaca `content.json` di server, jadi ia hanya bisa
 * menunjukkan apa yang sudah sampai ke sana. Ada dua jenis "belum sampai", dan
 * keduanya butuh jawaban yang berbeda:
 *
 *   1. `editorTouched` — formulir kendaraan sudah disunting, tapi isinya belum
 *      pernah masuk ke dokumen sama sekali. Hanya tombol Simpan yang
 *      memindahkannya (lihat `saveVehicle()`), dan Simpan juga menutup editor.
 *      Jadi klik pratinjau DITAHAN, bukan diam-diam disimpan: tombol bernama
 *      "Lihat pratinjau" tidak boleh punya efek samping menutup halaman yang
 *      sedang dikerjakan orang.
 *   2. `dirty` — dokumen sudah berubah (mis. tanda unggulan diklik dari daftar)
 *      dan tinggal menunggu simpan otomatis yang berjalan 1,2 detik setelah
 *      ketikan berhenti. Itu bisa dituntaskan tanpa siapa pun perlu tahu.
 *
 * Untuk kasus kedua, jendelanya dibuka SEKARANG — di dalam gerakan klik — lalu
 * diarahkan setelah simpanan selesai. `window.open()` yang dipanggil setelah
 * `await` dianggap peramban sebagai popup yang tidak diminta siapa pun.
 */
function bukaPratinjau(e, link) {
  const href = link.getAttribute("href") || "";
  if (!href || href === "#") { e.preventDefault(); return; }

  if (editorTouched) {
    e.preventDefault();
    toast(t("toast.previewSaveFirst"), "info");
    return;
  }

  if (!dirty) return; // Biarkan tautannya bekerja seperti tautan biasa.

  e.preventDefault();
  const tab = window.open("", "_blank");
  saveNow().then(() => {
    if (tab && !tab.closed) tab.location.replace(href);
    else toast(t("toast.previewBlocked"), "error");
  });
}

function openVehicle(col, id) {
  const item = id ? findItem(col, id) : blankItem(col);
  if (!item) {
    toast(t("toast.itemGone"), "error");
    setView(col);
    return;
  }

  vehicleCtx = {
    col,
    id: id || null,
    defs: vehicleFields(col),
    draft: { image: item.image || "", gallery: (item.gallery || []).slice() },
  };
  editorTouched = false;

  const eyebrow = $("editor-eyebrow");
  if (eyebrow) eyebrow.textContent = `${colLabel(col)} · ${id ? t("editor.eyebrow.edit") : t("editor.eyebrow.new")}`;

  const title = $("editor-title");
  if (title) title.textContent = id ? titleOf(col, item) : t("editor.addTitle", { one: colOne(col) });

  const sub = $("editor-sub");
  if (sub) {
    sub.textContent = id ? t("editor.subEdit") : t("editor.subNew");
  }

  const again = $("editor-save-add");
  if (again) again.hidden = !!id;

  syncPreviewLink(col, id);
  syncAiButton();
  /*
   * Kalau menurut catatan kita kuncinya belum ada, TANYAKAN LAGI.
   *
   * `aiSiap` dulu hanya dibaca sekali saat panel dimuat, dan panel ini tidak
   * pernah memuat ulang sendiri. Akibatnya memasang kunci di halaman
   * Pengaturan AI — di tab yang sama, atau oleh admin lain di tab lain — tidak
   * pernah memunculkan tombol Riset sampai seseorang menekan F5. Tombol yang
   * tidak pernah muncul jauh lebih mahal daripada satu permintaan yang
   * jawabannya satu baris JSON.
   *
   * Hanya saat belum siap: begitu kuncinya ada, tidak ada yang perlu ditanya
   * lagi tiap kali editor dibuka.
   */
  if (!aiSiap) muatKeadaanAi().then(syncAiButton);

  setView("editor", { hash: false, nav: col });
  renderEditorNav();
  renderVehicleSections(item);
  syncEditorMetrics();
  setActiveSection(SECTION_KEYS[0]);
  window.scrollTo({ top: 0, behavior: "instant" });

  const first = document.querySelector('#vehicle-form [name="brand"]');
  if (first) setTimeout(() => first.focus(), 40);
}

/* Meninggalkan editor lewat tombol Batal / panah kembali. Penjaga "belum
   disimpan" ditangani oleh penanganan hashchange, jadi cukup ubah alamatnya. */
function leaveEditor() {
  if (!vehicleCtx) { setView("dashboard"); return; }
  setView(vehicleCtx.col);
}

function renderEditorNav() {
  const nav = $("editor-nav");
  if (!nav) return;
  nav.innerHTML = editorSections().map((sec) => `<button type="button" class="editor-nav-item" data-goto-section="${esc(sec.k)}">
      <span class="editor-nav-label">${esc(sec.l)}</span>
      <span class="editor-nav-count" data-count-section="${esc(sec.k)}"></span>
    </button>`).join("");
}

function setActiveSection(key) {
  $$("#editor-nav .editor-nav-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-goto-section") === key));
}

/* Tinggi bilah lengket dipakai dua kali: sebagai `top` rel navigasi dan
   sebagai `scroll-margin` tiap bagian. Diukur, bukan ditebak, supaya judul
   yang membungkus di layar sempit tidak menggeser posisi lompatan. */
function editorStacked() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function syncEditorMetrics() {
  const view = document.querySelector('.view[data-view="editor"]');
  if (!view) return;
  const bar = $("editor-bar");
  const rail = document.querySelector(".editor-rail");
  view.style.setProperty("--editor-bar-h", (bar ? bar.offsetHeight : 0) + "px");
  view.style.setProperty("--editor-rail-h", (rail && editorStacked() ? rail.offsetHeight : 0) + "px");
}

function editorStickyOffset() {
  const topbar = document.querySelector(".admin-topbar");
  const bar = $("editor-bar");
  const rail = document.querySelector(".editor-rail");
  return (topbar ? topbar.offsetHeight : 60) +
    (bar ? bar.offsetHeight : 0) +
    (rail && editorStacked() ? rail.offsetHeight : 0);
}

function syncActiveSection() {
  if (activeView !== "editor") return;
  const form = $("vehicle-form");
  if (!form) return;
  const line = editorStickyOffset() + 24;
  let current = SECTION_KEYS[0];
  for (const el of form.querySelectorAll(".editor-section")) {
    if (el.getBoundingClientRect().top <= line) current = el.getAttribute("data-section");
  }
  // Di dasar halaman bagian terakhir selalu dianggap aktif, walau pendek.
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    current = SECTION_KEYS[SECTION_KEYS.length - 1];
  }
  setActiveSection(current);
}

/**
 * Posisi guliran dihitung sendiri, bukan lewat `scrollIntoView`. Halaman
 * publik memasang `scroll-padding-top` dengan variabel yang tidak ada di
 * admin, jadi `scrollIntoView` bisa mendarat di balik bilah lengket — dan
 * kalau animasi mulusnya tidak jalan, lompatannya tidak terjadi sama sekali.
 */
function scrollToY(top) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: reduce ? "instant" : "smooth" });
}

function scrollToSection(key) {
  const el = document.querySelector(`.editor-section[data-section="${CSS.escape(key)}"]`);
  if (!el) return;
  setActiveSection(key);
  scrollToY(window.scrollY + el.getBoundingClientRect().top - editorStickyOffset() - 12);
}

/* Saran merek: gabungan merek yang sudah dipakai di koleksi ini dan daftar bawaan. */
function brandOptions(col) {
  const used = uniqVals(content[col] || [], "brand");
  return [...new Set([...used, ...(BRAND_SUGGESTIONS[col] || [])])].sort((a, b) => a.localeCompare(b, "id"));
}

function specPresetHtml(col) {
  const presets = SPEC_PRESETS[col] || [];
  if (!presets.length) return "";
  return `<div class="chip-row" aria-label="${esc(t("editor.presetHint"))}">
    <span class="chip-row-label">${esc(t("editor.presetQuickAdd"))}</span>
    ${presets.map((label) => `<button type="button" class="chip" data-spec-preset="${esc(label)}">+ ${esc(label)}</button>`).join("")}
  </div>`;
}

function renderVehicleSections(item) {
  const form = $("vehicle-form");
  if (!form || !vehicleCtx) return;

  const col = vehicleCtx.col;
  const defs = vehicleCtx.defs;
  const one = col === "motors" ? "motor" : "mobil";

  const fill = (key, inner) => {
    const host = form.querySelector(`.editor-section[data-section="${key}"]`);
    if (!host) return;
    const sec = editorSections().find((x) => x.k === key);
    host.innerHTML = `<div class="editor-section-head">
        <h2>${esc(sec.l)}</h2>
        <p>${esc(sec.d)}</p>
      </div>
      <div class="editor-section-body">${inner}</div>`;
  };

  comboSources.brand = brandOptions(col);
  fill("dasar", `<div class="field-grid">
    ${defs.dasar.map((d) => fieldHtml(d, item[d.k], "v")).join("")}
  </div>`);

  fill("spesifikasi", `<div class="field-grid">${defs.spesifikasi.map((d) => fieldHtml(d, item[d.k], "v")).join("")}</div>
    <div class="editor-subsection">
      <h3>${esc(t("editor.extraSpecs"))}</h3>
      <p class="hint">${esc(t("editor.extraSpecs.desc"))}</p>
      ${specPresetHtml(col)}
      ${repeaterHtml("specs", item.specs || [], "kv")}
    </div>`);

  fill("media", `<div class="field-grid">
    <div class="field full">
      <label>${esc(t("editor.mainImage"))}</label>
      <div class="dropzone" data-vzone="image">${imagePreviewHtml(vehicleCtx.draft.image, 'data-vimg-del="1"')}</div>
      <div class="hint">${esc(t("editor.mainImage.hint"))}</div>
    </div>
    <div class="field full">
      <label>${esc(t("editor.gallery"))}</label>
      <div class="dropzone" data-vzone="gallery"><div class="empty-state-text">${esc(t("editor.gallery.drop"))}</div></div>
      <div class="gallery-list" data-gallery>${galleryHtml(vehicleCtx.draft.gallery)}</div>
      <div class="hint">${esc(t("editor.gallery.hint"))}</div>
    </div>
    ${fieldHtml({ k: "video", l: t("field.videoUrl"), t: "url", full: true, ph: "https://youtube.com/watch?v=…" }, item.video, "v")}
  </div>`);

  fill("varian", `${repeaterHtml("variantNames", item.variantNames || [], "text")}`);

  fill("lanjutan", `<div class="editor-subsection">
      <h3>${esc(t("editor.colorsTitle"))}</h3>
      ${repeaterHtml("colors", item.colors || [], "color")}
    </div>
    <div class="editor-subsection">
      <h3>${esc(t("editor.highlightsTitle"))}</h3>
      <div class="field full">
        <label for="v-highlights">${esc(t("editor.highlightsLabel"))}</label>
        <textarea id="v-highlights" name="highlights" rows="5" placeholder="${esc(t("editor.highlightsPh"))}">${esc((item.highlights || []).join("\n"))}</textarea>
      </div>
    </div>
    <div class="editor-subsection">
      <h3>${esc(t("editor.techTitle"))}</h3>
      <div class="field-grid">
        <div class="field full">
          <label for="v-id">${esc(t("editor.idLabel", { one }))}</label>
          <input type="text" id="v-id" name="__id" value="${esc(item.id)}" readonly />
          <div class="hint">${esc(vehicleCtx.id ? t("field.id.hintSaved") : t("field.id.hintNew"))}</div>
        </div>
        <div class="field">
          <button type="button" class="btn btn-outline btn-sm" data-copy-from="v-id">${esc(t("editor.copyId"))}</button>
        </div>
        <div class="field">
          <div class="hint">${esc(t("editor.lastChanged", { when: item.updatedAt ? formatDateTime(item.updatedAt) : t("common.never") }))}</div>
        </div>
      </div>
    </div>`);

  updateVehiclePreview();
}

function galleryHtml(list) {
  if (!list.length) return `<div class="empty-state-text">${esc(t("editor.galleryEmpty"))}</div>`;
  return list
    .map((url, i) => `<div class="gallery-item" draggable="true" data-gi="${i}">
      <img src="${esc(url)}" alt="" loading="lazy" />
      <button type="button" class="gallery-remove" data-gal-del="${i}" title="${esc(t("common.removeFromGallery"))}">&times;</button>
    </div>`)
    .join("");
}

function refreshGallery() {
  const wrap = document.querySelector("#vehicle-form [data-gallery]");
  if (wrap && vehicleCtx) wrap.innerHTML = galleryHtml(vehicleCtx.draft.gallery);
  updateVehicleMeter();
}

function refreshVehicleImage() {
  const dz = document.querySelector('#vehicle-form [data-vzone="image"]');
  if (dz && vehicleCtx) dz.innerHTML = imagePreviewHtml(vehicleCtx.draft.image, 'data-vimg-del="1"');
  updateVehiclePreview();
}

function updateVehiclePreview() {
  const form = $("vehicle-form");
  if (!form || !vehicleCtx) return;

  const brand = (form.elements.brand && form.elements.brand.value) || "";
  const name = (form.elements.name && form.elements.name.value) || "";

  const box = $("vehicle-preview");
  if (box) {
    const body = (form.elements.bodyType && form.elements.bodyType.value) || "";
    const priceText = (form.elements.priceText && form.elements.priceText.value) || "";
    const price = numOrNull(form.elements.price && form.elements.price.value);
    const range = (form.elements.rangeKm && form.elements.rangeKm.value) || "";
    const meta = [body, priceText || formatRupiah(price) || t("meta.noPrice"), range ? t("meta.range", { n: range }) : ""].filter(Boolean).join(" · ");

    box.innerHTML = `<div class="row-thumb">${thumbInnerHtml(vehicleCtx.draft.image, brand + " " + name)}</div>
      <div class="row-main">
        <div class="row-title">${esc(`${brand} ${name}`.trim() || (vehicleCtx.col === "motors" ? t("editor.previewNewMotor") : t("editor.previewNewCar")))}</div>
        <div class="row-meta">${esc(meta)}</div>
      </div>`;
  }

  // Item baru: ID ikut mengikuti ketikan sampai disimpan, jadi tidak ada kejutan.
  const idInput = $("v-id");
  if (idInput && !vehicleCtx.id) {
    const slug = slugify(`${brand} ${name}`);
    idInput.value = slug ? uniqueId(vehicleCtx.col, slug) : "";
    idInput.placeholder = t("editor.autoFromBrand");
  }

  updateVehicleMeter(form);
}

/**
 * Menghitung berapa banyak detail yang sudah terisi, per tab dan totalnya.
 * Saklar (unggulan/data lama) tidak ikut dihitung karena "tidak dicentang"
 * bukan berarti belum diisi.
 */
function vehicleStats(form) {
  if (!vehicleCtx) return null;
  const defs = vehicleCtx.defs;
  const isFilled = (v) => (Array.isArray(v) ? v.length > 0 : v !== "" && v !== null && v !== undefined);
  const countDefs = (list) => list.filter((d) => d.t !== "switch" && isFilled(readField(form, d))).length;
  const totalDefs = (list) => list.filter((d) => d.t !== "switch").length;
  const text = (key) => String((form.elements[key] && form.elements[key].value) || "").trim();

  const panes = {
    dasar: { filled: countDefs(defs.dasar), total: totalDefs(defs.dasar) },
    spesifikasi: {
      filled: countDefs(defs.spesifikasi) + (readRepeater(form, "specs").length ? 1 : 0),
      total: totalDefs(defs.spesifikasi) + 1,
    },
    media: {
      filled: (vehicleCtx.draft.image ? 1 : 0) + (vehicleCtx.draft.gallery.length ? 1 : 0) + (text("video") ? 1 : 0),
      total: 3,
    },
    varian: { filled: readRepeater(form, "variantNames").length ? 1 : 0, total: 1 },
    lanjutan: {
      filled: (readRepeater(form, "colors").length ? 1 : 0) + (text("highlights") ? 1 : 0),
      total: 2,
    },
  };

  let filled = 0;
  let total = 0;
  for (const key of Object.keys(panes)) {
    filled += panes[key].filled;
    total += panes[key].total;
  }
  return { panes, filled, total, pct: total ? Math.round((filled / total) * 100) : 0 };
}

function updateVehicleMeter(form) {
  const stats = vehicleStats(form || $("vehicle-form"));
  if (!stats) return;

  const meter = $("vehicle-meter");
  if (meter) {
    const tone = stats.pct >= 80 ? "good" : stats.pct >= 40 ? "mid" : "low";
    meter.className = "editor-meter " + tone;
    meter.innerHTML = `<div class="editor-meter-bar"><span style="width:${stats.pct}%"></span></div>
      <div class="editor-meter-text"><strong>${esc(t("editor.meter", { pct: stats.pct }))}</strong> · ${esc(t("editor.meterDetail", { filled: stats.filled, total: stats.total }))}</div>`;
  }

  for (const key of SECTION_KEYS) {
    const badge = document.querySelector(`[data-count-section="${key}"]`);
    if (!badge) continue;
    const p = stats.panes[key];
    badge.textContent = `${p.filled}/${p.total}`;
    badge.classList.toggle("is-empty", p.filled === 0);
    badge.classList.toggle("is-done", p.filled === p.total);
  }
}

function clearErrors(form) {
  form.querySelectorAll(".field.has-error").forEach((f) => f.classList.remove("has-error"));
  form.querySelectorAll(".error-text").forEach((e) => e.remove());
}

function markError(form, key, message) {
  const field = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`);
  if (!field) return null;
  field.classList.add("has-error");
  const err = document.createElement("div");
  err.className = "error-text";
  err.textContent = message;
  field.appendChild(err);
  return field.closest(".editor-section");
}

function saveVehicle(opts) {
  const form = $("vehicle-form");
  if (!form || !vehicleCtx) return;
  const again = !!(opts && opts.again);
  const { col, id, defs } = vehicleCtx;
  clearErrors(form);

  const data = {};
  for (const paneName of ["dasar", "spesifikasi"]) {
    for (const def of defs[paneName]) data[def.k] = readField(form, def);
  }

  // Bantuan pengisian: harga teks dan angka saling melengkapi.
  if (!data.priceText && data.price != null) data.priceText = formatRupiah(data.price);
  if (data.price == null && data.priceText) {
    const guess = parseRupiah(data.priceText);
    if (guess != null) data.price = guess;
  }

  data.specs = readRepeater(form, "specs");
  data.variantNames = readRepeater(form, "variantNames");
  data.colors = readRepeater(form, "colors");
  data.highlights = splitLines(form.elements.highlights ? form.elements.highlights.value : "");
  data.video = form.elements.video ? String(form.elements.video.value || "").trim() : "";
  data.image = vehicleCtx.draft.image;
  data.gallery = vehicleCtx.draft.gallery.slice();
  data.rangeStandard = data.rangeStandard || null;

  let badSection = null;
  if (!data.brand) badSection = markError(form, "brand", t("valid.brandRequired")) || badSection;
  if (!data.name) badSection = markError(form, "name", t("valid.nameRequired")) || badSection;
  if (badSection) {
    scrollToSection(badSection.getAttribute("data-section"));
    const firstBad = form.querySelector(".field.has-error input, .field.has-error select, .field.has-error textarea");
    if (firstBad) setTimeout(() => firstBad.focus({ preventScroll: true }), 260);
    toast(t("toast.fixRedFields"), "error");
    return;
  }

  /* Stempel `updatedAt`/`updatedBy` dipasang SERVER, di PUT /api/content.
     Hanya di sana yang tahu item mana yang benar-benar berbeda dari isi yang
     tersimpan — menstempel di sini menandai item sebagai "baru diubah" bahkan
     ketika tombol Simpan ditekan tanpa satu pun nilai yang berubah. */

  if (id) {
    const idx = content[col].findIndex((x) => x.id === id);
    content[col][idx] = Object.assign({}, content[col][idx], data, { id });
  } else {
    data.id = uniqueId(col, slugify(`${data.brand} ${data.name}`));
    content[col].push(data);
  }

  const label = titleOf(col, data);
  const savedId = id || data.id;
  editorTouched = false;
  commit();
  saveNow();

  // "Simpan & Tambah Lagi" menahan modal tetap terbuka dengan formulir kosong,
  // supaya memasukkan katalog beberapa item berturut-turut tidak perlu klik ulang.
  if (again) {
    openVehicle(col, null);
    toast(t("toast.addedNext", { name: label, one: colOne(col).toLowerCase() }), "success");
    return;
  }

  setView(col);
  if (id) {
    toast(t("toast.changesSaved"), "success");
  } else {
    toast(t("toast.added", { name: label }), "success", {
      label: t("toast.reopen"),
      onClick: () => openEditor(col, savedId),
    });
  }
}

/* ------------------------------------------------------------------ *
 * 13. Modal direktori
 * ------------------------------------------------------------------ */

/* Ikon peringatan lunak. Ditulis sekali supaya tidak berulang di dua tempat. */
const WARN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';

/**
 * Mengisi daftar saran combo dari data yang sudah ada di koleksi ini, digabung
 * dengan daftar bawaan. Dibaca ulang tiap kali modal dibuka supaya nilai yang
 * baru saja diketik langsung ikut disarankan pada entri berikutnya.
 */
function fillDirCombos(col) {
  const items = content[col] || [];
  // `numeric` supaya "7 kW" tidak mendarat sesudah "200 kW".
  const merge = (key, extra) =>
    [...new Set([...uniqVals(items, key), ...(extra || [])])].sort((a, b) =>
      a.localeCompare(b, intlLocale(locale), { numeric: true, sensitivity: "base" })
    );

  comboSources.area = merge("area");
  if (col === "spklu") {
    comboSources.spkluOperator = merge("operator", DIR_SUGGESTIONS.spkluOperator);
    comboSources.spkluConnector = merge("connector", DIR_SUGGESTIONS.spkluConnector);
    comboSources.spkluPower = merge("power", DIR_SUGGESTIONS.spkluPower);
    comboSources.hours = merge("hours", DIR_SUGGESTIONS.hoursSpklu);
  } else if (col === "bengkel") {
    comboSources.bengkelType = merge("type", DIR_SUGGESTIONS.bengkelType);
    comboSources.bengkelBrand = merge("brand");
    comboSources.hours = merge("hours", DIR_SUGGESTIONS.hoursBengkel);
  } else {
    comboSources.beritaSource = merge("source");
  }
}

function openDir(col, id) {
  const groups = dirGroups(col);
  if (!groups) return;
  const defs = groups.flatMap((g) => g.f);
  const item = id ? findItem(col, id) : blankItem(col);
  if (!item) return;

  dirCtx = { col, id: id || null, defs, draft: {} };
  editorTouched = false;
  for (const d of defs) if (d.t === "image") dirCtx.draft[d.k] = item[d.k] || "";

  // Berita baru diberi tanggal hari ini. Hampir selalu benar, dan tetap bisa
  // diubah — lebih baik daripada kolom kosong yang sering lupa diisi.
  if (!id && col === "berita" && !item.date) item.date = new Date().toISOString().slice(0, 10);

  fillDirCombos(col);

  const title = $("dir-modal-title");
  if (title) title.textContent = id ? t("editor.editTitle", { one: colOne(col), name: titleOf(col, item) }) : t("editor.addTitle", { one: colOne(col) });

  const sub = $("dir-modal-sub");
  if (sub) sub.textContent = id ? t("editor.subEdit") : t("dir.subNew");

  // "Simpan & Tambah Lagi" hanya masuk akal saat menambah, bukan saat mengedit.
  const again = $("dir-save-add");
  if (again) again.hidden = !!id;

  const wrap = $("dir-fields");
  if (wrap) {
    wrap.innerHTML = groups
      .map((g) => `<section class="form-section">
        <div class="form-section-head">
          <h4>${esc(g.l)}</h4>
          <p>${esc(g.d)}</p>
        </div>
        <div class="field-grid">${g.f.map((d) => fieldHtml(d, item[d.k], "d")).join("")}</div>
      </section>`)
      .join("");
  }

  const body = document.querySelector("#dir-form .modal-body");
  if (body) body.scrollTop = 0;

  openModal($("dir-modal"));
  updateDirMeter();
  checkDirDuplicate();

  const first = document.querySelector("#dir-form input, #dir-form textarea");
  // `preventScroll`: memfokuskan field pertama TANPA menggulir badan modal.
  // Tanpa ini peramban menggulir field itu ke tengah pandangan, dan labelnya
  // ikut terdorong ke atas sampai terpotong kepala modal.
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
}

/**
 * Berapa banyak detail yang sudah terisi. Saklar tidak ikut dihitung: "tidak
 * dicentang" bukan berarti belum diisi.
 */
function dirStats(form) {
  if (!dirCtx || !form) return null;
  const isFilled = (v) => (Array.isArray(v) ? v.length > 0 : v !== "" && v !== null && v !== undefined);
  const defs = dirCtx.defs.filter((d) => d.t !== "switch");
  let filled = 0;
  for (const d of defs) {
    const v = d.t === "image" ? dirCtx.draft[d.k] || "" : readField(form, d);
    if (isFilled(v)) filled++;
  }
  const total = defs.length;
  return { filled, total, pct: total ? Math.round((filled / total) * 100) : 0 };
}

function updateDirMeter() {
  const meter = $("dir-meter");
  const stats = dirStats($("dir-form"));
  if (!meter) return;
  if (!stats) { meter.className = "editor-meter modal-meter"; meter.innerHTML = ""; return; }

  const tone = stats.pct >= 80 ? "good" : stats.pct >= 40 ? "mid" : "low";
  meter.className = "editor-meter modal-meter " + tone;
  meter.innerHTML = `<div class="editor-meter-bar"><span style="width:${stats.pct}%"></span></div>
    <div class="editor-meter-text"><strong>${esc(t("editor.meter", { pct: stats.pct }))}</strong> · ${esc(t("editor.meterDetail", { filled: stats.filled, total: stats.total }))}</div>`;
}

/**
 * Peringatan lunak saat namanya sudah dipakai entri lain di koleksi yang sama.
 * Sengaja tidak memblokir simpan — dua SPKLU boleh saja bernama sama di area
 * berbeda — tapi jauh lebih sering ini berarti entri yang sama dimasukkan dua
 * kali, dan itu baru ketahuan setelah muncul di situs.
 */
function checkDirDuplicate() {
  const form = $("dir-form");
  if (!form || !dirCtx) return;

  const key = dirCtx.col === "berita" ? "title" : "name";
  const field = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`);
  const input = form.elements[key];
  if (!field || !input) return;

  const old = field.querySelector(".field-warn");
  if (old) old.remove();

  const val = String(input.value || "").trim().toLowerCase();
  if (!val) return;

  const hit = (content[dirCtx.col] || []).find(
    (x) => x.id !== dirCtx.id && String(x[key] || "").trim().toLowerCase() === val
  );
  if (!hit) return;

  field.insertAdjacentHTML(
    "beforeend",
    `<div class="field-warn">${WARN_ICON}<span>${esc(t("dir.duplicate"))}</span></div>`
  );
}

function saveDir(opts) {
  const form = $("dir-form");
  if (!form || !dirCtx) return;
  const again = !!(opts && opts.again);
  const { col, id } = dirCtx;
  const defs = dirCtx.defs;
  clearErrors(form);

  const data = {};
  for (const def of defs) data[def.k] = def.t === "image" ? dirCtx.draft[def.k] || "" : readField(form, def);

  const nameKey = col === "berita" ? "title" : "name";
  if (!data[nameKey]) {
    markError(form, nameKey, col === "berita" ? t("valid.titleRequired") : t("valid.dirNameRequired"));
    const bad = form.querySelector(".field.has-error input, .field.has-error textarea");
    if (bad) bad.focus();
    toast(t("toast.fixRedFields"), "error");
    return;
  }

  if (id) {
    const idx = content[col].findIndex((x) => x.id === id);
    content[col][idx] = Object.assign({}, content[col][idx], data, { id });
  } else {
    data.id = uniqueId(col, slugify(data[nameKey]) || col);
    content[col].push(data);
  }

  const label = titleOf(col, data);
  editorTouched = false;

  // "Simpan & Tambah Lagi" menahan modal tetap terbuka dengan formulir kosong,
  // supaya memasukkan beberapa entri berturut-turut tidak perlu klik ulang.
  if (again) {
    commit();
    saveNow();
    openDir(col, null);
    toast(t("toast.addedNext", { name: label, one: colOne(col).toLowerCase() }), "success");
    return;
  }

  closeModal($("dir-modal"));
  commit();
  saveNow();
  toast(id ? t("toast.changesSaved") : t("toast.itemAdded"), "success");
}

/* ------------------------------------------------------------------ *
 * 14. Form pengaturan situs (generik)
 * ------------------------------------------------------------------ */

/**
 * Menggambar ulang kedua form `site` dari `content.site`.
 *
 * Kolom yang sedang diketik dilewati — TAPI hanya kolom itu sendiri, bukan
 * seluruh form. Melewati seluruh form pernah membuat menu Tampilan menolak
 * setiap preset: mengklik kartu preset memindahkan fokus ke kartu itu (yang
 * berada di dalam <form>), jadi tidak ada satu pun input yang ikut diperbarui,
 * dan `collectSiteForm()` berikutnya menulis nilai lama dari DOM kembali ke
 * `content.site` — situs kembali ke preset bawaan tepat setelah disimpan.
 *
 * @param {{force?: boolean}} [options] `force` mengabaikan penjagaan fokus.
 *   Dipakai tindakan yang memang mengganti SELURUH setelan sekaligus (pilih
 *   preset, kembalikan ke bawaan): di sebagian peramban fokus tidak berpindah
 *   saat sebuah tombol diklik, jadi kolom yang tadi disentuh akan tertinggal
 *   basi kalau penjagaan itu tetap berlaku.
 */
function renderSiteForm(options) {
  if (!content) return;
  const force = !!(options && options.force);
  for (const id of SITE_FORMS) {
    const form = $(id);
    if (!form) continue;

    for (const el of form.elements) {
      const key = el.name;
      if (!key || !(key in content.site)) continue;
      if (!force && el === document.activeElement) continue;
      if (el.type === "checkbox") el.checked = !!content.site[key];
      else if (el.value !== String(content.site[key])) el.value = String(content.site[key]);
    }
    form.querySelectorAll("[data-image-field]").forEach((wrap) => renderSiteImageField(wrap, force));
    renderFooterMenus(form, force);
  }
  syncRangeOutputs();
  syncPresetCards();
  applyThemePreview();
}

/**
 * Nilai <input type="range"> tidak terlihat tanpa label angka di sampingnya.
 *
 * Satuannya dibaca dari `data-unit` di <output> — menu Tampilan memakai persen,
 * derajat, dan piksel dalam satu form yang sama. `data-div` membagi nilainya
 * lebih dulu, supaya slider yang bergerak per satuan bulat (jarak huruf judul)
 * tetap bisa menampilkan angka yang benar-benar dipakai CSS.
 */
function syncRangeOutputs() {
  for (const id of SITE_FORMS) {
    const form = $(id);
    if (!form) continue;
    form.querySelectorAll('input[type="range"]').forEach((input) => {
      const out = form.querySelector(`output[for="${CSS.escape(input.id)}"]`);
      if (!out) return;
      const div = Number(out.getAttribute("data-div"));
      const raw = Number(input.value);
      const shown = div > 0 ? (raw / div).toFixed(String(div).length - 1) : input.value;
      out.textContent = shown + (out.getAttribute("data-unit") || "px");
    });
  }
}

function renderSiteImageField(wrap, force) {
  const key = wrap.getAttribute("data-image-field");
  const dz = wrap.querySelector("[data-dropzone]");
  const url = (content.site && content.site[key]) || "";
  const input = wrap.querySelector(`input[name="${CSS.escape(key)}"]`);
  if (input && (force || input !== document.activeElement)) input.value = url;
  if (dz) dz.innerHTML = imagePreviewHtml(url, `data-site-img-del="${esc(key)}"`);
}

function collectSiteForm() {
  for (const id of SITE_FORMS) {
    const form = $(id);
    if (!form) continue;
    for (const el of form.elements) {
      const key = el.name;
      if (!key || !(key in content.site)) continue;
      content.site[key] = el.type === "checkbox" ? !!el.checked : String(el.value);
    }
    collectFooterMenus(form);
  }
}

/* ------------------------------------------------------------------ *
 * 14c. Penyusun menu footer
 * ------------------------------------------------------------------ */

/*
 * Menu footer dan tautan bilah bawah adalah satu-satunya field `site` yang
 * berupa LARIK, jadi mesin form generik di atas — satu input = satu field —
 * tidak bisa menanganinya. Dua fungsi di bawah yang menjembatani: yang satu
 * menggambar barisnya dari `content.site`, yang lain membacanya kembali dari
 * DOM saat ada yang berubah.
 *
 * Perubahan susunan (tambah, hapus, geser) dikerjakan langsung di DOM lalu
 * dibaca ulang, persis seperti repeater di editor kendaraan. Menggambar ulang
 * seluruh daftar pada tiap ketikan akan merebut fokus dari kolom yang sedang
 * diketik.
 */

function footerLinkRowHtml(link, hk) {
  const l = link || { label: "", url: "" };
  return `<div class="frow" data-frow>
    <input type="text" data-fk="label" data-hk="${esc(hk)}-label" value="${esc(l.label)}"
      placeholder="${esc(t("site.footerMenus.linkLabel.ph"))}" aria-label="${esc(t("site.footerMenus.linkLabel.ph"))}" />
    <input type="text" data-fk="url" data-hk="${esc(hk)}-url" value="${esc(l.url)}"
      placeholder="${esc(t("site.footerMenus.linkUrl.ph"))}" aria-label="${esc(t("site.footerMenus.linkUrl.ph"))}" />
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-frow-move="-1" title="${esc(t("common.moveUp"))}">&uarr;</button>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-frow-move="1" title="${esc(t("common.moveDown"))}">&darr;</button>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-frow-del title="${esc(t("common.removeRow"))}">&times;</button>
  </div>`;
}

function footerMenuHtml(col, i) {
  const c = col || { title: "", links: [] };
  const links = (c.links && c.links.length ? c.links : [{ label: "", url: "" }])
    .map((l, j) => footerLinkRowHtml(l, `m${i}-${j}`))
    .join("");
  return `<div class="fmenu" data-fmenu>
    <div class="fmenu-head">
      <input type="text" class="fmenu-title" data-fk="title" data-hk="m${i}-title" value="${esc(c.title)}"
        placeholder="${esc(t("site.footerMenus.colTitle.ph"))}" aria-label="${esc(t("site.footerMenus.colTitle.ph"))}" />
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-fmenu-move="-1" title="${esc(t("common.moveUp"))}">&uarr;</button>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-fmenu-move="1" title="${esc(t("common.moveDown"))}">&darr;</button>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-fmenu-del title="${esc(t("site.footerMenus.removeCol"))}">&times;</button>
    </div>
    <div class="frows" data-fmenu-links>${links}</div>
    <button type="button" class="repeater-add" data-flink-add>
      <span aria-hidden="true">+</span> ${esc(t("site.footerMenus.addLink"))}
    </button>
  </div>`;
}

function footerMenuEmptyHtml() {
  return `<p class="fmenu-empty" data-i18n="site.footerMenus.empty">${esc(t("site.footerMenus.empty"))}</p>`;
}

/**
 * @param {HTMLElement} root Form yang sedang digambar; halaman Tampilan tidak punya penyusun ini.
 * @param {boolean} [force] Lihat renderSiteForm().
 *
 * Kedua daftar digambar ulang lewat `innerHTML`, jadi penjagaan fokusnya harus
 * sekelompok, bukan per input: menyusun ulang barisnya saat ada yang sedang
 * diketik akan merebut fokus di tengah ketikan.
 */
function renderFooterMenus(root, force) {
  const idle = (el) => force || !el.contains(document.activeElement);

  const wrap = root.querySelector("[data-footer-menus]");
  if (wrap && idle(wrap)) {
    const cols = content.site.footerMenus || [];
    wrap.innerHTML = cols.length ? cols.map(footerMenuHtml).join("") : footerMenuEmptyHtml();
  }
  const legal = root.querySelector("[data-footer-legal]");
  if (legal && idle(legal)) {
    legal.innerHTML = (content.site.footerLegal || []).map((l, i) => footerLinkRowHtml(l, `g${i}`)).join("");
  }
  syncFooterMenuLimits(root);
}

/** Nilai mentah tiap baris; pemangkasan dan pembuangan baris kosong dikerjakan
    normalizeLinks(), fungsi yang sama dengan yang dipakai server. */
function readFooterLinks(body) {
  if (!body) return [];
  return Array.from(body.querySelectorAll("[data-frow]")).map((row) => ({
    label: (row.querySelector('[data-fk="label"]') || {}).value || "",
    url: (row.querySelector('[data-fk="url"]') || {}).value || "",
  }));
}

/** @param {HTMLElement} root Lihat renderFooterMenus(). */
function collectFooterMenus(root) {
  const wrap = root.querySelector("[data-footer-menus]");
  if (wrap) {
    content.site.footerMenus = normalizeMenus(
      Array.from(wrap.querySelectorAll("[data-fmenu]")).map((col) => ({
        title: (col.querySelector('[data-fk="title"]') || {}).value || "",
        links: readFooterLinks(col.querySelector("[data-fmenu-links]")),
      }))
    );
  }
  const legal = root.querySelector("[data-footer-legal]");
  if (legal) content.site.footerLegal = normalizeLinks(readFooterLinks(legal), MAX_LEGAL_LINKS);
}

/**
 * Mematikan tombol tambah begitu batasnya tercapai. Batasnya juga dijaga di
 * server (`store.ts`), tapi tombol yang tetap menyala lalu diam-diam tidak
 * berpengaruh adalah cara terburuk menyampaikan sebuah batas.
 */
function syncFooterMenuLimits(root) {
  const wrap = root.querySelector("[data-footer-menus]");
  const addCol = root.querySelector("[data-fmenu-add]");
  if (wrap && addCol) addCol.disabled = wrap.querySelectorAll("[data-fmenu]").length >= MAX_MENU_COLS;

  if (wrap) {
    wrap.querySelectorAll("[data-fmenu]").forEach((col) => {
      const add = col.querySelector("[data-flink-add]");
      if (add) add.disabled = col.querySelectorAll("[data-frow]").length >= MAX_MENU_LINKS;
    });
  }

  const legal = root.querySelector("[data-footer-legal]");
  const addLegal = root.querySelector("[data-flegal-add]");
  if (legal && addLegal) addLegal.disabled = legal.querySelectorAll("[data-frow]").length >= MAX_LEGAL_LINKS;
}

/** Menyimpan susunan baru lalu menjadwalkan simpan otomatis. */
function footerMenusChanged(root) {
  collectFooterMenus(root);
  syncFooterMenuLimits(root);

  // Kolom terakhir yang dihapus meninggalkan ruang kosong tanpa penjelasan;
  // render penuh baru terjadi belakangan, jadi keadaan kosongnya dipasang di sini.
  const wrap = root.querySelector("[data-footer-menus]");
  if (wrap && !wrap.querySelector("[data-fmenu]") && !wrap.querySelector(".fmenu-empty")) {
    wrap.innerHTML = footerMenuEmptyHtml();
  }

  commit({ key: "site:footerMenus", render: false });
}

/* ------------------------------------------------------------------ *
 * 14b. Menu Tampilan
 * ------------------------------------------------------------------ */

/** Sisi mana yang sedang ditunjukkan kotak pratinjau: terang atau gelap. */
let previewMode = "light";

/**
 * Menyalakan preset yang sedang dipakai.
 *
 * Preset dianggap aktif hanya kalau SELURUH field yang dibawanya masih sama
 * dengan nilai sekarang. Kalau cuma menyimpan id-nya, satu klik pada pemilih
 * warna sudah membuat kartu "Senja" tetap menyala padahal warnanya bukan
 * warna Senja lagi.
 */
function activePresetId() {
  const site = content && content.site;
  if (!site) return "";
  const hit = THEME_PRESETS.find((p) => PRESET_FIELDS.every((k) => String(site[k]) === String(p[k])));
  return hit ? hit.id : "";
}

function syncPresetCards() {
  const grid = $("preset-grid");
  if (!grid) return;
  const active = activePresetId();
  grid.querySelectorAll("[data-preset]").forEach((card) => {
    card.classList.toggle("active", card.getAttribute("data-preset") === active);
  });
}

function applyPreset(id) {
  const preset = findPreset(id);
  if (!preset || !content) return;
  for (const key of PRESET_FIELDS) content.site[key] = preset[key];
  content.site.themePreset = preset.id;
  renderSiteForm({ force: true });
  commit({ render: false });
  saveNow();
  toast(t("toast.presetApplied", { name: preset.label }), "success");
}

/** Mengembalikan SELURUH setelan tampilan ke bawaannya, termasuk CSS kustom. */
async function resetTampilan() {
  if (!content) return;
  const ok = await confirmDialog({
    title: t("tampilan.reset"),
    text: t("tampilan.reset.confirm"),
    detail: t("tampilan.reset.detail"),
    okText: t("tampilan.reset"),
    tone: "warning",
  });
  if (!ok) return;
  Object.assign(content.site, APPEARANCE_DEFAULTS, APPEARANCE_FLAGS);
  renderSiteForm({ force: true });
  commit({ render: false });
  saveNow();
  toast(t("toast.tampilanReset"), "success");
}

/**
 * Pratinjau langsung.
 *
 * Kotak pratinjau memakai variabel dan kelas `ui-*` yang persis sama dengan
 * yang dikirim ke situs publik, jadi tidak ada "versi panel" dari tema yang
 * bisa menyimpang. Warna latar pilihan sendiri dipasang di sini karena di
 * situs publik ia dikirim sebagai aturan CSS untuk <html>, yang tidak punya
 * padanan di dalam satu kotak.
 */
function applyThemePreview() {
  if (!content || !content.site) return;
  const site = content.site;

  // Panel ikut memakai warna aksen situs supaya tombol utamanya senada.
  const p = site.themePrimary;
  const s = site.themeSecondary;
  if (p) document.body.style.setProperty("--accent", p);
  if (s) document.body.style.setProperty("--accent-2", s);
  if (p && s) document.body.style.setProperty("--accent-grad", `linear-gradient(135deg, ${p}, ${s})`);

  const box = $("tampilan-preview");
  if (!box) return;
  const th = resolveTheme(site);
  const bg = previewMode === "dark" ? th.bgDark : th.bgLight;
  box.setAttribute("style", themeStyle(site) + (bg ? `;--bg:${bg};--bg-tint:${bg}` : ""));
  box.className = "tp ui-surface ui-bg-layer " + themeBodyClass(site);
  if (previewMode === "dark") box.setAttribute("data-theme", "dark");
  else box.removeAttribute("data-theme");

  const modes = document.querySelectorAll("[data-tp-mode]");
  modes.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tp-mode") === previewMode));
}

/* ------------------------------------------------------------------ *
 * 15. View media
 * ------------------------------------------------------------------ */

/*
 * Media punya dua lapis. Lapis pertama adalah DAFTAR: alamat gambar yang
 * dikumpulkan ulang dari kendaraan, berita, dan pengaturan situs — turunan,
 * tidak disimpan. Lapis kedua adalah METADATA (judul, teks alternatif,
 * catatan) yang disimpan di `content.media` berkunci alamat gambar; lihat
 * src/lib/media.js.
 *
 * Pemisahan itu yang membuat satu foto yang dipakai tiga kendaraan cukup
 * ditulis alt-nya sekali, dan alt itu tidak ikut hilang saat salah satu
 * kendaraannya dihapus.
 */

/** Saringan "belum ada alt" di bilah alat. */
let mediaOnlyMissingAlt = false;

/** Gambar yang sedang dibuka: { list, index, zoom }. `null` kalau modal tutup. */
let mediaCtx = null;

function collectMedia() {
  const map = new Map();

  /**
   * @param ref Kendaraan/berita asal pemakaian, kalau ada. Dipakai modal untuk
   *   menautkan tiap baris "Dipakai di" langsung ke editornya.
   */
  const add = (url, label, ref) => {
    const u = String(url || "").trim();
    if (!u) return;
    if (!map.has(u)) map.set(u, []);
    map.get(u).push({ label, col: (ref && ref.col) || "", id: (ref && ref.id) || "" });
  };

  for (const key of ["logoImage", "heroImage", "seoOgImage"]) add(content.site[key], t("media.siteSettings", { field: key }));
  for (const col of VEHICLE_COLS) {
    for (const it of content[col] || []) {
      add(it.image, `${colLabel(col)} · ${titleOf(col, it)}`, { col, id: it.id });
      (it.gallery || []).forEach((g) =>
        add(g, `${colLabel(col)} · ${titleOf(col, it)} (${t("media.gallerySuffix")})`, { col, id: it.id })
      );
    }
  }
  for (const it of content.berita || []) add(it.image, `${colLabel("berita")} · ${titleOf("berita", it)}`, { col: "berita", id: it.id });
  for (const u of mediaUploads) add(u, t("media.unused"));

  return [...map.entries()];
}

function mediaMeta(url) {
  return mediaEntry(content && content.media, url);
}

function mediaFileName(url) {
  const clean = String(url || "").split(/[?#]/)[0];
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  return name || clean;
}

/** Judul yang ditulis manusia kalau ada; kalau tidak, nama berkasnya. */
function mediaLabel(url) {
  return mediaMeta(url).title || mediaFileName(url);
}

function mediaExt(url) {
  const name = mediaFileName(url);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/** Gambar milik situs ini sendiri — hanya untuk ini ukuran berkas bisa dibaca. */
function mediaIsLocal(url) {
  const u = String(url || "");
  return u.startsWith("/") && !u.startsWith("//");
}

/**
 * Daftar yang sedang tampil, setelah pencarian dan saringan.
 *
 * Grid dan panah di modal memakai fungsi yang SAMA: kalau tidak, menekan panah
 * kanan di gambar terakhir hasil pencarian akan melompat ke gambar yang tidak
 * terlihat di belakangnya.
 */
function mediaList() {
  const search = $("media-search");
  const q = ((search && search.value) || "").trim().toLowerCase();
  return collectMedia().filter(([url, uses]) => {
    const meta = mediaMeta(url);
    if (mediaOnlyMissingAlt && meta.alt) return false;
    if (!q) return true;
    const hay = [url, meta.title, meta.alt, meta.note, ...uses.map((u) => u.label)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderMedia() {
  const el = $("media-grid");
  if (!el) return;

  const all = collectMedia();
  const items = mediaList();
  const missing = all.filter(([url]) => !mediaMeta(url).alt).length;

  const summary = $("media-summary");
  if (summary) {
    summary.textContent = !all.length
      ? ""
      : missing
        ? t("media.summary", { n: all.length, missing })
        : t("media.summaryAllSet", { n: all.length });
  }

  const filterBtn = $("media-filter-alt");
  if (filterBtn) {
    filterBtn.hidden = !all.length;
    filterBtn.classList.toggle("active", mediaOnlyMissingAlt);
    filterBtn.setAttribute("aria-pressed", String(mediaOnlyMissingAlt));
  }

  const search = $("media-search");
  const q = ((search && search.value) || "").trim();

  const uploader = `<div class="dropzone" data-dzone="__media">
    <div class="empty-state-text">${esc(t("upload.dropHereUrl"))}</div>
  </div>`;

  if (!items.length) {
    let empty;
    if (q) empty = emptyStateHtml(t("common.noResults"), t("media.noMatch", { q }), "🔍");
    else if (mediaOnlyMissingAlt && all.length) empty = emptyStateHtml(t("media.noMissingAlt"), t("media.summaryAllSet", { n: all.length }), "✅");
    else empty = emptyStateHtml(t("media.emptyTitle"), t("media.emptyText"), "🖼️");
    el.innerHTML = uploader + empty;
    return;
  }

  el.innerHTML = uploader + `<div class="media-grid">${items
    .map(([url, uses]) => {
      const meta = mediaMeta(url);
      return `<button type="button" class="media-card" data-media-open="${esc(url)}">
        <span class="media-card-thumb">
          <img src="${esc(safeUrl(url))}" alt="" loading="lazy" />
          <span class="media-card-uses">${esc(String(uses.length))}</span>
        </span>
        <span class="media-card-name">${esc(mediaLabel(url))}</span>
        ${meta.alt
          ? `<span class="media-card-alt">${esc(meta.alt)}</span>`
          : `<span class="media-card-alt is-missing">${esc(t("media.noAlt"))}</span>`}
      </button>`;
    })
    .join("")}</div>`;
}

/* ---------------- Modal media ---------------- */

function openMediaModal(url) {
  const list = mediaList();
  if (!list.length) return;
  let index = list.findIndex(([u]) => u === url);
  if (index < 0) index = 0;
  mediaCtx = { list, index, zoom: false };
  renderMediaModal();
  openModal($("media-modal"));
}

function mediaStep(step) {
  if (!mediaCtx || mediaCtx.list.length < 2) return;
  const n = mediaCtx.list.length;
  mediaCtx.index = (mediaCtx.index + step + n) % n;
  mediaCtx.zoom = false;
  renderMediaModal();
}

function currentMediaUrl() {
  const entry = mediaCtx && mediaCtx.list[mediaCtx.index];
  return entry ? entry[0] : "";
}

function mediaUsesHtml(uses) {
  if (!uses.length) return `<p class="mediaview-uses-empty">${esc(t("media.usesNone"))}</p>`;
  return `<ul class="mediaview-use-list">${uses
    .map((u) =>
      u.col && u.id
        ? `<li><button type="button" class="mediaview-use" data-media-goto="${esc(u.col)}:${esc(u.id)}" title="${esc(t("media.usesOpen", { name: u.label }))}">${esc(u.label)}</button></li>`
        : `<li><span class="mediaview-use is-static">${esc(u.label)}</span></li>`
    )
    .join("")}</ul>`;
}

/**
 * Menggambar isi modal dari gambar yang sedang aktif.
 *
 * Field yang sedang diketik dilewati — sama alasannya dengan form Pengaturan
 * Situs: autosave menggambar ulang panel setelah menyimpan, dan menulis ulang
 * nilai input yang sedang dipakai akan memindahkan kursor ke belakang teks.
 */
function renderMediaModal() {
  if (!mediaCtx) return;
  const entry = mediaCtx.list[mediaCtx.index];
  if (!entry) { closeModal($("media-modal")); return; }

  const [url, uses] = entry;
  const meta = mediaMeta(url);

  const title = $("media-modal-title");
  if (title) title.textContent = mediaLabel(url);
  const sub = $("media-modal-sub");
  if (sub) sub.textContent = t("media.counter", { i: mediaCtx.index + 1, n: mediaCtx.list.length });

  const img = $("media-image");
  if (img) {
    if (img.getAttribute("data-url") !== url) {
      img.setAttribute("data-url", url);
      img.src = safeUrl(url);
      const dim = $("media-fact-dim");
      if (dim) dim.textContent = "—";
      fillMediaSize(url);
    }
    // Alt sungguhan dipasang di pratinjau: yang diketik di sini persis yang
    // dibaca pembaca layar di situs.
    img.alt = meta.alt;
  }

  const canvas = $("media-canvas");
  if (canvas) canvas.classList.toggle("zoomed", !!mediaCtx.zoom);
  const zoomBtn = $("media-zoom");
  if (zoomBtn) {
    // Kunci ikut diperbarui, bukan cuma teksnya: applyStaticI18n() menggambar
    // ulang elemen ber-`data-i18n` saat bahasa berganti.
    zoomBtn.setAttribute("data-i18n", mediaCtx.zoom ? "media.zoomOut" : "media.zoomIn");
    zoomBtn.textContent = mediaCtx.zoom ? t("media.zoomOut") : t("media.zoomIn");
  }

  const many = mediaCtx.list.length > 1;
  for (const id of ["media-prev", "media-next"]) {
    const btn = $(id);
    if (btn) btn.hidden = !many;
  }

  const type = $("media-fact-type");
  if (type) type.textContent = mediaExt(url) || "—";
  const usesFact = $("media-fact-uses");
  if (usesFact) usesFact.textContent = t("media.usesCount", { n: uses.length });

  for (const field of ["alt", "title", "note"]) {
    const input = $(`media-field-${field}`);
    if (!input || input === document.activeElement) continue;
    if (input.value !== meta[field]) input.value = meta[field];
  }

  const usesBox = $("media-uses");
  if (usesBox) usesBox.innerHTML = mediaUsesHtml(uses);

  const copyBtn = $("media-copy");
  if (copyBtn) copyBtn.setAttribute("data-copy", url);
  const openLink = $("media-open");
  if (openLink) openLink.href = safeUrl(url);
  const dl = $("media-download");
  if (dl) {
    // `download` diabaikan peramban untuk berkas lintas domain: tombolnya akan
    // membuka tab, bukan mengunduh. Lebih baik tidak menjanjikannya.
    dl.hidden = !mediaIsLocal(url);
    dl.href = safeUrl(url);
    dl.setAttribute("download", mediaFileName(url));
  }
}

/**
 * Ukuran berkas hanya bisa dibaca untuk gambar milik situs ini: permintaan ke
 * domain lain ditolak CORS, dan gambar pabrikan yang ditaut langsung memang
 * bukan berkas kita.
 */
async function fillMediaSize(url) {
  const el = $("media-fact-size");
  if (!el) return;
  if (!mediaIsLocal(url)) { el.textContent = t("media.sizeUnknown"); return; }
  el.textContent = "…";
  try {
    // Peramban sudah memuat gambar yang sama untuk pratinjau, dan berkas
    // unggahan disajikan `immutable` — jadi ini nyaris selalu dari cache.
    const res = await fetch(safeUrl(url), { cache: "force-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const declared = Number(res.headers.get("content-length") || 0);
    const size = declared || (await res.blob()).size;
    if (currentMediaUrl() !== url) return;
    el.textContent = size ? formatSize(size) : "—";
  } catch {
    if (currentMediaUrl() === url) el.textContent = "—";
  }
}

/** Menulis satu field metadata gambar yang sedang dibuka. */
function setMediaField(field, value) {
  const url = currentMediaUrl();
  if (!url || !MEDIA_LIMITS[field]) return;

  if (!content.media || typeof content.media !== "object") content.media = {};
  const next = mediaMeta(url);
  next[field] = String(value == null ? "" : value).slice(0, MEDIA_LIMITS[field]);

  // Entri yang seluruh field-nya kosong dibuang, supaya membuka-buka gambar
  // di panel tidak meninggalkan baris kosong di content.json.
  if (!next.title && !next.alt && !next.note) delete content.media[url];
  else content.media[url] = next;

  commit({ key: `media:${field}:${url}`, render: false });

  const img = $("media-image");
  if (img && field === "alt") img.alt = next.alt;
  const title = $("media-modal-title");
  if (title && field === "title") title.textContent = mediaLabel(url);
}

/* ------------------------------------------------------------------ *
 * 16. View cadangan
 * ------------------------------------------------------------------ */

async function loadBackups() {
  const el = $("backups-list");
  if (!el) return;
  el.innerHTML = `<div class="skeleton"></div>`;
  try {
    const res = await fetch("/api/backups");
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    const backups = (data && data.backups) || [];
    const actions = `<div class="toolbar">
      <div class="toolbar-actions">
        <button type="button" class="btn btn-primary btn-sm" id="backup-download">${esc(t("backups.downloadAll"))}</button>
        <button type="button" class="btn btn-outline btn-sm" id="backup-import">${esc(t("backups.uploadRestore"))}</button>
      </div>
    </div>`;

    if (!backups.length) {
      el.innerHTML = actions + emptyStateHtml(t("backups.emptyTitle"), t("backups.emptyText"), "🗄️");
      return;
    }

    el.innerHTML = actions + `<div class="item-list">${backups
      .map((b) => `<div class="item-row">
        <div class="row-main">
          <div class="row-title">${esc(formatDateTime(b.time))}</div>
          <div class="row-meta">${esc(b.name)} · ${esc(formatSize(b.size))}</div>
        </div>
        <div class="row-actions"><button type="button" class="btn btn-outline btn-sm" data-restore="${esc(b.name)}">${esc(t("common.restore"))}</button></div>
      </div>`)
      .join("")}</div>`;
  } catch (err) {
    el.innerHTML = emptyStateHtml(t("backups.failTitle"), t("backups.failText"), "⚠️");
  }
}

async function restoreBackup(name) {
  const ok = await confirmDialog({
    title: t("confirm.restoreTitle"),
    text: t("confirm.restoreText"),
    detail: t("confirm.restoreDetail"),
    okText: t("common.restore"),
    tone: "warning",
  });
  if (!ok) return;
  try {
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "backups.failTitle"));
    content = data.content;
    dirty = false;
    setSaveState("saved");
    resetHistory();
    renderAll();
    loadBackups();
    toast(t("toast.backupRestored"), "success");
  } catch (err) {
    toast(t("toast.restoreFailed", { error: err.message }), "error");
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ *
 * 17. Impor / ekspor
 * ------------------------------------------------------------------ */

let jsonPickerHandler = null;

function pickJson(handler) {
  jsonPickerHandler = handler;
  const input = $("__json-picker");
  input.value = "";
  input.click();
}

async function importCollection(col, parsed) {
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed && parsed[col]) ? parsed[col] : null;
  if (!rows) { toast(t("toast.notAList"), "error"); return; }
  const ok = await confirmDialog({
    title: t("confirm.importTitle"),
    text: t("confirm.importText", { n: rows.length, col: colLabel(col) }),
    okText: t("common.import"),
    tone: "warning",
  });
  if (!ok) return;
  for (const row of rows) {
    const item = Object.assign(blankItem(col), row);
    item.id = uniqueId(col, slugify(isVehicle(col) ? `${item.brand} ${item.name}` : item[col === "berita" ? "title" : "name"]) || col);
    content[col].push(item);
  }
  commit();
  saveNow();
  toast(t("toast.imported", { n: rows.length }), "success");
}

/* ------------------------------------------------------------------ *
 * 18. Unggah gambar (dropzone generik)
 * ------------------------------------------------------------------ */

let filePickerTarget = null;

function pickImages(dz) {
  filePickerTarget = dz;
  const input = $("__image-picker");
  input.value = "";
  input.multiple = dz.getAttribute("data-vzone") === "gallery" || dz.getAttribute("data-dzone") === "__media";
  input.click();
}

async function handleUpload(dz, files) {
  if (!files.length) return;
  const prev = dz.innerHTML;
  dz.innerHTML = `<div class="upload-progress"><span class="spinner"></span> ${esc(t("upload.progress", { n: files.length }))}</div>`;
  const urls = [];
  try {
    for (const f of files) urls.push(await uploadImage(f));
  } catch (err) {
    dz.innerHTML = prev;
    toast(t("toast.uploadFailed", { error: err.message }), "error");
    return;
  }

  const vzone = dz.getAttribute("data-vzone");
  const dzone = dz.getAttribute("data-dzone");
  const siteField = dz.closest("[data-image-field]");

  if (vzone === "image" && vehicleCtx) {
    vehicleCtx.draft.image = urls[0];
    refreshVehicleImage();
  } else if (vzone === "gallery" && vehicleCtx) {
    vehicleCtx.draft.gallery.push(...urls);
    dz.innerHTML = prev;
    refreshGallery();
  } else if (dzone === "__avatar") {
    const input = document.querySelector('#profile-identity input[name="avatar"]');
    if (input) input.value = urls[0];
    dz.innerHTML = imagePreviewHtml(urls[0], 'data-avatar-del="1"');
  } else if (dzone === "__media") {
    mediaUploads.push(...urls);
    renderMedia();
    toast(t("toast.uploadedCopy"), "success");
  } else if (siteField) {
    const key = siteField.getAttribute("data-image-field");
    content.site[key] = urls[0];
    renderSiteImageField(siteField);
    applyThemePreview();
    commit({ render: false });
  } else if (dzone && dirCtx) {
    dirCtx.draft[dzone] = urls[0];
    dz.innerHTML = imagePreviewHtml(urls[0], `data-img-del="${esc(dzone)}"`);
    updateDirMeter();
  } else {
    dz.innerHTML = prev;
  }
  if (urls.length && !dzone) toast(t("toast.uploaded"), "success");
}

/* ------------------------------------------------------------------ *
 * 19. Pencarian global
 * ------------------------------------------------------------------ */

let palette = null;

function buildPalette() {
  if (palette) return palette;
  palette = document.createElement("div");
  palette.className = "modal-backdrop";
  palette.id = "search-palette";
  palette.innerHTML = `<div class="modal">
    <div class="modal-head">
      <h3 class="modal-title">${esc(t("topbar.searchLabel"))}</h3>
      <button type="button" class="modal-close" data-palette-close title="${esc(t("common.close"))}">&times;</button>
    </div>
    <div class="modal-body">
      <input type="search" class="search-input" id="palette-input" placeholder="${esc(t("palette.placeholder"))}" autocomplete="off" />
      <div class="item-list" id="palette-results"></div>
    </div>
  </div>`;
  document.body.appendChild(palette);
  return palette;
}

function searchAll(q) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return [];
  const out = [];
  for (const col of COLLECTIONS) {
    for (const it of content[col] || []) {
      const hay = (titleOf(col, it) + " " + metaOf(col, it) + " " + (it.tags || []).join(" ")).toLowerCase();
      if (hay.includes(query)) out.push({ col, it });
      if (out.length > 60) break;
    }
  }
  return out;
}

function renderPalette(q) {
  const box = $("palette-results");
  if (!box) return;
  const results = searchAll(q);
  if (!String(q || "").trim()) {
    box.innerHTML = `<div class="empty-state-text">${esc(t("palette.startHint"))}</div>`;
    return;
  }
  if (!results.length) {
    box.innerHTML = emptyStateHtml(t("common.noResults"), t("palette.emptyText"), "🔍");
    return;
  }
  box.innerHTML = results
    .slice(0, 40)
    .map(({ col, it }) => `<div class="item-row" data-open="${esc(col)}:${esc(it.id)}">
      <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
      <div class="row-main">
        <div class="row-title">${esc(titleOf(col, it))}</div>
        <div class="row-meta">${esc(metaOf(col, it))}</div>
      </div>
      <div class="row-badges"><span class="badge badge-muted">${esc(colLabel(col))}</span></div>
    </div>`)
    .join("");
}

function openPalette(initial) {
  buildPalette();
  openModal(palette);
  const input = $("palette-input");
  if (input) {
    input.value = initial || "";
    renderPalette(input.value);
    setTimeout(() => { input.focus(); input.select(); }, 20);
  }
}

/* ------------------------------------------------------------------ *
 * 20. Render menyeluruh
 * ------------------------------------------------------------------ */

function renderAll() {
  if (!content) return;
  renderNavCounts();
  renderDashboard();
  for (const col of COLLECTIONS) renderCollection(col);
  renderSiteForm();
  renderMedia();
}

/* ------------------------------------------------------------------ *
 * 21. Event
 * ------------------------------------------------------------------ */

function openEditor(col, id) {
  if (!isVehicle(col)) { openDir(col, id); return; }
  setHash(routeHash(col, id));
  openVehicle(col, id);
}

function parseRef(ref) {
  const i = String(ref).indexOf(":");
  return { col: ref.slice(0, i), id: ref.slice(i + 1) };
}

function bindEvents() {
  /* --- Navigasi --- */
  document.addEventListener("click", (e) => {
    /* Combobox lebih dulu: klik di luar panel yang terbuka ikut menutupnya. */
    if (comboClick(e)) return;

    const nav = e.target.closest(".nav-item[data-view]");
    if (nav) {
      e.preventDefault();
      setView(nav.getAttribute("data-view"));
      return;
    }

    const stat = e.target.closest("[data-goto]");
    if (stat) { setView(stat.getAttribute("data-goto")); return; }

    /* --- Bahasa panel --- */
    const langBtn = e.target.closest("[data-lang]");
    if (langBtn) {
      e.preventDefault();
      setLocale(langBtn.getAttribute("data-lang"), { toast: true });
      const menu = $("lang-menu");
      if (menu) menu.classList.remove("open");
      return;
    }
    if (e.target.closest("#lang-toggle")) {
      e.preventDefault();
      const menu = $("lang-menu");
      if (menu) menu.classList.toggle("open");
      return;
    }
    const openLangMenu = $("lang-menu");
    if (openLangMenu && openLangMenu.classList.contains("open") && !e.target.closest("#lang-menu")) {
      openLangMenu.classList.remove("open");
    }

    /* --- Akun --- */
    if (e.target.closest("#account-chip")) { e.preventDefault(); setView("profile"); return; }

    if (e.target.closest("#add-user")) { openUserModal(null); return; }

    const userEdit = e.target.closest("[data-user-edit]");
    if (userEdit) { openUserModal(userEdit.getAttribute("data-user-edit")); return; }

    const userDel = e.target.closest("[data-user-del]");
    if (userDel) { deleteUserById(userDel.getAttribute("data-user-del")); return; }

    const avatarDel = e.target.closest("[data-avatar-del]");
    if (avatarDel) {
      e.preventDefault();
      const input = document.querySelector('#profile-identity input[name="avatar"]');
      if (input) input.value = "";
      const zone = avatarDel.closest("[data-dzone]");
      if (zone) zone.innerHTML = imagePreviewHtml("", 'data-avatar-del="1"');
      return;
    }

    if (e.target.closest("#sidebar-toggle")) { toggleSidebar(); return; }

    /* Lapisan gelap di belakang drawer: klik di mana pun padanya menutup sidebar. */
    if (e.target.id === "sidebar-scrim") { $("admin-app").classList.remove("sidebar-open"); return; }

    if (e.target.closest("#logout")) {
      e.preventDefault();
      fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/admin/login"; });
      return;
    }

    if (e.target.closest("#profile-signout-others")) { signOutOtherDevices(); return; }

    /* --- Log aktivitas --- */
    if (e.target.closest("#activity-refresh")) { loadActivityPage(); return; }
    const halAktivitas = e.target.closest("[data-activity-page]");
    if (halAktivitas) {
      activityView.page = Number(halAktivitas.getAttribute("data-activity-page")) || 1;
      loadActivityPage();
      return;
    }

    /* --- Pratinjau --- */
    const pratinjauLink = e.target.closest("#editor-preview");
    if (pratinjauLink) { bukaPratinjau(e, pratinjauLink); return; }

    /* --- Riset AI --- */
    if (e.target.closest("#ai-open")) { openAiModal(); return; }
    if (e.target.closest("#ai-start")) { startAiRiset(); return; }
    if (e.target.closest("#ai-cancel")) { batalkanAiRiset(); return; }
    if (e.target.closest("#ai-retry")) { aiCtx.fase = "setup"; aiCtx.job = null; renderAiModal(); return; }
    if (e.target.closest("#ai-apply")) { applyAiUsulan(); return; }
    if (e.target.closest("#ai-modal-close")) { closeAiModal(); return; }
    if (e.target.closest("#ai-pick-empty")) {
      aiCtx.pilih = new Set((aiCtx.job.hasil.usulan || []).filter((u) => u.sekarang === null).map((u) => u.key));
      renderAiModal();
      return;
    }
    if (e.target.closest("#ai-pick-none")) { aiCtx.pilih.clear(); renderAiModal(); return; }

    /* --- Pengaturan AI --- */
    if (e.target.closest("#ai-key-change")) { aiEditing = true; renderAi(); return; }
    if (e.target.closest("#ai-key-cancel")) { aiEditing = false; renderAi(); return; }
    if (e.target.closest("#ai-key-remove")) { removeAiKey(); return; }
    if (e.target.closest("#ai-balance-refresh")) { loadAi({ segar: true }); return; }

    /* --- Palette --- */
    if (e.target.closest("[data-palette-close]")) { closeModal(palette); return; }

    /* --- Modal generik --- */
    const closeBtn = e.target.closest(".modal-close, [data-close-modal]");
    if (closeBtn) {
      const modal = closeBtn.closest(".modal-backdrop");
      requestCloseModal(modal);
      return;
    }
    if (e.target.classList && e.target.classList.contains("modal-backdrop")) {
      requestCloseModal(e.target);
      return;
    }

    if (e.target.closest("#media-refresh")) { renderMedia(); toast(t("toast.mediaReloaded"), "info"); return; }

    /* --- Media --- */
    if (e.target.closest("#media-filter-alt")) {
      mediaOnlyMissingAlt = !mediaOnlyMissingAlt;
      renderMedia();
      return;
    }
    const mediaOpen = e.target.closest("[data-media-open]");
    if (mediaOpen) { openMediaModal(mediaOpen.getAttribute("data-media-open")); return; }
    if (e.target.closest("#media-prev")) { mediaStep(-1); return; }
    if (e.target.closest("#media-next")) { mediaStep(1); return; }
    if (e.target.closest("#media-zoom") || e.target.closest("#media-image")) {
      if (mediaCtx) { mediaCtx.zoom = !mediaCtx.zoom; renderMediaModal(); }
      return;
    }
    const mediaGoto = e.target.closest("[data-media-goto]");
    if (mediaGoto) {
      const ref = parseRef(mediaGoto.getAttribute("data-media-goto"));
      closeModal($("media-modal"));
      openEditor(ref.col, ref.id);
      return;
    }

    if (e.target.closest("#editor-save-add")) { saveVehicle({ again: true }); return; }
    if (e.target.closest("#dir-save-add")) { saveDir({ again: true }); return; }
    if (e.target.closest("#editor-back") || e.target.closest("#editor-cancel")) { leaveEditor(); return; }

    const jump = e.target.closest("[data-goto-section]");
    if (jump) { scrollToSection(jump.getAttribute("data-goto-section")); return; }

    /* --- Salin ke papan klip --- */
    const copyFrom = e.target.closest("[data-copy-from]");
    const copy = copyFrom || e.target.closest("[data-copy]");
    if (copy) {
      const src = copyFrom ? $(copyFrom.getAttribute("data-copy-from")) : null;
      const text = copyFrom ? (src ? src.value : "") : copy.getAttribute("data-copy");
      if (!text) { toast(t("toast.noIdToCopy"), "info"); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(t("toast.copied"), "success"), () => toast(t("toast.copyFailed"), "error"));
      return;
    }

    /* --- Aksi item --- */
    const add = e.target.closest("[data-add]");
    if (add) { const col = add.getAttribute("data-add"); openEditor(col, null); return; }

    const open = e.target.closest("[data-open]");
    if (open) {
      const { col, id } = parseRef(open.getAttribute("data-open"));
      if (palette && palette.classList.contains("open")) closeModal(palette);
      if (!isVehicle(col)) setView(col);
      openEditor(col, id);
      return;
    }

    const dup = e.target.closest("[data-dup]");
    if (dup) { const { col, id } = parseRef(dup.getAttribute("data-dup")); duplicateItem(col, id); return; }

    const del = e.target.closest("[data-del]");
    if (del) { const { col, id } = parseRef(del.getAttribute("data-del")); deleteItem(col, id); return; }

    /* --- Toolbar --- */
    const mode = e.target.closest("[data-mode]");
    if (mode) {
      const col = mode.getAttribute("data-col");
      ui[col].mode = mode.getAttribute("data-mode");
      renderCollection(col);
      return;
    }

    const page = e.target.closest("[data-page]");
    if (page && !page.disabled) {
      const col = page.getAttribute("data-col");
      ui[col].page = Number(page.getAttribute("data-page")) || 1;
      renderCollection(col);
      return;
    }

    const bulk = e.target.closest("[data-bulk]");
    if (bulk) {
      const col = bulk.closest("[data-bulkbar]").getAttribute("data-bulkbar");
      bulkAction(col, bulk.getAttribute("data-bulk"));
      return;
    }

    const exp = e.target.closest("[data-export]");
    if (exp) {
      const col = exp.getAttribute("data-export");
      downloadJson(`evkita-${col}.json`, content[col] || []);
      toast(t("toast.jsonDownloaded"), "success");
      return;
    }

    const imp = e.target.closest("[data-import]");
    if (imp) { const col = imp.getAttribute("data-import"); pickJson((parsed) => importCollection(col, parsed)); return; }

    /* --- Cadangan --- */
    const restore = e.target.closest("[data-restore]");
    if (restore) { restoreBackup(restore.getAttribute("data-restore")); return; }

    if (e.target.closest("#backup-download")) {
      downloadJson("evkita-content.json", content);
      toast(t("toast.backupDownloaded"), "success");
      return;
    }
    if (e.target.closest("#backup-import")) {
      pickJson(async (parsed) => {
        if (!parsed || typeof parsed !== "object" || !parsed.site) { toast(t("toast.notABackup"), "error"); return; }
        const ok = await confirmDialog({ title: t("confirm.replaceTitle"), text: t("confirm.replaceText"), okText: t("common.replace"), tone: "question" });
        if (!ok) return;
        content = parsed;
        commit();
        saveNow();
      });
      return;
    }

    /* --- Chip spesifikasi siap pakai --- */
    const preset = e.target.closest("[data-spec-preset]");
    if (preset) {
      const label = preset.getAttribute("data-spec-preset");
      const rep = document.querySelector('#vehicle-form [data-rep="specs"]');
      if (!rep) return;
      const body = rep.querySelector("[data-rep-body]");
      const existing = Array.from(body.querySelectorAll('[data-rk="label"]'));
      const already = existing.find((i) => i.value.trim().toLowerCase() === label.toLowerCase());
      if (already) {
        already.focus();
        toast(t("toast.rowExists", { name: label }), "info");
        return;
      }
      // Baris kosong yang belum diisi dipakai ulang supaya tidak menumpuk.
      const blank = existing.find((i) => !i.value.trim() && !i.closest(".repeater-row").querySelector('[data-rk="value"]').value.trim());
      if (blank) {
        blank.value = label;
        blank.closest(".repeater-row").querySelector('[data-rk="value"]').focus();
      } else {
        body.insertAdjacentHTML("beforeend", repeaterRowHtml("specs", { label, value: "" }, "kv", body.children.length));
        const val = body.lastElementChild.querySelector('[data-rk="value"]');
        if (val) val.focus();
      }
      editorTouched = true;
      updateVehicleMeter();
      return;
    }

    /* --- Penyusun menu footer --- */
    const fmenuBtn = e.target.closest(
      "[data-fmenu-add], [data-fmenu-del], [data-fmenu-move], [data-flink-add], [data-flegal-add], [data-frow-del], [data-frow-move]"
    );
    if (fmenuBtn) {
      const form = fmenuBtn.closest("#site-form");
      if (!form) return;

      if (fmenuBtn.hasAttribute("data-fmenu-add")) {
        const wrap = form.querySelector("[data-footer-menus]");
        const empty = wrap.querySelector(".fmenu-empty");
        if (empty) empty.remove();
        wrap.insertAdjacentHTML("beforeend", footerMenuHtml(blankMenuColumn(), wrap.children.length));
        const title = wrap.lastElementChild.querySelector('[data-fk="title"]');
        if (title) title.focus();
      } else if (fmenuBtn.hasAttribute("data-fmenu-del")) {
        fmenuBtn.closest("[data-fmenu]").remove();
      } else if (fmenuBtn.hasAttribute("data-fmenu-move")) {
        moveSibling(fmenuBtn.closest("[data-fmenu]"), Number(fmenuBtn.getAttribute("data-fmenu-move")));
      } else if (fmenuBtn.hasAttribute("data-flink-add")) {
        const body = fmenuBtn.closest("[data-fmenu]").querySelector("[data-fmenu-links]");
        body.insertAdjacentHTML("beforeend", footerLinkRowHtml(null, `n${body.children.length}`));
        const input = body.lastElementChild.querySelector("input");
        if (input) input.focus();
      } else if (fmenuBtn.hasAttribute("data-flegal-add")) {
        const body = form.querySelector("[data-footer-legal]");
        body.insertAdjacentHTML("beforeend", footerLinkRowHtml(null, `g${body.children.length}`));
        const input = body.lastElementChild.querySelector("input");
        if (input) input.focus();
      } else if (fmenuBtn.hasAttribute("data-frow-del")) {
        fmenuBtn.closest("[data-frow]").remove();
      } else if (fmenuBtn.hasAttribute("data-frow-move")) {
        moveSibling(fmenuBtn.closest("[data-frow]"), Number(fmenuBtn.getAttribute("data-frow-move")));
      }

      footerMenusChanged(form);
      return;
    }

    /* --- Repeater --- */
    const repAdd = e.target.closest("[data-rep-add]");
    if (repAdd) {
      const rep = repAdd.closest(".repeater");
      const body = rep.querySelector("[data-rep-body]");
      const kind = rep.getAttribute("data-kind");
      const count = body.querySelectorAll(".repeater-row").length;
      body.insertAdjacentHTML("beforeend", repeaterRowHtml(rep.getAttribute("data-rep"), kind === "kv" ? { label: "", value: "" } : "", kind, count));
      const last = body.lastElementChild;
      const input = last && last.querySelector("input:not([type=color])");
      if (input) input.focus();
      updateVehicleMeter();
      return;
    }

    const repDel = e.target.closest("[data-rep-del]");
    if (repDel) { repDel.closest(".repeater-row").remove(); updateVehicleMeter(); return; }

    const repMove = e.target.closest("[data-rep-move]");
    if (repMove) {
      moveSibling(repMove.closest(".repeater-row"), Number(repMove.getAttribute("data-rep-move")));
      return;
    }

    /* --- Gambar: hapus --- */
    if (e.target.closest("[data-vimg-del]")) {
      if (vehicleCtx) { vehicleCtx.draft.image = ""; refreshVehicleImage(); }
      return;
    }
    const galDel = e.target.closest("[data-gal-del]");
    if (galDel) {
      if (vehicleCtx) { vehicleCtx.draft.gallery.splice(Number(galDel.getAttribute("data-gal-del")), 1); refreshGallery(); }
      return;
    }
    const presetCard = e.target.closest("[data-preset]");
    if (presetCard) {
      applyPreset(presetCard.getAttribute("data-preset"));
      return;
    }
    if (e.target.closest("#tampilan-reset")) {
      resetTampilan();
      return;
    }
    const tpMode = e.target.closest("[data-tp-mode]");
    if (tpMode) {
      previewMode = tpMode.getAttribute("data-tp-mode") === "dark" ? "dark" : "light";
      applyThemePreview();
      return;
    }

    const siteImgDel = e.target.closest("[data-site-img-del]");
    if (siteImgDel) {
      const key = siteImgDel.getAttribute("data-site-img-del");
      content.site[key] = "";
      const wrap = siteImgDel.closest("[data-image-field]");
      if (wrap) renderSiteImageField(wrap);
      applyThemePreview();
      commit({ render: false });
      return;
    }
    const imgDel = e.target.closest("[data-img-del]");
    if (imgDel) {
      const key = imgDel.getAttribute("data-img-del");
      if (dirCtx) dirCtx.draft[key] = "";
      const dz = imgDel.closest(".dropzone");
      if (dz) dz.innerHTML = imagePreviewHtml("", "");
      updateDirMeter();
      return;
    }

    /* --- Dropzone: buka pemilih berkas --- */
    const dz = e.target.closest(".dropzone");
    if (dz) { pickImages(dz); return; }
  });

  /* --- Input toolbar & form --- */
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.closest && el.closest("#vehicle-form, #dir-form")) editorTouched = true;

    /* Panel combobox hanya bereaksi pada ketikan sungguhan: memilih dari
       daftar juga memicu event ini, dan panelnya harus tetap tertutup. */
    if (e.isTrusted && el.matches && el.matches("[data-combo-input]")) {
      openCombo(el.closest(".combo"), { filter: true });
      /* sengaja tidak return: pratinjau editor ikut perlu diperbarui */
    }

    const search = el.closest && el.closest("[data-search]");
    if (search) {
      const col = search.getAttribute("data-col");
      ui[col].q = search.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    if (el.id === "palette-input") { renderPalette(el.value); return; }

    if (el.id === "global-search") { openPalette(el.value); el.value = ""; return; }

    // Warna repeater: input color dan teks saling menyalin.
    if (el.matches && el.matches('.repeater-row [data-rk="color"]')) {
      const text = el.closest(".color-field").querySelector('[data-rk="value"]');
      if (text) text.value = el.value;
      return;
    }
    if (el.matches && el.matches('.color-field [data-rk="value"]')) {
      const color = el.closest(".color-field").querySelector('[data-rk="color"]');
      if (color && /^#[0-9a-fA-F]{6}$/.test(el.value)) color.value = el.value;
      return;
    }

    if (el.closest && el.closest("#vehicle-form")) { updateVehiclePreview(); return; }

    if (el.closest && el.closest("#dir-form")) { updateDirMeter(); checkDirDuplicate(); return; }

    if (el.id === "media-search") { renderMedia(); return; }

    if (el.matches && el.matches("[data-media-field]")) {
      setMediaField(el.getAttribute("data-media-field"), el.value);
      return;
    }

    const siteForm = el.closest && el.closest("#site-form, #tampilan-form");
    if (siteForm) {
      collectSiteForm();
      if (el.type === "range") syncRangeOutputs();
      if (siteForm.id === "tampilan-form") syncPresetCards();
      applyThemePreview();
      commit({ key: "site:" + (el.name || el.getAttribute("data-hk") || "footer"), render: false });
      return;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.closest && el.closest("#vehicle-form, #dir-form")) editorTouched = true;
    if (el.closest && el.closest("#dir-form")) updateDirMeter();

    /* --- Saringan log aktivitas --- */
    const saringan = el.getAttribute && el.getAttribute("data-activity");
    if (saringan) {
      activityView[saringan] = el.value;
      activityView.page = 1; // Halaman 7 dari saringan lama hampir pasti tidak ada di saringan baru.
      loadActivityPage();
      return;
    }

    /* --- Riset AI --- */
    if (el.name === "ai-default-model") { simpanModelBawaan(el.value); return; }
    if (aiCtx && el.name === "ai-mode") { aiCtx.mode = el.value; renderAiModal(); return; }
    if (aiCtx && el.name === "ai-model") { aiCtx.model = el.value; renderAiModal(); return; }
    const aiPick = el.getAttribute && el.getAttribute("data-ai-pick");
    if (aiCtx && aiPick) {
      if (el.checked) aiCtx.pilih.add(aiPick);
      else aiCtx.pilih.delete(aiPick);
      // Sengaja hanya menggambar ulang bagian kaki: menggambar ulang seluruh
      // daftar akan memindahkan posisi guliran setiap kali satu kotak dicentang.
      const tombol = $("ai-apply");
      if (tombol) {
        tombol.textContent = t("ai.terapkan", { n: aiCtx.pilih.size });
        tombol.disabled = aiCtx.pilih.size === 0;
      }
      const baris = el.closest(".ai-row");
      if (baris) baris.classList.toggle("picked", el.checked);
      return;
    }

    const filter = el.closest && el.closest("[data-filter]");
    if (filter) {
      const col = filter.getAttribute("data-col");
      ui[col].filters[filter.getAttribute("data-filter")] = filter.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    const sort = el.closest && el.closest("[data-sort]");
    if (sort) {
      const col = sort.getAttribute("data-col");
      ui[col].sort = sort.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    const all = el.closest && el.closest("[data-all]");
    if (all) {
      const col = all.getAttribute("data-col");
      const vis = visibleItems(col);
      if (all.checked) vis.forEach((i) => ui[col].sel.add(i.id));
      else vis.forEach((i) => ui[col].sel.delete(i.id));
      renderCollection(col);
      return;
    }

    const check = el.closest && el.closest("[data-check]");
    if (check) {
      const col = check.getAttribute("data-col");
      const id = check.getAttribute("data-id");
      if (check.checked) ui[col].sel.add(id); else ui[col].sel.delete(id);
      const row = check.closest(".item-row");
      if (row) row.classList.toggle("selected", check.checked);
      syncToolbar(col);
      return;
    }

    if (el.closest && el.closest("#site-form, #tampilan-form") && el.type === "checkbox") {
      collectSiteForm();
      syncPresetCards();
      applyThemePreview();
      commit({ render: false });
    }
  });

  /* --- Submit form --- */
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.id === "vehicle-form") { e.preventDefault(); saveVehicle(); return; }
    if (form.id === "dir-form") { e.preventDefault(); saveDir(); return; }
    if (form.id === "user-form") { e.preventDefault(); saveUserForm(); return; }
    if (form.id === "profile-identity") { e.preventDefault(); saveProfileIdentity(form); return; }
    if (form.id === "profile-password") { e.preventDefault(); saveProfilePassword(form); return; }
    if (form.id === "profile-prefs") { e.preventDefault(); saveProfilePrefs(form); return; }
    if (form.id === "ai-key-form") { e.preventDefault(); saveAiKey(form); return; }
    if (SITE_FORMS.includes(form.id)) {
      e.preventDefault();
      collectSiteForm();
      commit({ render: false });
      saveNow();
      toast(t("toast.siteSaved"), "success");
      return;
    }
  });

  /* --- Tautan tanpa skema ---
     "evkita.com" yang diketik apa adanya berakhir sebagai tautan relatif dan
     tidak bisa dibuka dari situs. Dilengkapi saat field ditinggalkan, bukan
     saat mengetik: menyisipkan "https://" di tengah ketikan membuat kursor
     melompat ke tempat yang tidak diminta. */
  document.addEventListener("focusout", (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('#dir-form input[type="url"]')) return;
    const v = String(el.value || "").trim();
    if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return;
    el.value = "https://" + v.replace(/^\/+/, "");
    updateDirMeter();
  });

  /* --- Fokus pencarian global --- */
  document.addEventListener("focusin", (e) => {
    if (e.target.id === "global-search") {
      e.target.blur();
      openPalette(e.target.value || "");
      e.target.value = "";
    }
  });

  /* --- Seret & lepas: baris daftar, galeri, dropzone --- */
  let dragRow = null;
  let dragGallery = null;

  document.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const row = handle.closest(".item-row");
    if (row && !row.hasAttribute("data-nodrag")) row.setAttribute("draggable", "true");
    else if (row) toast(t("toast.needManualSort"), "info");
  });

  document.addEventListener("dragstart", (e) => {
    const gi = e.target.closest && e.target.closest(".gallery-item");
    if (gi) { dragGallery = Number(gi.getAttribute("data-gi")); e.dataTransfer.effectAllowed = "move"; return; }
    const row = e.target.closest && e.target.closest(".item-row[data-id]");
    if (row && row.getAttribute("draggable") === "true") {
      dragRow = { col: row.getAttribute("data-col"), id: row.getAttribute("data-id") };
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragRow.id); } catch (err) { /* Safari */ }
    }
  });

  document.addEventListener("dragend", (e) => {
    const row = e.target.closest && e.target.closest(".item-row");
    if (row) row.setAttribute("draggable", "false");
    dragRow = null;
    dragGallery = null;
  });

  document.addEventListener("dragover", (e) => {
    if (dragRow) {
      const row = e.target.closest && e.target.closest(".item-row[data-id]");
      if (row && row.getAttribute("data-col") === dragRow.col) e.preventDefault();
      return;
    }
    if (dragGallery !== null) {
      if (e.target.closest && e.target.closest(".gallery-item")) e.preventDefault();
      return;
    }
    const dz = e.target.closest && e.target.closest(".dropzone");
    if (dz) { e.preventDefault(); dz.classList.add("dragover"); }
  });

  document.addEventListener("dragleave", (e) => {
    const dz = e.target.closest && e.target.closest(".dropzone");
    if (dz) dz.classList.remove("dragover");
  });

  document.addEventListener("drop", (e) => {
    if (dragRow) {
      const row = e.target.closest && e.target.closest(".item-row[data-id]");
      if (row) { e.preventDefault(); moveItem(dragRow.col, dragRow.id, row.getAttribute("data-id")); }
      dragRow = null;
      return;
    }
    if (dragGallery !== null) {
      const gi = e.target.closest && e.target.closest(".gallery-item");
      if (gi && vehicleCtx) {
        e.preventDefault();
        const to = Number(gi.getAttribute("data-gi"));
        const arr = vehicleCtx.draft.gallery;
        const [moved] = arr.splice(dragGallery, 1);
        arr.splice(to, 0, moved);
        refreshGallery();
      }
      dragGallery = null;
      return;
    }
    const dz = e.target.closest && e.target.closest(".dropzone");
    if (dz) {
      e.preventDefault();
      dz.classList.remove("dragover");
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) handleUpload(dz, files);
    }
  });

  /* --- Pemilih berkas tersembunyi --- */
  $("__image-picker").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length && filePickerTarget) handleUpload(filePickerTarget, files);
    filePickerTarget = null;
  });

  $("__json-picker").addEventListener("change", (e) => {
    const file = (e.target.files || [])[0];
    if (!file || !jsonPickerHandler) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { jsonPickerHandler(JSON.parse(String(reader.result))); }
      catch (err) { toast(t("toast.invalidJson"), "error"); }
      jsonPickerHandler = null;
    };
    reader.readAsText(file);
  });

  /* --- Dimensi gambar di modal media ---
     Ukuran piksel baru diketahui setelah gambarnya benar-benar termuat, dan itu
     berlaku untuk gambar dari domain mana pun — tidak seperti ukuran berkas. */
  const mediaImage = $("media-image");
  if (mediaImage) {
    mediaImage.addEventListener("load", () => {
      const el = $("media-fact-dim");
      if (!el) return;
      el.textContent = mediaImage.naturalWidth
        ? t("media.pixels", { w: mediaImage.naturalWidth, h: mediaImage.naturalHeight })
        : "—";
    });
    mediaImage.addEventListener("error", () => {
      const el = $("media-fact-dim");
      if (el) el.textContent = "—";
    });
  }

  /* --- Papan ketik --- */
  document.addEventListener("keydown", (e) => {
    /* Combobox lebih dulu: panah, Enter, dan Escape miliknya sendiri. */
    if (comboKeydown(e)) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = String(e.key || "").toLowerCase();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) ||
      (document.activeElement && document.activeElement.isContentEditable);

    // Ctrl/⌘ + Enter menyimpan formulir modal dari mana pun kursornya berada —
    // termasuk dari dalam textarea, tempat Enter biasa berarti baris baru.
    if (mod && key === "enter" && dirCtx && modalStack[modalStack.length - 1] === $("dir-modal")) {
      e.preventDefault();
      saveDir();
      return;
    }
    if (mod && key === "k") { e.preventDefault(); openPalette(""); return; }
    if (mod && key === "s") { e.preventDefault(); saveNow(); return; }
    if (mod && key === "z") {
      e.preventDefault();
      applyHistory(e.shiftKey ? 1 : -1);
      return;
    }
    // Panah berpindah gambar hanya kalau modal media yang paling atas dan
    // kursor tidak sedang berada di dalam kolom teksnya.
    if (mediaCtx && !typing && !mod && modalStack[modalStack.length - 1] === $("media-modal")) {
      if (key === "arrowleft") { e.preventDefault(); mediaStep(-1); return; }
      if (key === "arrowright") { e.preventDefault(); mediaStep(1); return; }
    }

    if (e.key === "Escape") {
      /* Dialog konfirmasi menangkap Escape lebih dulu di fase capture dan
         menghentikan penyebarannya, jadi kalau baris ini tercapai berarti
         tidak ada dialog yang terbuka. Lihat konfirmasi.js. */
      const top = modalStack[modalStack.length - 1];
      if (top) { requestCloseModal(top); return; }
      const app = $("admin-app");
      if (app && app.classList.contains("sidebar-open")) { app.classList.remove("sidebar-open"); return; }
      if (activeView === "editor" && !typing) leaveEditor();
      return;
    }
    if (!typing && !modalStack.length && key === "n" && !mod && !e.altKey) {
      if (COLLECTIONS.includes(activeView)) { e.preventDefault(); openEditor(activeView, null); }
    }
  });

  window.addEventListener("hashchange", () => {
    // Perubahan alamat yang kita picu sendiri sudah dirender duluan.
    if (hashGuard) { hashGuard = false; lastHash = location.hash; return; }

    const target = location.hash;
    const leaving = activeView === "editor" && parseRoute(target).kind !== "editor";
    if (leaving && editorTouched) {
      const back = lastHash;
      confirmDialog({
        title: t("confirm.leaveTitle"),
        text: t("confirm.leaveText"),
        okText: t("common.leave"),
        tone: "warning",
      }).then((ok) => {
        if (!ok) { setHash(back); return; }
        editorTouched = false;
        lastHash = target;
        applyRoute(target);
      });
      return;
    }

    lastHash = target;
    applyRoute(target);
  });

  /* --- Sorotan bagian mengikuti guliran ---
     Dibatasi lewat waktu, bukan requestAnimationFrame: di tab latar belakang
     frame tidak pernah datang, dan penanda "sedang diproses" ala rAF bisa
     tersangkut selamanya sehingga sorotannya mati diam-diam. */
  let spyAt = 0;
  let spyTimer = null;
  const runSpy = () => { spyAt = Date.now(); syncActiveSection(); };
  const onScroll = () => {
    clearTimeout(spyTimer);
    if (Date.now() - spyAt >= 80) runSpy();
    else spyTimer = setTimeout(runSpy, 80);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { syncEditorMetrics(); syncActiveSection(); });

  const bar = $("editor-bar");
  if (bar && "ResizeObserver" in window) new ResizeObserver(syncEditorMetrics).observe(bar);

  window.addEventListener("beforeunload", (e) => {
    if (!dirty && !editorTouched) return;
    e.preventDefault();
    e.returnValue = "";
    return "";
  });
}

/* ------------------------------------------------------------------ *
 * 22. Bootstrap
 * ------------------------------------------------------------------ */

function ensureHiddenInputs() {
  if (!$("__image-picker")) {
    const img = document.createElement("input");
    img.type = "file";
    img.id = "__image-picker";
    img.accept = "image/*";
    img.hidden = true;
    document.body.appendChild(img);
  }
  if (!$("__json-picker")) {
    const js = document.createElement("input");
    js.type = "file";
    js.id = "__json-picker";
    js.accept = "application/json,.json";
    js.hidden = true;
    document.body.appendChild(js);
  }
}


/* ------------------------------------------------------------------ *
 * 23. Akun: pengguna yang login, bahasa, preferensi
 * ------------------------------------------------------------------ */

/** Pengguna yang sedang masuk. Diisi sekali saat init(), lalu dipakai untuk
    sapaan dasbor, penyaringan menu berdasarkan peran, dan halaman Profil. */
let me = null;
let usersList = [];
let activityList = [];

const ROLE_ORDER = ["owner", "admin", "editor"];
const roleLabel = (role) => t(`users.role.${ROLE_ORDER.includes(role) ? role : "editor"}`);
const isAdmin = () => !!me && (me.role === "owner" || me.role === "admin");

async function loadMe() {
  try {
    const res = await fetch("/api/profile");
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    if (data && data.ok) me = data.user;
  } catch {
    /* Panel tetap bisa dipakai tanpa profil; sapaan saja yang jadi umum. */
  }
}

/**
 * Menerapkan preferensi milik pengguna: bahasa, tema, dan kepadatan tampilan.
 *
 * Tema ikut ditulis ke localStorage karena skrip di <head> Base.astro membaca
 * dari sana sebelum halaman digambar — tanpa itu tema pilihan akan berkedip
 * setiap kali halaman dibuka.
 */
function applyUserPrefs() {
  if (!me) return;
  setLocale(me.locale, { save: false, render: false });

  if (me.theme === "light" || me.theme === "dark") {
    document.documentElement.setAttribute("data-theme", me.theme === "dark" ? "dark" : "light");
    if (me.theme === "light") document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("evkita-theme", me.theme); } catch { /* mode privat */ }
  }

  const app = $("admin-app");
  if (app) app.classList.toggle("density-compact", me.density === "compact");
}

/* ---------- Bahasa ---------- */

/**
 * Mengganti bahasa panel tanpa memuat ulang halaman.
 *
 * Teks yang dibuat JavaScript ikut lewat render ulang biasa. Teks yang datang
 * dari server (kerangka /admin) ditandai `data-i18n` di markup-nya, dan
 * applyStaticI18n() menyalakannya kembali dengan kunci yang sama — jadi kedua
 * jalur memakai kamus yang persis sama.
 */
function setLocale(code, opts) {
  const o = Object.assign({ save: true, render: true, toast: false }, opts || {});
  const next = normalizeLocale(code);
  if (next === locale && !o.render) return;

  locale = next;
  t = makeT(locale);

  const meta = localeMeta(locale);
  document.documentElement.setAttribute("lang", meta.html);
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch { /* diabaikan */ }

  applyStaticI18n();
  syncLangSwitch();

  /* Dropzone yang benar-benar kosong menampilkan teksnya lewat CSS `::after`,
     yang tidak bisa membaca kamus. Teksnya dikirim sebagai variabel CSS. */
  document.documentElement.style.setProperty("--dz-text", JSON.stringify(t("upload.dropHere")));

  if (o.render && content) {
    // Bilah alat menyimpan tanda tangan isinya untuk menghindari render ulang
    // yang tidak perlu; ganti bahasa harus menembus cache itu.
    for (const col of COLLECTIONS) {
      const el = $(col + "-toolbar");
      if (el) el.removeAttribute("data-sig");
    }
    renderAll();
    if (activeView === "profile") renderProfile();
    if (activeView === "users") renderUsers();
    if (activeView === "ai") renderAi();
  }

  if (o.save && me) {
    me.locale = locale;
    savePrefs({ silent: true });
  }
  if (o.toast) toast(t("toast.languageChanged"), "success");
}

/** Menerjemahkan ulang markup yang dirender server. */
function applyStaticI18n(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  scope.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
}

function syncLangSwitch() {
  const wrap = $("lang-switch");
  if (!wrap) return;
  wrap.innerHTML = LOCALES.map(
    (l) => `<button type="button" class="lang-opt${l.code === locale ? " active" : ""}" data-lang="${esc(l.code)}" title="${esc(l.label)}" lang="${esc(l.html)}">
      <span class="lang-flag">${esc(l.flag)}</span>
      <span class="lang-short">${esc(l.short)}</span>
      <span class="lang-label">${esc(l.label)}</span>
    </button>`
  ).join("");
  const btn = $("lang-toggle");
  // Bendera saja: tombolnya selebar 38px dan sudah punya aria-label serta
  // judul yang menyebut bahasanya dengan kata-kata.
  if (btn) btn.innerHTML = `<span class="lang-flag">${esc(localeMeta(locale).flag)}</span>`;
}

/* ---------- Menyimpan preferensi ---------- */

async function savePrefs(opts) {
  if (!me) return;
  const o = opts || {};
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "prefs",
        locale: me.locale,
        theme: me.theme,
        density: me.density,
        homeView: me.homeView,
      }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    me = data.user;
    if (!o.silent) toast(t("profile.prefsSaved"), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ------------------------------------------------------------------ *
 * 24. Halaman Profil Saya
 * ------------------------------------------------------------------ */

function avatarHtml(user, size) {
  const cls = "avatar" + (size ? " avatar-" + size : "");
  if (user && user.avatar) return `<span class="${cls}"><img src="${esc(user.avatar)}" alt="" /></span>`;
  return `<span class="${cls}">${esc(initials(user ? user.name || user.username : "?"))}</span>`;
}

function renderProfile() {
  const root = $("profile-root");
  if (!root) return;
  if (!me) { root.innerHTML = `<div class="skeleton"></div>`; return; }

  const homeOptions = ["dashboard", ...COLLECTIONS, "tampilan", "site", "media"]
    .map((v) => `<option value="${esc(v)}"${me.homeView === v ? " selected" : ""}>${esc(t(`nav.${v}`))}</option>`)
    .join("");

  root.innerHTML = `
    <div class="profile-hero">
      <div class="profile-hero-avatar">${avatarHtml(me, "lg")}</div>
      <div class="profile-hero-text">
        <h2>${esc(me.name || me.username)}</h2>
        <p>@${esc(me.username)}${me.email ? ` · ${esc(me.email)}` : ""}</p>
        <div class="profile-hero-meta">
          <span class="badge badge-role badge-role-${esc(me.role)}">${esc(roleLabel(me.role))}</span>
          <span class="row-meta">${esc(t("profile.memberSince", { when: formatDate(me.createdAt) }))}</span>
          ${me.lastLoginAt ? `<span class="row-meta">${esc(t("profile.lastLogin", { when: formatAgo(me.lastLoginAt) }))}</span>` : ""}
        </div>
      </div>
    </div>

    <form id="profile-identity" class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("profile.identity"))}</h2>
        <p>${esc(t("profile.identityDesc"))}</p>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="p-name">${esc(t("profile.name"))}</label>
          <input id="p-name" name="name" value="${esc(me.name)}" placeholder="${esc(t("profile.name.ph"))}" required />
        </div>
        <div class="field">
          <label for="p-username">${esc(t("profile.username"))}</label>
          <input id="p-username" name="username" value="${esc(me.username)}" autocapitalize="none" spellcheck="false" required />
          <span class="hint">${esc(t("profile.username.hint"))}</span>
        </div>
        <div class="field">
          <label for="p-email">${esc(t("profile.email"))}</label>
          <input id="p-email" name="email" type="email" value="${esc(me.email)}" />
        </div>
        <div class="field">
          <label>${esc(t("profile.role"))}</label>
          <input value="${esc(roleLabel(me.role))}" readonly />
          <span class="hint">${esc(t("profile.roleHint"))}</span>
        </div>
        <div class="field full">
          <label>${esc(t("profile.avatar"))}</label>
          <div class="dropzone" data-dropzone data-dzone="__avatar">${imagePreviewHtml(me.avatar, 'data-avatar-del="1"')}</div>
          <input type="hidden" name="avatar" value="${esc(me.avatar)}" />
          <span class="hint">${esc(t("profile.avatar.hint"))}</span>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${esc(t("common.saveChanges"))}</button>
      </div>
    </form>

    <form id="profile-password" class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("profile.security"))}</h2>
        <p>${esc(t("profile.securityDesc"))}</p>
      </div>
      <div class="field-grid">
        <div class="field full">
          <label for="p-cur">${esc(t("profile.currentPassword"))}</label>
          <input id="p-cur" name="currentPassword" type="password" autocomplete="current-password" required />
        </div>
        <div class="field">
          <label for="p-new">${esc(t("profile.newPassword"))}</label>
          <input id="p-new" name="newPassword" type="password" autocomplete="new-password" required />
        </div>
        <div class="field">
          <label for="p-rep">${esc(t("profile.confirmPassword"))}</label>
          <input id="p-rep" name="confirmPassword" type="password" autocomplete="new-password" required />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${esc(t("profile.changePassword"))}</button>
      </div>
      <p class="field-hint">${esc(t("profile.passwordRevokesNote"))}</p>
    </form>

    <section class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("profile.sessions"))}</h2>
        <p>${esc(t("profile.sessionsDesc"))}</p>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" id="profile-signout-others">${esc(t("profile.signOutOthers"))}</button>
      </div>
    </section>

    <form id="profile-prefs" class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("profile.prefs"))}</h2>
        <p>${esc(t("profile.prefsDesc"))}</p>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="p-locale">${esc(t("profile.language"))}</label>
          <select id="p-locale" name="locale">
            ${LOCALES.map((l) => `<option value="${esc(l.code)}"${l.code === me.locale ? " selected" : ""}>${esc(l.flag)} ${esc(l.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="p-theme">${esc(t("profile.theme"))}</label>
          <select id="p-theme" name="theme">
            ${["auto", "light", "dark"].map((v) => `<option value="${esc(v)}"${me.theme === v ? " selected" : ""}>${esc(t(`profile.theme.${v}`))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="p-density">${esc(t("profile.density"))}</label>
          <select id="p-density" name="density">
            ${["comfortable", "compact"].map((v) => `<option value="${esc(v)}"${me.density === v ? " selected" : ""}>${esc(t(`profile.density.${v}`))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="p-home">${esc(t("profile.homeView"))}</label>
          <select id="p-home" name="homeView">${homeOptions}</select>
          <span class="hint">${esc(t("profile.homeView.hint"))}</span>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${esc(t("common.save"))}</button>
      </div>
    </form>`;
}

async function saveProfileIdentity(form) {
  const body = {
    section: "identity",
    name: form.elements.name.value,
    username: form.elements.username.value,
    email: form.elements.email.value,
    avatar: form.elements.avatar.value,
  };
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    me = data.user;
    renderProfile();
    renderDashboard();
    syncAccountChip();
    toast(t("profile.saved"), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function signOutOtherDevices() {
  const setuju = await confirmDialog({
    title: t("profile.signOutOthers"),
    text: t("profile.signOutOthersConfirm"),
    okText: t("profile.signOutOthers"),
    danger: true,
  });
  if (!setuju) return;
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "signOutOthers" }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    toast(t("profile.signedOutOthers"), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function saveProfilePassword(form) {
  const body = {
    section: "password",
    currentPassword: form.elements.currentPassword.value,
    newPassword: form.elements.newPassword.value,
    confirmPassword: form.elements.confirmPassword.value,
  };
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    form.reset();
    toast(t("profile.passwordChanged"), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function saveProfilePrefs(form) {
  if (!me) return;
  me.theme = form.elements.theme.value;
  me.density = form.elements.density.value;
  me.homeView = form.elements.homeView.value;
  const nextLocale = form.elements.locale.value;

  const app = $("admin-app");
  if (app) app.classList.toggle("density-compact", me.density === "compact");
  if (me.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else if (me.theme === "light") document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("evkita-theme", me.theme === "auto" ? "" : me.theme); } catch { /* mode privat */ }

  if (nextLocale !== locale) {
    me.locale = nextLocale;
    setLocale(nextLocale, { save: false });
  }
  savePrefs();
}

/* ------------------------------------------------------------------ *
 * 25. Halaman Pengguna
 * ------------------------------------------------------------------ */

async function loadUsers() {
  const root = $("users-root");
  if (!root) return;
  if (!isAdmin()) {
    root.innerHTML = emptyStateHtml(t("users.forbidden"), "", "🔒");
    return;
  }
  root.innerHTML = `<div class="skeleton"></div>`;
  try {
    const res = await fetch("/api/users");
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.forbidden"));
    usersList = data.users;
    renderUsers();
  } catch (err) {
    root.innerHTML = emptyStateHtml(err.message, "", "⚠️");
  }
}

function renderUsers() {
  const root = $("users-root");
  if (!root || !isAdmin()) return;

  if (!usersList.length) {
    root.innerHTML = emptyStateHtml(t("users.emptyTitle"), t("users.emptyText"), "👥");
    return;
  }

  const order = { owner: 0, admin: 1, editor: 2 };
  const rows = [...usersList].sort((a, b) => (order[a.role] - order[b.role]) || cmpText(a.name, b.name));

  root.innerHTML = `<div class="role-legend">${ROLE_ORDER.map(
    (r) => `<div class="role-legend-item">
      <span class="badge badge-role badge-role-${esc(r)}">${esc(t(`users.role.${r}`))}</span>
      <span class="row-meta">${esc(t(`users.role.${r}.desc`))}</span>
    </div>`
  ).join("")}</div>
  <div class="item-list">${rows
    .map((u) => {
      const isMe = me && u.id === me.id;
      const canEdit = me && (me.role === "owner" || u.role !== "owner");
      return `<div class="item-row user-row">
        <div class="row-thumb row-thumb-avatar">${avatarHtml(u)}</div>
        <div class="row-main">
          <div class="row-title">${esc(u.name || u.username)}${isMe ? ` <span class="row-you">(${esc(t("users.you"))})</span>` : ""}</div>
          <div class="row-meta">@${esc(u.username)}${u.email ? ` · ${esc(u.email)}` : ""} · ${esc(
            u.lastLoginAt ? t("users.lastLogin", { when: formatAgo(u.lastLoginAt) }) : t("users.neverLoggedIn")
          )}</div>
        </div>
        <div class="row-badges"><span class="badge badge-role badge-role-${esc(u.role)}">${esc(roleLabel(u.role))}</span></div>
        <div class="row-actions">
          ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" data-user-edit="${esc(u.id)}">${esc(t("common.edit"))}</button>` : ""}
          ${!isMe && u.role !== "owner" ? `<button type="button" class="btn btn-danger btn-sm" data-user-del="${esc(u.id)}">${esc(t("common.delete"))}</button>` : ""}
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

let userCtx = null; // { id } — null berarti tambah pengguna baru

function openUserModal(id) {
  const user = id ? usersList.find((u) => u.id === id) : null;
  if (id && !user) return;
  userCtx = { id: id || null };

  const title = $("user-modal-title");
  if (title) title.textContent = id ? t("users.modal.edit") : t("users.modal.add");

  // Pemilik hanya boleh diangkat oleh pemilik, jadi pilihannya pun disembunyikan.
  const roles = ROLE_ORDER.filter((r) => r !== "owner" || (me && me.role === "owner"));

  const wrap = $("user-fields");
  if (wrap) {
    wrap.innerHTML = `
      <div class="field">
        <label for="u-name">${esc(t("profile.name"))}</label>
        <input id="u-name" name="name" value="${esc(user ? user.name : "")}" required />
      </div>
      <div class="field">
        <label for="u-username">${esc(t("profile.username"))}</label>
        <input id="u-username" name="username" value="${esc(user ? user.username : "")}" autocapitalize="none" spellcheck="false" required />
      </div>
      <div class="field">
        <label for="u-email">${esc(t("profile.email"))}</label>
        <input id="u-email" name="email" type="email" value="${esc(user ? user.email : "")}" />
      </div>
      <div class="field">
        <label for="u-role">${esc(t("profile.role"))}</label>
        <select id="u-role" name="role">${roles
          .map((r) => {
            // Pengguna baru selalu dimulai sebagai Editor: peran paling kecil
            // adalah bawaan yang aman, bukan peran paling atas di daftar.
            const on = user ? user.role === r : r === "editor";
            return `<option value="${esc(r)}"${on ? " selected" : ""}>${esc(t(`users.role.${r}`))}</option>`;
          })
          .join("")}</select>
      </div>
      <div class="field full">
        <label for="u-password">${esc(user ? t("users.newPassword") : t("users.password"))}</label>
        <input id="u-password" name="password" type="password" autocomplete="new-password"${user ? "" : " required"} />
        <span class="hint">${esc(user ? t("users.password.hintEdit") : t("users.password.hintNew", { n: 8 }))}</span>
      </div>`;
  }

  openModal($("user-modal"));
  const first = document.querySelector("#user-form input");
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
}

async function saveUserForm() {
  const form = $("user-form");
  if (!form || !userCtx) return;

  const body = {
    name: form.elements.name.value,
    username: form.elements.username.value,
    email: form.elements.email.value,
    role: form.elements.role.value,
    password: form.elements.password.value,
  };
  if (userCtx.id) body.id = userCtx.id;

  try {
    const res = await fetch("/api/users", {
      method: userCtx.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    usersList = data.users;
    // Mengubah akun sendiri lewat halaman ini harus ikut memperbarui sapaan.
    if (me && data.user && data.user.id === me.id) { me = Object.assign({}, me, data.user); syncAccountChip(); renderDashboard(); }
    closeModal($("user-modal"));
    renderUsers();
    toast(userCtx.id ? t("users.updated", { name: body.name }) : t("users.created", { name: body.name }), "success");
    userCtx = null;
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteUserById(id) {
  const user = usersList.find((u) => u.id === id);
  if (!user) return;
  const ok = await confirmDialog({
    title: t("users.deleteTitle"),
    text: t("users.deleteText", { name: user.name || user.username }),
    okText: t("common.delete"),
  });
  if (!ok) return;
  try {
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    usersList = data.users;
    renderUsers();
    toast(t("users.deleted", { name: user.name || user.username }), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ------------------------------------------------------------------ *
 * 25b. Halaman Pengaturan AI
 *
 * Kunci DeepSeek dimasukkan di sini, bukan dengan menyunting .env lewat SSH.
 *
 * Yang perlu diingat saat menyentuh berkas ini: halaman ini tidak pernah
 * MENERIMA kuncinya dari server. Endpoint-nya hanya mengembalikan "terpasang
 * atau belum", empat karakter terakhirnya, dan saldonya. Akibatnya kunci tidak
 * pernah ada di DOM dan tidak bisa dibaca ekstensi peramban siapa pun — dan
 * itu hanya bertahan selama tidak ada yang menambahkan field baru ke jawaban
 * endpoint-nya.
 * ------------------------------------------------------------------ */

let aiState = null;
/* Formulir kunci sedang dibuka meski kunci lama masih terpasang ("Ganti kunci"). */
let aiEditing = false;

async function loadAi(opts) {
  const root = $("ai-root");
  if (!root) return;
  if (!aiState) root.innerHTML = `<div class="skeleton"></div>`;

  const url = opts && opts.segar ? "/api/ai/pengaturan?segar=1" : "/api/ai/pengaturan";
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    aiState = data;
  } catch (err) {
    aiState = null;
    root.innerHTML = emptyStateHtml(t("ai.title"), err.message, "⚡");
    return;
  }
  renderAi();
}

/* Empat karakter terakhir saja yang nyata; sisanya titik. Panjang titiknya
   sengaja tetap, bukan sepanjang kunci aslinya — panjang kunci pun bukan
   sesuatu yang perlu ikut ditampilkan. */
function aiKeyMask(tail) {
  return "sk-" + "•".repeat(24) + String(tail || "");
}

function aiBalanceHtml() {
  const saldo = aiState.saldo;
  const refresh = `<div class="form-actions">
      <button type="button" class="btn btn-outline btn-sm" id="ai-balance-refresh">${esc(t("ai.balance.refresh"))}</button>
    </div>`;

  if (!saldo) {
    return `<section class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("ai.balance.title"))}</h2>
        <p>${esc(aiState.saldoErrorKey ? t(aiState.saldoErrorKey) : t("ai.balance.unreadable"))}</p>
      </div>
      ${refresh}
    </section>`;
  }

  const rows = (saldo.baris || [])
    .map(
      (b) => `<dl class="ai-balance">
        <div><dt>${esc(t("ai.balance.total"))}</dt><dd>${esc(b.total)} ${esc(b.mataUang)}</dd></div>
        <div><dt>${esc(t("ai.balance.granted"))}</dt><dd>${esc(b.hadiah)} ${esc(b.mataUang)}</dd></div>
        <div><dt>${esc(t("ai.balance.toppedUp"))}</dt><dd>${esc(b.isiUlang)} ${esc(b.mataUang)}</dd></div>
      </dl>`
    )
    .join("");

  const habis = saldo.tersedia ? "" : `<p class="ai-note ai-note-warn">${esc(t("ai.balance.empty"))}</p>`;

  return `<section class="panel form-section">
    <div class="form-section-head">
      <h2>${esc(t("ai.balance.title"))}</h2>
      <p>${esc(t("ai.balance.checked", { when: formatAgo(aiState.diperiksaPada) }))}</p>
    </div>
    ${rows}
    ${habis}
    ${refresh}
  </section>`;
}

/**
 * Pemilih model bawaan, beserta harganya.
 *
 * Harga dihitung dari tarif yang berlaku SAAT INI, bukan konstanta: selisih
 * jam sibuk dan jam sepi adalah dua kali lipat, dan jam sibuk DeepSeek jatuh
 * persis di jam kerja Indonesia. Angka yang tidak menyebut itu akan salah
 * separuh waktu.
 */
function aiModelHtml() {
  const sekarang = new Date();
  const pilihan = (aiState.pilihanModel || MODEL_PILIHAN)
    .map((id) => {
      const { rupiah } = perkiraanBiaya("lengkap", id, sekarang);
      return `<label class="ai-pick${aiState.model === id ? " active" : ""}">
        <input type="radio" name="ai-default-model" value="${esc(id)}"${aiState.model === id ? " checked" : ""} />
        <span class="ai-pick-main"><strong>${esc(id)}</strong><span>${esc(t(`ai.model.${id}`))}</span></span>
        <span class="ai-pick-cost">${esc(t("ai.perRiset", { rp: formatRupiahKecil(rupiah) }))}</span>
      </label>`;
    })
    .join("");

  return `<section class="panel form-section">
    <div class="form-section-head">
      <h2>${esc(t("ai.modelTitle"))}</h2>
      <p>${esc(t("ai.model.desc"))}</p>
    </div>
    <div class="ai-picks">${pilihan}</div>
    <p class="hint">${esc(jamSibuk(sekarang) ? t("ai.tarifSibuk") : t("ai.tarifSepi"))}</p>
  </section>`;
}

function aiKeyFormHtml() {
  return `<form id="ai-key-form" autocomplete="off">
    <div class="field-grid">
      <div class="field full">
        <label for="ai-key">${esc(t("ai.key.label"))}</label>
        <input
          id="ai-key"
          name="apiKey"
          type="password"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="none"
          placeholder="sk-…"
          required
        />
        <span class="hint">${esc(t("ai.key.hint"))}</span>
      </div>
    </div>
    <div class="form-actions">
      ${aiState.terpasang ? `<button type="button" class="btn btn-ghost" id="ai-key-cancel">${esc(t("common.cancel"))}</button>` : ""}
      <button type="submit" class="btn btn-primary" id="ai-key-save">${esc(t("ai.key.save"))}</button>
    </div>
  </form>`;
}

function renderAi() {
  const root = $("ai-root");
  if (!root || !aiState) return;

  const terpasang = !!aiState.terpasang;
  const showForm = !terpasang || aiEditing;

  root.innerHTML = `
    <section class="panel form-section">
      <div class="form-section-head">
        <h2>${esc(t("ai.key.title"))}</h2>
        <p>${esc(t("ai.key.desc"))}</p>
      </div>
      <div class="ai-key-state">
        <span class="badge ${terpasang ? "badge-ok" : "badge-muted"}">${esc(terpasang ? t("ai.state.on") : t("ai.state.off"))}</span>
        ${terpasang ? `<code class="ai-key-mask">${esc(aiKeyMask(aiState.ekor))}</code>` : ""}
      </div>
      ${showForm
        ? aiKeyFormHtml()
        : `<div class="form-actions">
            <button type="button" class="btn btn-outline" id="ai-key-change">${esc(t("ai.key.change"))}</button>
            <button type="button" class="btn btn-danger" id="ai-key-remove">${esc(t("ai.key.remove"))}</button>
          </div>`}
    </section>
    ${terpasang ? aiModelHtml() : ""}
    ${terpasang ? aiBalanceHtml() : ""}`;

  if (showForm) {
    const input = $("ai-key");
    if (input && aiEditing) setTimeout(() => input.focus(), 40);
  }
}

async function saveAiKey(form) {
  const apiKey = String(form.elements.apiKey.value || "").trim();
  if (!apiKey) return;

  const btn = $("ai-key-save");
  if (btn) {
    btn.disabled = true;
    btn.textContent = t("ai.key.testing");
  }

  try {
    const res = await fetch("/api/ai/pengaturan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    // Nilai di field dibuang lebih dulu, baru markup-nya diganti: menggambar
    // ulang saja meninggalkan kuncinya di objek form lama sampai GC berjalan.
    form.reset();
    aiState = data;
    aiEditing = false;
    // Tombol Riset di editor membaca `aiSiap`. Tanpa baris ini, kunci yang
    // baru saja terbukti sah tetap tidak memunculkan tombolnya.
    aiSiap = !!data.terpasang;
    if (data.model) aiModelBawaan = data.model;
    renderAi();
    toast(t("ai.saved"), "success");
  } catch (err) {
    // Ketikannya sengaja TIDAK dihapus: kunci yang ditolak biasanya kurang satu
    // karakter, dan menyuruh orang menempel ulang dari awal tidak menolong.
    if (btn) {
      btn.disabled = false;
      btn.textContent = t("ai.key.save");
    }
    toast(err.message, "error");
  }
}

async function simpanModelBawaan(model) {
  try {
    const res = await fetch("/api/ai/pengaturan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    aiState = data;
    aiModelBawaan = data.model;
    renderAi();
    toast(t("ai.modelSaved", { model }), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function removeAiKey() {
  const setuju = await confirmDialog({
    title: t("ai.remove.title"),
    text: t("ai.remove.text"),
    okText: t("ai.key.remove"),
    danger: true,
  });
  if (!setuju) return;

  try {
    const res = await fetch("/api/ai/pengaturan", { method: "DELETE" });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));
    aiState = data;
    aiEditing = false;
    aiSiap = false;
    renderAi();
    toast(t("ai.removed"), "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ------------------------------------------------------------------ *
 * 25c. Riset AI di editor kendaraan
 *
 * Satu modal, tiga keadaan berurutan:
 *
 *   setup → jalan → hasil
 *
 * Yang paling penting ada di ujungnya: "Terapkan" hanya MENGISI FORMULIR.
 * Ia tidak menyimpan apa pun. Sesudah itu penyunting melihat form seperti
 * biasa, masih bisa mengubah, dan menekan Simpan sendiri — jalur simpan yang
 * sudah ada tetap satu-satunya jalan menuju content.json, lengkap dengan
 * validasi, pemeriksaan tabrakan revisi, dan cadangan otomatisnya.
 * ------------------------------------------------------------------ */

/* Jeda antar tanya-kabar ke server. Bukan SSE: produksi ada di balik reverse
   proxy OpenLiteSpeed, yang mem-buffer aliran peristiwa sampai selesai —
   panel progres yang muncul sekaligus di akhir sama saja dengan tidak ada. */
const AI_POLL_MS = 900;

let aiCtx = null;
let aiTimer = null;

/* Apakah kunci DeepSeek sudah terpasang, dan model bawaan mana yang dipakai.
   Dibaca sekali saat panel dimuat: tombol Riset tidak ditampilkan sama sekali
   kalau kuncinya belum ada — tombol yang selalu menjawab "belum ada kunci"
   lebih buruk daripada tombol yang tidak ada. */
let aiSiap = false;
let aiModelBawaan = MODEL_BAWAAN;

/** Menyalakan atau mematikan tombol Riset menurut catatan `aiSiap` saat ini. */
function syncAiButton() {
  const btn = $("ai-open");
  if (btn) btn.hidden = !aiSiap;
}

async function muatKeadaanAi() {
  try {
    const res = await fetch("/api/ai/riset");
    const data = await res.json();
    if (!data || !data.ok) return;
    aiSiap = !!data.siap;
    if (data.modelBawaan) aiModelBawaan = data.modelBawaan;
  } catch {
    // Editor tetap bisa dipakai tanpa riset AI.
  }
}

const AI_MODES = () => [
  { k: "lengkap", l: t("ai.mode.lengkap"), d: t("ai.mode.lengkap.d") },
  { k: "lengkapi", l: t("ai.mode.lengkapi"), d: t("ai.mode.lengkapi.d") },
  { k: "harga", l: t("ai.mode.harga"), d: t("ai.mode.harga.d") },
];

function aiModal() {
  return $("ai-modal");
}

function stopAiPoll() {
  if (aiTimer) clearInterval(aiTimer);
  aiTimer = null;
}

async function openAiModal() {
  if (!vehicleCtx) return;

  const form = $("vehicle-form");
  const brand = String((form.elements.brand && form.elements.brand.value) || "").trim();
  const name = String((form.elements.name && form.elements.name.value) || "").trim();
  if (!brand || !name) {
    toast(t("ai.perluMerekNama"), "error");
    return;
  }

  aiCtx = {
    fase: "setup",
    brand,
    name,
    // Kendaraan baru belum punya field terisi, jadi "lengkapi yang kosong"
    // tidak berarti apa-apa untuknya.
    mode: vehicleCtx.id ? "lengkapi" : "lengkap",
    model: aiModelBawaan,
    hint: "",
    jobId: null,
    job: null,
    kuota: null,
    pilih: new Set(),
  };

  openModal(aiModal());
  renderAiModal();

  try {
    const res = await fetch("/api/ai/riset");
    const data = await res.json();
    if (!data || !data.ok) return;
    aiCtx.kuota = data.kuota;
    sambungJobLama(data.terakhir);
    renderAiModal();
  } catch { /* kuota cuma pemanis; tanpa itu tombolnya tetap bisa ditekan */ }
}

/**
 * Menyambung ulang ke riset yang sudah ada di server.
 *
 * Menutup kotak riset dulu berarti kehilangan hasilnya: id job-nya hanya hidup
 * di dalam kotak itu, jadi membukanya lagi selalu mulai dari layar persiapan
 * seolah tidak pernah ada riset — padahal di server hasilnya ada dan sudah
 * dibayar. Sekarang job hidup di server dan panel yang bertanya.
 *
 * Hanya untuk kendaraan yang SAMA. Hasil riset Ioniq 5 yang tiba-tiba muncul
 * saat membuka editor Atto 1 lebih membingungkan daripada berguna.
 */
function sambungJobLama(job) {
  if (!job || !aiCtx) return;
  const sama = vehicleCtx.id ? job.vehicleId === vehicleCtx.id : job.judul === `${aiCtx.brand} ${aiCtx.name}`.trim();
  if (!sama) return;

  aiCtx.jobId = job.id;
  aiCtx.job = job;
  aiCtx.model = job.model || aiCtx.model;
  aiCtx.mode = job.mode || aiCtx.mode;

  if (job.status === "jalan") {
    aiCtx.fase = "jalan";
    stopAiPoll();
    aiTimer = setInterval(pollAiRiset, AI_POLL_MS);
    return;
  }
  if (job.status === "selesai" && job.hasil) {
    aiCtx.pilih = new Set((job.hasil.usulan || []).filter((u) => u.pilih).map((u) => u.key));
    aiCtx.fase = "hasil";
    return;
  }
  if (job.status === "gagal") {
    aiCtx.fase = "gagal";
  }
}

function closeAiModal() {
  stopAiPoll();
  aiCtx = null;
  closeModal(aiModal());
}

/* ---------- Menggambar ---------- */

function aiBiayaTeks(mode, model) {
  const { rupiah } = perkiraanBiaya(mode, model, new Date());
  return t("ai.perkiraanBiaya", { rp: formatRupiahKecil(rupiah) });
}

function renderAiModal() {
  if (!aiCtx) return;
  const judul = $("ai-modal-title");
  const sub = $("ai-modal-sub");
  const body = $("ai-modal-body");
  const foot = $("ai-modal-foot");
  if (!judul || !body || !foot) return;

  judul.textContent = t("ai.research");
  sub.textContent = `${aiCtx.brand} ${aiCtx.name}`.trim();

  if (aiCtx.fase === "setup") {
    body.innerHTML = aiSetupHtml();
    foot.innerHTML = `<button type="button" class="btn btn-ghost" data-close-modal>${esc(t("common.cancel"))}</button>
      <button type="button" class="btn btn-primary" id="ai-start">${esc(t("ai.start"))}</button>`;
    return;
  }

  if (aiCtx.fase === "jalan") {
    body.innerHTML = aiProgresHtml();
    foot.innerHTML = `<p class="modal-foot-hint">${esc(t("ai.jalanHint"))}</p>
      <button type="button" class="btn btn-outline" id="ai-cancel">${esc(t("ai.batalkan"))}</button>`;
    return;
  }

  if (aiCtx.fase === "gagal") {
    body.innerHTML = aiGagalHtml();
    foot.innerHTML = `<button type="button" class="btn btn-ghost" data-close-modal>${esc(t("common.close"))}</button>
      <button type="button" class="btn btn-primary" id="ai-retry">${esc(t("ai.cobaLagi"))}</button>`;
    return;
  }

  body.innerHTML = aiHasilHtml();
  const jumlah = aiCtx.pilih.size;
  foot.innerHTML = `<button type="button" class="btn btn-ghost" data-close-modal>${esc(t("common.close"))}</button>
    <button type="button" class="btn btn-primary" id="ai-apply"${jumlah ? "" : " disabled"}>${esc(t("ai.terapkan", { n: jumlah }))}</button>`;
}

function aiSetupHtml() {
  const modes = AI_MODES()
    .map((m) => {
      // "Lengkapi yang kosong" tidak berlaku untuk kendaraan yang belum ada.
      if (m.k === "lengkapi" && !vehicleCtx.id) return "";
      return `<label class="ai-pick${aiCtx.mode === m.k ? " active" : ""}">
        <input type="radio" name="ai-mode" value="${esc(m.k)}"${aiCtx.mode === m.k ? " checked" : ""} />
        <span class="ai-pick-main"><strong>${esc(m.l)}</strong><span>${esc(m.d)}</span></span>
      </label>`;
    })
    .join("");

  const models = MODEL_PILIHAN.map((id) => {
    const { rupiah } = perkiraanBiaya(aiCtx.mode, id, new Date());
    return `<label class="ai-pick${aiCtx.model === id ? " active" : ""}">
      <input type="radio" name="ai-model" value="${esc(id)}"${aiCtx.model === id ? " checked" : ""} />
      <span class="ai-pick-main"><strong>${esc(id)}</strong><span>${esc(t(`ai.model.${id}`))}</span></span>
      <span class="ai-pick-cost">${esc(formatRupiahKecil(rupiah))}</span>
    </label>`;
  }).join("");

  const kuota = aiCtx.kuota
    ? `<p class="hint">${esc(t("ai.kuotaSisa", { sisa: Math.max(0, aiCtx.kuota.batas - aiCtx.kuota.terpakai), batas: aiCtx.kuota.batas }))}</p>`
    : "";

  return `<div class="ai-setup">
    <div class="ai-group">
      <h4>${esc(t("ai.modeTitle"))}</h4>
      <div class="ai-picks">${modes}</div>
    </div>
    <div class="ai-group">
      <h4>${esc(t("ai.modelTitle"))}</h4>
      <div class="ai-picks">${models}</div>
      <p class="hint">${esc(jamSibuk(new Date()) ? t("ai.tarifSibuk") : t("ai.tarifSepi"))}</p>
    </div>
    <div class="field full">
      <label for="ai-hint">${esc(t("ai.hint"))}</label>
      <input type="text" id="ai-hint" value="${esc(aiCtx.hint)}" placeholder="${esc(t("ai.hint.ph"))}" />
      <span class="hint">${esc(t("ai.hint.desc"))}</span>
    </div>
    ${kuota}
  </div>`;
}

const AI_IKON = {
  mulai: "◆",
  pikir: "◇",
  cari: "○",
  buka: "▸",
  susun: "◈",
};

function aiProgresHtml() {
  const job = aiCtx.job;
  const langkah = (job && job.langkah) || [];

  const baris = langkah.length
    ? langkah
        .map((l) => `<li class="ai-step ai-step-${esc(l.status)}">
            <span class="ai-step-icon" aria-hidden="true">${esc(AI_IKON[l.jenis] || "•")}</span>
            <span class="ai-step-body">
              <span class="ai-step-label">${esc(t(`ai.step.${l.jenis}`))}</span>
              ${l.teks ? `<span class="ai-step-text">${esc(l.teks)}</span>` : ""}
            </span>
          </li>`)
        .join("")
    : `<li class="ai-step ai-step-jalan"><span class="ai-step-icon" aria-hidden="true">◆</span>
        <span class="ai-step-body"><span class="ai-step-label">${esc(t("ai.step.mulai"))}</span></span></li>`;

  const cari = langkah.filter((l) => l.jenis === "cari").length;
  const buka = langkah.filter((l) => l.jenis === "buka").length;

  return `<div class="ai-progres">
    <ul class="ai-steps">${baris}</ul>
    <p class="ai-progres-meta">${esc(t("ai.progresMeta", { cari, buka }))}</p>
  </div>`;
}

/**
 * Layar kegagalan.
 *
 * Versi pertama mengembalikan modal ke layar persiapan dan menaruh alasannya di
 * toast — yang hilang sendiri beberapa detik kemudian. Riset yang gagal setelah
 * satu menit lalu tidak meninggalkan jejak apa pun adalah hal yang paling
 * membuat orang berhenti memercayai sebuah fitur.
 *
 * Karena itu layar ini menahan tiga hal sekaligus: alasannya, sejauh mana AI
 * sempat berjalan sebelum berhenti, dan — kalau ada — kalimat asli dari
 * DeepSeek yang menyebut persis apa yang ditolak.
 */
function aiGagalHtml() {
  const job = aiCtx.job || {};
  const pesan = job.errorKey ? t(job.errorKey) : t("err.ai.deepseekBermasalah");

  const langkah = job.langkah || [];
  const sejauhIni = langkah.length
    ? `<div class="ai-group">
        <h4>${esc(t("ai.sejauhIni"))}</h4>
        ${aiProgresHtml()}
      </div>`
    : "";

  // Pesan dari DeepSeek ditampilkan sebagai teks apa adanya di blok monospace:
  // ia ditujukan untuk ditelusuri, bukan dibaca sebagai kalimat panel.
  // "Jawaban mentah" kalau modelnya sempat menjawab, "pesan dari DeepSeek"
  // kalau permintaannya sendiri yang ditolak. Dua hal berbeda, dan menyebutnya
  // dengan nama yang sama membuat penelusurannya berputar-putar.
  const judulDetail = job.errorKey === "err.ai.jawabanTidakTerbaca" ? t("ai.jawabanMentah") : t("ai.gagalDetail");
  const detail = job.detail
    ? `<div class="ai-group">
        <h4>${esc(judulDetail)}</h4>
        <pre class="ai-detail">${esc(job.detail)}</pre>
      </div>`
    : "";

  return `<div class="ai-gagal">
    <p class="ai-gagal-pesan">${esc(pesan)}</p>
    ${detail}
    ${sejauhIni}
  </div>`;
}

function aiNilaiTeks(key, nilai) {
  if (nilai === null || nilai === undefined || nilai === "") return "—";
  if (Array.isArray(nilai)) return nilai.join(", ");
  if (key === "price") return formatRupiah(nilai);
  return String(nilai);
}

function aiHasilHtml() {
  const job = aiCtx.job;
  const hasil = job && job.hasil;

  if (!hasil || !hasil.usulan.length) {
    return `<div class="ai-kosong">${emptyStateHtml(t("ai.kosongTitle"), t("ai.kosongText"), "🔍")}</div>`;
  }

  const baris = hasil.usulan
    .map((u) => {
      const dipilih = aiCtx.pilih.has(u.key);
      // Alamat sumber sudah lewat safeUrl di server. Ia tetap dipasang dengan
      // rel="noopener noreferrer" — halaman yang dibuka AI bukan halaman yang
      // pernah kita periksa.
      const sumber = u.sumber
        ? `<a class="ai-src" href="${esc(u.sumber)}" target="_blank" rel="noopener noreferrer">${esc(aiHost(u.sumber))}</a>`
        : `<span class="ai-src ai-src-none">${esc(t("ai.tanpaSumber"))}</span>`;

      return `<label class="ai-row${dipilih ? " picked" : ""}">
        <input type="checkbox" data-ai-pick="${esc(u.key)}"${dipilih ? " checked" : ""} />
        <span class="ai-row-key">${esc(aiLabelField(u.key))}</span>
        <span class="ai-row-now">${esc(aiNilaiTeks(u.key, u.sekarang))}</span>
        <span class="ai-row-arrow" aria-hidden="true">→</span>
        <span class="ai-row-new">${esc(aiNilaiTeks(u.key, u.nilai))}</span>
        <span class="ai-conf ai-conf-${esc(u.keyakinan)}" title="${esc(u.catatan)}">${esc(t(`ai.conf.${u.keyakinan}`))}</span>
        ${sumber}
      </label>`;
    })
    .join("");

  const peringatan = hasil.peringatan.length
    ? `<div class="ai-warn">
        <strong>${esc(t("ai.peringatan"))}</strong>
        <ul>${hasil.peringatan.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>`
    : "";

  const biaya = job.biaya
    ? `<p class="ai-biaya">${esc(t("ai.biayaNyata", { rp: formatRupiahKecil(job.biaya.rupiah) }))}</p>`
    : "";

  const duaLangkah = job.duaLangkah
    ? `<p class="ai-biaya">${esc(t("ai.duaLangkah"))}</p>`
    : "";

  return `<div class="ai-hasil">
    ${hasil.ringkasan ? `<p class="ai-ringkasan">${esc(hasil.ringkasan)}</p>` : ""}
    <div class="ai-tools">
      <button type="button" class="btn btn-outline btn-sm" id="ai-pick-empty">${esc(t("ai.pilihKosong"))}</button>
      <button type="button" class="btn btn-outline btn-sm" id="ai-pick-none">${esc(t("ai.bersihkan"))}</button>
    </div>
    <div class="ai-rows">${baris}</div>
    ${peringatan}
    ${duaLangkah}
    ${biaya}
  </div>`;
}

/* Nama host saja: alamat penuh dari halaman yang dibuka AI bisa sangat panjang
   dan tidak menambah apa pun pada keputusan "sumber ini bisa dipercaya?". */
function aiHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* Label field memakai kamus yang sama dengan formulirnya, supaya baris usulan
   dan baris form menyebut hal yang sama dengan kata yang sama. */
function aiLabelField(key) {
  const defs = vehicleCtx ? vehicleCtx.defs : null;
  if (defs) {
    for (const pane of ["dasar", "spesifikasi"]) {
      const d = (defs[pane] || []).find((x) => x.k === key);
      if (d) return d.l;
    }
  }
  if (key === "variantNames") return t("editor.section.varian");
  if (key === "colors") return t("editor.colorsTitle");
  return key;
}

/* ---------- Menjalankan ---------- */

async function startAiRiset() {
  if (!aiCtx || !vehicleCtx) return;

  const hintInput = $("ai-hint");
  if (hintInput) aiCtx.hint = String(hintInput.value || "").trim();

  aiCtx.fase = "jalan";
  aiCtx.job = null;
  renderAiModal();

  try {
    const res = await fetch("/api/ai/riset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        col: vehicleCtx.col,
        vehicleId: vehicleCtx.id,
        brand: aiCtx.brand,
        name: aiCtx.name,
        mode: aiCtx.mode,
        model: aiCtx.model,
        hint: aiCtx.hint,
      }),
    });
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.badJson"));

    aiCtx.jobId = data.job.id;
    aiCtx.job = data.job;
    aiCtx.kuota = data.kuota;
    renderAiModal();

    stopAiPoll();
    aiTimer = setInterval(pollAiRiset, AI_POLL_MS);
  } catch (err) {
    // Gagal sebelum job sempat dibuat — mis. kuota habis, atau kunci dicabut.
    // Alasannya tetap ditahan di layar, bukan dititipkan ke toast.
    aiCtx.fase = "gagal";
    aiCtx.job = { errorKey: "", detail: err.message, langkah: [] };
    renderAiModal();
  }
}

async function pollAiRiset() {
  if (!aiCtx || !aiCtx.jobId) return stopAiPoll();

  let data;
  try {
    const res = await fetch(`/api/ai/riset?id=${encodeURIComponent(aiCtx.jobId)}`);
    data = await res.json();
  } catch {
    // Satu permintaan yang gagal bukan alasan membuang risetnya — jaringan
    // panel bisa tersendat sementara server terus bekerja.
    return;
  }

  /*
   * SELURUH sisanya dibungkus try/catch, dan itu bukan kehati-hatian berlebih.
   *
   * Fungsi ini dipanggil `setInterval`. Pengecualian apa pun di dalamnya jadi
   * penolakan janji yang tidak tertangkap — tidak muncul di mana pun, tidak
   * menghentikan apa pun, dan meninggalkan kotak riset membeku selamanya di
   * layar progres yang semua langkahnya sudah bertanda selesai. Persis itu yang
   * terjadi ketika satu baris di bawah membaca `hasil.usulan` pada `hasil` yang
   * kosong: riset selesai, tapi hasilnya tidak pernah muncul dan tidak ada
   * satu pun petunjuk kenapa.
   */
  try {
    if (!data || !data.ok) {
      stopAiPoll();
      aiCtx.fase = "gagal";
      aiCtx.job = { errorKey: data && data.errorKey ? data.errorKey : "err.ai.jobHilang", detail: "", langkah: (aiCtx.job && aiCtx.job.langkah) || [] };
      renderAiModal();
      return;
    }

    aiCtx.job = data.job;
    aiCtx.kuota = data.kuota;

    if (data.job.status === "jalan") {
      renderAiModal();
      return;
    }

    stopAiPoll();

    // Dibatalkan sendiri oleh penyunting: itu bukan kegagalan, dan mereka sudah
    // tahu alasannya.
    if (data.job.status === "batal") {
      aiCtx.fase = "setup";
      renderAiModal();
      toast(t("ai.dibatalkan"), "info");
      return;
    }

    // "Selesai" tanpa hasil seharusnya mustahil — tapi "seharusnya mustahil"
    // adalah keadaan yang paling mahal kalau ia tetap terjadi, karena tidak ada
    // yang menanganinya. Diperlakukan sebagai kegagalan yang bisa dibaca.
    if (data.job.status !== "selesai" || !data.job.hasil) {
      aiCtx.fase = "gagal";
      renderAiModal();
      return;
    }

    // Centang awal datang dari server: ia yang tahu field mana yang benar-benar
    // masih kosong di disk.
    const usulan = data.job.hasil.usulan || [];
    aiCtx.pilih = new Set(usulan.filter((u) => u.pilih).map((u) => u.key));
    aiCtx.fase = "hasil";
    renderAiModal();
  } catch (err) {
    stopAiPoll();
    aiCtx.fase = "gagal";
    aiCtx.job = { errorKey: "", detail: String((err && err.message) || err), langkah: (aiCtx.job && aiCtx.job.langkah) || [] };
    renderAiModal();
  }
}

async function batalkanAiRiset() {
  if (!aiCtx || !aiCtx.jobId) return;
  stopAiPoll();
  try {
    await fetch(`/api/ai/riset?id=${encodeURIComponent(aiCtx.jobId)}`, { method: "DELETE" });
  } catch { /* kalau gagal, batas waktu di server yang menghentikannya */ }
  aiCtx.fase = "setup";
  renderAiModal();
  toast(t("ai.dibatalkan"), "info");
}

/* ---------- Menerapkan ---------- */

/* Mengisi ulang satu repeater (varian / warna) dari daftar nilai. */
function setRepeater(name, values, kind) {
  const form = $("vehicle-form");
  const body = form.querySelector(`[data-rep="${CSS.escape(name)}"] [data-rep-body]`);
  if (!body) return;
  body.innerHTML = (values || []).map((v, i) => repeaterRowHtml(name, v, kind, i)).join("");
}

function applyAiUsulan() {
  if (!aiCtx || !aiCtx.job || !aiCtx.job.hasil) return;
  const form = $("vehicle-form");
  if (!form) return;

  const dipakai = (aiCtx.job.hasil.usulan || []).filter((u) => aiCtx.pilih.has(u.key));
  if (!dipakai.length) return;

  for (const u of dipakai) {
    if (u.key === "variantNames") { setRepeater("variantNames", u.nilai, "text"); continue; }
    if (u.key === "colors") { setRepeater("colors", u.nilai, "color"); continue; }

    const el = form.elements[u.key];
    if (!el) continue;
    el.value = Array.isArray(u.nilai) ? u.nilai.join(", ") : String(u.nilai);
  }

  /*
   * `editorTouched` saja, TANPA `markDirty()` — persis seperti yang terjadi
   * saat seseorang mengetik nilainya sendiri.
   *
   * `markDirty()` menandai DOKUMEN sebagai belum tersimpan, dan dokumennya
   * memang belum berubah: usulan baru masuk ke formulir, bukan ke `content`.
   * Menyalakannya di sini membuat bilah atas berbunyi "belum tersimpan" untuk
   * perubahan yang tidak ada, dan membuat menerapkan usulan terasa berbeda
   * dari mengetik nilai yang sama.
   */
  editorTouched = true;
  updateVehiclePreview();

  const label = dipakai.map((u) => aiLabelField(u.key)).join(", ");
  closeAiModal();
  // Sengaja BUKAN saveNow(): usulan yang diterapkan baru mengisi formulir.
  // Penyunting yang memutuskan kapan ia tersimpan.
  toast(t("ai.diterapkan", { n: dipakai.length, daftar: label }), "success");
}

/* ------------------------------------------------------------------ *
 * 26. Sapaan dasbor, skor kelengkapan, dan log aktivitas
 * ------------------------------------------------------------------ */

/** Sapaan mengikuti jam setempat, bukan jam server. */
function greetingKey() {
  const h = new Date().getHours();
  if (h < 5) return "dash.hello.night";
  if (h < 11) return "dash.hello.morning";
  if (h < 15) return "dash.hello.afternoon";
  if (h < 19) return "dash.hello.evening";
  return "dash.hello.night";
}

const QUICK_ACTIONS = [
  { key: "dash.quick.addCar", add: "cars", icon: "M5 17h14M4 17v-4.2a2 2 0 0 1 .2-.9l2-4A2 2 0 0 1 8 6.8h8a2 2 0 0 1 1.8 1.1l2 4a2 2 0 0 1 .2.9V17M4 13h16" },
  { key: "dash.quick.addMotor", add: "motors", icon: "M8 17h6l3-6h-4l-2-3H8M14 8h3" },
  { key: "dash.quick.addBerita", add: "berita", icon: "M4 5h12a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5ZM7 9h6M7 13h6" },
  { key: "dash.quick.site", view: "site", icon: "M10.3 4.3a1.7 1.7 0 0 1 3.4 0l.1.6 1.6.9.6-.2a1.7 1.7 0 0 1 1.9 2.6l-.4.5.6 1.7.6.3a1.7 1.7 0 0 1 0 3l-.6.3-.6 1.7.4.5a1.7 1.7 0 0 1-1.9 2.6l-.6-.2-1.6.9-.1.6a1.7 1.7 0 0 1-3.4 0l-.1-.6-1.6-.9-.6.2a1.7 1.7 0 0 1-1.9-2.6l.4-.5-.6-1.7-.6-.3a1.7 1.7 0 0 1 0-3l.6-.3.6-1.7-.4-.5a1.7 1.7 0 0 1 1.9-2.6l.6.2 1.6-.9ZM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" },
];

function renderDashHello() {
  const el = $("dash-hello");
  if (!el) return;

  const name = me ? (me.name || me.username).split(/\s+/)[0] : "";
  const vehicles = allVehicles();
  const brands = new Set(vehicles.map((v) => (v.brand || "").trim()).filter(Boolean));
  const issues = healthIssues().length;

  const subKey = !vehicles.length
    ? "dash.hello.sub.empty"
    : issues
      ? "dash.hello.sub.issues"
      : "dash.hello.sub.clean";

  const total = COLLECTIONS.reduce((n, c) => n + (content[c] || []).length, 0);
  const done = Math.max(0, total - issues);
  const pct = total ? Math.round((done / total) * 100) : 100;

  const actions = QUICK_ACTIONS.map(
    (a) => `<button type="button" class="quick-action"${a.add ? ` data-add="${esc(a.add)}"` : ` data-goto="${esc(a.view)}"`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${a.icon}"/></svg>
      <span>${esc(t(a.key))}</span>
    </button>`
  ).join("");

  el.innerHTML = `<section class="hello-card">
    <div class="hello-main">
      <div class="hello-avatar">${avatarHtml(me, "lg")}</div>
      <div class="hello-text">
        <p class="hello-eyebrow">${esc(
          me && me.previousLoginAt
            ? t("dash.hello.lastLogin", { when: formatAgo(me.previousLoginAt) })
            : t("dash.hello.firstLogin")
        )}</p>
        <h2 class="hello-title">${esc(t(greetingKey(), { name: name || t("topbar.account") }))}</h2>
        <p class="hello-sub">${esc(t(subKey, { issues, vehicles: vehicles.length, brands: brands.size }))}</p>
      </div>
      <div class="hello-score" role="img" aria-label="${esc(t("dash.score.title"))}: ${pct}%">
        <div class="score-ring" style="--pct:${pct}"><span>${pct}%</span></div>
        <div class="score-text">
          <strong>${esc(t("dash.score.title"))}</strong>
          <span class="row-meta">${esc(total ? t("dash.score.summary", { done, total }) : t("dash.score.perfect"))}</span>
        </div>
      </div>
    </div>
    <div class="hello-actions">
      <span class="hello-actions-label">${esc(t("dash.quick.title"))}</span>
      ${actions}
      <a class="quick-action quick-action-link" href="/" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        <span>${esc(t("dash.quick.viewSite"))}</span>
      </a>
    </div>
  </section>`;
}

async function loadActivity() {
  try {
    const res = await fetch("/api/activity?limit=12");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.ok) activityList = data.entries;
  } catch {
    /* Log aktivitas bersifat pelengkap — kegagalannya tidak menghentikan dasbor. */
  }
  renderDashActivity();
}

/**
 * Nama field yang bisa dibaca manusia.
 *
 * Log menyimpan kunci mentah (`price`, `rangeKm`), bukan kalimat jadi — itu
 * yang membuat satu entri bisa dibaca dalam tiga bahasa. Kunci yang tidak
 * punya terjemahan dikembalikan apa adanya: metadata gambar memakai NAMA
 * BERKAS sebagai "field", dan nama berkas memang tidak untuk diterjemahkan.
 */
function fieldLabel(key) {
  /* Dua kamus, karena field datang dari dua formulir: kendaraan dan direktori
     memakai awalan `field.`, sedangkan Pengaturan Situs dan menu Tampilan
     memakai `site.` dan `tampilan.`. Tanpa yang kedua, satu-satunya baris log
     yang tidak pernah bisa dibaca justru yang paling sering muncul. */
  for (const kunci of [`field.${key}`, `site.${key}`, `tampilan.${key}`]) {
    const teks = t(kunci);
    if (teks !== kunci) return teks;
  }
  return key;
}

/** Berapa nama field yang disebut sebelum sisanya diringkas jadi angka. */
const ACTIVITY_FIELD_MAX = 6;

/**
 * Menyiapkan nilai `meta` sebuah entri untuk disisipkan ke kalimatnya.
 *
 * Nama koleksi dan nama field disimpan sebagai kunci, jadi keduanya harus
 * lewat kamus dulu — kalau tidak, panel berbahasa Inggris akan berbunyi
 * "changed 3 items in cars".
 */
function activityVars(a) {
  const meta = Object.assign({}, a.meta || {});
  if (meta.col && meta.col !== "site" && meta.col !== "media") meta.col = colLabel(meta.col);

  const fields = String(meta.fields || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (fields.length) {
    const tampil = fields.slice(0, ACTIVITY_FIELD_MAX).map(fieldLabel);
    const sisa = fields.length - tampil.length;
    meta.fields = sisa > 0 ? `${tampil.join(", ")} ${t("activity.more", { n: sisa })}` : tampil.join(", ");
  }
  return meta;
}

const activityLine = (a) => t(`activity.${a.action}`, activityVars(a));

/**
 * Satu daftar untuk dua tempat: panel ringkas di dasbor dan halaman penuh.
 * Kalau keduanya menggambar sendiri-sendiri, cepat atau lambat kalimat yang
 * sama akan tampil berbeda di dua layar.
 */
function activityRowsHtml(list, opts) {
  const detail = !!(opts && opts.detail);
  return `<ul class="activity-list">${list
    .map(
      (a) => `<li class="activity-item">
      <span class="activity-dot" aria-hidden="true"></span>
      <div class="activity-body">
        <div class="activity-text"><strong>${esc(a.userName || "—")}</strong> ${esc(activityLine(a))}</div>
        <div class="row-meta">${esc(detail ? `${formatDateTime(a.at)} · ${formatAgo(a.at)}` : formatAgo(a.at))}</div>
      </div>
      ${detail && a.meta && a.meta.id && a.meta.col && findItem(a.meta.col, a.meta.id)
        ? `<div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(a.meta.col)}:${esc(a.meta.id)}">${esc(t("common.open"))}</button></div>`
        : ""}
    </li>`
    )
    .join("")}</ul>`;
}

function renderDashActivity() {
  const el = $("dash-activity");
  if (!el) return;
  if (!activityList.length) {
    el.innerHTML = emptyStateHtml(t("dash.activity.emptyTitle"), t("dash.activity.emptyText"), "🕘");
    return;
  }
  el.innerHTML = activityRowsHtml(activityList);
}

/* ---------------- Halaman Log Aktivitas ---------------- */

/* Golongan aksi, harus sama persis dengan GOLONGAN_AKSI di src/lib/activity.ts. */
const ACTIVITY_KINDS = ["konten", "akun", "masuk", "sistem", "ai"];

const activityView = { month: "", user: "", action: "", page: 1 };
let activityPage = null;

async function loadActivityPage() {
  const list = $("activity-list");
  if (!list) return;
  list.innerHTML = `<div class="skeleton"></div>`;

  const q = new URLSearchParams({ penuh: "1", hal: String(activityView.page) });
  if (activityView.month) q.set("bulan", activityView.month);
  if (activityView.user) q.set("pengguna", activityView.user);
  if (activityView.action) q.set("aksi", activityView.action);

  try {
    const res = await fetch(`/api/activity?${q}`);
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!data || !data.ok) throw new Error(apiMessage(data, "err.forbidden"));
    activityPage = data;
    renderActivityView();
  } catch (err) {
    activityPage = null;
    list.innerHTML = emptyStateHtml(t("activity.failTitle"), err && err.message ? err.message : t("err.forbidden"), "⚠️");
    const bar = $("activity-toolbar");
    if (bar) bar.innerHTML = "";
  }
}

function renderActivityView() {
  const bar = $("activity-toolbar");
  const list = $("activity-list");
  if (!bar || !list || !activityPage) return;

  const months = activityPage.months || [];
  const users = activityPage.users || [];

  bar.innerHTML = `<div class="toolbar">
    <div class="toolbar-filters">
      <select class="select-mini" data-activity="month">
        <option value="">${esc(t("activity.monthLatest"))}</option>
        ${months.map((m) => `<option value="${esc(m)}"${m === activityView.month ? " selected" : ""}>${esc(m)}</option>`).join("")}
      </select>
      <select class="select-mini" data-activity="user">
        <option value="">${esc(t("activity.allUsers"))}</option>
        ${users.map((u) => `<option value="${esc(u.id)}"${u.id === activityView.user ? " selected" : ""}>${esc(u.name)}</option>`).join("")}
      </select>
      <select class="select-mini" data-activity="action">
        <option value="">${esc(t("activity.allKinds"))}</option>
        ${ACTIVITY_KINDS.map((k) => `<option value="${esc(k)}"${k === activityView.action ? " selected" : ""}>${esc(t(`activity.kind.${k}`))}</option>`).join("")}
      </select>
    </div>
    <div class="toolbar-actions">
      <span class="row-meta">${esc(t("activity.count", { n: activityPage.total }))}</span>
    </div>
  </div>`;

  const entries = activityPage.entries || [];
  if (!entries.length) {
    list.innerHTML = emptyStateHtml(t("activity.emptyTitle"), t("activity.emptyText"), "🕘");
    return;
  }

  const pages = activityPage.pages || 1;
  const halaman = pages > 1
    ? `<div class="pagination">
        <button type="button" data-activity-page="${Math.max(1, activityPage.page - 1)}"${activityPage.page === 1 ? " disabled" : ""}>&larr;</button>
        <span class="row-meta">${esc(t("activity.pageOf", { page: activityPage.page, pages }))}</span>
        <button type="button" data-activity-page="${Math.min(pages, activityPage.page + 1)}"${activityPage.page === pages ? " disabled" : ""}>&rarr;</button>
      </div>`
    : "";

  list.innerHTML = activityRowsHtml(entries, { detail: true }) + halaman;
}

/** Nama & foto di bilah atas, sekaligus pintasan ke halaman Profil. */
function syncAccountChip() {
  const chip = $("account-chip");
  if (!chip) return;
  if (!me) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.innerHTML = `${avatarHtml(me)}<span class="account-name">${esc((me.name || me.username).split(/\s+/)[0])}</span>`;
  chip.setAttribute("title", t("nav.profile"));
}

/**
 * Menyalakan titik penanda di butir "Pembaruan" kalau ada rilis yang lebih baru
 * dari versi terpasang. Hanya dijalankan untuk peran yang boleh memperbarui —
 * endpoint-nya pun menolak yang lain.
 */
async function checkUpdateBadge() {
  const dot = $("update-dot");
  if (!dot || !isAdmin()) return;
  try {
    const res = await fetch("/api/version");
    if (!res.ok) return;
    const data = await res.json();
    dot.hidden = !(data && data.updateAvailable);
  } catch {
    /* Titik penanda bersifat pelengkap; diamkan kalau GitHub tak terjangkau. */
  }
}

/** Menyembunyikan menu yang tidak boleh diakses peran ini. */
function applyRoleVisibility() {
  const allowed = isAdmin();
  document.querySelectorAll("[data-requires-admin]").forEach((el) => {
    el.hidden = !allowed;
  });
}

async function init() {
  ensureHiddenInputs();
  applySidebarPref();
  bindEvents();

  // Profil dimuat lebih dulu: bahasa, tema, dan kepadatan tampilan berasal
  // dari sana, dan render pertama harus sudah memakainya.
  await loadMe();
  applyUserPrefs();
  applyRoleVisibility();
  syncAccountChip();
  syncLangSwitch();

  try {
    const res = await fetch("/api/content");
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!data || !data.ok) throw new Error(t("toast.loadFailed", { error: "" }));
    content = data.content;
  } catch (err) {
    toast(t("toast.loadFailed", { error: err.message }), "error");
    return;
  }

  resetHistory();
  setSaveState("saved");
  renderAll();

  loadActivity();
  checkUpdateBadge();
  // Tidak di-await: editor boleh terbuka lebih dulu, dan tombol Riset muncul
  // begitu jawabannya datang.
  muatKeadaanAi().then(() => {
    if (activeView === "editor") syncAiButton();
  });

  lastHash = location.hash;
  const route = parseRoute(location.hash);
  if (route.kind === "editor") {
    openVehicle(route.col, route.id);
  } else if (!location.hash && me && me.homeView && me.homeView !== "dashboard") {
    // Halaman pembuka pilihan pengguna hanya berlaku saat tidak ada alamat
    // spesifik — tautan yang dibagikan tetap membuka halaman yang dimaksud.
    setView(me.homeView);
  } else {
    setView(route.view, { hash: false });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
