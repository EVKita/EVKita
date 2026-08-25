/**
 * Ilustrasi kendaraan cadangan (dipakai kalau item belum punya foto) plus
 * palet warna bawaan. Dipakai server-side oleh `mobil/[slug].astro` dan
 * client-side oleh `scripts/app.js`, jadi berkas ini wajib JS murni tanpa
 * ketergantungan DOM maupun Node.
 */

export const CAR_COLORS = [
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

/**
 * `wheels` menyimpan titik sumbu roda per bodi: sedan/coupe punya moncong
 * lebih panjang, jadi memakai satu pasang koordinat untuk semua bodi membuat
 * rodanya terlihat salah tempat.
 */
export const CAR_BODIES = {
  Hatchback: {
    body: "M30 116 L30 100 Q30 92 40 90 L62 72 Q76 62 92 58 L118 50 Q134 44 150 44 L270 44 Q282 44 292 52 L318 72 Q330 82 334 94 L336 116 Z",
    window: "M98 60 L120 52 Q136 47 150 47 L262 47 Q272 47 278 53 L288 65 L98 65 Z",
    wheels: [104, 288],
  },
  Crossover: {
    body: "M30 118 L30 96 Q30 88 40 86 L64 66 Q78 56 96 52 L122 44 Q138 38 154 38 L286 38 Q298 38 306 46 L328 78 Q338 90 342 102 L342 118 Z",
    window: "M100 56 L122 48 Q138 43 154 43 L280 43 Q290 43 296 50 L306 62 L100 62 Z",
    wheels: [106, 294],
  },
  SUV: {
    body: "M30 118 L30 96 Q30 88 40 86 L66 68 Q80 58 98 54 L124 46 Q140 40 156 40 L292 40 Q304 40 312 48 L330 88 Q338 100 340 112 L340 118 Z",
    window: "M100 54 L124 48 Q140 44 156 44 L286 44 Q296 44 302 52 L312 64 L100 64 Z",
    wheels: [108, 296],
  },
  Sedan: {
    body: "M28 114 L28 98 Q28 90 38 88 L64 70 Q80 60 98 56 L126 48 Q142 42 158 42 L282 42 Q296 42 304 52 L324 66 L354 70 Q368 72 372 82 L372 114 Z",
    window: "M102 58 L126 50 Q142 46 158 46 L276 46 Q288 46 294 54 L302 64 L102 64 Z",
    wheels: [106, 306],
  },
  Coupe: {
    body: "M28 112 L28 96 Q28 88 38 86 L66 68 Q82 58 100 54 L132 44 Q148 38 164 38 L288 42 Q302 42 310 50 L334 66 L358 72 Q368 74 370 84 L370 112 Z",
    window: "M104 56 L132 47 Q148 42 164 42 L282 45 Q294 45 300 52 L308 62 L104 62 Z",
    wheels: [106, 304],
  },
  MPV: {
    body: "M30 118 L30 96 Q30 88 40 86 L64 72 Q78 64 96 60 L124 52 Q140 47 156 47 L320 47 Q332 47 340 56 L344 118 Z",
    window: "M100 58 L124 53 Q140 49 156 49 L314 49 Q324 49 330 57 L338 66 L100 66 Z",
    wheels: [106, 298],
  },
  Niaga: {
    body: "M32 118 L32 98 Q32 90 42 88 L66 78 Q80 70 98 68 L120 62 Q132 57 148 57 L330 57 Q340 57 348 66 L350 118 Z",
    window: "M100 64 L120 60 Q132 56 148 56 L324 56 Q334 56 340 64 L346 72 L100 72 Z",
    wheels: [104, 300],
  },
  Wagon: {
    body: "M28 116 L28 98 Q28 90 38 88 L62 70 Q78 60 96 56 L124 48 Q140 42 156 42 L318 42 Q332 42 340 52 L356 72 Q366 80 368 92 L368 116 Z",
    window: "M100 58 L124 50 Q140 46 156 46 L312 46 Q322 46 328 54 L336 64 L100 64 Z",
    wheels: [104, 302],
  },
  Pickup: {
    body: "M28 116 L28 98 Q28 90 38 88 L62 72 Q76 62 94 58 L120 50 Q136 44 152 44 L232 44 Q244 44 250 52 L262 74 L360 74 Q370 74 370 84 L370 116 Z",
    window: "M100 60 L120 52 Q136 47 152 47 L228 47 Q238 47 243 54 L252 66 L100 66 Z",
    wheels: [104, 312],
  },
  Van: {
    body: "M30 118 L30 92 Q30 82 42 80 L58 60 Q68 50 84 50 L330 50 Q342 50 348 60 L352 118 Z",
    window: "M96 58 L110 55 Q120 53 132 53 L324 53 Q334 53 339 61 L344 70 L96 70 Z",
    wheels: [102, 302],
  },
  Roadster: {
    body: "M26 110 L26 96 Q26 88 36 86 L68 70 Q86 60 106 56 L142 46 Q158 40 174 40 L272 44 Q286 44 294 52 L322 66 L360 72 Q372 74 374 84 L374 110 Z",
    window: "M116 56 L142 48 Q158 44 174 44 L266 47 Q276 47 281 53 L288 60 L116 60 Z",
    wheels: [104, 308],
  },
};

/** Tipe bodi yang harus digambar sebagai motor/skuter, bukan mobil. */
const MOTO_TYPES = /skuter|scooter|motor|moped|bebek|matic|kopling|sport|trail|cub/i;

/** Skuter bertubuh bulat vs motor sport bertubuh runcing — dua siluet berbeda. */
const MOTO_SHAPES = {
  skuter: {
    body: "M156 104 L156 66 Q156 58 166 58 L238 58 Q250 58 258 68 L292 98 L292 122 L160 122 Z",
    seat: "M168 48 h66 a6 6 0 0 1 0 12 h-66 a6 6 0 0 1 0 -12 z",
    tail: 0,
  },
  sport: {
    body: "M150 108 L154 78 Q156 66 172 64 L226 58 Q244 56 258 66 L296 88 L300 118 L156 122 Z",
    seat: "M186 44 L262 40 Q272 39 274 48 L272 58 L188 60 Q178 60 178 52 Z",
    tail: 1,
  },
};

export function shade(hex, pct) {
  const num = parseInt(String(hex).replace("#", ""), 16);
  if (!Number.isFinite(num)) return hex;
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

export function paletteFor(c) {
  if (c && c.colors && c.colors.length) {
    return c.colors.map((hex) => ({ name: hex, hex }));
  }
  return CAR_COLORS;
}

export function defaultColor(c) {
  const palette = paletteFor(c);
  let h = 0;
  for (const ch of String((c && c.id) || "x")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length].hex;
}

/**
 * SVG ini ikut masuk ke innerHTML di sisi klien, jadi teks apa pun dari data
 * (merek, nama) wajib dilucuti dulu — bukan sekadar soal rapi, tapi keamanan.
 */
function esc(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Hanya izinkan hex sederhana supaya nilai warna tidak bisa menutup atribut. */
function safeColor(v, fallback) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(v || "")) ? String(v) : fallback;
}

function gradId(c, suffix) {
  const base = String((c && c.id) || "x").replace(/[^a-zA-Z0-9]/g, "");
  return "ev" + base + (suffix || "");
}

function wheel(cx, cy, r) {
  const rim = r * 0.56;
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    spokes.push(
      `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * rim).toFixed(1)}" y2="${(cy + Math.sin(a) * rim).toFixed(1)}" stroke="#1b2330" stroke-width="2.4" stroke-linecap="round"/>`
    );
  }
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0b0e13"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="#191f29" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${rim}" fill="#39424f"/>
    ${spokes.join("")}
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.2).toFixed(1)}" fill="#141a23"/>
  </g>`;
}

/** Definisi bersama: gradien bodi, kilau, dan bayangan lantai yang melembut. */
function defs(id, color) {
  const light = shade(color, 26);
  const dark = shade(color, -26);
  return `<defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.42" stop-color="${color}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#31414f"/>
      <stop offset="1" stop-color="#0a1017"/>
    </linearGradient>
    <radialGradient id="${id}s" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.34"/>
      <stop offset="0.65" stop-color="#000000" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

