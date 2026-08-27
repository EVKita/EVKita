"use strict";

/* =============================================================================
 * EVKita — Logika Panel Admin
 *
 * Struktur berkas: konfigurasi (data) → helper → jaringan/riwayat → render →
 * modal → event. Definisi field ditulis sebagai DATA, bukan markup berulang,
 * supaya menambah field cukup satu baris dan tidak ada markup yang tercecer.
 *
 * Semua markup yang dibangun dari data pengguna WAJIB lewat esc().
 * ========================================================================== */

/* ------------------------------------------------------------------ *
 * 1. Konfigurasi
 * ------------------------------------------------------------------ */

/* "editor" adalah halaman penuh untuk mobil/motor. Tidak punya butir di
   sidebar — yang disorot tetap koleksi asalnya. */
const VIEWS = ["dashboard", "cars", "motors", "spklu", "bengkel", "berita", "site", "media", "backups", "editor"];
const COLLECTIONS = ["cars", "motors", "spklu", "bengkel", "berita"];
const VEHICLE_COLS = ["cars", "motors"];
const DIR_COLS = ["spklu", "bengkel", "berita"];

const COL_LABEL = { cars: "Mobil", motors: "Motor", spklu: "SPKLU", bengkel: "Bengkel", berita: "Berita" };
const COL_ONE = { cars: "Mobil", motors: "Motor", spklu: "SPKLU", bengkel: "Bengkel", berita: "Berita" };

const PAGE_SIZE = 24;
const AUTOSAVE_MS = 1200;
const HISTORY_MAX = 40;

const CAR_BODY_TYPES = ["Hatchback", "Crossover", "SUV", "Sedan", "Coupe", "MPV", "Wagon", "Pikap", "Van", "Niaga"];
const MOTOR_BODY_TYPES = ["Skuter", "Motor Bebek", "Motor Sport", "Moped", "Motor Trail", "Sepeda Listrik"];
const RANGE_STANDARDS = ["", "WLTP", "NEDC", "CLTC", "EPA", "Klaim pabrikan"];
const DRIVE_TYPES = ["", "FWD", "RWD", "AWD", "4WD"];
const STATUS_OPTS = [["published", "Terbit"], ["draft", "Draf"]];

/* Saran merek untuk field Merek. Digabung dengan merek yang sudah ada di data
   lalu ditampilkan sebagai daftar pilihan yang bisa dicari. Field-nya tetap
   teks bebas: merek yang belum ada di daftar boleh diketik langsung. */
const BRAND_SUGGESTIONS = {
  cars: ["Aion", "BMW", "BYD", "Chery", "Citroen", "Denza", "DFSK", "Geely", "Honda", "Hyundai", "Jetour", "Kia", "Lexus", "Maxus", "Mercedes-Benz", "MG", "Mini", "Mitsubishi", "Neta", "Nissan", "Polestar", "Seres", "Tesla", "Toyota", "VinFast", "Volvo", "Wuling"],
  motors: ["Alva", "Charged", "Davigo", "Electrum", "Exotic", "Gesits", "Honda", "Maka Motors", "Niu", "Polytron", "Rakata", "Selis", "Smoot", "United", "Uwinfly", "Viar", "Volta", "Yamaha"],
};

/* Label spesifikasi yang lazim tapi tidak punya field baku. Tampil sebagai chip
   di tab Spesifikasi supaya baris tambahan cukup satu klik. */
const SPEC_PRESETS = {
  cars: ["Dimensi (P×L×T)", "Jarak Sumbu Roda", "Ground Clearance", "Bobot Kosong", "Kapasitas Bagasi", "Ukuran Ban", "Tipe Baterai", "Jumlah Airbag", "Fitur Keselamatan", "Layar Infotainment", "Radius Putar"],
  motors: ["Bobot", "Tipe Baterai", "Baterai Bisa Ditukar", "Daya Motor (Watt)", "Waktu Pengisian Penuh", "Rem Depan / Belakang", "Ukuran Ban", "Kapasitas Bagasi", "Mode Berkendara", "Suspensi", "Beban Maksimum"],
};

/* Urutan bagian di halaman editor, sekaligus isi navigasi sampingnya. */
const EDITOR_SECTIONS = [
  { k: "dasar", l: "Dasar", d: "Identitas kendaraan dan cara ia tampil di daftar katalog." },
  { k: "spesifikasi", l: "Spesifikasi", d: "Angka yang dibandingkan pembaca — jarak tempuh, baterai, tenaga, dan harga." },
  { k: "media", l: "Media", d: "Gambar utama, galeri, dan video yang tampil di halaman detail." },
  { k: "varian", l: "Varian", d: "Nama varian yang dijual. Jumlahnya dihitung otomatis dari daftar ini." },
  { k: "lanjutan", l: "Lanjutan", d: "Pilihan warna, daftar keunggulan, dan identitas teknis item." },
];
const SECTION_KEYS = EDITOR_SECTIONS.map((x) => x.k);

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
  const one = motor ? "motor" : "mobil";
  return {
    dasar: [
      { k: "brand", l: "Merek", t: "combo", req: true, ph: motor ? "mis. Polytron" : "mis. Hyundai", src: "brand", hint: "Pilih dari daftar, atau ketik merek baru." },
      { k: "name", l: "Nama Model", t: "text", req: true, ph: motor ? "mis. Fox 500" : "mis. Ioniq 5" },
      { k: "bodyType", l: motor ? "Tipe Motor" : "Tipe Bodi", t: "select", opts: motor ? MOTOR_BODY_TYPES : CAR_BODY_TYPES },
      { k: "year", l: "Tahun Model", t: "number", ph: "2025" },
      { k: "status", l: "Status", t: "select", opts: STATUS_OPTS, hint: "Draf belum tampil di situs publik." },
      { k: "tagline", l: "Tagline", t: "text", ph: "Satu kalimat penjual" },
      { k: "description", l: "Deskripsi", t: "textarea", full: true, rows: 5, ph: `Ceritakan singkat tentang ${one} ini — posisinya di pasar, keunggulan utamanya.` },
      { k: "tags", l: "Tag", t: "tags", full: true, hint: "Pisahkan dengan koma, mis. keluarga, irit, cepat" },
      { k: "featured", l: "Tampilkan sebagai unggulan", t: "switch" },
      { k: "stale", l: "Tandai sebagai data lama", t: "switch", hint: "Dipakai kalau data perlu diperiksa ulang" },
    ],
    spesifikasi: [
      { k: "rangeKm", l: "Jarak Tempuh (km)", t: "number", ph: motor ? "80" : "450" },
      { k: "rangeStandard", l: "Standar Pengujian", t: "select", opts: RANGE_STANDARDS },
      { k: "batteryKwh", l: "Kapasitas Baterai (kWh)", t: "number", step: "0.1", ph: motor ? "2,4" : "58" },
      { k: "powerHp", l: "Tenaga (hp)", t: "number" },
      { k: "torqueNm", l: "Torsi (Nm)", t: "number" },
      { k: "topSpeedKph", l: "Kecepatan Maksimum (km/jam)", t: "number" },
      { k: "accelSec", l: motor ? "Akselerasi (detik)" : "Akselerasi 0–100 km/jam (detik)", t: "number", step: "0.1" },
      ...(motor
        ? []
        : [
          { k: "seats", l: "Jumlah Kursi", t: "number" },
          { k: "driveType", l: "Penggerak", t: "select", opts: DRIVE_TYPES },
        ]),
      { k: "chargeDcKw", l: "Pengisian DC (kW)", t: "number" },
      { k: "chargeAcKw", l: motor ? "Daya Pengisi Daya (kW)" : "Pengisian AC (kW)", t: "number" },
      { k: "chargeTime", l: "Waktu Pengisian", t: "text", ph: motor ? "mis. 4 jam (0–100%)" : "mis. 18 menit (10–80%)" },
      { k: "warranty", l: "Garansi", t: "text", ph: motor ? "mis. 3 tahun / baterai 2 tahun" : "mis. 8 tahun / 160.000 km" },
      { k: "price", l: "Harga (Rupiah, angka)", t: "number", ph: motor ? "22000000" : "415000000", hint: "Cukup isi salah satu kolom harga — yang lain diisi otomatis." },
      { k: "priceText", l: "Harga (teks tampil)", t: "text", ph: motor ? "Rp 22 jt" : "Rp 415 jt" },
    ],
  };
}

