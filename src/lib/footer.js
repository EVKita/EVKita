/**
 * Definisi footer yang dipakai bersama.
 *
 * Sengaja JavaScript polos tanpa API khusus Node, supaya berkas yang sama bisa
 * dipakai tiga tempat: `store.ts` (batas jumlah saat normalisasi),
 * `SiteFooter.astro` (yang menggambar footernya), dan `admin.js` (penyusun menu
 * di panel, yang berjalan di peramban).
 *
 * Ikonnya ditulis sebagai isi <svg> tanpa tag pembungkusnya, sama seperti
 * `AdminSidebar.astro`: pembungkusnya ditentukan pemakainya, isinya satu sumber.
 */

/** Batas kewarasan, bukan desain: menu yang lebih panjang dari ini tidak terbaca. */
export const MAX_MENU_COLS = 4;
export const MAX_MENU_LINKS = 12;
export const MAX_LEGAL_LINKS = 8;

/**
 * Jejaring sosial yang punya field sendiri di panel.
 *
 * `key` adalah nama field di `site`; menambah satu jejaring berarti menambah
 * satu baris di sini, satu nilai bawaan di `SITE_DEFAULTS`, dan satu input di
 * panel. Nama jejaring adalah merek, jadi tidak diterjemahkan.
 */
export const SOCIAL_NETWORKS = [
  {
    key: "socialInstagram",
    label: "Instagram",
    icon: `<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>`,
  },
  {
    key: "socialYoutube",
    label: "YouTube",
    icon: `<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.4v5.2l4.4-2.6z" fill="currentColor" stroke="none"/>`,
  },
  {
    key: "socialTiktok",
    label: "TikTok",
    icon: `<path d="M14 3.5v10.9a3.6 3.6 0 1 1-3.6-3.6c.36 0 .7.05 1.02.15"/><path d="M14 3.5a5.2 5.2 0 0 0 5.2 5.2"/>`,
  },
  {
    key: "socialFacebook",
    label: "Facebook",
    icon: `<path d="M15.5 3.5h-2.2A3.3 3.3 0 0 0 10 6.8V10H7.8v3.2H10v7.3h3.2v-7.3h2.4l.6-3.2h-3V7.2c0-.5.4-.9.9-.9h2.1z" stroke-linejoin="round"/>`,
  },
  {
    key: "socialX",
    label: "X",
    icon: `<path d="m4.5 4.5 15 15M19.5 4.5l-15 15"/>`,
  },
  {
    key: "socialWhatsapp",
    label: "WhatsApp",
    icon: `<path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3.8 20.2l1.4-4.2A8.2 8.2 0 1 1 20.2 11.7Z"/><path d="M9.2 8.6c.3-.1.6 0 .8.3l.7 1.2c.1.3.1.6-.1.8l-.4.5c-.1.2-.2.4 0 .7.4.7 1 1.3 1.7 1.7.3.2.5.1.7-.1l.5-.4c.2-.2.5-.2.8-.1l1.2.7c.3.2.4.5.3.8-.2.7-.9 1.2-1.7 1.2-2.6-.2-4.6-2.2-4.8-4.8 0-.8.5-1.5 1.2-1.7Z" stroke-linejoin="round"/>`,
  },
  {
    key: "socialLinkedin",
    label: "LinkedIn",
    icon: `<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 10.5v6"/><circle cx="8" cy="7.6" r="1.1" fill="currentColor" stroke="none"/><path d="M12 16.5v-3.4a2.1 2.1 0 0 1 4.2 0v3.4M12 16.5v-6"/>`,
  },
  {
    key: "socialTelegram",
    label: "Telegram",
    icon: `<path d="M20.5 4.6 3.9 11.1c-.6.2-.6 1 0 1.2l4.2 1.4 1.6 4.5c.2.6 1 .7 1.3.2l2.2-2.9 4.1 3c.5.4 1.2.1 1.3-.5l2.6-12.6c.1-.6-.5-1-1-.8Z" stroke-linejoin="round"/><path d="m8.1 13.7 10-7.3-6.6 8.1"/>`,
  },
];

