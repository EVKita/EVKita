"use strict";

const MOTORS = typeof EV_MOTORS !== "undefined" ? EV_MOTORS : [];
let dataset = typeof EV_CARS !== "undefined" ? EV_CARS : [];

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

const CAR_COLORS = [
  { name: "Putih", hex: "#f2f4f7" },
  { name: "Silver", hex: "#c3cad4" },
  { name: "Abu-abu", hex: "#7a8697" },
  { name: "Hitam", hex: "#181c22" },
  { name: "Merah", hex: "#d64541" },
  { name: "Biru", hex: "#2f6bff" },
  { name: "Teal", hex: "#2a9d8f" },
  { name: "Hijau", hex: "#3aa655" },
  { name: "Kuning", hex: "#f0b429" },
  { name: "Oranye", hex: "#ee8b28" },
  { name: "Cokelat", hex: "#8a5a33" },
  { name: "Ungu", hex: "#8e6bd6" },
];

const CAR_BODIES = {
  Hatchback: {
    body: "M30 116 L30 100 Q30 92 40 90 L62 72 Q76 62 92 58 L118 50 Q134 44 150 44 L270 44 Q282 44 292 52 L318 72 Q330 82 334 94 L336 116 Z",
    window: "M98 60 L120 52 Q136 47 150 47 L262 47 Q272 47 278 53 L288 65 L98 65 Z",
  },
  Crossover: {
    body: "M30 118 L30 96 Q30 88 40 86 L64 66 Q78 56 96 52 L122 44 Q138 38 154 38 L286 38 Q298 38 306 46 L328 78 Q338 90 342 102 L342 118 Z",
    window: "M100 56 L122 48 Q138 43 154 43 L280 43 Q290 43 296 50 L306 62 L100 62 Z",
  },
  SUV: {
    body: "M30 118 L30 96 Q30 88 40 86 L66 68 Q80 58 98 54 L124 46 Q140 40 156 40 L292 40 Q304 40 312 48 L330 88 Q338 100 340 112 L340 118 Z",
    window: "M100 54 L124 48 Q140 44 156 44 L286 44 Q296 44 302 52 L312 64 L100 64 Z",
  },
  Sedan: {
    body: "M28 114 L28 98 Q28 90 38 88 L64 70 Q80 60 98 56 L126 48 Q142 42 158 42 L282 42 Q296 42 304 52 L324 66 L354 70 Q368 72 372 82 L372 114 Z",
    window: "M102 58 L126 50 Q142 46 158 46 L276 46 Q288 46 294 54 L302 64 L102 64 Z",
  },
  Coupe: {
    body: "M28 112 L28 96 Q28 88 38 86 L66 68 Q82 58 100 54 L132 44 Q148 38 164 38 L288 42 Q302 42 310 50 L334 66 L358 72 Q368 74 370 84 L370 112 Z",
    window: "M104 56 L132 47 Q148 42 164 42 L282 45 Q294 45 300 52 L308 62 L104 62 Z",
  },
  MPV: {
    body: "M30 118 L30 96 Q30 88 40 86 L64 72 Q78 64 96 60 L124 52 Q140 47 156 47 L320 47 Q332 47 340 56 L344 118 Z",
    window: "M100 58 L124 53 Q140 49 156 49 L314 49 Q324 49 330 57 L338 66 L100 66 Z",
  },
  Niaga: {
    body: "M32 118 L32 98 Q32 90 42 88 L66 78 Q80 70 98 68 L120 62 Q132 57 148 57 L330 57 Q340 57 348 66 L350 118 Z",
    window: "M100 64 L120 60 Q132 56 148 56 L324 56 Q334 56 340 64 L346 72 L100 72 Z",
  },
};

const uiState = { color: {}, variant: {} };

function paletteFor(c) {
  if (c.colors && c.colors.length) {
    return c.colors.map((hex) => ({ name: hex, hex }));
  }
  return CAR_COLORS;
}

function shade(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function defaultColor(c) {
  const palette = paletteFor(c);
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length].hex;
}

function wheel(cx) {
  return `<g><circle cx="${cx}" cy="116" r="22" fill="#0c1016"/><circle cx="${cx}" cy="116" r="12" fill="#2b3644"/><circle cx="${cx}" cy="116" r="4.5" fill="#151b24"/></g>`;
}

