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
const VIEWS = ["dashboard", "cars", "motors", "spklu", "bengkel", "berita", "site", "media", "backups", "editor", "profile", "users"];
const COLLECTIONS = ["cars", "motors", "spklu", "bengkel", "berita"];
const VEHICLE_COLS = ["cars", "motors"];
const DIR_COLS = ["spklu", "bengkel", "berita"];

const colLabel = (col) => t(`col.${col}`);
const colOne = (col) => t(`col.${col}.one`);

const PAGE_SIZE = 24;
const AUTOSAVE_MS = 1200;
const HISTORY_MAX = 40;

/* Nilai berikut adalah DATA, bukan antarmuka: ia tersimpan apa adanya di
   content.json dan ikut tampil di situs publik yang berbahasa Indonesia.
   Menerjemahkannya akan mengubah isi database, jadi sengaja dibiarkan. */
const CAR_BODY_TYPES = ["Hatchback", "Crossover", "SUV", "Sedan", "Coupe", "MPV", "Wagon", "Pikap", "Van", "Niaga"];
const MOTOR_BODY_TYPES = ["Skuter", "Motor Bebek", "Motor Sport", "Moped", "Motor Trail", "Sepeda Listrik"];
const RANGE_STANDARDS = ["", "WLTP", "NEDC", "CLTC", "EPA", "Klaim pabrikan"];
const DRIVE_TYPES = ["", "FWD", "RWD", "AWD", "4WD"];

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

/* Field per koleksi direktori. Semua field skema tercakup. */
function dirFields(col) {
  if (col === "spklu") {
    return [
      { k: "name", l: t("field.spklu.name"), t: "text", req: true, ph: t("field.spklu.name.ph") },
      { k: "operator", l: t("field.spklu.operator"), t: "text", ph: t("field.spklu.operator.ph") },
      { k: "area", l: t("field.area"), t: "text", ph: t("field.area.ph") },
      { k: "address", l: t("field.address"), t: "textarea", full: true, rows: 2 },
      { k: "power", l: t("field.spklu.power"), t: "text", ph: t("field.spklu.power.ph") },
      { k: "connector", l: t("field.spklu.connector"), t: "text", ph: t("field.spklu.connector.ph") },
      { k: "count", l: t("field.spklu.count"), t: "number" },
      { k: "hours", l: t("field.hours"), t: "text", ph: t("field.hours.phSpklu") },
      { k: "price", l: t("field.spklu.price"), t: "text", ph: t("field.spklu.price.ph") },
      { k: "website", l: t("field.website"), t: "url", ph: "https://" },
      { k: "mapUrl", l: t("field.mapUrl"), t: "url", ph: "https://maps.google.com/…" },
      { k: "note", l: t("field.note"), t: "textarea", full: true, rows: 2 },
      { k: "featured", l: t("field.featured"), t: "switch" },
    ];
  }
  if (col === "bengkel") {
    return [
      { k: "name", l: t("field.bengkel.name"), t: "text", req: true },
      { k: "type", l: t("field.bengkel.type"), t: "text", ph: t("field.bengkel.type.ph") },
      { k: "brand", l: t("field.bengkel.brand"), t: "text", ph: t("field.bengkel.brand.ph") },
      { k: "area", l: t("field.area"), t: "text" },
      { k: "address", l: t("field.address"), t: "textarea", full: true, rows: 2 },
      { k: "phone", l: t("field.phone"), t: "text", ph: "mis. 021-1234567" },
      { k: "hours", l: t("field.hours"), t: "text", ph: t("field.hours.phBengkel") },
      { k: "services", l: t("field.bengkel.services"), t: "textarea", full: true, rows: 2, ph: t("field.bengkel.services.ph") },
      { k: "website", l: t("field.website"), t: "url", ph: "https://" },
      { k: "mapUrl", l: t("field.mapUrl"), t: "url", ph: "https://maps.google.com/…" },
      { k: "note", l: t("field.note"), t: "textarea", full: true, rows: 2 },
      { k: "featured", l: t("field.featured"), t: "switch" },
    ];
  }
  return [
    { k: "title", l: t("field.berita.title"), t: "text", req: true, full: true },
    { k: "source", l: t("field.berita.source"), t: "text", ph: t("field.berita.source.ph") },
    { k: "date", l: t("field.berita.date"), t: "date" },
    { k: "url", l: t("field.berita.url"), t: "url", full: true, ph: "https://" },
    { k: "image", l: t("field.berita.image"), t: "image", full: true },
    { k: "excerpt", l: t("field.berita.excerpt"), t: "textarea", full: true, rows: 3 },
    { k: "featured", l: t("field.featured"), t: "switch" },
  ];
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
let confirmResolver = null;
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

function openModal(el) {
  if (!el) return;
  el.classList.add("open");
  el.removeAttribute("hidden");
  if (!modalStack.includes(el)) modalStack.push(el);
}

function closeModal(el) {
  if (!el) return;
  el.classList.remove("open");
  const i = modalStack.indexOf(el);
  if (i >= 0) modalStack.splice(i, 1);
  if (el.id === "dir-modal") { dirCtx = null; editorTouched = false; }
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
    });
    if (!ok) return;
  }
  editorTouched = false;
  closeModal(modal);
}

