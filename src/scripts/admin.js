"use strict";

const BODY_TYPES = ["Hatchback", "Crossover", "SUV", "Sedan", "Coupe", "MPV", "Niaga", "Skuter"];
const RANGE_STANDARDS = ["WLTP", "NEDC", "CLTC", "Klaim pabrikan"];

const SITE_FIELDS = [
  "brandText",
  "themePrimary",
  "themeSecondary",
  "heroEyebrow",
  "heroTitle",
  "heroSub",
  "aboutTitle",
  "aboutText",
  "footerTitle",
  "footerDesc",
  "footerSourceText",
  "footerSourceUrl",
  "footerNote",
];

const DIR_CONFIG = {
  spklu: {
    title: "name",
    meta: ["operator", "area"],
    fields: [
      ["name", "Nama", "text"],
      ["operator", "Operator", "text"],
      ["area", "Area", "text"],
      ["power", "Daya (kW)", "text"],
      ["website", "Website", "text"],
    ],
  },
  bengkel: {
    title: "name",
    meta: ["type", "brand", "area"],
    fields: [
      ["name", "Nama", "text"],
      ["type", "Tipe", "text"],
      ["brand", "Brand", "text"],
      ["area", "Area", "text"],
      ["website", "Website", "text"],
    ],
  },
  berita: {
    title: "title",
    meta: ["source", "date"],
    fields: [
      ["title", "Judul", "text"],
      ["source", "Sumber", "text"],
      ["url", "URL", "text"],
      ["date", "Tanggal", "date"],
    ],
  },
};

const TABS = ["overview", "cars", "motors", "spklu", "bengkel", "berita", "site"];