/* Field per koleksi direktori. Label Bahasa Indonesia, semua field skema tercakup. */
const DIR_FIELDS = {
  spklu: [
    { k: "name", l: "Nama Lokasi", t: "text", req: true, ph: "mis. SPKLU PLN UP3 Menteng" },
    { k: "operator", l: "Operator", t: "text", ph: "mis. PLN, Starvo, Utomo" },
    { k: "area", l: "Area / Kota", t: "text", ph: "mis. Jakarta Pusat" },
    { k: "address", l: "Alamat Lengkap", t: "textarea", full: true, rows: 2 },
    { k: "power", l: "Daya", t: "text", ph: "mis. 50 kW" },
    { k: "connector", l: "Jenis Konektor", t: "text", ph: "mis. CCS2, CHAdeMO, AC Type 2" },
    { k: "count", l: "Jumlah Unit Pengisi", t: "number" },
    { k: "hours", l: "Jam Operasional", t: "text", ph: "mis. 24 jam" },
    { k: "price", l: "Tarif", t: "text", ph: "mis. Rp 2.466/kWh" },
    { k: "website", l: "Situs Web", t: "url", ph: "https://" },
    { k: "mapUrl", l: "Tautan Peta", t: "url", ph: "https://maps.google.com/…" },
    { k: "note", l: "Catatan", t: "textarea", full: true, rows: 2 },
    { k: "featured", l: "Tampilkan sebagai unggulan", t: "switch" },
  ],
  bengkel: [
    { k: "name", l: "Nama Bengkel", t: "text", req: true },
    { k: "type", l: "Jenis Bengkel", t: "text", ph: "mis. Resmi, Umum, Spesialis" },
    { k: "brand", l: "Merek yang Dilayani", t: "text", ph: "mis. Wuling, BYD, Semua merek" },
    { k: "area", l: "Area / Kota", t: "text" },
    { k: "address", l: "Alamat Lengkap", t: "textarea", full: true, rows: 2 },
    { k: "phone", l: "Telepon", t: "text", ph: "mis. 021-1234567" },
    { k: "hours", l: "Jam Operasional", t: "text", ph: "mis. Senin–Sabtu 08.00–17.00" },
    { k: "services", l: "Layanan", t: "textarea", full: true, rows: 2, ph: "mis. Servis berkala, perbaikan baterai" },
    { k: "website", l: "Situs Web", t: "url", ph: "https://" },
    { k: "mapUrl", l: "Tautan Peta", t: "url", ph: "https://maps.google.com/…" },
    { k: "note", l: "Catatan", t: "textarea", full: true, rows: 2 },
    { k: "featured", l: "Tampilkan sebagai unggulan", t: "switch" },
  ],
  berita: [
    { k: "title", l: "Judul Berita", t: "text", req: true, full: true },
    { k: "source", l: "Sumber", t: "text", ph: "mis. Kompas Otomotif" },
    { k: "date", l: "Tanggal Terbit", t: "date" },
    { k: "url", l: "Tautan Artikel", t: "url", full: true, ph: "https://" },
    { k: "image", l: "Gambar Sampul", t: "image", full: true },
    { k: "excerpt", l: "Ringkasan", t: "textarea", full: true, rows: 3 },
    { k: "featured", l: "Tampilkan sebagai unggulan", t: "switch" },
  ],
};

