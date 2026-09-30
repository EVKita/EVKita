"use strict";

import { esc, rupiah, vehicleHref, cardHTML as buildCard, visualHTML as buildVisual } from "../lib/card-html.js";
import { voteRowHtml, rankVotes, saringKendaraan } from "../lib/vote-html.js";
import { MAX_COMPARE, compareTableHTML, compareSlug } from "../lib/compare-html.js";
import { hargaWajar } from "../lib/vehicle-spec.js";
import { makePubT, normalizePubLocale } from "../lib/i18n/pub.js";

/* Bahasa situs publik dibaca dari cookie yang ditulis LanguageToggle. */
function readPubLang() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)evkita_pub_lang=([^;]+)/);
    return normalizePubLocale(m ? m[1] : "");
  } catch {
    return "id";
  }
}
const t = makePubT(readPubLang());

let EV_CARS = [];
let MOTORS = [];
let dataset = [];

/*
 * Pembangun kartu diambil dari src/lib/card-html.js dan tabel perbandingan
 * dari src/lib/compare-html.js — modul yang sama dipakai server saat merender
 * beranda dan halaman /bandingkan, supaya markupnya tidak bisa berselisih
 * antara kedua sisi.
 */

const PRICE_BUCKETS = [
  { id: "all", labelKey: "pub.filter.semuaHarga" },
  { id: "under300", labelKey: "pub.filter.under300", test: (p) => p !== null && p < 300000000 },
  { id: "under500", labelKey: "pub.filter.under500", test: (p) => p !== null && p < 500000000 },
  { id: "500-800", labelKey: "pub.filter.rentang500", test: (p) => p !== null && p >= 500000000 && p < 800000000 },
  { id: "over800", labelKey: "pub.filter.over800", test: (p) => p !== null && p >= 800000000 },
];

const RANGE_BUCKETS = [
  { id: "all", labelKey: "pub.filter.semuaJarak" },
  { id: "r0", labelKey: "pub.filter.under200", test: (v) => v !== null && v < 200 },
  { id: "r200", labelKey: "pub.filter.rentang200", test: (v) => v !== null && v >= 200 && v < 350 },
  { id: "r350", labelKey: "pub.filter.rentang350", test: (v) => v !== null && v >= 350 && v < 500 },
  { id: "r500", labelKey: "pub.filter.over500", test: (v) => v !== null && v >= 500 },
];

const BATTERY_BUCKETS = [
  { id: "all", labelKey: "pub.filter.semuaKapasitas" },
  { id: "b0", labelKey: "pub.filter.under40", test: (v) => v !== null && v < 40 },
  { id: "b40", labelKey: "pub.filter.rentang40", test: (v) => v !== null && v >= 40 && v < 60 },
  { id: "b60", labelKey: "pub.filter.rentang60", test: (v) => v !== null && v >= 60 && v < 80 },
  { id: "b80", labelKey: "pub.filter.over80", test: (v) => v !== null && v >= 80 },
];

