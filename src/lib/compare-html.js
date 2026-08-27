import { esc, safeUrl, priceLabel, vehicleHref } from "./card-html.js";
import { defaultColor, carSVG } from "./cars-ui.js";

/**
 * Tabel perbandingan spesifikasi — satu sumber untuk server dan browser.
 *
 * Markup ini dulu hanya ada di `app.js`, artinya hanya hidup di dalam modal
 * beranda: tidak punya URL, tidak bisa dibagikan, dan tidak terlihat perayap.
 * Padahal "BYD Seal vs Ioniq 5" persis yang orang ketik di mesin pencari.
 *
 * Sekarang halaman `/bandingkan/<a>-vs-<b>` merender tabel yang sama di server
 * dari fungsi ini, dan modal beranda tetap memakainya di browser. Sama seperti
 * `card-html.js`: dua sisi, satu markup, jadi keduanya tidak bisa berselisih.
 *
 * Sengaja JavaScript polos tanpa API khusus Node, dan teksnya Bahasa Indonesia
 * — situs publik ini memang tidak diterjemahkan.
 */

/** Batas kendaraan yang bisa disandingkan sekaligus. */
export const MAX_COMPARE = 3;

/**
 * Baris tabel. `num` + `best` menandai kolom yang menang; barisnya dilewati
 * kalau tak satu pun kendaraan punya nilainya, supaya tabel tidak berlubang.
 */
export const COMPARE_ROWS = [
  { key: "price", label: "Harga", text: (c) => priceLabel(c), num: (c) => c.price, best: "min" },
  { key: "rangeKm", label: "Jarak tempuh", text: (c) => (c.rangeKm != null ? c.rangeKm + " km" : ""), num: (c) => c.rangeKm, best: "max" },
  { key: "rangeStandard", label: "Standar uji", text: (c) => c.rangeStandard || "" },
  { key: "batteryKwh", label: "Baterai", text: (c) => (c.batteryKwh != null ? c.batteryKwh + " kWh" : ""), num: (c) => c.batteryKwh, best: "max" },
  { key: "powerHp", label: "Tenaga", text: (c) => (c.powerHp != null ? c.powerHp + " hp" : ""), num: (c) => c.powerHp, best: "max" },
  { key: "torqueNm", label: "Torsi", text: (c) => (c.torqueNm != null ? c.torqueNm + " Nm" : ""), num: (c) => c.torqueNm, best: "max" },
  { key: "accelSec", label: "0–100 km/j", text: (c) => (c.accelSec != null ? c.accelSec + " dtk" : ""), num: (c) => c.accelSec, best: "min" },
  { key: "topSpeedKph", label: "Kecepatan puncak", text: (c) => (c.topSpeedKph != null ? c.topSpeedKph + " km/j" : ""), num: (c) => c.topSpeedKph, best: "max" },
  { key: "chargeDcKw", label: "Isi cepat DC", text: (c) => (c.chargeDcKw != null ? c.chargeDcKw + " kW" : ""), num: (c) => c.chargeDcKw, best: "max" },
  { key: "chargeAcKw", label: "Isi AC", text: (c) => (c.chargeAcKw != null ? c.chargeAcKw + " kW" : ""), num: (c) => c.chargeAcKw, best: "max" },
  { key: "chargeTime", label: "Waktu isi", text: (c) => c.chargeTime || "" },
  { key: "driveType", label: "Penggerak", text: (c) => c.driveType || "" },
  { key: "seats", label: "Kursi", text: (c) => (c.seats != null ? c.seats + " kursi" : "") },
  { key: "year", label: "Tahun", text: (c) => (c.year != null ? String(c.year) : "") },
  { key: "warranty", label: "Garansi", text: (c) => c.warranty || "" },
  { key: "variantNames", label: "Varian", text: (c) => (c.variantNames || []).join(", ") },
];

/**
 * Indeks kolom pemenang untuk satu baris, atau -1 kalau tidak ada.
 *
 * Sengaja hanya menandai kalau pemenangnya tunggal: dua kendaraan dengan
 * jarak tempuh sama persis tidak boleh keduanya berlabel "terbaik", karena
 * yang dibaca orang dari tanda itu adalah "yang ini menang".
 */
export function bestIndex(row, items) {
  if (!row.num || !row.best) return -1;
  const nums = items.map((c) => row.num(c));
  const valid = nums.filter((n) => n !== null && n !== undefined);
  if (valid.length < 2) return -1;
  const target = row.best === "min" ? Math.min(...valid) : Math.max(...valid);
  if (valid.filter((n) => n === target).length !== 1) return -1;
  return nums.indexOf(target);
}

/**
 * Baris yang layak dijadikan kesimpulan singkat, berurutan menurut yang paling
 * sering menentukan pilihan orang. Sengaja bukan seluruh COMPARE_ROWS: "menang
 * di jumlah kursi" bukan kesimpulan, itu cuma selisih angka.
 *
 * `phrase` adalah predikat yang dipasang di belakang nama kendaraan, bukan
 * label tabelnya: "unggul di harga" tidak memberi tahu siapa pun apakah yang
 * dimaksud lebih mahal atau lebih murah.
 */