/* Filter dropdown per koleksi. `options` menghasilkan daftar dari data aktual. */
const uniqVals = (items, key) => [...new Set(items.map((i) => String(i[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));

const VEHICLE_STATUS_FILTER = {
  id: "status",
  label: "Semua status",
  options: () => [
    ["published", "Terbit"],
    ["draft", "Draf"],
    ["featured", "Unggulan"],
    ["stale", "Data lama"],
    ["noimage", "Tanpa gambar"],
    ["noprice", "Tanpa harga"],
  ],
  match: (it, v) =>
    v === "featured" ? !!it.featured
      : v === "stale" ? !!it.stale
        : v === "noimage" ? !it.image
          : v === "noprice" ? it.price == null && !it.priceText
            : it.status === v,
};

const FILTERS = {
  cars: [
    { id: "brand", label: "Semua merek", options: (it) => uniqVals(it, "brand"), match: (i, v) => i.brand === v },
    { id: "bodyType", label: "Semua tipe bodi", options: (it) => uniqVals(it, "bodyType"), match: (i, v) => i.bodyType === v },
    VEHICLE_STATUS_FILTER,
  ],
  motors: [
    { id: "brand", label: "Semua merek", options: (it) => uniqVals(it, "brand"), match: (i, v) => i.brand === v },
    { id: "bodyType", label: "Semua tipe", options: (it) => uniqVals(it, "bodyType"), match: (i, v) => i.bodyType === v },
    VEHICLE_STATUS_FILTER,
  ],
  spklu: [
    { id: "area", label: "Semua area", options: (it) => uniqVals(it, "area"), match: (i, v) => i.area === v },
    { id: "operator", label: "Semua operator", options: (it) => uniqVals(it, "operator"), match: (i, v) => i.operator === v },
    { id: "featured", label: "Semua item", options: () => [["1", "Unggulan saja"], ["0", "Bukan unggulan"]], match: (i, v) => (v === "1" ? !!i.featured : !i.featured) },
  ],
  bengkel: [
    { id: "area", label: "Semua area", options: (it) => uniqVals(it, "area"), match: (i, v) => i.area === v },
    { id: "type", label: "Semua jenis", options: (it) => uniqVals(it, "type"), match: (i, v) => i.type === v },
    { id: "brand", label: "Semua merek", options: (it) => uniqVals(it, "brand"), match: (i, v) => i.brand === v },
  ],
  berita: [
    { id: "source", label: "Semua sumber", options: (it) => uniqVals(it, "source"), match: (i, v) => i.source === v },
    { id: "featured", label: "Semua item", options: () => [["1", "Unggulan saja"], ["0", "Bukan unggulan"]], match: (i, v) => (v === "1" ? !!i.featured : !i.featured) },
  ],
};

const cmpText = (a, b) => String(a || "").localeCompare(String(b || ""), "id", { sensitivity: "base" });
const cmpNum = (a, b, dir) => {
  const av = a == null ? null : Number(a);
  const bv = b == null ? null : Number(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nilai kosong selalu di bawah, apa pun arah urutannya
  if (bv == null) return -1;
  return dir * (av - bv);
};

const SORT_COMMON = [["manual", "Urutan manual"], ["az", "Nama A–Z"], ["za", "Nama Z–A"]];
const SORTS = {
  cars: [...SORT_COMMON, ["price-asc", "Harga termurah"], ["price-desc", "Harga termahal"], ["range-desc", "Jarak tempuh terjauh"], ["updated", "Terbaru diubah"]],
  motors: [...SORT_COMMON, ["price-asc", "Harga termurah"], ["price-desc", "Harga termahal"], ["range-desc", "Jarak tempuh terjauh"], ["updated", "Terbaru diubah"]],
  spklu: SORT_COMMON,
  bengkel: SORT_COMMON,
  berita: [...SORT_COMMON, ["date-desc", "Tanggal terbaru"], ["date-asc", "Tanggal terlama"]],
};

const SHORTCUTS = [
  ["Ctrl / ⌘ + K", "Pencarian global"],
  ["Ctrl / ⌘ + S", "Simpan sekarang"],
  ["Ctrl / ⌘ + Z", "Urungkan"],
  ["Ctrl / ⌘ + Shift + Z", "Ulangi"],
  ["N", "Tambah item di halaman aktif"],
  ["Esc", "Tutup dialog / menu"],
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

function formatRupiah(n) {
  if (n == null) return "";
  if (n >= 1e12) return "Rp " + (n / 1e12).toFixed(2).replace(".", ",") + " T";
  if (n >= 1e9) return "Rp " + (n / 1e9).toFixed(2).replace(/\.?0+$/, "").replace(".", ",") + " M";
  if (n >= 1e6) return "Rp " + Math.round(n / 1e6) + " jt";
  return "Rp " + new Intl.NumberFormat("id-ID").format(n);
}

/* Menerjemahkan teks harga bebas ("Rp 415 jt", "415 juta") jadi angka rupiah. */
function parseRupiah(text) {
  const t = String(text || "").toLowerCase().replace(/\./g, "").replace(/,/g, ".");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/\b(m|milyar|miliar)\b/.test(t)) n *= 1e9;
  else if (/\b(jt|juta)\b/.test(t)) n *= 1e6;
  else if (/\brb\b|ribu/.test(t)) n *= 1e3;
  return Math.round(n);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

function initials(text) {
  return String(text || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
}

function isVehicle(col) {
  return VEHICLE_COLS.includes(col);
}

function titleOf(col, item) {
  if (!item) return "";
  if (col === "berita") return item.title || "(tanpa judul)";
  if (isVehicle(col)) return `${item.brand || ""} ${item.name || ""}`.trim() || "(tanpa nama)";
  return item.name || "(tanpa nama)";
}

function metaOf(col, item) {
  if (isVehicle(col)) {
    const parts = [item.bodyType];
    if (item.variantNames && item.variantNames.length) parts.push(item.variantNames.length + " varian");
    parts.push(item.priceText || formatRupiah(item.price) || "Harga belum tersedia");
    if (item.rangeKm) parts.push(item.rangeKm + " km");
    return parts.filter(Boolean).join(" · ");
  }
  if (col === "spklu") return [item.operator, item.area, item.power, item.count ? item.count + " unit" : ""].filter(Boolean).join(" · ") || "Belum ada detail";
  if (col === "bengkel") return [item.type, item.brand, item.area].filter(Boolean).join(" · ") || "Belum ada detail";
  if (col === "berita") return [item.source, formatDate(item.date)].filter(Boolean).join(" · ") || "Belum ada detail";
  return "";
}

function imageOf(col, item) {
  return item && item.image ? item.image : "";
}

function findItem(col, id) {
  return (content[col] || []).find((x) => x.id === id) || null;
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
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
      title: "Tutup tanpa menyimpan?",
      text: "Perubahan pada formulir ini akan hilang.",
      okText: "Tutup tanpa simpan",
    });
    if (!ok) return;
  }
  editorTouched = false;
  closeModal(modal);
}

function confirmDialog(opts) {
  const modal = $("confirm-modal");
  const o = Object.assign({ title: "Konfirmasi", text: "", okText: "Hapus", danger: true }, opts || {});
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
    toast(step < 0 ? "Tidak ada lagi yang bisa diurungkan" : "Tidak ada lagi yang bisa diulangi", "info");
    return;
  }
  historyIndex = next;
  historyKey = "";
  content = JSON.parse(history[historyIndex]);
  markDirty();
  renderAll();
  scheduleSave();
  toast(step < 0 ? "Perubahan diurungkan" : "Perubahan diulangi", "info");
}

function setSaveState(state) {
  const el = $("save-state");
  if (!el) return;
  const text = state === "saving" ? "Menyimpan…" : state === "dirty" ? "Ada perubahan belum disimpan" : "Tersimpan";
  el.className = "save-state " + state;
  el.textContent = text;
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
    if (!data || !data.ok) throw new Error((data && data.error) || "Server menolak permintaan");
    content = data.content;
    dirty = false;
    setSaveState("saved");
    renderAll();
  } catch (err) {
    setSaveState("dirty");
    toast("Gagal menyimpan: " + (err && err.message ? err.message : "kesalahan jaringan"), "error");
  } finally {
    savingNow = false;
    if (savePending) { savePending = false; saveNow(); }
  }
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (res.status === 401) { location.href = "/admin/login"; throw new Error("Sesi berakhir"); }
  const data = await res.json();
  if (!data || !data.ok) throw new Error((data && data.error) || "Unggahan ditolak");
  return data.url;
}

/* ------------------------------------------------------------------ *
 * 7. Field generik (dipakai modal kendaraan & direktori)
 * ------------------------------------------------------------------ */

function optionsHtml(opts, current) {
  const list = (opts || []).map((o) => (Array.isArray(o) ? o : [o, o || "— pilih —"]));
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
    return `<div class="empty-state-text">Klik atau seret gambar ke sini</div>`;
  }
  return `<div class="media-item"><img src="${esc(url)}" alt="" loading="lazy" />
    <button type="button" class="media-remove" ${extraAttr || ""} title="Hapus gambar">&times;</button></div>`;
}