/**
 * Baris kontak yang punya field sendiri di panel.
 *
 * `href` menentukan bentuk tautannya: `mailto:`, `tel:`, `wa.me`, atau alamat
 * apa adanya. Yang `href`-nya null tampil sebagai teks biasa — alamat dan jam
 * buka bukan tautan.
 */
export const CONTACT_ROWS = [
  {
    key: "contactEmail",
    label: "Email",
    href: (v) => `mailto:${v}`,
    icon: `<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 7.3 5a1.2 1.2 0 0 0 1.4 0l7.3-5"/>`,
  },
  {
    key: "contactPhone",
    label: "Telepon",
    href: (v) => `tel:${String(v).replace(/[^\d+]/g, "")}`,
    icon: `<path d="M6.2 3.8h2.4l1.4 3.4-1.8 1.3a11 11 0 0 0 5.3 5.3l1.3-1.8 3.4 1.4v2.4a2 2 0 0 1-2.2 2A14.6 14.6 0 0 1 4.2 6a2 2 0 0 1 2-2.2Z" stroke-linejoin="round"/>`,
  },
  {
    key: "contactWhatsapp",
    label: "WhatsApp",
    href: (v) => `https://wa.me/${String(v).replace(/[^\d]/g, "")}`,
    icon: `<path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3.8 20.2l1.4-4.2A8.2 8.2 0 1 1 20.2 11.7Z"/><path d="M9.2 8.6c.3-.1.6 0 .8.3l.7 1.2c.1.3.1.6-.1.8l-.4.5c-.1.2-.2.4 0 .7.4.7 1 1.3 1.7 1.7.3.2.5.1.7-.1l.5-.4c.2-.2.5-.2.8-.1l1.2.7c.3.2.4.5.3.8-.2.7-.9 1.2-1.7 1.2-2.6-.2-4.6-2.2-4.8-4.8 0-.8.5-1.5 1.2-1.7Z" stroke-linejoin="round"/>`,
  },
  {
    key: "contactAddress",
    label: "Alamat",
    href: null,
    icon: `<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>`,
  },
  {
    key: "contactMapUrl",
    label: "Peta",
    href: (v) => v,
    // Alamat peta selalu panjang dan tidak terbaca; yang ditampilkan ajakannya.
    text: () => "Lihat lokasi di peta",
    icon: `<path d="m9 3.8-5 2.4v14l5-2.4 6 2.4 5-2.4v-14l-5 2.4-6-2.4Z" stroke-linejoin="round"/><path d="M9 3.8v14M15 6.2v14"/>`,
  },
  {
    key: "contactHours",
    label: "Jam operasional",
    href: null,
    icon: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3 1.8"/>`,
  },
  {
    key: "contactWebsite",
    label: "Situs web",
    href: (v) => v,
    icon: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z"/>`,
  },
];

/**
 * Kolom menu kosong yang dipakai tombol "tambah menu" di panel.
 * Bentuknya harus sama persis dengan yang dihasilkan `normalizeMenus()`.
 */
export function blankMenuColumn() {
  return { title: "", links: [{ label: "", url: "" }] };
}

function text(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Daftar tautan: label bebas + alamat bebas, dipotong pada `max`.
 *
 * Alamatnya sengaja disimpan apa adanya, sama seperti `website` dan `mapUrl` di
 * koleksi direktori; penyaring skema (`safeUrl`) dipasang di titik render, satu
 * tempat untuk semua sumber tautan.
 */
export function normalizeLinks(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((l) => ({ label: text(l && l.label), url: text(l && l.url) }))
    .filter((l) => l.label || l.url);
}

/** Kolom menu footer: judul kolom + daftar tautannya. */
export function normalizeMenus(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_MENU_COLS)
    .map((c) => ({ title: text(c && c.title), links: normalizeLinks(c && c.links, MAX_MENU_LINKS) }))
    .filter((c) => c.title || c.links.length);
}
