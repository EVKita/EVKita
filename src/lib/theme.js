/**
 * Tema tampilan situs publik.
 *
 * Semua setelan menu **Tampilan** di panel admin bermuara ke berkas ini, dan
 * hanya ke berkas ini. Tujuannya satu: ada SATU tempat yang tahu bagaimana
 * sebuah nilai di `content.json` berubah menjadi CSS. Sebelum ini tujuh
 * halaman masing-masing merakit objek tema sendiri, jadi menambah satu setelan
 * berarti menyunting tujuh berkas — dan cukup satu yang terlewat untuk membuat
 * satu halaman tampil berbeda dari yang lain tanpa ada yang menyadarinya.
 *
 * Berkas ini JavaScript polos tanpa impor apa pun supaya bisa dipakai di dua
 * tempat sekaligus: frontmatter `.astro` (dirender server) dan
 * `src/scripts/admin.js` (pratinjau langsung di peramban).
 *
 * ATURAN KEAMANAN: nilai di sini berasal dari panel admin dan langsung disusun
 * menjadi CSS. Setiap nilai WAJIB lewat penyaring — `hex()`, `num()`, atau
 * daftar putih `pick()`. Tidak ada teks bebas yang boleh lolos ke dalam CSS,
 * kecuali field CSS Kustom yang memang disengaja dan dibersihkan tersendiri.
 */

/* ------------------------------------------------------------------ *
 * Daftar putih
 * ------------------------------------------------------------------ */

/**
 * Huruf yang boleh dipakai. Nilainya datang dari panel dan langsung disusun
 * jadi URL Google Fonts, jadi teks bebas tidak boleh lewat.
 */
export const FONTS = {
  Inter: "Inter:wght@400;500;600;700;800;900",
  Poppins: "Poppins:wght@400;500;600;700;800",
  Manrope: "Manrope:wght@400;500;600;700;800",
  Figtree: "Figtree:wght@400;500;600;700;800;900",
  Outfit: "Outfit:wght@400;500;600;700;800",
  Rubik: "Rubik:wght@400;500;600;700;800",
  Montserrat: "Montserrat:wght@400;500;600;700;800",
  Nunito: "Nunito:wght@400;500;600;700;800",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@400;500;600;700;800",
  "Space Grotesk": "Space+Grotesk:wght@400;500;600;700",
  "DM Sans": "DM+Sans:wght@400;500;600;700;800;900",
  Lexend: "Lexend:wght@400;500;600;700;800;900",
  Urbanist: "Urbanist:wght@400;500;600;700;800;900",
  Sora: "Sora:wght@400;500;600;700;800",
  Archivo: "Archivo:wght@400;500;600;700;800;900",
  "Bricolage Grotesque": "Bricolage+Grotesque:wght@400;500;600;700;800",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700;800;900",
  Fraunces: "Fraunces:wght@400;500;600;700;800;900",
  Lora: "Lora:wght@400;500;600;700",
  Merriweather: "Merriweather:wght@400;700;900",
  "Bebas Neue": "Bebas+Neue",
};

export const FONT_NAMES = Object.keys(FONTS);

/** Pilihan yang ditawarkan tiap field bergaya daftar. Urutan = urutan tampil. */
export const CHOICES = {
  themeMode: ["auto", "light", "dark"],
  gradType: ["linear", "radial", "conic"],
  bgPattern: ["none", "dots", "grid", "lines", "mesh", "aurora", "noise"],
  themeShadow: ["none", "soft", "medium", "strong"],
  themeCard: ["solid", "outline", "elevated", "glass"],
  headerStyle: ["blur", "solid", "clear"],
  buttonStyle: ["gradient", "solid", "outline", "soft"],
  buttonShape: ["pill", "rounded", "square"],
  heroAlign: ["center", "left"],
};

/* ------------------------------------------------------------------ *
 * Nilai bawaan
 * ------------------------------------------------------------------ */

/**
 * Nilai bawaan seluruh setelan menu Tampilan.
 *
 * Ditulis di sini, bukan di `store.ts`, karena dua pihak membutuhkannya:
 * server (untuk melengkapi `content.json` lama yang belum punya field ini) dan
 * panel (untuk tombol "Kembalikan ke bawaan"). Menyalinnya ke dua tempat
 * berarti suatu hari tombol itu akan mengembalikan situs ke tampilan yang
 * bukan tampilan bawaannya.
 */