const SORTERS = {
  brand: (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
  priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  priceDesc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  rangeDesc: (a, b) => (b.rangeKm ?? -1) - (a.rangeKm ?? -1),
  batteryDesc: (a, b) => (b.batteryKwh ?? -1) - (a.batteryKwh ?? -1),
  powerDesc: (a, b) => (b.powerHp ?? -1) - (a.powerHp ?? -1),
  newest: (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
};

const DEFAULTS = {
  mode: "mobil",
  search: "",
  brand: "all",
  body: "all",
  price: "all",
  range: "all",
  battery: "all",
  sort: "rangeDesc",
  view: "grid",
};

const state = { ...DEFAULTS, compare: [] };

/**
 * Beranda etalase: empat kartu pertama dalam keadaan bawaan. Seluruh
 * katalog pindah ke /katalog lewat tombol "Buka katalog lengkap" di bawah
 * grid. Angka 4 ini disamakan dengan HOME_CARDS di src/pages/index.astro —
 * kalau salah satunya berubah tanpa yang lain, kartu akan melompat saat
 * skrip selesai dimuat.
 */
const HOME_TEASER = 4;

/* Keadaan bawaan = belum ada ketikan, pilihan, atau urutan yang diubah. */
function isDefaultState() {
  return (
    !state.search.trim() &&
    state.brand === "all" &&
    state.body === "all" &&
    state.price === "all" &&
    state.range === "all" &&
    state.battery === "all" &&
    state.sort === DEFAULTS.sort
  );
}

const $ = (id) => document.getElementById(id);

const uiState = { color: {}, variant: {} };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animasi masuk hanya untuk render pertama. Setiap ketikan di kotak cari
 * merender ulang seluruh kartu; kalau semuanya ikut memudar lagi, mengetik
 * terasa berkedip-kedip.
 */
let animateCards = true;


/* ===== Sinkronisasi state dengan URL =====
   Supaya hasil filter bisa disalin-tempel dan dibagikan, bukan cuma hidup di
   memori tab yang sedang dibuka. */

const URL_KEYS = {
  mode: "mode",
  search: "q",
  brand: "merek",
  body: "bodi",
  price: "harga",
  range: "jarak",
  battery: "baterai",
  sort: "urut",
  view: "tampilan",
};

function readUrlState() {
  const p = new URLSearchParams(location.search);
  for (const [key, param] of Object.entries(URL_KEYS)) {
    const v = p.get(param);
    if (v !== null && v !== "") state[key] = v;
  }
  const cmp = p.get("banding");
  if (cmp) state.compare = cmp.split(",").filter(Boolean).slice(0, MAX_COMPARE);
  if (state.mode !== "motor") state.mode = "mobil";
  if (state.view !== "list") state.view = "grid";
  if (!SORTERS[state.sort]) state.sort = DEFAULTS.sort;
}

function writeUrlState() {
  const p = new URLSearchParams(location.search);
  for (const [key, param] of Object.entries(URL_KEYS)) {
    if (state[key] && state[key] !== DEFAULTS[key]) p.set(param, state[key]);
    else p.delete(param);
  }
  if (state.compare.length) p.set("banding", state.compare.join(","));
  else p.delete("banding");
  const qs = p.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
}

/* ===== Kartu kendaraan =====
   Markupnya dibangun src/lib/card-html.js. Di sini hanya status yang khas
   browser yang disuntikkan: warna dan varian yang sedang dipilih pembaca,
   daftar bandingkan, dan apakah animasi masuk masih perlu dijalankan. */

/**
 * Beranda mengirim peta ringkas `alamat → alt`; `card-html.js` menunggu bentuk
 * penuh `{ alamat: { alt } }` yang sama dengan `content.media`. Diterjemahkan
 * di sini, sekali, bukan di setiap kartu.
 */
let mediaMapCache = null;
function toMediaMap(lite) {
  if (mediaMapCache) return mediaMapCache;
  mediaMapCache = {};
  for (const [url, alt] of Object.entries(lite)) mediaMapCache[url] = { alt };
  return mediaMapCache;
}

function cardHTML(c) {
  return buildCard(c, {
    linkable: true,
    compare: state.compare,
    color: uiState.color,
    variant: uiState.variant,
    animate: animateCards,
    media: window.__EV_MEDIA_ALT__ ? toMediaMap(window.__EV_MEDIA_ALT__) : {},
    t,
  });
}


/* ===== Filter & render ===== */

function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(el, options, selected) {
  if (!el) return;
  el.innerHTML = options
    .map((o) => `<option value="${esc(o.id)}">${esc(o.labelKey ? t(o.labelKey) : o.label)}</option>`)
    .join("");
  el.value = options.some((o) => o.id === selected) ? selected : options[0].id;
}

function populateFilters() {
  const brands = uniqSorted(dataset.map((c) => c.brand));
  const bodies = uniqSorted(dataset.map((c) => c.bodyType));

  fillSelect(
    $("filterBrand"),
    [{ id: "all", labelKey: "pub.filter.semuaMerek" }, ...brands.map((b) => ({ id: b, label: b }))],
    state.brand
  );
  state.brand = $("filterBrand").value;

  fillSelect(
    $("filterBody"),
    [{ id: "all", labelKey: "pub.filter.semuaTipe" }, ...bodies.map((b) => ({ id: b, label: b }))],
    state.body
  );
  state.body = $("filterBody").value;

  fillSelect($("filterPrice"), PRICE_BUCKETS, state.price);
  fillSelect($("filterRange"), RANGE_BUCKETS, state.range);
  fillSelect($("filterBattery"), BATTERY_BUCKETS, state.battery);
  const sortEl = $("sortBy");
  if (sortEl) sortEl.value = state.sort;

  renderBodyChips(bodies);
}

function renderBodyChips(bodies) {
  const wrap = $("bodyChips");
  if (!wrap) return;
  if (bodies.length < 2) {
    wrap.innerHTML = "";
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const counts = {};
  for (const c of dataset) counts[c.bodyType] = (counts[c.bodyType] || 0) + 1;
  wrap.innerHTML =
    `<button type="button" class="chip${state.body === "all" ? " active" : ""}" data-chip="all">${t("pub.filter.semua")} <span class="chip-count">${dataset.length}</span></button>` +
    bodies
      .map(
        (b) =>
          `<button type="button" class="chip${state.body === b ? " active" : ""}" data-chip="${esc(b)}">${esc(b)} <span class="chip-count">${counts[b]}</span></button>`
      )
      .join("");
}

function bucketTest(list, id, value) {
  if (id === "all") return true;
  const b = list.find((x) => x.id === id);
  return b && b.test ? b.test(value) : true;
}

function getFiltered() {
  const q = state.search.trim().toLowerCase();
  const list = dataset.filter((c) => {
    if (q) {
      const hay = [c.brand, c.name, c.bodyType, c.tagline, ...(c.tags || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.brand !== "all" && c.brand !== state.brand) return false;
    if (state.body !== "all" && c.bodyType !== state.body) return false;
    if (!bucketTest(PRICE_BUCKETS, state.price, c.price)) return false;
    if (!bucketTest(RANGE_BUCKETS, state.range, c.rangeKm)) return false;
    if (!bucketTest(BATTERY_BUCKETS, state.battery, c.batteryKwh)) return false;
    return true;
  });

  list.sort(SORTERS[state.sort] || SORTERS.brand);
  return list;
}

function activeFilterChips() {
  const chips = [];
  if (state.search.trim()) chips.push({ key: "search", label: `“${state.search.trim()}”` });
  if (state.brand !== "all") chips.push({ key: "brand", label: state.brand });
  if (state.body !== "all") chips.push({ key: "body", label: state.body });
  const named = (list, id) => {
    const item = list.find((x) => x.id === id) || {};
    return item.labelKey ? t(item.labelKey) : item.label;
  };
  if (state.price !== "all") chips.push({ key: "price", label: named(PRICE_BUCKETS, state.price) });
  if (state.range !== "all") chips.push({ key: "range", label: named(RANGE_BUCKETS, state.range) });
  if (state.battery !== "all") chips.push({ key: "battery", label: named(BATTERY_BUCKETS, state.battery) });
  return chips;
}

function renderHeroStats() {
  const el = $("heroStats");
  if (!el) return;
  const all = [...EV_CARS, ...MOTORS];
  const brandCount = new Set(all.map((c) => c.brand)).size;
  /* Harga di luar batas wajar diabaikan saat menghitung yang terendah — satu
     harga salah ketik tidak boleh membuat statistik berbunyi "Rp 0 jt". */
  const priced = all.filter((c) => hargaWajar(c.price));
  const minPrice = priced.length ? Math.min(...priced.map((c) => c.price)) : null;
  const ranged = all.filter((c) => c.rangeKm);
  const maxRange = ranged.length ? Math.max(...ranged.map((c) => c.rangeKm)) : 0;

  const pills = [
    [all.length, t("pub.stat.models")],
    [brandCount, t("pub.stat.brands")],
    [minPrice !== null ? rupiah(minPrice) : "—", t("pub.stat.minPrice")],
    [maxRange ? maxRange + " km" : "—", t("pub.stat.maxRange")],
  ];
  el.innerHTML = pills
    .map(([n, l]) => `<div class="stat-pill"><span class="num">${esc(n)}</span><span class="label">${esc(l)}</span></div>`)
    .join("");
}

function render() {
  const full = getFiltered();
  /* Etalase empat kartu; interaksi apa pun (cari, filter, urut, tautan
     berbagi berisi parameter) membuka seluruh hasil. */
  const list = isDefaultState() && full.length > HOME_TEASER ? full.slice(0, HOME_TEASER) : full;
  const grid = $("grid");
  grid.className = "grid" + (state.view === "list" ? " as-list" : "");
  grid.innerHTML = list.map(cardHTML).join("");

  const noun = state.mode === "motor" ? t("pub.tax.motor") : t("pub.tax.mobil");
  const count = $("resultCount");
  if (count) {
    count.innerHTML =
      list.length === dataset.length
        ? t("pub.result.all", { n: dataset.length, noun })
        : t("pub.result.filtered", { n: list.length, total: dataset.length, noun });
  }

  const af = $("activeFilters");
  if (af) {
    const chips = activeFilterChips();
    af.innerHTML = chips
      .map((c) => `<button type="button" class="filter-tag" data-clear="${esc(c.key)}">${esc(c.label)} <span aria-hidden="true">✕</span></button>`)
      .join("");
  }

  $("empty").hidden = list.length > 0;
  grid.hidden = list.length === 0;

  updateCompareUI();
  observeReveals();
  animateCards = false;
  writeUrlState();
}

/* ===== Bandingkan ===== */

function comparePool() {
  return [...EV_CARS, ...MOTORS];
}

function compareItems() {
  return state.compare.map((id) => comparePool().find((c) => c.id === id)).filter(Boolean);
}

function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else if (state.compare.length < MAX_COMPARE) state.compare.push(id);
  else {
    flashDock();
    return;
  }
  render();
}

function flashDock() {
  const dock = $("compareDock");
  if (!dock || reduceMotion) return;
  dock.classList.remove("shake");
  void dock.offsetWidth;
  dock.classList.add("shake");
}

function updateCompareUI() {
  const dock = $("compareDock");
  if (!dock) return;
  const items = compareItems();
  // State bisa memuat id dari URL yang sudah dihapus di panel admin.
  if (items.length !== state.compare.length) state.compare = items.map((c) => c.id);

  dock.hidden = items.length === 0;
  const wrap = $("compareItems");
  if (wrap) {
    wrap.innerHTML =
      `<span class="compare-label">${t("pub.card.compare")} <b>${items.length}</b>/${MAX_COMPARE}</span>` +
      items
        .map(
          (c) =>
            `<span class="compare-chip">${esc(c.brand)} ${esc(c.name)}<button type="button" data-compare-remove="${esc(c.id)}" aria-label="${esc(t("pub.compare.remove", { name: c.name }))}">✕</button></span>`
        )
        .join("");
  }
  const openBtn = $("compareOpen");
  if (openBtn) openBtn.disabled = items.length < 2;

  if (!$("compareModal").hidden) renderCompareTable();
}

function renderCompareTable() {
  const body = $("compareBody");
  if (!body) return;
  const items = compareItems();
  if (items.length < 2) {
    body.innerHTML = `<p class="compare-hint">${esc(t("pub.compare.hint"))}</p>`;
    const link = $("compareLink");
    if (link) link.hidden = true;
    return;
  }

  body.innerHTML = compareTableHTML(items, { t });
  updateCompareLink(items);
}

/**
 * Menyalakan tautan ke halaman perbandingan yang sesungguhnya.
 *
 * Modal hidup di dalam beranda dan hilang begitu ditutup — tanpa tautan ini
 * tidak ada cara mengirimkan perbandingan yang sedang dilihat ke orang lain.
 */
function updateCompareLink(items) {
  const link = $("compareLink");
  if (!link) return;
  link.href = "/bandingkan/" + compareSlug(items.map((c) => c.id));
  link.hidden = false;
}

function openCompare() {
  const modal = $("compareModal");
  if (!modal) return;
  renderCompareTable();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.documentElement.classList.add("modal-open");
}

function closeCompare() {
  const modal = $("compareModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  document.documentElement.classList.remove("modal-open");
}

/* ===== Animasi masuk & toolbar lengket ===== */

let revealObserver = null;

function observeReveals() {
  if (reduceMotion) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealObserver.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
  }
  document.querySelectorAll(".reveal:not(.in)").forEach((el) => revealObserver.observe(el));
}

function setupStickyToolbar() {
  const toolbar = $("toolbar");
  if (!toolbar || !toolbar.parentNode) return;
  // Sentinel dipakai supaya "sudah menempel atau belum" tidak perlu dihitung
  // ulang tiap frame scroll.
  const sentinel = document.createElement("div");
  sentinel.className = "toolbar-sentinel";
  toolbar.parentNode.insertBefore(sentinel, toolbar);
  new IntersectionObserver(
    ([e]) => toolbar.classList.toggle("stuck", !e.isIntersecting),
    { threshold: 0 }
  ).observe(sentinel);
}

/* ===== Mode & event ===== */

function switchMode(mode, keepFilters) {
  if (mode !== "mobil" && mode !== "motor") return;
  if (mode === "motor" && !MOTORS.length) return;
  state.mode = mode;
  dataset = mode === "motor" ? MOTORS : EV_CARS;

  if (!keepFilters) {
    state.brand = "all";
    state.body = "all";
    /*
     * Kata kunci ikut dibersihkan saat berpindah Mobil/Motor.
     *
     * Merek dan model kedua sisi berbeda — "Alessa" hanya ada di motor, "BYD"
     * hanya di mobil — jadi pencarian yang terbawa dari sisi lain hampir selalu
     * menghasilkan nol. Katalog yang kosong terbaca sebagai "situsnya rusak",
     * bukan sebagai "kata kuncinya tidak cocok", dan itulah yang terjadi:
     * mengetik "Alessa" di tab Motor lalu membuka tab Mobil menampilkan
     * "0 dari 27 mobil listrik".
     */
    state.search = "";
    const kotakCari = $("search");
    if (kotakCari) kotakCari.value = "";
  }

  document.querySelectorAll(".mode-btn").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });

  populateFilters();
  render();
}

function resetFilters() {
  Object.assign(state, { ...DEFAULTS, mode: state.mode, view: state.view });
  const s = $("search");
  if (s) s.value = "";
  populateFilters();
  render();
}

function bindEvents() {
  const on = (id, ev, fn) => {
    const el = $(id);
    if (el) el.addEventListener(ev, fn);
  };

  let searchTimer = null;
  on("search", "input", (e) => {
    const v = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = v;
      render();
    }, 120);
  });

  const selectBind = [
    ["filterBrand", "brand"],
    ["filterBody", "body"],
    ["filterPrice", "price"],
    ["filterRange", "range"],
    ["filterBattery", "battery"],
    ["sortBy", "sort"],
  ];
  for (const [id, key] of selectBind) {
    on(id, "change", (e) => {
      state[key] = e.target.value;
      if (key === "body") renderBodyChips(uniqSorted(dataset.map((c) => c.bodyType)));
      render();
    });
  }

  on("resetFilters", "click", resetFilters);
  on("emptyReset", "click", resetFilters);

  on("bodyChips", "click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.body = chip.dataset.chip;
    const sel = $("filterBody");
    if (sel) sel.value = state.body;
    renderBodyChips(uniqSorted(dataset.map((c) => c.bodyType)));
    render();
  });

  on("activeFilters", "click", (e) => {
    const tag = e.target.closest(".filter-tag");
    if (!tag) return;
    const key = tag.dataset.clear;
    state[key] = DEFAULTS[key];
    if (key === "search" && $("search")) $("search").value = "";
    populateFilters();
    render();
  });

  on("viewSwitch", "click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    state.view = btn.dataset.view;
    document.querySelectorAll("#viewSwitch button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });

  on("filterToggle", "click", (e) => {
    const row = $("filterRow");
    if (!row) return;
    const open = row.classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });

  on("modeToggle", "click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (btn && btn.dataset.mode !== state.mode) switchMode(btn.dataset.mode);
  });

  on("compareClear", "click", () => {
    state.compare = [];
    closeCompare();
    render();
  });
  on("compareOpen", "click", openCompare);
  on("compareItems", "click", (e) => {
    const btn = e.target.closest("[data-compare-remove]");
    if (!btn) return;
    toggleCompare(btn.dataset.compareRemove);
  });
  on("compareModal", "click", (e) => {
    if (e.target.closest("[data-compare-close]")) closeCompare();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCompare();
  });

  document.addEventListener("click", (e) => {
    const navMode = e.target.closest("[data-navmode]");
    if (navMode) {
      if (state.mode !== navMode.dataset.navmode) switchMode(navMode.dataset.navmode);
      return;
    }

    const cmp = e.target.closest("[data-compare]");
    if (cmp) {
      toggleCompare(cmp.dataset.compare);
      return;
    }

    const swatch = e.target.closest(".swatch");
    const chip = e.target.closest(".variant-chip");
    if (!swatch && !chip) return;
    const scope = e.target.closest("[data-car]");
    if (!scope) return;
    const c = dataset.find((x) => x.id === scope.dataset.car);
    if (!c) return;

    if (swatch) uiState.color[c.id] = swatch.dataset.color;
    else uiState.variant[c.id] = parseInt(chip.dataset.variant, 10);

    const wrap = scope.querySelector(".car-visual");
    if (wrap) {
      wrap.outerHTML = buildVisual(c, {
        linkable: true,
        color: uiState.color,
        variant: uiState.variant,
        t,
      });
    }
  });
}