const VERDICT_KEYS = [
  { key: "rangeKm", phrase: "jarak tempuhnya lebih jauh" },
  { key: "price", phrase: "harganya lebih murah" },
  { key: "batteryKwh", phrase: "baterainya lebih besar" },
  { key: "powerHp", phrase: "tenaganya lebih besar" },
  { key: "accelSec", phrase: "akselerasinya lebih cepat" },
  { key: "chargeDcKw", phrase: "pengisian DC-nya lebih cepat" },
];

/**
 * Siapa unggul di mana. Baris tanpa pemenang tunggal — nilainya seri, atau ada
 * kendaraan yang datanya belum lengkap — sengaja tidak muncul sama sekali,
 * karena "unggul" atas data yang bolong bukan kesimpulan, melainkan tebakan.
 *
 * @param {any[]} items
 * @returns {{ key: string, label: string, winner: any, value: string }[]}
 */
export function compareVerdicts(items) {
  return VERDICT_KEYS.map(({ key, phrase }) => {
    const row = COMPARE_ROWS.find((r) => r.key === key);
    if (!row) return null;
    const i = bestIndex(row, items);
    if (i < 0) return null;
    return { key, label: row.label, phrase, winner: items[i], value: row.text(items[i]) };
  }).filter(Boolean);
}

/** "A", "A dan B", "A, B, dan C" — koma seri seperti lazimnya Bahasa Indonesia. */
export function joinPhrase(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} dan ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, dan ${parts[parts.length - 1]}`;
}

/**
 * Kesimpulan sebagai satu kalimat.
 *
 * Dikelompokkan per kendaraan, bukan per baris. Merangkainya baris demi baris
 * menghasilkan "Ioniq 5 unggul di jarak tempuh, Ioniq 5 unggul di baterai" —
 * benar, tapi ditulis oleh mesin. Dikelompokkan, kalimatnya justru menjawab
 * pertanyaan yang sebenarnya: apa yang didapat dari masing-masing pilihan.
 *
 * @param {ReturnType<typeof compareVerdicts>} verdicts
 * @param {number} [perWinner] keunggulan terbanyak yang disebut per kendaraan
 * @returns {string} tanpa titik di akhir; pemanggil yang menutup kalimatnya
 */
export function verdictSentence(verdicts, perWinner = 2) {
  const order = [];
  const byWinner = new Map();
  for (const v of verdicts) {
    if (!byWinner.has(v.winner.id)) {
      byWinner.set(v.winner.id, []);
      order.push(v.winner);
    }
    byWinner.get(v.winner.id).push(v);
  }

  return order
    .map((winner) => {
      const parts = byWinner
        .get(winner.id)
        .slice(0, perWinner)
        .map((v) => `${v.phrase}${v.value ? ` (${v.value})` : ""}`);
      return `${winner.brand} ${winner.name} ${joinPhrase(parts)}`;
    })
    .join("; ");
}

/** Gambar kendaraan, atau ilustrasi SVG kalau belum ada fotonya. */
function headVisual(c) {
  return c.image
    ? `<img src="${safeUrl(c.image)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="compare-svg">${carSVG(c, defaultColor(c))}</div>`;
}

/**
 * @param {any[]} items kendaraan yang dibandingkan, urutannya jadi urutan kolom
 * @param {{ linkHead?: boolean }} [opts] `linkHead` menautkan judul kolom ke
 *   halaman detail — dipakai halaman perbandingan, tidak di modal beranda yang
 *   memang tidak dimaksudkan untuk membawa orang pergi.
 */
export function compareTableHTML(items, opts) {
  const linkHead = !!(opts && opts.linkHead);

  const head = items
    .map((c) => {
      const inner = `<div class="compare-head-media">${headVisual(c)}</div>
          <span class="compare-head-brand">${esc(c.brand)}</span>
          <span class="compare-head-name">${esc(c.name)}</span>`;
      const card = linkHead
        ? `<a class="compare-head-card" href="${safeUrl(vehicleHref(c))}">${inner}</a>`
        : `<div class="compare-head-card">${inner}</div>`;
      return `<th scope="col">${card}</th>`;
    })
    .join("");

  const rows = COMPARE_ROWS.map((row) => {
    const texts = items.map((c) => row.text(c));
    if (!texts.some((t) => t)) return "";
    const winner = bestIndex(row, items);
    const cells = texts
      .map((t, i) => `<td class="${i === winner ? "is-best" : ""}">${t ? esc(t) : "—"}</td>`)
      .join("");
    return `<tr><th scope="row">${esc(row.label)}</th>${cells}</tr>`;
  }).join("");

  return `<div class="compare-scroll"><table class="compare-table">
    <thead><tr><th scope="col"><span class="sr-only">Spesifikasi</span></th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/**
 * Slug perbandingan: `byd-seal-vs-hyundai-ioniq-5`.
 *
 * Urutannya dibakukan menurut abjad supaya satu pasang kendaraan hanya punya
 * SATU alamat. Tanpa itu, "a-vs-b" dan "b-vs-a" adalah dua halaman dengan isi
 * identik yang saling mengencerkan peringkatnya sendiri.
 */
export function compareSlug(ids) {
  return [...ids].sort().join("-vs-");
}

/** Kebalikannya; id yang dihasilkan belum tentu ada, pemanggil yang mencocokkan. */
export function parseCompareSlug(slug) {
  return String(slug || "")
    .split("-vs-")
    .map((s) => s.trim())
    .filter(Boolean);
}
