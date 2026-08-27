"use strict";

import { paletteFor, defaultColor, carSVG } from "../lib/cars-ui.js";

let EV_CARS = [];
let MOTORS = [];
let dataset = [];

/**
 * Semua nilai di berkas ini berakhir di innerHTML, dan isinya datang dari
 * panel admin (teks bebas). Jadi tiap penyisipan wajib lewat esc/attr —
 * bukan sekadar kerapian, tapi pencegahan injeksi markup.
 */
function esc(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL di dalam atribut: tolak skema yang bisa mengeksekusi skrip. */
function safeUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^(https?:|mailto:|tel:|\/|\.\/|#|data:image\/)/i.test(s)) return esc(s);
  return "";
}

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

const MAX_COMPARE = 3;

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

function rupiah(n) {
  if (n === null || n === undefined) return "";
  if (n >= 1000000000) return "Rp " + (n / 1000000000).toFixed(2).replace(".", ",") + " M";
  return "Rp " + Math.round(n / 1000000) + " jt";
}

function priceLabel(c) {
  return c.priceText || (c.price != null ? rupiah(c.price) : "");
}

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

/* ===== Kartu kendaraan ===== */

function visualHTML(c, linkable) {
  const names = c.variantNames && c.variantNames.length ? c.variantNames : ["Standard"];
  let vi = uiState.variant[c.id] || 0;
  if (vi >= names.length) vi = 0;
  const chips = names
    .map((n, i) => `<button type="button" class="variant-chip${i === vi ? " active" : ""}" data-variant="${i}">${esc(n)}</button>`)
    .join("");
  const variantRow =
    names.length > 1 || (c.variantNames && c.variantNames.length)
      ? `<div class="variant-row"><span class="mini-label">Varian</span><div class="chips">${chips}</div></div>`
      : "";
  const href = safeUrl("/mobil/" + c.id);
  const openLink = linkable ? `<a class="card-media-link" href="${href}" aria-label="${esc(c.brand + " " + c.name)}">` : "";
  const closeLink = linkable ? "</a>" : "";

  const video = safeUrl(c.video);
  if (video) {
    return `<div class="car-visual">
      ${openLink}<div class="car-svg car-photo-wrap"><video class="car-photo" src="${video}" poster="${safeUrl(c.image)}" controls muted loop playsinline preload="metadata"></video></div>${closeLink}
      ${variantRow}
    </div>`;
  }

  const image = safeUrl(c.image);
  if (image) {
    return `<div class="car-visual">
      ${openLink}<div class="car-svg car-photo-wrap"><img class="car-photo" src="${image}" alt="${esc(c.brand + " " + c.name)}" loading="lazy" decoding="async" /></div>${closeLink}
      ${variantRow}
    </div>`;
  }

  const palette = paletteFor(c);
  const color = uiState.color[c.id] || defaultColor(c);
  const swatches = palette
    .map(
      (col) =>
        `<button type="button" class="swatch${col.hex === color ? " active" : ""}" data-color="${esc(col.hex)}" title="${esc(col.name)}" aria-label="Warna ${esc(col.name)}" style="--sw:${esc(col.hex)}"></button>`
    )
    .join("");
  return `<div class="car-visual">
    ${openLink}<div class="car-svg">${carSVG(c, color)}</div>${closeLink}
    <div class="color-row"><span class="mini-label">Warna</span><div class="swatches">${swatches}</div></div>
    ${variantRow}
  </div>`;
}

/** Spesifikasi tambahan hanya dirender kalau terisi — kartu tidak boleh penuh "—". */
function extraSpecs(c) {
  const rows = [];
  if (c.accelSec != null) rows.push(["0–100 km/j", c.accelSec + " dtk"]);
  if (c.topSpeedKph != null) rows.push(["Kecepatan puncak", c.topSpeedKph + " km/j"]);
  if (c.seats != null) rows.push(["Kursi", c.seats]);
  if (c.chargeDcKw != null) rows.push(["Isi cepat DC", c.chargeDcKw + " kW"]);
  if (!rows.length) return "";
  return `<div class="card-extra">${rows
    .map(([k, v]) => `<span class="pill-spec"><b>${esc(v)}</b> ${esc(k)}</span>`)
    .join("")}</div>`;
}

function cardHTML(c) {
  const range = c.rangeKm
    ? `<span class="spec-value">${esc(c.rangeKm)} km</span>${c.rangeStandard ? `<span class="spec-note">${esc(c.rangeStandard)}</span>` : ""}`
    : '<span class="spec-value">—</span>';

  const price = priceLabel(c)
    ? `<span class="card-price">${esc(priceLabel(c))}</span>`
    : '<span class="card-price na">Harga belum tersedia</span>';

  const badges = [];
  if (c.featured) badges.push('<span class="badge badge-featured">Unggulan</span>');
  if (c.stale) badges.push('<span class="badge badge-stale">Data lama</span>');
  if (c.year) badges.push(`<span class="badge badge-muted">${esc(c.year)}</span>`);

  const linkable = state.mode === "mobil";
  const detailLink = linkable
    ? `<a href="${safeUrl("/mobil/" + c.id)}" class="card-detail">Lihat detail <span aria-hidden="true">→</span></a>`
    : "";

  const picked = state.compare.includes(c.id);
  const compareBtn = `<button type="button" class="compare-toggle${picked ? " active" : ""}" data-compare="${esc(c.id)}" aria-pressed="${picked}">
      <span class="compare-tick" aria-hidden="true">${picked ? "✓" : "+"}</span> Bandingkan
    </button>`;

  const tags = (c.tags || [])
    .slice(0, 3)
    .map((t) => `<span class="tag-mini">${esc(t)}</span>`)
    .join("");

  return `
    <article class="card${animateCards ? " reveal" : ""}" data-car="${esc(c.id)}">
      <div class="card-head">
        <div>
          <div class="card-brand">${esc(c.brand)}</div>
          <h3 class="card-name">${esc(c.name)}</h3>
        </div>
        <span class="card-type">${esc(c.bodyType)}</span>
      </div>
      ${c.tagline ? `<p class="card-tagline">${esc(c.tagline)}</p>` : ""}
      ${visualHTML(c, linkable)}
      <div class="card-specs">
        <div class="spec"><span class="spec-label">Jarak tempuh</span>${range}</div>
        <div class="spec"><span class="spec-label">Baterai</span><span class="spec-value">${c.batteryKwh != null ? esc(c.batteryKwh) + " kWh" : "—"}</span></div>
        <div class="spec"><span class="spec-label">Tenaga</span><span class="spec-value">${c.powerHp != null ? esc(c.powerHp) + " hp" : "—"}</span></div>
        <div class="spec"><span class="spec-label">Varian</span><span class="spec-value">${esc(c.variants || (c.variantNames || []).length || 1)}</span></div>
      </div>
      ${extraSpecs(c)}
      ${tags ? `<div class="tag-row-mini">${tags}</div>` : ""}
      <div class="card-footer">
        <div class="card-price-wrap">
          <span class="card-price-label">Mulai dari</span>
          ${price}
        </div>
        <div class="card-badges">${badges.join("")}</div>
      </div>
      <div class="card-actions">
        ${compareBtn}
        ${detailLink}
      </div>
    </article>
  `;
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

const COMPARE_ROWS = [
  { label: "Harga", text: (c) => priceLabel(c), num: (c) => c.price, best: "min" },
  { label: "Jarak tempuh", text: (c) => (c.rangeKm != null ? c.rangeKm + " km" : ""), num: (c) => c.rangeKm, best: "max" },
  { label: "Standar uji", text: (c) => c.rangeStandard || "" },
  { label: "Baterai", text: (c) => (c.batteryKwh != null ? c.batteryKwh + " kWh" : ""), num: (c) => c.batteryKwh, best: "max" },
  { label: "Tenaga", text: (c) => (c.powerHp != null ? c.powerHp + " hp" : ""), num: (c) => c.powerHp, best: "max" },
  { label: "Torsi", text: (c) => (c.torqueNm != null ? c.torqueNm + " Nm" : ""), num: (c) => c.torqueNm, best: "max" },
  { label: "0–100 km/j", text: (c) => (c.accelSec != null ? c.accelSec + " dtk" : ""), num: (c) => c.accelSec, best: "min" },
  { label: "Kecepatan puncak", text: (c) => (c.topSpeedKph != null ? c.topSpeedKph + " km/j" : ""), num: (c) => c.topSpeedKph, best: "max" },
  { label: "Isi cepat DC", text: (c) => (c.chargeDcKw != null ? c.chargeDcKw + " kW" : ""), num: (c) => c.chargeDcKw, best: "max" },
  { label: "Isi AC", text: (c) => (c.chargeAcKw != null ? c.chargeAcKw + " kW" : ""), num: (c) => c.chargeAcKw, best: "max" },
  { label: "Waktu isi", text: (c) => c.chargeTime || "" },
  { label: "Penggerak", text: (c) => c.driveType || "" },
  { label: "Kursi", text: (c) => (c.seats != null ? c.seats + " kursi" : "") },
  { label: "Tahun", text: (c) => (c.year != null ? String(c.year) : "") },
  { label: "Garansi", text: (c) => c.warranty || "" },
  { label: "Varian", text: (c) => (c.variantNames || []).join(", ") },
];

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
    return;
  }

  const head = items
    .map((c) => {
      const visual = c.image
        ? `<img src="${safeUrl(c.image)}" alt="" loading="lazy" decoding="async" />`
        : `<div class="compare-svg">${carSVG(c, defaultColor(c))}</div>`;
      return `<th scope="col">
        <div class="compare-head-card">
          <div class="compare-head-media">${visual}</div>
          <span class="compare-head-brand">${esc(c.brand)}</span>
          <span class="compare-head-name">${esc(c.name)}</span>
        </div>
      </th>`;
    })
    .join("");

  const rows = COMPARE_ROWS.map((row) => {
    const texts = items.map((c) => row.text(c));
    if (!texts.some((t) => t)) return "";
    let bestIdx = -1;
    if (row.num && row.best) {
      const nums = items.map((c) => row.num(c));
      const valid = nums.filter((n) => n !== null && n !== undefined);
      if (valid.length > 1) {
        const target = row.best === "min" ? Math.min(...valid) : Math.max(...valid);
        // Hanya tandai kalau ada satu pemenang jelas.
        if (valid.filter((n) => n === target).length === 1) bestIdx = nums.indexOf(target);
      }
    }
    const cells = texts
      .map((t, i) => `<td class="${i === bestIdx ? "is-best" : ""}">${t ? esc(t) : "—"}</td>`)
      .join("");
    return `<tr><th scope="row">${esc(row.label)}</th>${cells}</tr>`;
  }).join("");

  body.innerHTML = `<div class="compare-scroll"><table class="compare-table">
    <thead><tr><th scope="col"><span class="sr-only">Spesifikasi</span></th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
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
    if (wrap) wrap.outerHTML = visualHTML(c, state.mode === "mobil");
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