function scooterSVG(c, color) {
  const gid = "g" + c.id.replace(/[^a-zA-Z0-9]/g, "");
  const light = shade(color, 18);
  const dark = shade(color, -20);
  const stroke = shade(color, -32);
  return `<svg viewBox="0 0 400 150" role="img" aria-label="${c.brand} ${c.name}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    <ellipse cx="200" cy="141" rx="150" ry="7" fill="#000" opacity="0.25"/>
    <g fill="#0c1016"><circle cx="106" cy="122" r="20"/><circle cx="298" cy="122" r="20"/></g>
    <g fill="#2b3644"><circle cx="106" cy="122" r="11"/><circle cx="298" cy="122" r="11"/></g>
    <g fill="#151b24"><circle cx="106" cy="122" r="4"/><circle cx="298" cy="122" r="4"/></g>
    <g fill="url(#${gid})" stroke="${stroke}" stroke-width="1.5">
      <rect x="52" y="58" width="16" height="60" rx="8" transform="rotate(14 60 88)"/>
      <rect x="82" y="42" width="38" height="11" rx="5.5" transform="rotate(-6 101 47)"/>
      <rect x="90" y="88" width="88" height="13" rx="6.5"/>
      <path d="M156 104 L156 66 Q156 58 166 58 L238 58 Q250 58 258 68 L292 98 L292 122 L160 122 Z"/>
    </g>
    <g fill="#0a1420">
      <rect x="168" y="48" width="66" height="12" rx="6"/>
      <circle cx="101" cy="40" r="6"/>
      <rect x="252" y="46" width="26" height="12" rx="6" transform="rotate(-12 265 52)"/>
    </g>
  </svg>`;
}

function carSVG(c, color) {
  if (c.bodyType === "Skuter") return scooterSVG(c, color);
  const b = CAR_BODIES[c.bodyType] || CAR_BODIES.Crossover;
  const gid = "g" + c.id.replace(/[^a-zA-Z0-9]/g, "");
  const light = shade(color, 18);
  const dark = shade(color, -20);
  const stroke = shade(color, -32);
  return `<svg viewBox="0 0 400 150" role="img" aria-label="${c.brand} ${c.name}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    <ellipse cx="200" cy="141" rx="150" ry="7" fill="#000" opacity="0.3"/>
    ${wheel(106)}${wheel(294)}
    <path d="${b.body}" fill="url(#${gid})" stroke="${stroke}" stroke-width="1.5"/>
    <path d="${b.window}" fill="#0a1420"/>
  </svg>`;
}

function visualHTML(c) {
  const names = c.variantNames && c.variantNames.length ? c.variantNames : ["Standard"];
  let vi = uiState.variant[c.id] || 0;
  if (vi >= names.length) vi = 0;
  const chips = names.map((n, i) => `<button type="button" class="variant-chip${i === vi ? " active" : ""}" data-variant="${i}">${n}</button>`).join("");
  const variantRow = `<div class="variant-row"><span class="mini-label">Varian</span><div class="chips">${chips}</div></div>`;

  if (c.video) {
    return `<div class="car-visual">
      <div class="car-svg car-photo-wrap"><video class="car-photo" src="${c.video}" poster="${c.image || ""}" controls muted loop playsinline preload="metadata"></video></div>
      ${variantRow}
    </div>`;
  }

  if (c.image) {
    return `<div class="car-visual">
      <div class="car-svg car-photo-wrap"><img class="car-photo" src="${c.image}" alt="${c.brand} ${c.name}" loading="lazy" onerror="this.style.display='none'" /></div>
      ${variantRow}
    </div>`;
  }

  const palette = paletteFor(c);
  const color = uiState.color[c.id] || defaultColor(c);
  const swatches = palette.map((col) => `<button type="button" class="swatch${col.hex === color ? " active" : ""}" data-color="${col.hex}" title="${col.name}" aria-label="Warna ${col.name}" style="--sw:${col.hex}"></button>`).join("");
  return `<div class="car-visual">
    <div class="car-svg">${carSVG(c, color)}</div>
    <div class="color-row"><span class="mini-label">Warna</span><div class="swatches">${swatches}</div></div>
    ${variantRow}
  </div>`;
}

function excerpt(c) {
  const parts = [];
  if (c.rangeKm != null) parts.push(`Jarak tempuh ${c.rangeKm} km${c.rangeStandard ? " (" + c.rangeStandard + ")" : ""}`);
  if (c.batteryKwh != null) parts.push(`baterai ${c.batteryKwh} kWh`);
  if (c.powerHp != null) parts.push(`tenaga ${c.powerHp} hp`);
  return parts.join(" · ");
}