export const APPEARANCE_DEFAULTS = {
  // Warna & gradien
  themePreset: "evkita",
  themePrimary: "#37e0a6",
  themeSecondary: "#3aa0ff",
  themeMode: "auto",
  gradType: "linear",
  gradAngle: "135",
  gradMid: "#ffffff",

  // Latar belakang
  bgPattern: "none",
  bgIntensity: "50",
  bgLight: "#f4f6fa",
  bgDark: "#0b0e14",
  bgImage: "",
  bgImageOpacity: "18",
  bgImageBlur: "0",

  // Tipografi
  themeFont: "Inter",
  themeFontHeading: "",
  themeFontScale: "100",
  themeHeadingWeight: "900",
  themeHeadingSpacing: "-3",

  // Bentuk & kedalaman
  themeRadius: "16",
  themeShadow: "soft",
  themeCard: "solid",
  themeMaxWidth: "1220",
  themeSpacing: "100",

  // Header, tombol, hero
  headerStyle: "blur",
  buttonStyle: "gradient",
  buttonShape: "pill",
  heroAlign: "center",
  heroOverlay: "70",

  // CSS kustom
  customCss: "",
};

/** Saklar tampilan. Terpisah karena bertipe boolean, bukan string. */
export const APPEARANCE_FLAGS = {
  gradMidOn: false,
  bgCustom: false,
  bgImageFixed: true,
  headerSticky: true,
  headerBorder: false,
  heroGlow: true,
  fxAnimations: true,
  fxHover: true,
};

/* ------------------------------------------------------------------ *
 * Preset
 * ------------------------------------------------------------------ */

/**
 * Preset adalah paket setelan siap pakai, bukan sekadar sepasang warna:
 * memilih "Senja" ikut mengganti gradien, pola latar, sudut membulat, dan
 * hurufnya. Kalau preset hanya mengganti warna, hasilnya selalu terasa seperti
 * tema bawaan yang dicat ulang — persis yang ingin dihindari orang yang
 * membuka menu ini.
 *
 * `label` sengaja tidak diterjemahkan: ia nama diri, sama seperti nama huruf.
 */