let content = { site: {}, cars: [], motors: [], spklu: [], bengkel: [], berita: [] };
let editingVehicle = null;
let editingDir = null;
let galleryDraft = [];

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitList(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLines(v) {
  return String(v || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(collection, base) {
  let id = base || collection.slice(0, -1) || "item";
  if (!content[collection].some((c) => c.id === id)) return id;
  let n = 2;
  while (content[collection].some((c) => c.id === `${id}-${n}`)) n++;
  return `${id}-${n}`;
}

function formatJt(n) {
  if (n == null) return "—";
  if (n >= 1000000000) return "Rp " + (n / 1000000000).toFixed(2).replace(".", ",") + " M";
  return "Rp " + Math.round(n / 1000000) + " jt";
}

let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function save() {
  const res = await fetch("/api/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  const data = await res.json();
  if (res.status === 401) {
    location.href = "/admin/login";
    return;
  }
  if (data.ok) {
    content = data.content;
    renderAll();
    showToast("Tersimpan");
  } else {
    showToast("Gagal menyimpan");
  }
}

function renderSiteForm() {
  for (const key of SITE_FIELDS) {
    const el = $("site-form").elements[key];
    if (el) el.value = content.site[key] || "";
  }
}

function renderVehicleList(collection, elId) {
  const wrap = $(elId);
  const searchId = collection === "cars" ? "car-search" : "motor-search";
  const q = $(searchId).value.trim().toLowerCase();
  const list = content[collection].filter((c) =>
    !q ? true : (c.brand + " " + c.name).toLowerCase().includes(q)
  );

  if (!list.length) {
    wrap.innerHTML = '<p class="empty-hint">' + (q ? "Tidak ada hasil untuk pencarian ini." : "Belum ada data.") + "</p>";
    return;
  }

  wrap.innerHTML = list
    .map((c) => {
      const vn = Array.isArray(c.variantNames) ? c.variantNames.length : 0;
      const thumb = c.image ? `<img class="row-thumb" src="${esc(c.image)}" alt="" />` : "";
      const viewLink =
        collection === "cars"
          ? `<a class="btn btn-ghost btn-sm" href="/mobil/${esc(c.id)}" target="_blank" rel="noopener">Lihat</a>`
          : "";
      return `<div class="car-row">
        ${thumb}
        <div class="row-info">
          <div class="row-title">${esc(c.brand)} ${esc(c.name)}</div>
          <div class="meta">${esc(c.bodyType)} · ${vn} varian · ${esc(c.priceText || "Harga belum tersedia")}</div>
        </div>
        <div class="actions">
          ${viewLink}
          <button class="btn btn-ghost btn-sm" data-edit="${esc(c.id)}" data-collection="${collection}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${esc(c.id)}" data-collection="${collection}">Hapus</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderDirList(collection) {
  const wrap = $(collection + "-list");
  const q = $(collection + "-search").value.trim().toLowerCase();
  const cfg = DIR_CONFIG[collection];
  const items = content[collection] || [];
  const list = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => {
      if (!q) return true;
      const hay = Object.values(item).join(" ").toLowerCase();
      return hay.includes(q);
    });

  if (!list.length) {
    wrap.innerHTML = '<p class="empty-hint">' + (q ? "Tidak ada hasil untuk pencarian ini." : "Belum ada data.") + "</p>";
    return;
  }

  wrap.innerHTML = list
    .map(({ item, i }) => {
      const title = item[cfg.title] || "(tanpa judul)";
      const meta = cfg.meta
        .map((k) => item[k])
        .filter(Boolean)
        .join(" · ");
      return `<div class="car-row">
        <div class="row-info">
          <div class="row-title">${esc(title)}</div>
          <div class="meta">${esc(meta)}</div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-dir-edit="${i}" data-collection="${collection}">Edit</button>
          <button class="btn btn-danger btn-sm" data-dir-delete="${i}" data-collection="${collection}">Hapus</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderOverview() {
  const cars = content.cars || [];
  const motors = content.motors || [];
  const brandCount = new Set(cars.map((c) => c.brand)).size;
  const priced = cars.filter((c) => c.price != null);
  const min = priced.length ? Math.min(...priced.map((c) => c.price)) : null;
  const max = priced.length ? Math.max(...priced.map((c) => c.price)) : null;
  const totalVariants = cars.reduce((s, c) => s + (c.variantNames?.length || 0), 0);
  const withImg = cars.filter((c) => c.image).length;

  $("overview-stats").innerHTML = `
    <div class="stat-card"><span class="n">${cars.length}</span><span class="l">Mobil</span></div>
    <div class="stat-card"><span class="n">${motors.length}</span><span class="l">Motor</span></div>
    <div class="stat-card"><span class="n">${(content.spklu || []).length}</span><span class="l">SPKLU</span></div>
    <div class="stat-card"><span class="n">${(content.bengkel || []).length}</span><span class="l">Bengkel</span></div>
    <div class="stat-card"><span class="n">${(content.berita || []).length}</span><span class="l">Berita</span></div>
    <div class="stat-card"><span class="n">${brandCount}</span><span class="l">Merek</span></div>
    <div class="stat-card"><span class="n">${totalVariants}</span><span class="l">Total varian</span></div>
    <div class="stat-card"><span class="n">${withImg}</span><span class="l">Mobil dgn gambar</span></div>
    <div class="stat-card"><span class="n">${formatJt(min)}</span><span class="l">Harga terendah</span></div>
    <div class="stat-card"><span class="n">${formatJt(max)}</span><span class="l">Harga tertinggi</span></div>
  `;

  const recent = cars.slice(0, 5);
  $("overview-recent").innerHTML = recent.length
    ? recent
        .map(
          (c) => `<div class="car-row">
            <div class="row-info">
              <div class="row-title">${esc(c.brand)} ${esc(c.name)}</div>
              <div class="meta">${esc(c.bodyType)} · ${esc(c.priceText || "Harga belum tersedia")}</div>
            </div>
            <div class="actions">
              <button class="btn btn-ghost btn-sm" data-edit="${esc(c.id)}" data-collection="cars">Edit</button>
            </div>
          </div>`
        )
        .join("")
    : '<p class="empty-hint">Belum ada data mobil.</p>';
}

function renderGalleryDraft() {
  const wrap = $("gallery-list");
  if (!galleryDraft.length) {
    wrap.innerHTML = '<span class="hint">Belum ada gambar galeri.</span>';
    return;
  }
  wrap.innerHTML = galleryDraft
    .map(
      (url) => `<div class="gallery-item">
        <img src="${esc(url)}" alt="" />
        <button type="button" class="gallery-remove" data-gallery-remove="${esc(url)}" title="Hapus">×</button>
      </div>`
    )
    .join("");
}

function renderAll() {
  renderSiteForm();
  renderVehicleList("cars", "car-list");
  renderVehicleList("motors", "motor-list");
  renderDirList("spklu");
  renderDirList("bengkel");
  renderDirList("berita");
  renderOverview();
}

function populateSelects() {
  const bodySelect = $("car-form").elements["bodyType"];
  bodySelect.innerHTML = BODY_TYPES.map((b) => `<option value="${b}">${b}</option>`).join("");

  const stdSelect = $("car-form").elements["rangeStandard"];
  stdSelect.innerHTML =
    '<option value="">—</option>' +
    RANGE_STANDARDS.map((s) => `<option value="${s}">${s}</option>`).join("");
}

function openVehicleModal(collection, car) {
  const form = $("car-form");
  form.reset();
  editingVehicle = car ? { collection, id: car.id } : { collection, id: null };
  galleryDraft = car ? [...(car.gallery || [])] : [];
  $("modal-title").textContent = collection === "cars" ? (car ? "Edit Mobil" : "Tambah Mobil") : (car ? "Edit Motor" : "Tambah Motor");

  const defaultBody = collection === "motors" ? "Skuter" : "Hatchback";

  if (car) {
    const f = form.elements;
    f.brand.value = car.brand || "";
    f.name.value = car.name || "";
    f.bodyType.value = car.bodyType || defaultBody;
    f.rangeStandard.value = car.rangeStandard || "";
    f.rangeKm.value = car.rangeKm ?? "";
    f.batteryKwh.value = car.batteryKwh ?? "";
    f.powerHp.value = car.powerHp ?? "";
    f.price.value = car.price ?? "";
    f.priceText.value = car.priceText || "";
    f.tagline.value = car.tagline || "";
    f.description.value = car.description || "";
    f.highlights.value = (car.highlights || []).join("\n");
    f.variantNames.value = (car.variantNames || []).join(", ");
    f.colors.value = (car.colors || []).join(", ");
    f.video.value = car.video || "";
    f.stale.checked = !!car.stale;
  } else {
    form.elements["bodyType"].value = defaultBody;
  }

  const preview = $("image-preview");
  if (car && car.image) {
    preview.src = car.image;
    preview.style.display = "block";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }

  renderGalleryDraft();
  $("car-modal").classList.add("open");
}

function closeVehicleModal() {
  $("car-modal").classList.remove("open");
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append("image", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok) return data.url;
    showToast("Upload gambar gagal");
  } catch {
    showToast("Upload gambar gagal");
  }
  return null;
}

async function submitVehicle(e) {
  e.preventDefault();
  const f = $("car-form").elements;
  const collection = editingVehicle.collection;
  const brand = String(f.brand.value || "").trim();
  const name = String(f.name.value || "").trim();
  if (!brand || !name) return;

  const existing = editingVehicle.id ? content[collection].find((c) => c.id === editingVehicle.id) : null;
  let image = existing?.image || "";

  if (f.removeImage.checked) {
    image = "";
  }
  const mainFile = f.imageFile.files && f.imageFile.files[0];
  if (mainFile) {
    const url = await uploadImage(mainFile);
    if (url) image = url;
  }

  const gallery = [...galleryDraft];
  const galleryFiles = f.galleryFiles.files || [];
  for (const file of galleryFiles) {
    const url = await uploadImage(file);
    if (url) gallery.push(url);
  }

  const vehicle = {
    id: editingVehicle.id || uniqueId(collection, slugify(`${brand} ${name}`)),
    brand,
    name,
    bodyType: f.bodyType.value || (collection === "motors" ? "Skuter" : "Hatchback"),
    tagline: String(f.tagline.value || "").trim(),
    description: String(f.description.value || "").trim(),
    highlights: splitLines(f.highlights.value),
    rangeKm: numOrNull(f.rangeKm.value),
    rangeStandard: f.rangeStandard.value || null,
    batteryKwh: numOrNull(f.batteryKwh.value),
    powerHp: numOrNull(f.powerHp.value),
    price: numOrNull(f.price.value),
    priceText: String(f.priceText.value || "").trim(),
    stale: f.stale.checked,
    variantNames: splitList(f.variantNames.value),
    colors: splitList(f.colors.value),
    image,
    gallery,
    video: String(f.video.value || "").trim(),
  };

  const idx = content[collection].findIndex((c) => c.id === vehicle.id);
  if (idx >= 0) {
    content[collection][idx] = vehicle;
  } else {
    content[collection].push(vehicle);
  }
  closeVehicleModal();
  save();
}

function buildDirFields() {
  const cfg = DIR_CONFIG[editingDir.collection];
  return cfg.fields
    .map(([key, label, type]) => {
      const value = editingDir.item ? editingDir.item[key] || "" : "";
      const escVal = esc(value);
      return `<div class="field${key === "title" || key === "name" ? "" : ""}">
        <label>${esc(label)}</label>
        <input name="${esc(key)}" type="${type}" value="${escVal}" />
      </div>`;
    })
    .join("");
}

function openDirModal(collection, index) {
  const cfg = DIR_CONFIG[collection];
  const item = index != null ? content[collection][index] : null;
  editingDir = { collection, index: index ?? null, item };
  $("dir-modal-title").textContent = (item ? "Edit " : "Tambah ") + cfg.label;
  $("dir-fields").innerHTML = buildDirFields();
  $("dir-modal").classList.add("open");
}

function closeDirModal() {
  $("dir-modal").classList.remove("open");
}

function submitDir(e) {
  e.preventDefault();
  const f = $("dir-form").elements;
  const cfg = DIR_CONFIG[editingDir.collection];
  const item = {};
  for (const [key] of cfg.fields) {
    item[key] = String(f[key] ? f[key].value : "").trim();
  }

  if (editingDir.index != null) {
    content[editingDir.collection][editingDir.index] = item;
  } else {
    content[editingDir.collection].push(item);
  }
  closeDirModal();
  save();
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  TABS.forEach((n) => {
    $("tab-" + n).hidden = n !== name;
  });
}

function init() {
  populateSelects();

  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  $("car-search").addEventListener("input", () => renderVehicleList("cars", "car-list"));
  $("motor-search").addEventListener("input", () => renderVehicleList("motors", "motor-list"));
  $("spklu-search").addEventListener("input", () => renderDirList("spklu"));
  $("bengkel-search").addEventListener("input", () => renderDirList("bengkel"));
  $("berita-search").addEventListener("input", () => renderDirList("berita"));

  $("site-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = $("site-form").elements;
    for (const key of SITE_FIELDS) {
      if (f[key]) content.site[key] = f[key].value || "";
    }
    save();
  });

  $("add-car").addEventListener("click", () => openVehicleModal("cars", null));
  $("add-motor").addEventListener("click", () => openVehicleModal("motors", null));
  $("close-modal").addEventListener("click", closeVehicleModal);
  $("cancel-modal").addEventListener("click", closeVehicleModal);
  $("car-modal").addEventListener("click", (e) => {
    if (e.target === $("car-modal")) closeVehicleModal();
  });
  $("car-form").addEventListener("submit", submitVehicle);

  $("add-spklu").addEventListener("click", () => openDirModal("spklu", null));
  $("add-bengkel").addEventListener("click", () => openDirModal("bengkel", null));
  $("add-berita").addEventListener("click", () => openDirModal("berita", null));
  $("close-dir-modal").addEventListener("click", closeDirModal);
  $("cancel-dir-modal").addEventListener("click", closeDirModal);
  $("dir-modal").addEventListener("click", (e) => {
    if (e.target === $("dir-modal")) closeDirModal();
  });
  $("dir-form").addEventListener("submit", submitDir);

  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      const collection = editBtn.dataset.collection || "cars";
      const item = content[collection].find((c) => c.id === editBtn.dataset.edit);
      if (item) openVehicleModal(collection, item);
      return;
    }
    const delBtn = e.target.closest("[data-delete]");
    if (delBtn) {
      const collection = delBtn.dataset.collection || "cars";
      const item = content[collection].find((c) => c.id === delBtn.dataset.delete);
      if (item && confirm(`Hapus ${item.brand} ${item.name}?`)) {
        content[collection] = content[collection].filter((c) => c.id !== item.id);
        save();
      }
      return;
    }
    const dirEditBtn = e.target.closest("[data-dir-edit]");
    if (dirEditBtn) {
      openDirModal(dirEditBtn.dataset.collection, parseInt(dirEditBtn.dataset.dirEdit, 10));
      return;
    }
    const dirDelBtn = e.target.closest("[data-dir-delete]");
    if (dirDelBtn) {
      const collection = dirDelBtn.dataset.collection;
      const index = parseInt(dirDelBtn.dataset.dirDelete, 10);
      const item = content[collection][index];
      const title = item ? item[DIR_CONFIG[collection].title] : "item ini";
      if (confirm(`Hapus ${title}?`)) {
        content[collection].splice(index, 1);
        save();
      }
      return;
    }
    const remBtn = e.target.closest("[data-gallery-remove]");
    if (remBtn) {
      galleryDraft = galleryDraft.filter((u) => u !== remBtn.dataset.galleryRemove);
      renderGalleryDraft();
    }
  });

  $("logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/admin/login";
  });

  load();
}

async function load() {
  try {
    const res = await fetch("/api/content");
    if (res.status === 401) {
      location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    if (data.ok) {
      content = data.content;
      renderAll();
    }
  } catch {
    showToast("Gagal memuat data");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
