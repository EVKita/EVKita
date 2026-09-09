/**
 * Aturan kecil untuk wizard kendaraan AI.
 *
 * Berkas ini sengaja JavaScript polos: identitas draf dipakai panel peramban,
 * sementara uji otomatis perlu membuktikan normalisasi dan pencarian kembarnya
 * tanpa membangun DOM admin yang sangat besar.
 */

export const AI_WIZARD_STORAGE_KEY = "evkita.aiWizard";

function teks(value, max = 120) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Bentuk aman yang boleh disimpan di localStorage. Tidak ada hasil AI di sini. */
export function normalisasiDrafWizard(raw) {
  const col = raw?.col === "motors" ? "motors" : "cars";
  const tahunMentah = Number(raw?.year);
  const year = Number.isInteger(tahunMentah) && tahunMentah >= 2008 && tahunMentah <= 2035
    ? tahunMentah
    : null;

  return {
    col,
    brand: teks(raw?.brand, 80),
    name: teks(raw?.name, 120),
    year,
    hint: teks(raw?.hint, 300),
    jobId: teks(raw?.jobId, 100),
  };
}

/** Keterangan tahun dan varian disatukan agar prompt tidak punya dua sumber. */
export function hintRisetWizard(raw) {
  const draf = normalisasiDrafWizard(raw);
  return [draf.year ? `tahun model ${draf.year}` : "", draf.hint].filter(Boolean).join(", ");
}

function kunciNama(brand, name) {
  return `${teks(brand, 80)} ${teks(name, 120)}`.toLocaleLowerCase("id");
}

/** Entri dengan merek + nama yang sama, untuk peringatan sebelum riset berbayar. */
export function kendaraanSama(list, brand, name) {
  const dicari = kunciNama(brand, name);
  if (!dicari.trim()) return null;
  return (Array.isArray(list) ? list : []).find((item) =>
    kunciNama(item?.brand, item?.name) === dicari
  ) || null;
}
