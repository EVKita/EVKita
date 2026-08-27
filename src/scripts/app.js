"use strict";

import { esc, rupiah, cardHTML as buildCard, visualHTML as buildVisual } from "../lib/card-html.js";
import { MAX_COMPARE, compareTableHTML, compareSlug } from "../lib/compare-html.js";

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
  { id: "all", label: "Semua harga" },
  { id: "under300", label: "Di bawah 300 juta", test: (p) => p !== null && p < 300000000 },
  { id: "under500", label: "Di bawah 500 juta", test: (p) => p !== null && p < 500000000 },
  { id: "500-800", label: "500 – 800 juta", test: (p) => p !== null && p >= 500000000 && p < 800000000 },
  { id: "over800", label: "Di atas 800 juta", test: (p) => p !== null && p >= 800000000 },
];

const RANGE_BUCKETS = [
  { id: "all", label: "Semua jarak" },
  { id: "r0", label: "Di bawah 200 km", test: (v) => v !== null && v < 200 },
  { id: "r200", label: "200 – 350 km", test: (v) => v !== null && v >= 200 && v < 350 },
  { id: "r350", label: "350 – 500 km", test: (v) => v !== null && v >= 350 && v < 500 },
  { id: "r500", label: "500 km ke atas", test: (v) => v !== null && v >= 500 },
];

const BATTERY_BUCKETS = [
  { id: "all", label: "Semua kapasitas" },
  { id: "b0", label: "Di bawah 40 kWh", test: (v) => v !== null && v < 40 },
  { id: "b40", label: "40 – 60 kWh", test: (v) => v !== null && v >= 40 && v < 60 },
  { id: "b60", label: "60 – 80 kWh", test: (v) => v !== null && v >= 60 && v < 80 },
  { id: "b80", label: "80 kWh ke atas", test: (v) => v !== null && v >= 80 },
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

function cardHTML(c) {
  return buildCard(c, {
    // Dulu hanya mobil yang boleh ditautkan: motor belum punya halaman detail,
    // jadi kartunya sengaja mati. Sejak /motor/<slug> ada, keduanya bisa —
    // dan `vehicleHref()` yang tahu ke mana masing-masing pergi.
    linkable: true,
    compare: state.compare,
    color: uiState.color,
    variant: uiState.variant,
    animate: animateCards,
  });
}


/* ===== Filter & render ===== */

function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(el, options, selected) {
  if (!el) return;
  el.innerHTML = options.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("");
  el.value = options.some((o) => o.id === selected) ? selected : options[0].id;
}

function populateFilters() {
  const brands = uniqSorted(dataset.map((c) => c.brand));
  const bodies = uniqSorted(dataset.map((c) => c.bodyType));

  fillSelect(
    $("filterBrand"),
    [{ id: "all", label: "Semua merek" }, ...brands.map((b) => ({ id: b, label: b }))],
    state.brand
  );
  state.brand = $("filterBrand").value;

  fillSelect(
    $("filterBody"),
    [{ id: "all", label: "Semua tipe" }, ...bodies.map((b) => ({ id: b, label: b }))],
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
    `<button type="button" class="chip${state.body === "all" ? " active" : ""}" data-chip="all">Semua <span class="chip-count">${dataset.length}</span></button>` +
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
  const named = (list, id) => (list.find((x) => x.id === id) || {}).label;
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
  const priced = all.filter((c) => c.price !== null && c.price !== undefined);
  const minPrice = priced.length ? Math.min(...priced.map((c) => c.price)) : null;
  const ranged = all.filter((c) => c.rangeKm);
  const maxRange = ranged.length ? Math.max(...ranged.map((c) => c.rangeKm)) : 0;

  const pills = [
    [all.length, "Model terdata"],
    [brandCount, "Merek"],
    [minPrice !== null ? rupiah(minPrice) : "—", "Harga terendah"],
    [maxRange ? maxRange + " km" : "—", "Jarak terjauh"],
  ];
  el.innerHTML = pills
    .map(([n, l]) => `<div class="stat-pill"><span class="num">${esc(n)}</span><span class="label">${esc(l)}</span></div>`)
    .join("");
}

function render() {
  const list = getFiltered();
  const grid = $("grid");
  grid.className = "grid" + (state.view === "list" ? " as-list" : "");
  grid.innerHTML = list.map(cardHTML).join("");

  const noun = state.mode === "motor" ? "motor" : "mobil";
  const count = $("resultCount");
  if (count) {
    count.innerHTML =
      list.length === dataset.length
        ? `Menampilkan <b>${dataset.length}</b> ${esc(noun)} listrik`
        : `Menampilkan <b>${list.length}</b> dari <b>${dataset.length}</b> ${esc(noun)} listrik`;
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
      `<span class="compare-label">Bandingkan <b>${items.length}</b>/${MAX_COMPARE}</span>` +
      items
        .map(
          (c) =>
            `<span class="compare-chip">${esc(c.brand)} ${esc(c.name)}<button type="button" data-compare-remove="${esc(c.id)}" aria-label="Hapus ${esc(c.name)} dari perbandingan">✕</button></span>`
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
    body.innerHTML = '<p class="compare-hint">Pilih minimal dua kendaraan untuk dibandingkan.</p>';
    const link = $("compareLink");
    if (link) link.hidden = true;
    return;
  }

  body.innerHTML = compareTableHTML(items);
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