function postHTML(c) {
  const price = c.price
    ? `<span class="post-price">${c.priceText}</span>`
    : '<span class="post-price na">Harga belum tersedia</span>';

  const stale = c.stale ? '<span class="badge-stale">Data lama</span>' : "";

  return `
    <article class="post-card" data-car="${c.id}">
      <div class="post-thumb">${visualHTML(c)}</div>
      <div class="post-content">
        <span class="post-cat">${c.brand}</span>
        <h3 class="post-title">${c.name}</h3>
        <p class="post-excerpt">${excerpt(c)}</p>
        <div class="post-meta">
          <span>${c.bodyType} · ${c.variants} varian</span>
          ${stale}
        </div>
        <div class="post-footer">${price}</div>
      </div>
    </article>
  `;
}

function renderTicker() {
  const items = dataset
    .slice()
    .sort((a, b) => (b.powerHp || 0) - (a.powerHp || 0))
    .slice(0, 8);
  const html = items
    .map((c) => `<span class="ticker-item"><b>●</b>${c.brand} ${c.name} mulai ${c.priceText || "harga belum tersedia"}</span>`)
    .join("");
  $("ticker").innerHTML = html + html;
}

function renderFeatured() {
  const ranged = dataset.filter((c) => c.rangeKm);
  const car = ranged.reduce((a, b) => ((b.rangeKm || 0) > (a.rangeKm || 0) ? b : a), ranged[0]);
  if (!car) {
    $("featured").innerHTML = "";
    return;
  }

  $("featured").innerHTML = `
    <div class="featured-media" data-car="${car.id}">
      ${visualHTML(car)}
    </div>
    <div class="featured-info">
      <span class="badge">Sorotan</span>
      <div class="featured-brand">${car.brand}</div>
      <h2>${car.name}</h2>
      <p class="featured-excerpt">${car.description || excerpt(car)}</p>
      <div class="featured-meta">${car.bodyType} · ${car.variants} varian · <strong>${car.priceText || "Harga belum tersedia"}</strong></div>
      <a class="btn-primary" href="#daftar">Lihat Semua ↓</a>
    </div>`;
}

function renderPopular() {
  const list = dataset
    .filter((c) => c.rangeKm)
    .sort((a, b) => b.rangeKm - a.rangeKm)
    .slice(0, 5);

  $("popular").innerHTML = list
    .map(
      (c, i) => `<li><a href="#daftar" data-brand="${c.brand}">
        <span class="rank">${i + 1}</span>
        <span class="pt"><strong>${c.brand} ${c.name}</strong><small>${c.rangeKm} km · ${c.priceText || "Harga belum tersedia"}</small></span>
      </a></li>`
    )
    .join("");
}

function renderCategories() {
  const brands = uniqSorted(dataset.map((c) => c.brand));

  $("categories").innerHTML = brands
    .map(
      (b) => `<li><a href="#daftar" data-brand="${b}">${b}<span>${dataset.filter((c) => c.brand === b).length}</span></a></li>`
    )
    .join("");

  const footerCats = $("footer-cats");
  if (footerCats) {
    footerCats.innerHTML = brands
      .slice(0, 6)
      .map((b) => `<li><a href="#daftar" data-brand="${b}">${b}</a></li>`)
      .join("");
  }
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

function render() {
  const list = getFiltered();
  const grid = $("grid");
  grid.innerHTML = list.map(postHTML).join("");

  $("resultCount").textContent = `Menampilkan ${list.length} dari ${dataset.length} model`;
  $("empty").hidden = list.length > 0;
  grid.hidden = list.length === 0;
}

function switchMode(mode) {
  if (mode !== "mobil" && mode !== "motor") return;
  state.mode = mode;
  dataset = mode === "motor" ? MOTORS : (typeof EV_CARS !== "undefined" ? EV_CARS : []);

  state.brand = "all";
  state.body = "all";
  $("filterBrand").value = "all";
  $("filterBody").value = "all";

  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  const title = $("daftarTitle");
  if (title) title.textContent = mode === "motor" ? "Motor Listrik Terbaru" : "Mobil Listrik Terbaru";

  populateFilters();
  renderHeroStats();
  renderTicker();
  renderFeatured();
  renderPopular();
  renderCategories();
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

    const brandLink = e.target.closest("[data-brand]");
    if (brandLink) {
      state.brand = brandLink.dataset.brand;
      $("filterBrand").value = state.brand;
      render();
      const grid = $("grid");
      if (grid && !grid.hidden) grid.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (wrap) wrap.outerHTML = visualHTML(c);
  });
}

function init() {
  populateFilters();
  renderHeroStats();
  renderTicker();
  renderFeatured();
  renderPopular();
  renderCategories();
  bindEvents();
  render();
}

document.addEventListener("DOMContentLoaded", init);