/* Repeater: barisnya dibaca langsung dari DOM saat simpan, jadi tidak perlu state ganda. */
function repeaterHtml(name, rows, kind) {
  const body = (rows || []).map((r, i) => repeaterRowHtml(name, r, kind, i)).join("");
  const addLabel = kind === "kv" ? "Tambah baris spesifikasi" : kind === "color" ? "Tambah warna" : "Tambah varian";
  return `<div class="repeater" data-rep="${esc(name)}" data-kind="${esc(kind)}">
    <div data-rep-body>${body}</div>
    <button type="button" class="btn btn-outline btn-sm repeater-add" data-rep-add="${esc(name)}">+ ${esc(addLabel)}</button>
  </div>`;
}

function repeaterRowHtml(name, row, kind, index) {
  const move = `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-move="-1" title="Naikkan">&uarr;</button>
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-move="1" title="Turunkan">&darr;</button>`;
  const del = `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-rep-del title="Hapus baris">&times;</button>`;

  if (kind === "kv") {
    const r = row || { label: "", value: "" };
    return `<div class="repeater-row">
      <input type="text" data-rk="label" value="${esc(r.label)}" placeholder="Label, mis. Ground clearance" />
      <input type="text" data-rk="value" value="${esc(r.value)}" placeholder="Nilai, mis. 170 mm" />
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
    <input type="text" data-rk="value" value="${esc(row || "")}" placeholder="Nama varian ke-${index + 1}" />
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
    fab.setAttribute("aria-label", `Tambah ${COL_ONE[activeView]}`);
    const label = fab.querySelector(".fab-label");
    if (label) label.textContent = `Tambah ${COL_ONE[activeView]}`;
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
  renderDashStats();
  renderDashCharts();
  renderDashRecent();
  renderDashHealth();
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
    ["Mobil listrik", (content.cars || []).length, "cars"],
    ["Motor listrik", (content.motors || []).length, "motors"],
    ["Lokasi SPKLU", (content.spklu || []).length, "spklu"],
    ["Bengkel", (content.bengkel || []).length, "bengkel"],
    ["Berita", (content.berita || []).length, "berita"],
    ["Merek unik", brands.size, ""],
    ["Total varian", variants, ""],
    ["Item draf", drafts, ""],
    ["Item unggulan", featured, ""],
    ["Tanpa gambar", noImage, ""],
    ["Harga terendah", prices.length ? formatRupiah(Math.min(...prices)) : "—", ""],
    ["Harga tertinggi", prices.length ? formatRupiah(Math.max(...prices)) : "—", ""],
    ["Rata-rata jarak tempuh", avgRange != null ? avgRange + " km" : "—", ""],
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
    const k = String(it[key] || "").trim() || "(kosong)";
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
    <div class="sub-head"><h4 class="panel-title">Model terbanyak per merek</h4></div>
    ${empty ? emptyStateHtml("Belum ada kendaraan", "Tambah mobil atau motor untuk melihat ringkasan ini.") : barChartHtml(byBrand)}
    <div class="sub-head"><h4 class="panel-title">Sebaran tipe bodi mobil</h4></div>
    ${byBody.length ? barChartHtml(byBody) : emptyStateHtml("Belum ada data", "Tipe bodi diambil dari data mobil.")}
    <div class="sub-head"><h4 class="panel-title">Pintasan papan ketik</h4></div>
    <div class="stack">${SHORTCUTS.map(([k, d]) => `<div class="row-meta"><span class="kbd">${esc(k)}</span> ${esc(d)}</div>`).join("")}</div>`;
}

function renderDashRecent() {
  const el = $("dash-recent");
  if (!el) return;
  const items = [];
  for (const col of VEHICLE_COLS) for (const it of content[col] || []) items.push({ col, it });
  items.sort((a, b) => String(b.it.updatedAt || "").localeCompare(String(a.it.updatedAt || "")));
  const recent = items.filter((x) => x.it.updatedAt).slice(0, 8);

  if (!recent.length) {
    el.innerHTML = emptyStateHtml("Belum ada riwayat perubahan", "Setiap kali kamu menyimpan kendaraan, waktunya dicatat di sini.");
    return;
  }
  el.innerHTML = `<div class="item-list">${recent
    .map(({ col, it }) => `<div class="item-row">
      <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
      <div class="row-main">
        <div class="row-title">${esc(titleOf(col, it))}</div>
        <div class="row-meta">${esc(COL_LABEL[col])} · diubah ${esc(formatDateTime(it.updatedAt))}</div>
      </div>
      <div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(col)}:${esc(it.id)}">Edit</button></div>
    </div>`)
    .join("")}</div>`;
}

function healthIssues() {
  const issues = [];
  for (const col of VEHICLE_COLS) {
    for (const it of content[col] || []) {
      const why = [];
      if (!it.image) why.push("tanpa gambar");
      if (it.price == null && !it.priceText) why.push("tanpa harga");
      if (it.rangeKm == null) why.push("tanpa jarak tempuh");
      if (!it.description) why.push("tanpa deskripsi");
      if (it.status === "draft") why.push("masih draf");
      if (it.stale) why.push("ditandai data lama");
      if (why.length) issues.push({ col, id: it.id, title: titleOf(col, it), why });
    }
  }
  for (const col of ["spklu", "bengkel"]) {
    for (const it of content[col] || []) {
      const why = [];
      if (!it.website && !it.mapUrl) why.push("tanpa tautan situs maupun peta");
      if (!it.address) why.push("tanpa alamat");
      if (why.length) issues.push({ col, id: it.id, title: titleOf(col, it), why });
    }
  }
  for (const it of content.berita || []) {
    const why = [];
    if (!it.url) why.push("tanpa tautan artikel");
    if (!it.image) why.push("tanpa gambar");
    if (why.length) issues.push({ col: "berita", id: it.id, title: titleOf("berita", it), why });
  }
  return issues;
}

