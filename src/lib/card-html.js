import { paletteFor, defaultColor, carSVG } from "./cars-ui.js";
import { safeUrl as allowedUrl } from "./url.js";

/**
 * Markup kartu kendaraan — satu sumber untuk server dan browser.
 *
 * Sebelumnya kartu HANYA dibangun di `app.js`, artinya hanya di browser.
 * Beranda mengirim `<div id="grid">` yang kosong lalu menyuntikkan seluruh
 * dataset sebagai `window.__EV_CARS__`. Akibatnya perayap yang tidak
 * menjalankan JavaScript — dan itu termasuk sebagian besar perayap media
 * sosial serta perayap model bahasa — melihat halaman berisi hero, judul
 * seksi, dan NOL kendaraan. Satu-satunya hal yang membuat situs ini layak
 * dicari, tidak terlihat.
 *
 * Berkas ini menutupnya tanpa menduplikasi apa pun: server merender halaman
 * pertama, `app.js` mengambil alih begitu orang memfilter atau mengurutkan.
 * Karena markupnya berasal dari fungsi yang sama, keduanya tidak bisa
 * berselisih.
 *
 * Sengaja JavaScript polos: dipakai frontmatter `.astro` (Node) dan `app.js`
 * (browser), sama seperti `cars-ui.js` dan `i18n/index.js`.
 *
 * Teksnya Bahasa Indonesia dan memang tidak diterjemahkan — situs publik ini
 * berbahasa Indonesia. Yang tiga bahasa hanya panel admin.
 */

export function esc(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL di dalam atribut: skema disaring lebih dulu, lalu diubah untuk HTML. */
export function safeUrl(v) {
  return esc(allowedUrl(v));
}

export function rupiah(n) {
  if (n === null || n === undefined) return "";
  if (n >= 1000000000) return "Rp " + (n / 1000000000).toFixed(2).replace(".", ",") + " M";
  return "Rp " + Math.round(n / 1000000) + " jt";
}

export function priceLabel(c) {
  return c.priceText || (c.price != null ? rupiah(c.price) : "");
}

/**
 * Alamat halaman detail sebuah kendaraan.
 *
 * Satu tempat, dipakai kartu, tabel perbandingan, kalkulator, dan beranda.
 * Motor dan mobil bentuk objeknya identik — keduanya lewat `normalizeCar()` —
 * jadi yang membedakannya adalah `kind`, yang dipasang saat konten dibaca
 * (`store.ts`). Menebaknya dari data lain tidak mungkin: sebuah merek boleh
 * menjual keduanya, dan sebuah id boleh sama bentuknya.
 */
export function vehicleHref(c) {
  return (c && c.kind === "motor" ? "/motor/" : "/mobil/") + c.id;
}

/**
 * Pilihan yang berbeda antara render server dan render browser.
 * Server memakai semua nilai bawaannya: belum ada yang dipilih siapa pun.
 */
function withDefaults(opts) {
  return {
    linkable: true,
    compare: [],
    color: {},
    variant: {},
    animate: false,
    ...(opts || {}),
  };
}

export function visualHTML(c, opts) {
  const o = withDefaults(opts);
  const names = c.variantNames && c.variantNames.length ? c.variantNames : ["Standard"];
  let vi = o.variant[c.id] || 0;
  if (vi >= names.length) vi = 0;
  const chips = names
    .map((n, i) => `<button type="button" class="variant-chip${i === vi ? " active" : ""}" data-variant="${i}">${esc(n)}</button>`)
    .join("");
  const variantRow =
    names.length > 1 || (c.variantNames && c.variantNames.length)
      ? `<div class="variant-row"><span class="mini-label">Varian</span><div class="chips">${chips}</div></div>`
      : "";
  const href = safeUrl(vehicleHref(c));
  const openLink = o.linkable ? `<a class="card-media-link" href="${href}" aria-label="${esc(c.brand + " " + c.name)}">` : "";
  const closeLink = o.linkable ? "</a>" : "";

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
  const color = o.color[c.id] || defaultColor(c);
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
export function extraSpecs(c) {
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

export function cardHTML(c, opts) {
  const o = withDefaults(opts);

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

  const detailLink = o.linkable
    ? `<a href="${safeUrl(vehicleHref(c))}" class="card-detail">Lihat detail <span aria-hidden="true">→</span></a>`
    : "";

  const picked = o.compare.includes(c.id);
  const compareBtn = `<button type="button" class="compare-toggle${picked ? " active" : ""}" data-compare="${esc(c.id)}" aria-pressed="${picked}">
      <span class="compare-tick" aria-hidden="true">${picked ? "✓" : "+"}</span> Bandingkan
    </button>`;

  const tags = (c.tags || [])
    .slice(0, 3)
    .map((t) => `<span class="tag-mini">${esc(t)}</span>`)
    .join("");

  return `
    <article class="card${o.animate ? " reveal" : ""}" data-car="${esc(c.id)}">
      <div class="card-head">
        <div>
          <div class="card-brand">${esc(c.brand)}</div>
          <h3 class="card-name">${esc(c.name)}</h3>
        </div>
        <span class="card-type">${esc(c.bodyType)}</span>
      </div>
      ${c.tagline ? `<p class="card-tagline">${esc(c.tagline)}</p>` : ""}
      ${visualHTML(c, o)}
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

/**
 * Urutan bawaan katalog, sama dengan `SORTERS.rangeDesc` di app.js.
 * Server harus merender urutan yang sama dengan yang akan dipakai browser,
 * kalau tidak kartu akan melompat-lompat saat halaman selesai dimuat.
 */
export function defaultSort(list) {
  return [...list].sort((a, b) => (b.rangeKm ?? -1) - (a.rangeKm ?? -1));
}