export const THEME_PRESETS = [
  {
    id: "evkita",
    label: "EVKita",
    themePrimary: "#37e0a6",
    themeSecondary: "#3aa0ff",
    gradType: "linear",
    gradAngle: "135",
    bgPattern: "none",
    themeRadius: "16",
    themeFont: "Inter",
    themeFontHeading: "",
    themeCard: "solid",
    themeShadow: "soft",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "nyala",
    label: "Nyala",
    themePrimary: "#ff3d2e",
    themeSecondary: "#ff8a00",
    gradType: "linear",
    gradAngle: "135",
    bgPattern: "none",
    themeRadius: "16",
    themeFont: "Inter",
    themeFontHeading: "",
    themeCard: "solid",
    themeShadow: "soft",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "samudra",
    label: "Samudra",
    themePrimary: "#0ea5e9",
    themeSecondary: "#6366f1",
    gradType: "linear",
    gradAngle: "150",
    bgPattern: "mesh",
    themeRadius: "20",
    themeFont: "Plus Jakarta Sans",
    themeFontHeading: "",
    themeCard: "glass",
    themeShadow: "medium",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "senja",
    label: "Senja",
    themePrimary: "#f97316",
    themeSecondary: "#db2777",
    gradType: "linear",
    gradAngle: "120",
    bgPattern: "aurora",
    themeRadius: "22",
    themeFont: "Outfit",
    themeFontHeading: "Bricolage Grotesque",
    themeCard: "elevated",
    themeShadow: "strong",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "hutan",
    label: "Hutan",
    themePrimary: "#16a34a",
    themeSecondary: "#84cc16",
    gradType: "linear",
    gradAngle: "160",
    bgPattern: "dots",
    themeRadius: "14",
    themeFont: "Figtree",
    themeFontHeading: "",
    themeCard: "solid",
    themeShadow: "soft",
    buttonStyle: "solid",
    buttonShape: "rounded",
  },
  {
    id: "anggur",
    label: "Anggur",
    themePrimary: "#7c3aed",
    themeSecondary: "#ec4899",
    gradType: "conic",
    gradAngle: "210",
    bgPattern: "aurora",
    themeRadius: "24",
    themeFont: "Sora",
    themeFontHeading: "",
    themeCard: "glass",
    themeShadow: "strong",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "karbon",
    label: "Karbon",
    themePrimary: "#475569",
    themeSecondary: "#0f172a",
    gradType: "linear",
    gradAngle: "135",
    bgPattern: "grid",
    themeRadius: "6",
    themeFont: "Archivo",
    themeFontHeading: "",
    themeCard: "outline",
    themeShadow: "none",
    buttonStyle: "outline",
    buttonShape: "square",
  },
  {
    id: "emas",
    label: "Emas",
    themePrimary: "#d4a017",
    themeSecondary: "#b45309",
    gradType: "linear",
    gradAngle: "115",
    bgPattern: "noise",
    themeRadius: "10",
    themeFont: "Lora",
    themeFontHeading: "Playfair Display",
    themeCard: "outline",
    themeShadow: "soft",
    buttonStyle: "solid",
    buttonShape: "rounded",
  },
  {
    id: "mawar",
    label: "Mawar",
    themePrimary: "#e11d48",
    themeSecondary: "#fb7185",
    gradType: "radial",
    gradAngle: "135",
    bgPattern: "mesh",
    themeRadius: "26",
    themeFont: "Nunito",
    themeFontHeading: "Fraunces",
    themeCard: "elevated",
    themeShadow: "medium",
    buttonStyle: "soft",
    buttonShape: "pill",
  },
  {
    id: "neon",
    label: "Neon",
    themePrimary: "#a3e635",
    themeSecondary: "#22d3ee",
    gradType: "linear",
    gradAngle: "100",
    bgPattern: "lines",
    themeRadius: "8",
    themeFont: "Space Grotesk",
    themeFontHeading: "",
    themeCard: "outline",
    themeShadow: "none",
    buttonStyle: "outline",
    buttonShape: "square",
  },
  {
    id: "langit",
    label: "Langit",
    themePrimary: "#38bdf8",
    themeSecondary: "#818cf8",
    gradType: "linear",
    gradAngle: "140",
    bgPattern: "dots",
    themeRadius: "18",
    themeFont: "Manrope",
    themeFontHeading: "",
    themeCard: "solid",
    themeShadow: "medium",
    buttonStyle: "gradient",
    buttonShape: "pill",
  },
  {
    id: "kopi",
    label: "Kopi",
    themePrimary: "#a16207",
    themeSecondary: "#78350f",
    gradType: "linear",
    gradAngle: "150",
    bgPattern: "noise",
    themeRadius: "12",
    themeFont: "Merriweather",
    themeFontHeading: "Fraunces",
    themeCard: "solid",
    themeShadow: "soft",
    buttonStyle: "solid",
    buttonShape: "rounded",
  },
];

/** Field yang ikut berubah ketika sebuah preset dipilih. */
export const PRESET_FIELDS = [
  "themePrimary",
  "themeSecondary",
  "gradType",
  "gradAngle",
  "bgPattern",
  "themeRadius",
  "themeFont",
  "themeFontHeading",
  "themeCard",
  "themeShadow",
  "buttonStyle",
  "buttonShape",
];

export function findPreset(id) {
  return THEME_PRESETS.find((p) => p.id === id) || null;
}

/* ------------------------------------------------------------------ *
 * Penyaring nilai
 * ------------------------------------------------------------------ */

/** Warna heksadesimal, atau `fallback` kalau bukan. Tanpa ini, teks bebas
    dari panel bisa menyelinap ke dalam deklarasi CSS. */