function confirmDialog(opts) {
  const modal = $("confirm-modal");
  const o = Object.assign({ title: t("common.confirm"), text: "", okText: t("common.delete"), danger: true }, opts || {});
  if (!modal) return Promise.resolve(true);

  const titleEl = $("confirm-title");
  const textEl = $("confirm-text");
  const okBtn = $("confirm-ok");
  if (titleEl) titleEl.textContent = o.title;
  if (textEl) textEl.textContent = o.text;
  if (okBtn) {
    okBtn.textContent = o.okText;
    okBtn.className = "btn " + (o.danger ? "btn-danger" : "btn-primary");
  }
  openModal(modal);
  if (okBtn) okBtn.focus();

  return new Promise((resolve) => {
    confirmResolver = (val) => {
      confirmResolver = null;
      closeModal(modal);
      resolve(val);
    };
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
    const type = def.t === "url" ? "url" : def.t === "date" ? "date" : "text";
    control = `<input type="${type}" id="${esc(id)}" name="${esc(def.k)}" value="${esc(value)}"${ph} />`;
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
const COMBO_LABEL = { brand: "merek" };

function comboLabel(key) {
  return COMBO_LABEL[key] || "pilihan";
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
      <strong>Tidak ada ${esc(label)} yang cocok</strong>
      <span>“${esc(input.value.trim())}” tetap bisa dipakai — cukup lanjut mengisi.</span>
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
    <span>${list.length} dari ${total} ${esc(label)}</span>
    <span>Ketik untuk mencari · ${esc(label)} baru boleh langsung diketik</span>
  </div>`;

  setComboActive(box, pop.querySelector(".combo-opt.is-on") || pop.querySelector(".combo-opt"), true);
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

  const view = col === "cars" ? `<a class="btn btn-ghost btn-sm" href="/mobil/${encodeURIComponent(it.id)}" target="_blank" rel="noopener">${esc(t("common.view"))}</a>` : "";
  // Skema disaring lebih dulu: field ini teks bebas, dan esc() tidak menolak
  // `javascript:`. Tautan yang ditolak tidak dirender sama sekali.
  const itemUrl = col === "berita" ? safeUrl(it.url) : "";
  const itemMap = col === "spklu" || col === "bengkel" ? safeUrl(it.mapUrl) : "";
  const link = itemUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(itemUrl)}" target="_blank" rel="noopener">${esc(t("common.open"))}</a>` : "";
  const map = itemMap ? `<a class="btn btn-ghost btn-sm" href="${esc(itemMap)}" target="_blank" rel="noopener">${esc(t("common.map"))}</a>` : "";

  return `<div class="item-row${selected ? " selected" : ""}" data-col="${esc(col)}" data-id="${esc(it.id)}"${dragEnabled ? "" : ' data-nodrag="1"'}>
    <input type="checkbox" class="row-check" data-check data-col="${esc(col)}" data-id="${esc(it.id)}"${selected ? " checked" : ""} aria-label="${esc(t("common.selectItem", { name: titleOf(col, it) }))}" />
    <span class="drag-handle" title="${esc(dragEnabled ? t("common.dragToSort") : t("common.dragNeedsManual"))}">⋮⋮</span>
    <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
    <div class="row-main">
      <div class="row-title">${esc(titleOf(col, it))}</div>
      <div class="row-meta">${esc(metaOf(col, it))}</div>
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
  if (isVehicle(col)) { copy.status = "draft"; copy.updatedAt = new Date().toISOString(); }
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
    const ok = await confirmDialog({ title: t("confirm.deleteBulkTitle"), text: t("confirm.deleteBulkText", { n: ids.length, col: colLabel(col) }), okText: t("common.deleteAll") });
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
    if (isVehicle(col)) it.updatedAt = new Date().toISOString();
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

  data.updatedAt = new Date().toISOString();

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

function openDir(col, id) {
  const defs = dirFields(col);
  if (!defs) return;
  const item = id ? findItem(col, id) : blankItem(col);
  if (!item) return;

  dirCtx = { col, id: id || null, draft: {} };
  editorTouched = false;
  for (const d of defs) if (d.t === "image") dirCtx.draft[d.k] = item[d.k] || "";

  const title = $("dir-modal-title");
  if (title) title.textContent = id ? t("editor.editTitle", { one: colOne(col), name: titleOf(col, item) }) : t("editor.addTitle", { one: colOne(col) });

  const wrap = $("dir-fields");
  if (wrap) wrap.innerHTML = `<div class="field-grid">${defs.map((d) => fieldHtml(d, item[d.k], "d")).join("")}</div>`;

  openModal($("dir-modal"));
  const first = document.querySelector("#dir-form input, #dir-form textarea");
  if (first) setTimeout(() => first.focus(), 30);
}

function saveDir() {
  const form = $("dir-form");
  if (!form || !dirCtx) return;
  const { col, id } = dirCtx;
  const defs = dirFields(col);
  clearErrors(form);

  const data = {};
  for (const def of defs) data[def.k] = def.t === "image" ? dirCtx.draft[def.k] || "" : readField(form, def);

  const nameKey = col === "berita" ? "title" : "name";
  if (!data[nameKey]) {
    markError(form, nameKey, col === "berita" ? t("valid.titleRequired") : t("valid.dirNameRequired"));
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

  closeModal($("dir-modal"));
  commit();
  saveNow();
  toast(id ? t("toast.changesSaved") : t("toast.itemAdded"), "success");
}

/* ------------------------------------------------------------------ *
 * 14. Form pengaturan situs (generik)
 * ------------------------------------------------------------------ */

function renderSiteForm() {
  const form = $("site-form");
  if (!form || !content) return;
  // Jangan timpa apa yang sedang diketik pengguna.
  if (form.contains(document.activeElement)) return;

  for (const el of form.elements) {
    const key = el.name;
    if (!key || !(key in content.site)) continue;
    if (el.type === "checkbox") el.checked = !!content.site[key];
    else if (el.value !== String(content.site[key])) el.value = String(content.site[key]);
  }
  form.querySelectorAll("[data-image-field]").forEach(renderSiteImageField);
  syncRangeOutputs();
  applyThemePreview();
}

/** Nilai <input type="range"> tidak terlihat tanpa label angka di sampingnya. */
function syncRangeOutputs() {
  const form = $("site-form");
  if (!form) return;
  form.querySelectorAll('input[type="range"]').forEach((input) => {
    const out = form.querySelector(`output[for="${CSS.escape(input.id)}"]`);
    if (out) out.textContent = input.value + "px";
  });
}

function renderSiteImageField(wrap) {
  const key = wrap.getAttribute("data-image-field");
  const dz = wrap.querySelector("[data-dropzone]");
  const url = (content.site && content.site[key]) || "";
  const input = wrap.querySelector(`input[name="${CSS.escape(key)}"]`);
  if (input) input.value = url;
  if (dz) dz.innerHTML = imagePreviewHtml(url, `data-site-img-del="${esc(key)}"`);
}

function collectSiteForm() {
  const form = $("site-form");
  if (!form) return;
  for (const el of form.elements) {
    const key = el.name;
    if (!key || !(key in content.site)) continue;
    content.site[key] = el.type === "checkbox" ? !!el.checked : String(el.value);
  }
}

function applyThemePreview() {
  if (!content || !content.site) return;
  const p = content.site.themePrimary;
  const s = content.site.themeSecondary;
  if (p) document.body.style.setProperty("--accent", p);
  if (s) document.body.style.setProperty("--accent-2", s);
  if (p && s) document.body.style.setProperty("--accent-grad", `linear-gradient(135deg, ${p}, ${s})`);
}

/* ------------------------------------------------------------------ *
 * 15. View media
 * ------------------------------------------------------------------ */

function collectMedia() {
  const map = new Map();
  const add = (url, usage) => {
    const u = String(url || "").trim();
    if (!u) return;
    if (!map.has(u)) map.set(u, []);
    map.get(u).push(usage);
  };

  for (const key of ["logoImage", "heroImage", "seoOgImage"]) add(content.site[key], t("media.siteSettings", { field: key }));
  for (const col of VEHICLE_COLS) {
    for (const it of content[col] || []) {
      add(it.image, `${colLabel(col)} · ${titleOf(col, it)}`);
      (it.gallery || []).forEach((g) => add(g, `${colLabel(col)} · ${titleOf(col, it)} (galeri)`));
    }
  }
  for (const it of content.berita || []) add(it.image, `Berita · ${titleOf("berita", it)}`);
  for (const u of mediaUploads) add(u, t("media.unused"));

  return [...map.entries()];
}

function renderMedia() {
  const el = $("media-grid");
  if (!el) return;
  const q = ($("media-search")?.value || "").trim().toLowerCase();
  const items = collectMedia().filter(
    ([url, uses]) => !q || url.toLowerCase().includes(q) || uses.join(" ").toLowerCase().includes(q)
  );

  const uploader = `<div class="dropzone" data-dzone="__media">
    <div class="empty-state-text">${esc(t("upload.dropHereUrl"))}</div>
  </div>`;

  if (!items.length) {
    el.innerHTML = uploader + (q
      ? emptyStateHtml(t("common.noResults"), t("media.noMatch", { q }), "🔍")
      : emptyStateHtml(t("media.emptyTitle"), t("media.emptyText"), "🖼️"));
    return;
  }

  el.innerHTML = uploader + `<div class="media-grid">${items
    .map(([url, uses]) => `<div class="media-item">
      <img src="${esc(url)}" alt="" loading="lazy" />
      <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(url)}" title="${esc(t("common.copyUrl"))}">${esc(t("common.copyUrl"))}</button>
      <div class="row-meta">${esc(uses.slice(0, 3).join(" · "))}${uses.length > 3 ? ` · +${uses.length - 3} lagi` : ""}</div>
    </div>`)
    .join("")}</div>`;
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
    okText: t("common.restore"),
    danger: false,
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
    danger: false,
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
    commit({ render: false });
  } else if (dzone && dirCtx) {
    dirCtx.draft[dzone] = urls[0];
    dz.innerHTML = imagePreviewHtml(urls[0], `data-img-del="${esc(dzone)}"`);
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

    /* --- Dialog konfirmasi --- */
    if (e.target.closest("#confirm-ok")) { if (confirmResolver) confirmResolver(true); return; }
    if (e.target.closest("#confirm-cancel")) { if (confirmResolver) confirmResolver(false); return; }

    /* --- Palette --- */
    if (e.target.closest("[data-palette-close]")) { closeModal(palette); return; }

    /* --- Modal generik --- */
    const closeBtn = e.target.closest(".modal-close, [data-close-modal]");
    if (closeBtn) {
      const modal = closeBtn.closest(".modal-backdrop");
      if (modal === $("confirm-modal") && confirmResolver) { confirmResolver(false); return; }
      requestCloseModal(modal);
      return;
    }
    if (e.target.classList && e.target.classList.contains("modal-backdrop")) {
      if (e.target === $("confirm-modal")) { if (confirmResolver) confirmResolver(false); return; }
      requestCloseModal(e.target);
      return;
    }

    if (e.target.closest("#media-refresh")) { renderMedia(); toast(t("toast.mediaReloaded"), "info"); return; }

    if (e.target.closest("#editor-save-add")) { saveVehicle({ again: true }); return; }
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
        const ok = await confirmDialog({ title: t("confirm.replaceTitle"), text: t("confirm.replaceText"), okText: t("common.replace"), danger: false });
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
      const row = repMove.closest(".repeater-row");
      const dir = Number(repMove.getAttribute("data-rep-move"));
      if (dir < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (dir > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
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
    const siteImgDel = e.target.closest("[data-site-img-del]");
    if (siteImgDel) {
      const key = siteImgDel.getAttribute("data-site-img-del");
      content.site[key] = "";
      const wrap = siteImgDel.closest("[data-image-field]");
      if (wrap) renderSiteImageField(wrap);
      commit({ render: false });
      return;
    }
    const imgDel = e.target.closest("[data-img-del]");
    if (imgDel) {
      const key = imgDel.getAttribute("data-img-del");
      if (dirCtx) dirCtx.draft[key] = "";
      const dz = imgDel.closest(".dropzone");
      if (dz) dz.innerHTML = imagePreviewHtml("", "");
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

    if (el.id === "media-search") { renderMedia(); return; }

    const siteForm = el.closest && el.closest("#site-form");
    if (siteForm) {
      collectSiteForm();
      if (el.type === "range") syncRangeOutputs();
      if (el.name === "themePrimary" || el.name === "themeSecondary") applyThemePreview();
      commit({ key: "site:" + el.name, render: false });
      return;
    }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.closest && el.closest("#vehicle-form, #dir-form")) editorTouched = true;

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
      ui[col].sort = sorel.value;
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

    if (el.closest && el.closest("#site-form") && el.type === "checkbox") {
      collectSiteForm();
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
    if (form.id === "site-form") {
      e.preventDefault();
      collectSiteForm();
      commit({ render: false });
      saveNow();
      toast(t("toast.siteSaved"), "success");
      return;
    }
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

  /* --- Papan ketik --- */
  document.addEventListener("keydown", (e) => {
    /* Combobox lebih dulu: panah, Enter, dan Escape miliknya sendiri. */
    if (comboKeydown(e)) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = String(e.key || "").toLowerCase();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) ||
      (document.activeElement && document.activeElement.isContentEditable);

    if (mod && key === "k") { e.preventDefault(); openPalette(""); return; }
    if (mod && key === "s") { e.preventDefault(); saveNow(); return; }
    if (mod && key === "z") {
      e.preventDefault();
      applyHistory(e.shiftKey ? 1 : -1);
      return;
    }
    if (e.key === "Escape") {
      if (confirmResolver) { confirmResolver(false); return; }
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
      <span class="lang-short">${esc(l.short)}</span>
      <span class="lang-label">${esc(l.label)}</span>
    </button>`
  ).join("");
  const btn = $("lang-toggle");
  if (btn) btn.textContent = localeMeta(locale).short;
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

  const homeOptions = ["dashboard", ...COLLECTIONS, "site", "media"]
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
            ${LOCALES.map((l) => `<option value="${esc(l.code)}"${l.code === me.locale ? " selected" : ""}>${esc(l.label)}</option>`).join("")}
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
  if (first) setTimeout(() => first.focus(), 30);
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

function renderDashActivity() {
  const el = $("dash-activity");
  if (!el) return;
  if (!activityList.length) {
    el.innerHTML = emptyStateHtml(t("dash.activity.emptyTitle"), t("dash.activity.emptyText"), "🕘");
    return;
  }
  el.innerHTML = `<ul class="activity-list">${activityList
    .map(
      (a) => `<li class="activity-item">
      <span class="activity-dot" aria-hidden="true"></span>
      <div class="activity-body">
        <div class="activity-text"><strong>${esc(a.userName || "—")}</strong> ${esc(t(`activity.${a.action}`, a.meta || {}))}</div>
        <div class="row-meta">${esc(formatAgo(a.at))}</div>
      </div>
    </li>`
    )
    .join("")}</ul>`;
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