function renderDashHealth() {
  const el = $("dash-health");
  if (!el) return;
  const issues = healthIssues();
  if (!issues.length) {
    el.innerHTML = emptyStateHtml("Semua data lengkap", "Tidak ada peringatan kelengkapan data saat ini.", "✅");
    return;
  }
  const shown = issues.slice(0, 40);
  el.innerHTML = `<div class="item-list">${shown
    .map((x) => `<div class="item-row" data-open="${esc(x.col)}:${esc(x.id)}">
      <div class="row-main">
        <div class="row-title">${esc(x.title)}</div>
        <div class="row-meta">${esc(COL_LABEL[x.col])} · ${esc(x.why.join(", "))}</div>
      </div>
      <div class="row-badges"><span class="badge badge-warn">${esc(x.why.length)}</span></div>
      <div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-open="${esc(x.col)}:${esc(x.id)}">Perbaiki</button></div>
    </div>`)
    .join("")}</div>${issues.length > shown.length ? `<div class="row-meta">dan ${issues.length - shown.length} peringatan lain…</div>` : ""}`;
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
    for (const f of FILTERS[col] || []) {
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
  return JSON.stringify((FILTERS[col] || []).map((f) => f.options(content[col] || [])));
}

function toolbarHtml(col) {
  const state = ui[col];
  const items = content[col] || [];
  const filters = (FILTERS[col] || [])
    .map((f) => `<select class="select-mini" data-filter="${esc(f.id)}" data-col="${esc(col)}">
      <option value="">${esc(f.label)}</option>${optionsHtml(f.options(items), state.filters[f.id] || "")}
    </select>`)
    .join("");

  const sorts = `<select class="select-mini" data-sort data-col="${esc(col)}">${optionsHtml(SORTS[col], state.sort)}</select>`;

  const bulk = isVehicle(col)
    ? `<button type="button" class="btn btn-ghost btn-sm" data-bulk="publish">Terbitkan</button>
       <button type="button" class="btn btn-ghost btn-sm" data-bulk="draft">Jadikan draf</button>`
    : "";

  return `<div class="toolbar">
    <div class="toolbar-search">
      <input type="search" class="search-input" data-search data-col="${esc(col)}" value="${esc(state.q)}" placeholder="Cari ${esc(COL_LABEL[col].toLowerCase())}…" />
    </div>
    <div class="toolbar-filters">
      ${filters}${sorts}
      <div class="view-switch">
        <button type="button" data-mode="list" data-col="${esc(col)}" class="${state.mode === "list" ? "active" : ""}">Daftar</button>
        <button type="button" data-mode="grid" data-col="${esc(col)}" class="${state.mode === "grid" ? "active" : ""}">Grid</button>
      </div>
      <label class="check-row"><input type="checkbox" data-all data-col="${esc(col)}" /> <span>Pilih semua</span></label>
    </div>
    <div class="toolbar-actions">
      <button type="button" class="btn btn-outline btn-sm" data-export="${esc(col)}">Ekspor JSON</button>
      <button type="button" class="btn btn-outline btn-sm" data-import="${esc(col)}">Impor JSON</button>
    </div>
  </div>
  <div class="bulk-bar" data-bulkbar="${esc(col)}" hidden>
    <span class="bulk-count">0 dipilih</span>
    ${bulk}
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="featured">Tandai unggulan</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="unfeatured">Batal unggulan</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="duplicate">Duplikat</button>
    <button type="button" class="btn btn-danger btn-sm" data-bulk="delete">Hapus</button>
    <button type="button" class="btn btn-ghost btn-sm" data-bulk="clear">Batal pilih</button>
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
      if (count) count.textContent = state.sel.size + " dipilih";
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
  if (isVehicle(col) && it.status === "draft") badges.push('<span class="badge badge-draft">Draf</span>');
  if (it.featured) badges.push('<span class="badge badge-featured">Unggulan</span>');
  if (isVehicle(col) && it.stale) badges.push('<span class="badge badge-warn">Data lama</span>');
  if (isVehicle(col) && !it.image) badges.push('<span class="badge badge-muted">Tanpa gambar</span>');

  const view = col === "cars" ? `<a class="btn btn-ghost btn-sm" href="/mobil/${encodeURIComponent(it.id)}" target="_blank" rel="noopener">Lihat</a>` : "";
  const link = col === "berita" && it.url ? `<a class="btn btn-ghost btn-sm" href="${esc(it.url)}" target="_blank" rel="noopener">Buka</a>` : "";
  const map = (col === "spklu" || col === "bengkel") && it.mapUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(it.mapUrl)}" target="_blank" rel="noopener">Peta</a>` : "";

  return `<div class="item-row${selected ? " selected" : ""}" data-col="${esc(col)}" data-id="${esc(it.id)}"${dragEnabled ? "" : ' data-nodrag="1"'}>
    <input type="checkbox" class="row-check" data-check data-col="${esc(col)}" data-id="${esc(it.id)}"${selected ? " checked" : ""} aria-label="Pilih ${esc(titleOf(col, it))}" />
    <span class="drag-handle" title="${dragEnabled ? "Seret untuk mengurutkan" : "Ubah urutan ke “Urutan manual” untuk menyeret"}">⋮⋮</span>
    <div class="row-thumb">${thumbInnerHtml(imageOf(col, it), titleOf(col, it))}</div>
    <div class="row-main">
      <div class="row-title">${esc(titleOf(col, it))}</div>
      <div class="row-meta">${esc(metaOf(col, it))}</div>
    </div>
    <div class="row-badges">${badges.join("")}</div>
    <div class="row-actions">
      ${view}${link}${map}
      <button type="button" class="btn btn-ghost btn-sm" data-open="${esc(col)}:${esc(it.id)}">Edit</button>
      <button type="button" class="btn btn-ghost btn-sm" data-dup="${esc(col)}:${esc(it.id)}">Duplikat</button>
      <button type="button" class="btn btn-danger btn-sm" data-del="${esc(col)}:${esc(it.id)}">Hapus</button>
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
    <span class="row-meta">${total} item</span>
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
      ? emptyStateHtml("Tidak ada hasil", "Coba ubah kata kunci atau setel ulang filter di atas.", "🔍")
      : emptyStateHtml(
        `Belum ada ${COL_LABEL[col].toLowerCase()}`,
        `Mulai dengan menambahkan ${COL_ONE[col].toLowerCase()} pertama. Isian wajibnya hanya merek dan nama model.`,
        "➕",
        { col, label: `+ Tambah ${COL_ONE[col]}` },
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
  for (const def of DIR_FIELDS[col]) item[def.k] = def.t === "switch" ? false : def.t === "number" ? null : "";
  return item;
}

function duplicateItem(col, id) {
  const src = findItem(col, id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  const nameKey = col === "berita" ? "title" : "name";
  copy[nameKey] = String(copy[nameKey] || "") + " (salinan)";
  copy.id = uniqueId(col, slugify(isVehicle(col) ? `${copy.brand} ${copy.name}` : copy[nameKey]) || col);
  if (isVehicle(col)) { copy.status = "draft"; copy.updatedAt = new Date().toISOString(); }
  const idx = (content[col] || []).findIndex((x) => x.id === id);
  content[col].splice(idx + 1, 0, copy);
  commit();
  toast("Item diduplikat sebagai draf", "success");
}

async function deleteItem(col, id) {
  const item = findItem(col, id);
  if (!item) return;
  const ok = await confirmDialog({
    title: "Hapus item?",
    text: `“${titleOf(col, item)}” akan dihapus dari ${COL_LABEL[col]}.`,
    okText: "Hapus",
  });
  if (!ok) return;
  const before = snapshotNow();
  content[col] = content[col].filter((x) => x.id !== id);
  ui[col].sel.delete(id);
  commit();
  toast(`“${titleOf(col, item)}” dihapus`, "success", {
    label: "Urungkan",
    onClick: () => { content = JSON.parse(before); commit(); toast("Penghapusan diurungkan", "info"); },
  });
}

async function bulkAction(col, action) {
  const state = ui[col];
  const ids = [...state.sel];
  if (!ids.length) return;

  if (action === "clear") { state.sel.clear(); renderCollection(col); return; }

  if (action === "delete") {
    const ok = await confirmDialog({ title: "Hapus item terpilih?", text: `${ids.length} item akan dihapus dari ${COL_LABEL[col]}.`, okText: "Hapus semua" });
    if (!ok) return;
    const before = snapshotNow();
    content[col] = content[col].filter((x) => !state.sel.has(x.id));
    state.sel.clear();
    commit();
    toast(`${ids.length} item dihapus`, "success", {
      label: "Urungkan",
      onClick: () => { content = JSON.parse(before); commit(); toast("Penghapusan diurungkan", "info"); },
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
  toast(`${ids.length} item diperbarui`, "success");
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
    toast("Item itu tidak ada lagi — mungkin sudah dihapus", "error");
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
  if (eyebrow) eyebrow.textContent = `${COL_LABEL[col]} · ${id ? "Edit" : "Baru"}`;

  const title = $("editor-title");
  if (title) title.textContent = id ? titleOf(col, item) : `Tambah ${COL_ONE[col]} Baru`;

  const sub = $("editor-sub");
  if (sub) {
    sub.textContent = id
      ? "Perubahan baru tersimpan setelah menekan Simpan."
      : "Hanya Merek dan Nama Model yang wajib. Sisanya bisa dilengkapi kapan saja.";
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
  nav.innerHTML = EDITOR_SECTIONS.map((sec) => `<button type="button" class="editor-nav-item" data-goto-section="${esc(sec.k)}">
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
  return `<div class="chip-row" aria-label="Tambah baris spesifikasi siap pakai">
    <span class="chip-row-label">Cepat tambah:</span>
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
    const sec = EDITOR_SECTIONS.find((x) => x.k === key);
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
      <h3>Baris spesifikasi tambahan</h3>
      <p class="hint">Untuk data yang tidak tercakup field di atas. Tampil apa adanya di halaman detail.</p>
      ${specPresetHtml(col)}
      ${repeaterHtml("specs", item.specs || [], "kv")}
    </div>`);

  fill("media", `<div class="field-grid">
    <div class="field full">
      <label>Gambar Utama</label>
      <div class="dropzone" data-vzone="image">${imagePreviewHtml(vehicleCtx.draft.image, 'data-vimg-del="1"')}</div>
      <div class="hint">Klik untuk memilih berkas, atau seret gambar ke kotak ini.</div>
    </div>
    <div class="field full">
      <label>Galeri</label>
      <div class="dropzone" data-vzone="gallery"><div class="empty-state-text">Klik atau seret beberapa gambar sekaligus ke sini</div></div>
      <div class="gallery-list" data-gallery>${galleryHtml(vehicleCtx.draft.gallery)}</div>
      <div class="hint">Seret pratinjau untuk mengubah urutan tampil.</div>
    </div>
    ${fieldHtml({ k: "video", l: "URL Video", t: "url", full: true, ph: "https://youtube.com/watch?v=…" }, item.video, "v")}
  </div>`);

  fill("varian", `${repeaterHtml("variantNames", item.variantNames || [], "text")}`);

  fill("lanjutan", `<div class="editor-subsection">
      <h3>Pilihan Warna</h3>
      ${repeaterHtml("colors", item.colors || [], "color")}
    </div>
    <div class="editor-subsection">
      <h3>Keunggulan</h3>
      <div class="field full">
        <label for="v-highlights">Satu keunggulan per baris</label>
        <textarea id="v-highlights" name="highlights" rows="5" placeholder="Pengisian cepat 18 menit&#10;Garansi baterai 8 tahun">${esc((item.highlights || []).join("\n"))}</textarea>
      </div>
    </div>
    <div class="editor-subsection">
      <h3>Identitas Teknis</h3>
      <div class="field-grid">
        <div class="field full">
          <label for="v-id">ID (dipakai di tautan halaman ${esc(one)})</label>
          <input type="text" id="v-id" name="__id" value="${esc(item.id)}" readonly />
          <div class="hint">${vehicleCtx.id
            ? "ID tidak berubah lagi supaya tautan yang sudah tersebar tetap hidup."
            : "Dibuat otomatis dari Merek &amp; Nama Model, dan ikut berubah selama item ini belum disimpan."}</div>
        </div>
        <div class="field">
          <button type="button" class="btn btn-outline btn-sm" data-copy-from="v-id">Salin ID</button>
        </div>
        <div class="field">
          <div class="hint">Terakhir diubah: ${esc(item.updatedAt ? formatDateTime(item.updatedAt) : "belum pernah")}</div>
        </div>
      </div>
    </div>`);

  updateVehiclePreview();
}