export function scooterSVG(c, color) {
  const col = safeColor(color, defaultColor(c || {}));
  const id = gradId(c, "m");
  const stroke = shade(col, -38);
  const label = esc(((c && c.brand) || "") + " " + ((c && c.name) || "")).trim() || "Kendaraan listrik";
  const sporty = MOTO_SHAPES[/sport|trail|kopling/i.test(String((c && c.bodyType) || "")) ? "sport" : "skuter"];

  return `<svg viewBox="0 0 400 150" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">
    ${defs(id, col)}
    <ellipse cx="200" cy="140" rx="152" ry="12" fill="url(#${id}s)"/>
    ${wheel(106, 120, 22)}${wheel(298, 120, 22)}
    <g stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round">
      <rect x="52" y="56" width="15" height="62" rx="7.5" fill="#2c3542" transform="rotate(14 60 88)"/>
      <rect x="82" y="40" width="40" height="11" rx="5.5" fill="#1b2430" transform="rotate(-6 102 46)"/>
      <rect x="88" y="86" width="92" height="14" rx="7" fill="url(#${id}b)"/>
      <path d="${sporty.body}" fill="url(#${id}b)"/>
      <path d="${sporty.body}" fill="url(#${id}g)" stroke="none"/>
    </g>
    <path d="${sporty.seat}" fill="#0f151d"/>
    <circle cx="100" cy="38" r="7" fill="#fdf3d0"/>
    <circle cx="100" cy="38" r="3" fill="#fff9e8"/>
    <rect x="290" y="86" width="22" height="9" rx="4.5" fill="#c2372f"/>
  </svg>`;
}

export function carSVG(c, color) {
  const type = String((c && c.bodyType) || "");
  if (!CAR_BODIES[type] && MOTO_TYPES.test(type)) return scooterSVG(c, color);

  const b = CAR_BODIES[type] || CAR_BODIES.Crossover;
  const col = safeColor(color, defaultColor(c || {}));
  const id = gradId(c, "c");
  const stroke = shade(col, -38);
  const label = esc(((c && c.brand) || "") + " " + ((c && c.name) || "")).trim() || "Kendaraan listrik";
  const [wx1, wx2] = b.wheels || [106, 294];

  return `<svg viewBox="0 0 400 150" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">
    ${defs(id, col)}
    <ellipse cx="200" cy="139" rx="168" ry="13" fill="url(#${id}s)"/>
    ${wheel(wx1, 116, 23)}${wheel(wx2, 116, 23)}
    <path d="${b.body}" fill="url(#${id}b)" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="${b.body}" fill="url(#${id}g)"/>
    <path d="${b.window}" fill="url(#${id}w)"/>
    <path d="${b.body}" fill="none" stroke="${shade(col, 40)}" stroke-width="0.9" stroke-opacity="0.55" stroke-linejoin="round"/>
  </svg>`;
}