function hex(v, fallback = "") {
  const s = String(v == null ? "" : v).trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

function num(v, min, max, fallback) {
  const n = Number(String(v == null ? "" : v).trim().replace(/px$/i, ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pick(v, list, fallback) {
  const s = String(v == null ? "" : v).trim();
  return list.includes(s) ? s : fallback;
}

function flag(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return !!v;
}

/**
 * URL gambar latar. Hanya jalur lokal dan http(s) yang diterima — `javascript:`
 * memang tidak berbahaya di dalam `url()`, tapi `data:` yang panjang bisa
 * membuat HTML membengkak, dan tanda kutip harus tetap ditolak supaya tidak
 * ada yang bisa keluar dari deklarasi.
 */
function cssUrl(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s || /["'()\\\s]/.test(s)) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

/* ------------------------------------------------------------------ *
 * Nilai tema yang sudah bersih
 * ------------------------------------------------------------------ */

/**
 * Membaca objek `site` apa adanya dan mengembalikan nilai yang sudah aman
 * dipakai. Dipanggil semua fungsi di bawah supaya penyaringan hanya ditulis
 * sekali.
 */
export function resolveTheme(site) {
  const s = site || {};
  const primary = hex(s.themePrimary, "#37e0a6");
  const secondary = hex(s.themeSecondary, primary);
  const fontBody = FONTS[s.themeFont] ? s.themeFont : "Inter";
  const fontHead = FONTS[s.themeFontHeading] ? s.themeFontHeading : "";

  return {
    primary,
    secondary,
    gradMid: flag(s.gradMidOn, false) ? hex(s.gradMid, "") : "",
    gradType: pick(s.gradType, CHOICES.gradType, "linear"),
    gradAngle: num(s.gradAngle, 0, 360, 135),

    mode: pick(s.themeMode, CHOICES.themeMode, "auto"),
    radius: num(s.themeRadius, 0, 36, 16),

    fontBody,
    fontHead,
    fontScale: num(s.themeFontScale, 85, 120, 100) / 100,
    headWeight: num(s.themeHeadingWeight, 400, 900, 900),
    headTrack: num(s.themeHeadingSpacing, -8, 4, -3) / 100,

    bgPattern: pick(s.bgPattern, CHOICES.bgPattern, "none"),
    bgIntensity: num(s.bgIntensity, 0, 100, 50) / 100,
    bgLight: flag(s.bgCustom, false) ? hex(s.bgLight, "") : "",
    bgDark: flag(s.bgCustom, false) ? hex(s.bgDark, "") : "",
    bgImage: cssUrl(s.bgImage),
    bgImageOpacity: num(s.bgImageOpacity, 0, 100, 18) / 100,
    bgImageBlur: num(s.bgImageBlur, 0, 24, 0),
    bgImageFixed: flag(s.bgImageFixed, true),

    shadow: pick(s.themeShadow, CHOICES.themeShadow, "soft"),
    card: pick(s.themeCard, CHOICES.themeCard, "solid"),
    maxWidth: num(s.themeMaxWidth, 1000, 1600, 1220),
    spacing: num(s.themeSpacing, 70, 140, 100) / 100,

    headerStyle: pick(s.headerStyle, CHOICES.headerStyle, "blur"),
    headerSticky: flag(s.headerSticky, true),
    headerBorder: flag(s.headerBorder, false),

    buttonStyle: pick(s.buttonStyle, CHOICES.buttonStyle, "gradient"),
    buttonShape: pick(s.buttonShape, CHOICES.buttonShape, "pill"),

    heroAlign: pick(s.heroAlign, CHOICES.heroAlign, "center"),
    heroOverlay: num(s.heroOverlay, 0, 100, 70) / 100,
    heroGlow: flag(s.heroGlow, true),

    fxAnimations: flag(s.fxAnimations, true),
    fxHover: flag(s.fxHover, true),

    customCss: cleanCustomCss(s.customCss),
  };
}

/** Menyusun deklarasi gradien aksen dari tipe, sudut, dan warna. */
export function gradientCss(th) {
  const stops = [th.primary, th.gradMid, th.secondary].filter(Boolean).join(", ");
  if (th.gradType === "radial") return `radial-gradient(circle at 30% 25%, ${stops})`;
  if (th.gradType === "conic") return `conic-gradient(from ${th.gradAngle}deg, ${stops}, ${th.primary})`;
  return `linear-gradient(${th.gradAngle}deg, ${stops})`;
}

/**
 * Variabel yang dipasang sebagai atribut `style` di `<body>`.
 *
 * Sengaja inline, bukan lewat `<style>`: `global.css` mendeklarasikan token
 * yang sama di `:root`, yang kekhususannya lebih tinggi daripada selektor
 * `body`. Gaya inline satu-satunya yang pasti menang tanpa `!important`.
 */
export function themeStyle(site) {
  const th = resolveTheme(site);
  const parts = [
    `--accent:${th.primary}`,
    `--accent-2:${th.secondary}`,
    `--accent-grad:${gradientCss(th)}`,
    `--radius:${th.radius}px`,
    `--radius-sm:${Math.max(4, Math.round(th.radius * 0.6))}px`,
    `--radius-lg:${Math.round(th.radius * 1.6)}px`,
    `--font-sans:"${th.fontBody}",system-ui,-apple-system,"Segoe UI",sans-serif`,
    `--font-head:"${th.fontHead || th.fontBody}",var(--font-sans)`,
    `--font-scale:${th.fontScale}`,
    `--head-weight:${th.headWeight}`,
    `--head-track:${th.headTrack}em`,
    `--maxw:${th.maxWidth}px`,
    `--space-scale:${th.spacing}`,
    `--bg-fx-opacity:${th.bgIntensity}`,
    `--hero-overlay:${th.heroOverlay}`,
  ];
  if (th.bgImage) {
    parts.push(`--bg-image:url(${th.bgImage})`);
    parts.push(`--bg-image-opacity:${th.bgImageOpacity}`);
    parts.push(`--bg-image-blur:${th.bgImageBlur}px`);
    parts.push(`--bg-image-attach:${th.bgImageFixed ? "fixed" : "scroll"}`);
  }
  return parts.join(";");
}

/**
 * Kelas penanda di `<body>`. Semua pilihan yang berupa "gaya", bukan angka,
 * diwujudkan sebagai kelas supaya aturannya bisa ditulis penuh di `global.css`
 * — bukan dijahit dari puluhan variabel yang hanya berarti di satu tempat.
 */
export function themeBodyClass(site) {
  const th = resolveTheme(site);
  const cls = [
    `ui-shadow-${th.shadow}`,
    `ui-card-${th.card}`,
    `ui-btn-${th.buttonStyle}`,
    `ui-btnshape-${th.buttonShape}`,
    `ui-header-${th.headerStyle}`,
    `ui-bg-${th.bgPattern}`,
    `ui-hero-${th.heroAlign}`,
  ];
  if (th.bgImage) cls.push("ui-has-bgimage");
  if (!th.headerSticky) cls.push("ui-header-static");
  if (th.headerBorder) cls.push("ui-header-line");
  if (!th.heroGlow) cls.push("ui-no-glow");
  if (!th.fxAnimations) cls.push("ui-no-anim");
  if (!th.fxHover) cls.push("ui-no-lift");
  return cls.join(" ");
}

/**
 * Warna latar pilihan pemilik situs.
 *
 * Tidak bisa ikut gaya inline: nilainya berbeda antara tema terang dan gelap,
 * sedangkan satu atribut `style` hanya bisa membawa satu nilai. Karena itu
 * dikirim sebagai aturan CSS dengan kekhususan yang cukup untuk mengalahkan
 * `:root` dan `[data-theme="dark"]` di `global.css`.
 */
export function themeExtraCss(site) {
  const th = resolveTheme(site);
  const out = [];
  if (th.bgLight) {
    out.push(`html:root:not([data-theme="dark"]){--bg:${th.bgLight};--bg-tint:${th.bgLight}}`);
  }
  if (th.bgDark) {
    out.push(`html:root[data-theme="dark"]{--bg:${th.bgDark};--bg-tint:${th.bgDark}}`);
  }
  if (th.customCss) out.push(th.customCss);
  return out.join("\n");
}

/**
 * Membersihkan CSS kustom. Yang dijaga hanya satu hal: potongan itu tidak
 * boleh bisa menutup `<style>` lalu membuka tag lain. Selebihnya memang
 * disengaja bebas — field ini ada supaya pemilik situs bisa menyentuh apa pun
 * yang tidak tercakup menu Tampilan.
 */
export function cleanCustomCss(v) {
  return String(v == null ? "" : v)
    .replace(/<\/?[a-zA-Z]/g, "")
    .slice(0, 20000)
    .trim();
}

/** Satu URL Google Fonts untuk huruf isi dan huruf judul sekaligus. */
export function themeFontHref(site) {
  const th = resolveTheme(site);
  const families = [FONTS[th.fontBody]];
  if (th.fontHead && th.fontHead !== th.fontBody) families.push(FONTS[th.fontHead]);
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

/** Mode tema bawaan untuk atribut `data-theme-mode` di `<html>`. */
export function themeMode(site) {
  return resolveTheme(site).mode;
}
