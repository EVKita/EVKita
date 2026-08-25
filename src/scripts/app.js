"use strict";

import { paletteFor, defaultColor, carSVG } from "../lib/cars-ui.js";

let EV_CARS = [];
let MOTORS = [];
let dataset = [];

const PRICE_BUCKETS = [
  { id: "all", label: "Semua harga" },
  { id: "under300", label: "Di bawah 300 juta", test: (p) => p !== null && p < 300000000 },
  { id: "under500", label: "Di bawah 500 juta", test: (p) => p !== null && p < 500000000 },
  { id: "500-800", label: "500 – 800 juta", test: (p) => p !== null && p >= 500000000 && p < 800000000 },
  { id: "over800", label: "Di atas 800 juta", test: (p) => p !== null && p >= 800000000 },
];

const SORTERS = {
  brand: (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
  priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  priceDesc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  rangeDesc: (a, b) => (b.rangeKm ?? -1) - (a.rangeKm ?? -1),
  batteryDesc: (a, b) => (b.batteryKwh ?? -1) - (a.batteryKwh ?? -1),
  powerDesc: (a, b) => (b.powerHp ?? -1) - (a.powerHp ?? -1),
};

const state = {
  mode: "mobil",
  search: "",
  brand: "all",
  body: "all",
  price: "all",
  sort: "rangeDesc",
};

const $ = (id) => document.getElementById(id);

const uiState = { color: {}, variant: {} };

function visualHTML(c, linkable = true) {
  const names = c.variantNames && c.variantNames.length ? c.variantNames : ["Standard"];
  let vi = uiState.variant[c.id] || 0;
  if (vi >= names.length) vi = 0;
  const chips = names.map((n, i) => `<button type="button" class="variant-chip${i === vi ? " active" : ""}" data-variant="${i}">${n}</button>`).join("");
  const variantRow = `<div class="variant-row"><span class="mini-label">Varian</span><div class="chips">${chips}</div></div>`;
  const openLink = linkable ? `<a class="card-media-link" href="/mobil/${c.id}">` : "";
  const closeLink = linkable ? "</a>" : "";

  if (c.video) {
    return `<div class="car-visual">
      ${openLink}<div class="car-svg car-photo-wrap"><video class="car-photo" src="${c.video}" poster="${c.image || ""}" controls muted loop playsinline preload="metadata"></video></div>${closeLink}
      ${variantRow}
    </div>`;
  }

  if (c.image) {
    return `<div class="car-visual">
      ${openLink}<div class="car-svg car-photo-wrap"><img class="car-photo" src="${c.image}" alt="${c.brand} ${c.name}" loading="lazy" onerror="this.style.display='none'" /></div>${closeLink}
      ${variantRow}
    </div>`;
  }

  const palette = paletteFor(c);
  const color = uiState.color[c.id] || defaultColor(c);
  const swatches = palette.map((col) => `<button type="button" class="swatch${col.hex === color ? " active" : ""}" data-color="${col.hex}" title="${col.name}" aria-label="Warna ${col.name}" style="--sw:${col.hex}"></button>`).join("");
  return `<div class="car-visual">
    ${openLink}<div class="car-svg">${carSVG(c, color)}</div>${closeLink}
    <div class="color-row"><span class="mini-label">Warna</span><div class="swatches">${swatches}</div></div>
    ${variantRow}
  </div>`;
}

function uniqSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

function populateFilters() {
  const brands = uniqSorted(dataset.map((c) => c.brand));
  const bodies = uniqSorted(dataset.map((c) => c.bodyType));

  $("filterBrand").innerHTML =
    '<option value="all">Semua merek</option>' +
    brands.map((b) => `<option value="${b}">${b}</option>`).join("");

  $("filterBody").innerHTML =
    '<option value="all">Semua tipe</option>' +
    bodies.map((b) => `<option value="${b}">${b}</option>`).join("");

  $("filterPrice").innerHTML = PRICE_BUCKETS.map(
    (b) => `<option value="${b.id}">${b.label}</option>`
  ).join("");
}

function renderHeroStats() {
  const brandCount = new Set(dataset.map((c) => c.brand)).size;
  const priced = dataset.filter((c) => c.price !== null);
  const minPrice = priced.length ? Math.min(...priced.map((c) => c.price)) : null;
  const ranged = dataset.filter((c) => c.rangeKm);
  const maxRange = ranged.length ? Math.max(...ranged.map((c) => c.rangeKm)) : 0;

  const formatJt = (n) => {
    if (n >= 1000000000) return "Rp " + (n / 1000000000).toFixed(2).replace(".", ",") + " M";
    return "Rp " + Math.round(n / 1000000) + " jt";
  };

  $("heroStats").innerHTML = `
    <div class="stat-pill"><span class="num">${dataset.length}</span><span class="label">Model terdata</span></div>
    <div class="stat-pill"><span class="num">${brandCount}</span><span class="label">Merek</span></div>
    <div class="stat-pill"><span class="num">${minPrice !== null ? formatJt(minPrice) : "—"}</span><span class="label">Harga terendah</span></div>
    <div class="stat-pill"><span class="num">${maxRange ? maxRange + " km" : "—"}</span><span class="label">Jarak terjauh</span></div>
  `;
}

function getFiltered() {
  let list = dataset.filter((c) => {
    const q = state.search.trim().toLowerCase();
    if (q && !(c.brand + " " + c.name).toLowerCase().includes(q)) return false;
    if (state.brand !== "all" && c.brand !== state.brand) return false;
    if (state.body !== "all" && c.bodyType !== state.body) return false;
    if (state.price !== "all") {
      const bucket = PRICE_BUCKETS.find((b) => b.id === state.price);
      if (!bucket.test(c.price)) return false;
    }
    return true;
  });

  list.sort(SORTERS[state.sort] || SORTERS.brand);
  return list;
}

function cardHTML(c) {
  const range = c.rangeKm
    ? `<span class="spec-value">${c.rangeKm} km</span><span class="spec-note">${c.rangeStandard || ""}</span>`
    : '<span class="spec-value">—</span><span class="spec-note">n/a</span>';

  const price = c.price
    ? `<span class="card-price">${c.priceText}</span>`
    : '<span class="card-price na">Harga belum tersedia</span>';

  const stale = c.stale ? '<span class="badge-stale">Data lama</span>' : "";

  const detailLink = state.mode === "mobil" ? `<a href="/mobil/${c.id}" class="card-detail">Lihat detail →</a>` : "";

  return `
    <article class="card" data-car="${c.id}">
      <div class="card-brand">${c.brand}</div>
      <h3 class="card-name">${c.name}</h3>
      <span class="card-body">${c.bodyType}</span>
      ${visualHTML(c, state.mode === "mobil")}
      <div class="card-specs">
        <div class="spec">
          <span class="spec-label">Jarak tempuh</span>
          ${range}
        </div>
        <div class="spec">
          <span class="spec-label">Baterai</span>
          <span class="spec-value">${c.batteryKwh != null ? c.batteryKwh + " kWh" : "—"}</span>
        </div>
        <div class="spec">
          <span class="spec-label">Tenaga</span>
          <span class="spec-value">${c.powerHp != null ? c.powerHp + " hp" : "—"}</span>
        </div>
        <div class="spec">
          <span class="spec-label">Varian</span>
          <span class="spec-value">${c.variants}</span>
        </div>
      </div>
      <div class="card-footer">
        <div>
          <span class="spec-label" style="display:block;font-size:11px;color:var(--text-muted)">Mulai dari</span>
          ${price}
        </div>
        ${stale}
      </div>
      ${detailLink}
    </article>
  `;
}

function render() {
  const list = getFiltered();
  const grid = $("grid");
  grid.innerHTML = list.map(cardHTML).join("");

  $("resultCount").textContent = `${list.length} dari ${dataset.length} model`;
  $("empty").hidden = list.length > 0;
  grid.hidden = list.length === 0;
}

function switchMode(mode) {
  if (mode !== "mobil" && mode !== "motor") return;
  state.mode = mode;
  dataset = mode === "motor" ? MOTORS : EV_CARS;

  state.brand = "all";
  state.body = "all";
  $("filterBrand").value = "all";
  $("filterBody").value = "all";

  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  populateFilters();
  renderHeroStats();
  render();
}

function bindEvents() {
  $("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  $("filterBrand").addEventListener("change", (e) => {
    state.brand = e.target.value;
    render();
  });

  $("filterBody").addEventListener("change", (e) => {
    state.body = e.target.value;
    render();
  });

  $("filterPrice").addEventListener("change", (e) => {
    state.price = e.target.value;
    render();
  });

  $("sortBy").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  const reset = () => {
    state.search = "";
    state.brand = "all";
    state.body = "all";
    state.price = "all";
    state.sort = "rangeDesc";
    $("search").value = "";
    $("filterBrand").value = "all";
    $("filterBody").value = "all";
    $("filterPrice").value = "all";
    $("sortBy").value = "rangeDesc";
    render();
  };

  $("resetFilters").addEventListener("click", reset);
  $("emptyReset").addEventListener("click", reset);

  const modeToggle = $("modeToggle");
  if (modeToggle) {
    modeToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".mode-btn");
      if (btn && btn.dataset.mode !== state.mode) switchMode(btn.dataset.mode);
    });
  }

  document.addEventListener("click", (e) => {
    const navMode = e.target.closest("[data-navmode]");
    if (navMode) {
      if (state.mode !== navMode.dataset.navmode) switchMode(navMode.dataset.navmode);
      const target = $("daftar");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const swatch = e.target.closest(".swatch");
    const chip = e.target.closest(".variant-chip");
    if (!swatch && !chip) return;
    const scope = e.target.closest("[data-car]");
    if (!scope) return;
    const c = dataset.find((x) => x.id === scope.dataset.car);
    if (!c) return;

    if (swatch) {
      uiState.color[c.id] = swatch.dataset.color;
    } else {
      uiState.variant[c.id] = parseInt(chip.dataset.variant, 10);
    }
    const wrap = scope.querySelector(".car-visual");
    if (wrap) wrap.outerHTML = visualHTML(c, state.mode === "mobil");
  });
}

function init() {
  if (window.__EV_CARS__ && Array.isArray(window.__EV_CARS__)) {
    EV_CARS = window.__EV_CARS__;
  }
  if (window.__EV_MOTORS__ && Array.isArray(window.__EV_MOTORS__)) {
    MOTORS = window.__EV_MOTORS__;
  }
  dataset = EV_CARS;
  populateFilters();
  renderHeroStats();
  bindEvents();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