function init() {
  if (Array.isArray(window.__EV_CARS__)) EV_CARS = window.__EV_CARS__;
  if (Array.isArray(window.__EV_MOTORS__)) MOTORS = window.__EV_MOTORS__;

  readUrlState();
  if (state.mode === "motor" && !MOTORS.length) state.mode = "mobil";
  dataset = state.mode === "motor" ? MOTORS : EV_CARS;

  const s = $("search");
  if (s) s.value = state.search;
  document.querySelectorAll("#viewSwitch button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));

  populateFilters();
  renderHeroStats();
  bindEvents();
  setupStickyToolbar();
  switchMode(state.mode, true);
  observeReveals();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* ===== VoteKita: satu pengunjung satu favorit per jenis =====
   Panel sisi kanan beranda (`aside#voteKita`): 10 mobil + 10 motor terfavorit
   ala Shining Awards — suara terbanyak di atas, tersedikit di bawah, plus
   bilah persen dan lencana favorit. Masing-masing punya kotak cari: ketik
   merek/model langsung keluar beserta gambarnya.
   Baris awalnya sudah dirender server lewat `voteRowHtml()` yang SAMA — di sini
   tinggal menggambar ulang tiap ada suara masuk, supaya peringkatnya bergerak
   langsung tanpa muat ulang. Favorit sendiri diingat di `localStorage`
   (`evkita_fav_mobil` / `evkita_fav_motor`, satu id per jenis); memilih
   kendaraan lain MEMINDAHKAN suara lewat server (cookie `evkita_vid`),
   bukan menambah suara baru. */

(function voteKita() {
  const daftarMobil = document.getElementById("voteMobil");
  if (!daftarMobil) return; // halaman tanpa panel VoteKita: tidak ada kerjaan
  const daftarMotor = document.getElementById("voteMotor");
  const wadah = document.getElementById("voteKita");
  const voteLang = readPubLang();

  /* Agregat dari server (`{ cars: {id:{s,v}}, motors: {...} }`) — disalin
     supaya suara yang baru masuk bisa digabung tanpa menunggu muat ulang. */
  const agregat = { cars: {}, motors: {} };
  try {
    const awal = window.__EV_VOTES__ || {};
    if (awal.cars && typeof awal.cars === "object") agregat.cars = { ...awal.cars };
    if (awal.motors && typeof awal.motors === "object") agregat.motors = { ...awal.motors };
  } catch {
    /* abaikan */
  }

  const emberUntuk = (jenis) => (jenis === "motor" ? agregat.motors : agregat.cars);
  const kendaraanUntuk = (jenis) => {
    const dariWindow = jenis === "motor" ? window.__EV_MOTORS__ : window.__EV_CARS__;
    const dariModul = jenis === "motor" ? MOTORS : EV_CARS;
    if (Array.isArray(dariModul) && dariModul.length) return dariModul;
    return Array.isArray(dariWindow) ? dariWindow : [];
  };
  const elUntuk = (jenis) => (jenis === "motor" ? daftarMotor : daftarMobil);

  function bacaSuaraSaya(jenis, id) {
    try {
      const n = parseInt(window.localStorage.getItem(`evkita_vote_${jenis}_${id}`), 10);
      return n >= 1 && n <= 5 ? n : 0;
    } catch {
      return 0;
    }
  }

  /* Satu favorit per jenis — id kendaraan pilihan pengunjung ini. */
  function bacaFavorit(jenis) {
    try {
      return String(window.localStorage.getItem(`evkita_fav_${jenis}`) || "");
    } catch {
      return "";
    }
  }

  function tulisFavorit(jenis, id) {
    try {
      if (!id) window.localStorage.removeItem(`evkita_fav_${jenis}`);
      else window.localStorage.setItem(`evkita_fav_${jenis}`, String(id));
    } catch {
      /* mode privat: voting tetap jalan, cuma tidak diingat */
    }
  }

  function tulisSuaraSaya(jenis, id, bintang) {
    try {
      window.localStorage.setItem(`evkita_vote_${jenis}_${id}`, String(bintang));
    } catch {
      /* mode privat: voting tetap jalan, cuma tidak diingat */
    }
  }

  /* Batas tampil tiap daftar: lima pertama terlihat, sisanya menunggu tombol
     "Pilihan lain" dibuka. Angkanya sama dengan render server di
     `index.astro` — keduanya harus sepakat. */
  const BATAS_TAMPIL = 5;

  /* Gambar ulang satu daftar. Tanpa kueri: 10 teratas sudah terurut (suara
     terbanyak dulu), lima pertama tampil dan sisanya menunggu tombol
     "Pilihan lain". Dengan kueri: seluruh katalog disaring merek/modelnya
     (beserta gambarnya) dan ditampilkan sekaligus — ini mesin cari VoteKita.
     Markupnya memakai `voteRowHtml()` yang sama dengan render server. */
  function gambarDaftar(jenis, query) {
    const el = elUntuk(jenis);
    if (!el) return;
    const q = String(query === undefined ? el.dataset.query || "" : query || "");
    el.dataset.query = q;
    const terbuka = el.dataset.expanded === "1";
    const penuh = rankVotes(kendaraanUntuk(jenis), emberUntuk(jenis), 100000);
    const cari = saringKendaraan(penuh, q);
    const tampil = q ? cari.slice(0, 20) : cari.slice(0, 10);
    const agg = emberUntuk(jenis);
    let total = 0;
    for (const k of Object.keys(agg)) total += Number((agg[k] && agg[k].v) || 0);
    const fav = bacaFavorit(jenis);
    if (!tampil.length) {
      el.innerHTML = `<li class="vote-empty">${esc(t("pub.vote.kosong"))}</li>`;
    } else {
      el.innerHTML = tampil
        .map((r, i) =>
          voteRowHtml(r.v, emberUntuk(jenis)[r.v.id], {
            t,
            href: vehicleHref(r.v),
            img: r.v.image,
            myVote: bacaSuaraSaya(jenis, r.v.id),
            lang: voteLang,
            rank: q ? "" : i + 1,
            hidden: !q && !terbuka && i >= BATAS_TAMPIL,
            totalSuara: total,
            favorit: fav !== "" && fav === r.v.id,
          })
        )
        .join("");
    }
    selaraskanTombol(el);
  }

  /* Teks dan panah tombol "Pilihan lain" mengikuti keadaan daftarnya. */
  function selaraskanTombol(el) {
    if (!wadah || !el || !el.id) return;
    const tombol = wadah.querySelector(`[data-vote-more="${el.id}"]`);
    if (!tombol) return;
    const terbuka = el.dataset.expanded === "1";
    const teks = tombol.querySelector("[data-vote-more-teks]");
    const panah = tombol.querySelector("[data-vote-more-panah]");
    if (teks) teks.textContent = terbuka ? t("pub.vote.ciutkan") : t("pub.vote.lainnya");
    if (panah) panah.textContent = terbuka ? " ↑" : " ↓";
    tombol.setAttribute("aria-expanded", terbuka ? "true" : "false");
  }

  /* Buka/tutup pilihan lain: baris di luar lima pertama disembunyikan atau
     ditampilkan kembali. Anak langsung dipakai sebagai patokan (bukan kelas
     baris), supaya menutup dua bentuk markup: bungkus `<li>` dari render
     server dan baris langsung dari gambar ulang di sini. */
  function jungkitLainnya(tombol) {
    const el = tombol && tombol.dataset && tombol.dataset.voteMore
      ? document.getElementById(tombol.dataset.voteMore)
      : null;
    if (!el) return;
    const terbuka = el.dataset.expanded === "1";
    el.dataset.expanded = terbuka ? "0" : "1";
    Array.prototype.forEach.call(el.children, (baris, i) => {
      if (i < BATAS_TAMPIL) return;
      if (terbuka) baris.setAttribute("hidden", "");
      else baris.removeAttribute("hidden");
    });
    selaraskanTombol(el);
  }

  /* Baris galat kecil di kaki panel — dibuat bila orkestrator belum
     menyediakannya, supaya kegagalan tidak diam. */
  function tampilkanGalat(pesan) {
    if (!wadah) return;
    let el = wadah.querySelector(".vote-err");
    if (!el) {
      el = document.createElement("p");
      el.className = "vote-err";
      el.setAttribute("role", "alert");
      wadah.appendChild(el);
    }
    el.hidden = !pesan;
    if (pesan) el.textContent = pesan;
  }

  /* Sorot pratinjau: tombol yang dilewati kursor/terfokus ikut menyala. */
  function sorotPratinjau(tombol, nyala) {
    const baris = tombol.closest("[data-vote-id]");
    if (!baris) return;
    const n = parseInt(tombol.dataset.voteStars, 10);
    baris.querySelectorAll("[data-vote-stars]").forEach((b) => {
      if (parseInt(b.dataset.voteStars, 10) <= n) b.classList.toggle("preview", nyala);
    });
  }

  async function kirimSuara(tombol) {
    const baris = tombol.closest("[data-vote-id]");
    if (!baris || baris.dataset.sibuk) return;
    const jenis = baris.dataset.voteKind === "motor" ? "motor" : "mobil";
    const id = baris.dataset.voteId || "";
    const bintang = parseInt(tombol.dataset.voteStars, 10);
    if (!id || !(bintang >= 1 && bintang <= 5)) return;
    const favLama = bacaFavorit(jenis);
    baris.dataset.sibuk = "1";
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: jenis, id, stars: bintang, prev: bacaSuaraSaya(jenis, id) }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* abaikan */
      }
      if (!res.ok || !data || !data.ok) throw new Error("gagal");
      /* Jumlah lokal disamakan dengan jawaban server: suara baru masuk dan
         suara lama yang dipindahkan ikut diperbarui, lalu daftar digambar
         ulang supaya peringkatnya langsung pindah. */
      emberUntuk(jenis)[id] = { s: data.avg * data.votes, v: data.votes };
      if (data.lama && data.lama.id && data.lama.id !== id) {
        if (data.lama.votes > 0) emberUntuk(jenis)[data.lama.id] = { s: data.lama.avg * data.lama.votes, v: data.lama.votes };
        else delete emberUntuk(jenis)[data.lama.id];
        try {
          window.localStorage.removeItem(`evkita_vote_${jenis}_${data.lama.id}`);
        } catch {
          /* abaikan */
        }
      }
      tulisSuaraSaya(jenis, id, bintang);
      tulisFavorit(jenis, id);
      tampilkanGalat("");
      gambarDaftar(jenis);
      if (favLama && favLama !== "" && favLama !== id) {
        const nama = (baris.querySelector(".vote-name") || {}).textContent || "";
        tampilkanInfo(t("pub.vote.pindah", { nama: String(nama).replace(/★.*$/, "").trim() || id }));
      }
    } catch {
      tampilkanGalat(t("pub.vote.err"));
    } finally {
      delete baris.dataset.sibuk;
    }
  }

  /* Kabar sukses kecil di kaki panel — hilang sendiri setelah 4 detik. */
  function tampilkanInfo(pesan) {
    if (!wadah) return;
    let el = wadah.querySelector(".vote-info-ok");
    if (!el) {
      el = document.createElement("p");
      el.className = "vote-info-ok";
      el.setAttribute("role", "status");
      wadah.appendChild(el);
    }
    el.hidden = !pesan;
    if (pesan) el.textContent = pesan;
    if (el._t) clearTimeout(el._t);
    if (pesan) {
      el._t = setTimeout(() => {
        el.hidden = true;
      }, 4000);
    }
  }

  if (wadah) {
    wadah.addEventListener("input", (e) => {
      const cari = e.target.closest("[data-vote-cari]");
      if (!cari || !wadah.contains(cari)) return;
      const el = document.getElementById(cari.dataset.voteCari);
      if (!el) return;
      const jenis = el.id === "voteMotor" ? "motor" : "mobil";
      gambarDaftar(jenis, cari.value);
    });
    wadah.addEventListener("click", (e) => {
      const lainnya = e.target.closest("[data-vote-more]");
      if (lainnya && wadah.contains(lainnya)) { jungkitLainnya(lainnya); return; }
      const tombol = e.target.closest("[data-vote-stars]");
      if (!tombol || !wadah.contains(tombol)) return;
      kirimSuara(tombol);
    });
    wadah.addEventListener("mouseover", (e) => {
      const tombol = e.target.closest("[data-vote-stars]");
      if (tombol) sorotPratinjau(tombol, true);
    });
    wadah.addEventListener("mouseout", (e) => {
      const tombol = e.target.closest("[data-vote-stars]");
      if (tombol) sorotPratinjau(tombol, false);
    });
    /* Papan ketik mendapat pratinjau yang sama lewat fokus. */
    wadah.addEventListener("focusin", (e) => {
      const tombol = e.target.closest("[data-vote-stars]");
      if (tombol) sorotPratinjau(tombol, true);
    });
    wadah.addEventListener("focusout", (e) => {
      const tombol = e.target.closest("[data-vote-stars]");
      if (tombol) sorotPratinjau(tombol, false);
    });
  }

  gambarDaftar("mobil");
  gambarDaftar("motor");
})();