function galleryHtml(list) {
  if (!list.length) return `<div class="empty-state-text">Galeri masih kosong.</div>`;
  return list
    .map((url, i) => `<div class="gallery-item" draggable="true" data-gi="${i}">
      <img src="${esc(url)}" alt="" loading="lazy" />
      <button type="button" class="gallery-remove" data-gal-del="${i}" title="Hapus dari galeri">&times;</button>
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
    const meta = [body, priceText || formatRupiah(price) || "Harga belum tersedia", range ? range + " km" : ""].filter(Boolean).join(" · ");

    box.innerHTML = `<div class="row-thumb">${thumbInnerHtml(vehicleCtx.draft.image, brand + " " + name)}</div>
      <div class="row-main">
        <div class="row-title">${esc(`${brand} ${name}`.trim() || (vehicleCtx.col === "motors" ? "Motor baru" : "Mobil baru"))}</div>
        <div class="row-meta">${esc(meta)}</div>
      </div>`;
  }

  // Item baru: ID ikut mengikuti ketikan sampai disimpan, jadi tidak ada kejutan.
  const idInput = $("v-id");
  if (idInput && !vehicleCtx.id) {
    const slug = slugify(`${brand} ${name}`);
    idInput.value = slug ? uniqueId(vehicleCtx.col, slug) : "";
    idInput.placeholder = "otomatis dari merek & nama";
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
      <div class="editor-meter-text"><strong>${stats.pct}% lengkap</strong> · ${stats.filled} dari ${stats.total} detail terisi</div>`;
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
  if (!data.brand) badSection = markError(form, "brand", "Merek wajib diisi.") || badSection;
  if (!data.name) badSection = markError(form, "name", "Nama model wajib diisi.") || badSection;
  if (badSection) {
    scrollToSection(badSection.getAttribute("data-section"));
    const firstBad = form.querySelector(".field.has-error input, .field.has-error select, .field.has-error textarea");
    if (firstBad) setTimeout(() => firstBad.focus({ preventScroll: true }), 260);
    toast("Lengkapi field yang ditandai merah", "error");
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
    toast(`“${label}” ditambahkan — lanjut isi ${COL_ONE[col].toLowerCase()} berikutnya`, "success");
    return;
  }

  setView(col);
  if (id) {
    toast("Perubahan disimpan", "success");
  } else {
    toast(`“${label}” ditambahkan`, "success", {
      label: "Buka lagi",
      onClick: () => openEditor(col, savedId),
    });
  }
}

/* ------------------------------------------------------------------ *
 * 13. Modal direktori
 * ------------------------------------------------------------------ */

function openDir(col, id) {
  const defs = DIR_FIELDS[col];
  if (!defs) return;
  const item = id ? findItem(col, id) : blankItem(col);
  if (!item) return;

  dirCtx = { col, id: id || null, draft: {} };
  editorTouched = false;
  for (const d of defs) if (d.t === "image") dirCtx.draft[d.k] = item[d.k] || "";

  const title = $("dir-modal-title");
  if (title) title.textContent = id ? `Edit ${COL_ONE[col]}: ${titleOf(col, item)}` : `Tambah ${COL_ONE[col]} Baru`;

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
  const defs = DIR_FIELDS[col];
  clearErrors(form);

  const data = {};
  for (const def of defs) data[def.k] = def.t === "image" ? dirCtx.draft[def.k] || "" : readField(form, def);

  const nameKey = col === "berita" ? "title" : "name";
  if (!data[nameKey]) {
    markError(form, nameKey, col === "berita" ? "Judul wajib diisi." : "Nama wajib diisi.");
    toast("Lengkapi field yang ditandai merah", "error");
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
  toast(id ? "Perubahan disimpan" : "Item baru ditambahkan", "success");
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

  for (const key of ["logoImage", "heroImage", "seoOgImage"]) add(content.site[key], "Pengaturan situs · " + key);
  for (const col of VEHICLE_COLS) {
    for (const it of content[col] || []) {
      add(it.image, `${COL_LABEL[col]} · ${titleOf(col, it)}`);
      (it.gallery || []).forEach((g) => add(g, `${COL_LABEL[col]} · ${titleOf(col, it)} (galeri)`));
    }
  }
  for (const it of content.berita || []) add(it.image, `Berita · ${titleOf("berita", it)}`);
  for (const u of mediaUploads) add(u, "Unggahan baru (belum dipakai)");

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
    <div class="empty-state-text">Klik atau seret gambar ke sini untuk mengunggah dan mendapatkan URL</div>
  </div>`;

  if (!items.length) {
    el.innerHTML = uploader + (q
      ? emptyStateHtml("Tidak ada hasil", `Tidak ada gambar yang cocok dengan "${esc(q)}".`, "🔍")
      : emptyStateHtml("Belum ada gambar", "Gambar yang dipakai di kendaraan, berita, dan pengaturan situs akan muncul di sini.", "🖼️"));
    return;
  }

  el.innerHTML = uploader + `<div class="media-grid">${items
    .map(([url, uses]) => `<div class="media-item">
      <img src="${esc(url)}" alt="" loading="lazy" />
      <button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(url)}" title="Salin URL">Salin URL</button>
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
        <button type="button" class="btn btn-primary btn-sm" id="backup-download">Unduh cadangan sekarang</button>
        <button type="button" class="btn btn-outline btn-sm" id="backup-import">Impor dari file JSON</button>
      </div>
    </div>`;

    if (!backups.length) {
      el.innerHTML = actions + emptyStateHtml("Belum ada cadangan", "Cadangan dibuat otomatis setiap kali kamu menyimpan perubahan.", "🗄️");
      return;
    }

    el.innerHTML = actions + `<div class="item-list">${backups
      .map((b) => `<div class="item-row">
        <div class="row-main">
          <div class="row-title">${esc(formatDateTime(b.time))}</div>
          <div class="row-meta">${esc(b.name)} · ${esc(formatSize(b.size))}</div>
        </div>
        <div class="row-actions"><button type="button" class="btn btn-outline btn-sm" data-restore="${esc(b.name)}">Pulihkan</button></div>
      </div>`)
      .join("")}</div>`;
  } catch (err) {
    el.innerHTML = emptyStateHtml("Gagal memuat cadangan", "Periksa koneksi lalu muat ulang halaman.", "⚠️");
  }
}

async function restoreBackup(name) {
  const ok = await confirmDialog({
    title: "Pulihkan cadangan?",
    text: `Seluruh konten aktif akan diganti isi ${name}. Konten saat ini otomatis dicadangkan lebih dulu.`,
    okText: "Pulihkan",
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
    if (!data || !data.ok) throw new Error((data && data.error) || "Gagal memulihkan");
    content = data.content;
    dirty = false;
    setSaveState("saved");
    resetHistory();
    renderAll();
    loadBackups();
    toast("Cadangan berhasil dipulihkan", "success");
  } catch (err) {
    toast("Gagal memulihkan: " + err.message, "error");
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
  if (!rows) { toast("File tidak berisi daftar item yang dikenali", "error"); return; }
  const ok = await confirmDialog({
    title: "Impor data?",
    text: `${rows.length} item akan ditambahkan ke ${COL_LABEL[col]}. Data yang sudah ada tidak dihapus.`,
    okText: "Impor",
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
  toast(`${rows.length} item diimpor`, "success");
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
  dz.innerHTML = `<div class="upload-progress"><span class="spinner"></span> Mengunggah ${files.length} gambar…</div>`;
  const urls = [];
  try {
    for (const f of files) urls.push(await uploadImage(f));
  } catch (err) {
    dz.innerHTML = prev;
    toast("Gagal mengunggah: " + err.message, "error");
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
  } else if (dzone === "__media") {
    mediaUploads.push(...urls);
    renderMedia();
    toast("Gambar diunggah, URL siap disalin", "success");
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
  if (urls.length && !dzone) toast("Gambar diunggah", "success");
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
      <h3 class="modal-title">Pencarian global</h3>
      <button type="button" class="modal-close" data-palette-close title="Tutup">&times;</button>
    </div>
    <div class="modal-body">
      <input type="search" class="search-input" id="palette-input" placeholder="Cari di semua koleksi…" autocomplete="off" />
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
    box.innerHTML = `<div class="empty-state-text">Ketik nama mobil, motor, SPKLU, bengkel, atau berita.</div>`;
    return;
  }
  if (!results.length) {
    box.innerHTML = emptyStateHtml("Tidak ada hasil", "Coba kata kunci lain.", "🔍");
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
      <div class="row-badges"><span class="badge badge-muted">${esc(COL_LABEL[col])}</span></div>
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

    if (e.target.closest("#sidebar-toggle")) { toggleSidebar(); return; }

    /* Lapisan gelap di belakang drawer: klik di mana pun padanya menutup sidebar. */
    if (e.target.id === "sidebar-scrim") { $("admin-app").classList.remove("sidebar-open"); return; }

    if (e.target.closest("#logout")) {
      e.preventDefault();
      fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/admin/login"; });
      return;
    }

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

    if (e.target.closest("#media-refresh")) { renderMedia(); toast("Daftar media dimuat ulang", "info"); return; }

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
      if (!text) { toast("Belum ada ID untuk disalin", "info"); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Disalin ke papan klip", "success"), () => toast("Gagal menyalin", "error"));
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
      toast("Berkas JSON diunduh", "success");
      return;
    }

    const imp = e.target.closest("[data-import]");
    if (imp) { const col = imp.getAttribute("data-import"); pickJson((parsed) => importCollection(col, parsed)); return; }

    /* --- Cadangan --- */
    const restore = e.target.closest("[data-restore]");
    if (restore) { restoreBackup(restore.getAttribute("data-restore")); return; }

    if (e.target.closest("#backup-download")) {
      downloadJson("evkita-content.json", content);
      toast("Cadangan diunduh", "success");
      return;
    }
    if (e.target.closest("#backup-import")) {
      pickJson(async (parsed) => {
        if (!parsed || typeof parsed !== "object" || !parsed.site) { toast("File bukan cadangan konten EVKita", "error"); return; }
        const ok = await confirmDialog({ title: "Ganti seluruh konten?", text: "Isi file akan menggantikan seluruh konten aktif.", okText: "Ganti", danger: false });
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
        toast(`Baris “${label}” sudah ada`, "info");
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
    const t = e.target;
    if (t.closest && t.closest("#vehicle-form, #dir-form")) editorTouched = true;

    /* Panel combobox hanya bereaksi pada ketikan sungguhan: memilih dari
       daftar juga memicu event ini, dan panelnya harus tetap tertutup. */
    if (e.isTrusted && t.matches && t.matches("[data-combo-input]")) {
      openCombo(t.closest(".combo"), { filter: true });
      /* sengaja tidak return: pratinjau editor ikut perlu diperbarui */
    }

    const search = t.closest && t.closest("[data-search]");
    if (search) {
      const col = search.getAttribute("data-col");
      ui[col].q = search.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    if (t.id === "palette-input") { renderPalette(t.value); return; }

    if (t.id === "global-search") { openPalette(t.value); t.value = ""; return; }

    // Warna repeater: input color dan teks saling menyalin.
    if (t.matches && t.matches('.repeater-row [data-rk="color"]')) {
      const text = t.closest(".color-field").querySelector('[data-rk="value"]');
      if (text) text.value = t.value;
      return;
    }
    if (t.matches && t.matches('.color-field [data-rk="value"]')) {
      const color = t.closest(".color-field").querySelector('[data-rk="color"]');
      if (color && /^#[0-9a-fA-F]{6}$/.test(t.value)) color.value = t.value;
      return;
    }

    if (t.closest && t.closest("#vehicle-form")) { updateVehiclePreview(); return; }

    if (t.id === "media-search") { renderMedia(); return; }

    const siteForm = t.closest && t.closest("#site-form");
    if (siteForm) {
      collectSiteForm();
      if (t.type === "range") syncRangeOutputs();
      if (t.name === "themePrimary" || t.name === "themeSecondary") applyThemePreview();
      commit({ key: "site:" + t.name, render: false });
      return;
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.closest && t.closest("#vehicle-form, #dir-form")) editorTouched = true;

    const filter = t.closest && t.closest("[data-filter]");
    if (filter) {
      const col = filter.getAttribute("data-col");
      ui[col].filters[filter.getAttribute("data-filter")] = filter.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    const sort = t.closest && t.closest("[data-sort]");
    if (sort) {
      const col = sort.getAttribute("data-col");
      ui[col].sort = sort.value;
      ui[col].page = 1;
      renderCollection(col);
      return;
    }

    const all = t.closest && t.closest("[data-all]");
    if (all) {
      const col = all.getAttribute("data-col");
      const vis = visibleItems(col);
      if (all.checked) vis.forEach((i) => ui[col].sel.add(i.id));
      else vis.forEach((i) => ui[col].sel.delete(i.id));
      renderCollection(col);
      return;
    }

    const check = t.closest && t.closest("[data-check]");
    if (check) {
      const col = check.getAttribute("data-col");
      const id = check.getAttribute("data-id");
      if (check.checked) ui[col].sel.add(id); else ui[col].sel.delete(id);
      const row = check.closest(".item-row");
      if (row) row.classList.toggle("selected", check.checked);
      syncToolbar(col);
      return;
    }

    if (t.closest && t.closest("#site-form") && t.type === "checkbox") {
      collectSiteForm();
      commit({ render: false });
    }
  });

  /* --- Submit form --- */
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.id === "vehicle-form") { e.preventDefault(); saveVehicle(); return; }
    if (form.id === "dir-form") { e.preventDefault(); saveDir(); return; }
    if (form.id === "site-form") {
      e.preventDefault();
      collectSiteForm();
      commit({ render: false });
      saveNow();
      toast("Pengaturan situs disimpan", "success");
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
    else if (row) toast("Ubah pengurutan ke “Urutan manual” dulu untuk menyeret baris", "info");
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
      catch (err) { toast("File JSON tidak valid", "error"); }
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
        title: "Tinggalkan halaman ini?",
        text: "Isian yang belum disimpan akan hilang.",
        okText: "Tinggalkan",
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

async function init() {
  ensureHiddenInputs();
  applySidebarPref();
  bindEvents();

  try {
    const res = await fetch("/api/content");
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!data || !data.ok) throw new Error("Gagal memuat konten");
    content = data.content;
  } catch (err) {
    toast("Gagal memuat konten: " + err.message, "error");
    return;
  }

  resetHistory();
  setSaveState("saved");
  renderAll();

  lastHash = location.hash;
  const route = parseRoute(location.hash);
  if (route.kind === "editor") openVehicle(route.col, route.id);
  else setView(route.view, { hash: false });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
