import path from "node:path";
import {
  mesinAktif,
  kunciMesin,
  jalankanRiset,
  rapikanJadiJson,
  biayaDariUsage,
  galatTidakTerhubung,
  BISA_DIRAPIKAN,
} from "./ai-mesin";
import { normalizeArtikel, artikelTayang } from "./artikel.js";
import { modelBawaan, siapRiset, tanggalWib } from "./ai-jobs";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { mulaiJalan, selesaiJalan, sedangJalan } from "./kunci-jalan.js";
import { safeUrl } from "./url.js";

/**
 * Penyegar artikel tayang harian.
 *
 * Draf otomatis (`artikel-harian.ts`) menulis tulisan BARU yang menunggu
 * telaah manusia; modul ini mengurus tulisan LAMA yang sudah tayang — dibaca
 * ulang sekali sehari, fakta usangnya (harga, spesifikasi, ketersediaan)
 * diperbarui dari katalog dan berita terbaru memakai AI. Yang TIDAK pernah
 * diubah: judul, slug, kategori, tag, gambar, tanggal terbit, dan draf
 * (draf milik alur telaah, bukan milik penyegar).
 *
 * Empat pagar yang membuatnya aman berjalan sendiri:
 *
 *   1. **Sekali sehari, paling banyak BATAS_SEHARI artikel.** Status terakhir
 *      disimpan di `data/artikel-segar.json`; artikel yang sudah disegarkan
 *      hari ini dilewati, sisanya antre round-robin dari yang paling lama
 *      tak tersentuh — seluruh koleksi berputar pelan-pelan.
 *   2. **Sumber anti-khayal.** Model hanya boleh memakai angka dari bahan
 *      (katalog + berita terbaru); sumber yang dikutip harus dari daftar
 *      yang diberikan atau dari daftar lama artikel itu sendiri — alamat
 *      lain dibuang sebelum disimpan, dan sumber lama manusia tidak pernah
 *      dihapus.
 *   3. **Hanya yang berubah yang dicap.** `updatedAt`/`updatedBy` dipasang
 *      kalau isinya benar-benar berbeda — stempel "Diperbarui" di halaman
 *      publik berarti isinya sungguh berganti, bukan karena jadwal lewat.
 *   4. **Tanpa kunci AI selalu dilewati.** Seperti `jadwalkanArtikel()`,
 *      putaran ini tidak pernah melempar dan tidak pernah menahan permintaan
 *      pembaca.
 *
 * Dipicu middleware sekali sehari lewat `jadwalkanSegar()`, dan bisa dipaksa
 * dari panel (tombol segarkan sekarang).
 *
 * Cache terjemahan EN/ZH SENGAJA tidak dihangatkan di sini (beda dengan
 * `pembaruan-kendaraan.ts`): isi artikel panjang, menghangatkan berarti
 * membayar terjemahan ganda setiap hari. `terjemahContent()` menerjemahkan
 * saat diminta pembaca pertama dan meng-cache-nya — putaran berikutnya gratis.
 */

const BERKAS = () => path.resolve(process.cwd(), "data/artikel-segar.json");

/** Batas keras satu penulisan artikel, supaya antrean tidak membeku selamanya. */
const BATAS_MS_SEGAR = 5 * 60 * 1000;
/** Artikel terbanyak yang disegarkan per hari — pembatas biaya AI. */
export const BATAS_SEHARI = 10;
/** Batas satu putaran penuh, lihat `kunci-jalan.js`. */
const BATAS_MS_PUTARAN = BATAS_SEHARI * BATAS_MS_SEGAR + 15 * 60 * 1000;
/** Putaran harian dimulai setelah jam ini (WIB), sesudah draf otomatis (05.00). */
export const JAM_MULAI = 6;
/** Isi minimum yang diterima dari AI — di bawah ini dianggap terpotong. */
const MIN_ISI = 500;

export interface RiwayatSegar {
  id: string;
  tanggal: string;
  hasil: "diperbarui" | "tetap" | "gagal";
}

export interface StatusSegar {
  pengaturan: { aktif: boolean };
  jalan: boolean;
  tanggal: string;
  hasil: {
    ok: boolean;
    tanggal: string;
    diperbarui: string[];
    tetap: number;
    gagal: number;
    biayaRupiah: number;
    errorKey: string;
  } | null;
  riwayat: RiwayatSegar[];
}

function hasilKosong(): NonNullable<StatusSegar["hasil"]> {
  return {
    ok: false,
    tanggal: "",
    diperbarui: [],
    tetap: 0,
    gagal: 0,
    biayaRupiah: 0,
    errorKey: "",
  };
}

/** Bawaan MENYALA: fitur ini diminta menyala, dan tanpa kunci AI ia diam sendiri. */
export function normalkanPengaturanSegar(s: any): { aktif: boolean } {
  if (!s || typeof s !== "object") return { aktif: true };
  if (typeof (s as any).aktif === "undefined") return { aktif: true };
  return { aktif: !!(s as any).aktif };
}

export function bacaSegar(): StatusSegar {
  const res = readJson<any>(BERKAS());
  const data = res.status === "ok" ? res.data : {};
  return {
    pengaturan: normalkanPengaturanSegar(data?.pengaturan),
    // `jalan` di disk bisa sisa putaran yang mati saat aplikasi dimulai ulang.
    jalan: !!data?.jalan && sedangJalan("artikel-segar", BATAS_MS_PUTARAN),
    tanggal: String(data?.tanggal || ""),
    hasil: data?.hasil && typeof data.hasil === "object" ? { ...hasilKosong(), ...data.hasil } : null,
    riwayat: Array.isArray(data?.riwayat)
      ? data.riwayat
          .filter((r: any) => r && r.id && r.tanggal)
          .map((r: any) => ({ id: String(r.id), tanggal: String(r.tanggal), hasil: r.hasil === "diperbarui" ? "diperbarui" : r.hasil === "tetap" ? "tetap" : "gagal" as const }))
      : [],
  };
}

function tulisSegar(status: StatusSegar): void {
  try {
    writeJsonAtomic(BERKAS(), status);
  } catch {
    /* status yang gagal ditulis bukan alasan menjatuhkan putaran */
  }
}

export function simpanPengaturanSegar(parsial: any): StatusSegar {
  const status = bacaSegar();
  // Saklar panel selalu menyebut `aktif` apa adanya; bawaan menyala hanya
  // berlaku saat berkas pengaturan belum pernah ada.
  if (parsial && typeof parsial.aktif !== "undefined") status.pengaturan = { aktif: !!parsial.aktif };
  tulisSegar(status);
  return status;
}

/** Umur tulisan: perubahan terakhir yang tercatat, atau tanggal terbitnya. */
function umurTulisan(a: any): string {
  return String((a && (a.updatedAt || a.date || a.publishAt)) || "");
}

/**
 * Memilih artikel yang disegarkan putaran ini: yang tayang saja (draf milik
 * alur telaah), belum disegarkan hari ini, dari yang paling lama tak
 * tersentuh — seluruh koleksi berputar, bukan yang itu-itu saja.
 */
export function pilihSegar(
  daftar: any[],
  riwayat: RiwayatSegar[],
  hari: string,
  batas: number = BATAS_SEHARI,
  sekarang: number = Date.now()
): any[] {
  const sudah = new Set((riwayat || []).filter((r) => r && r.tanggal === hari).map((r) => String(r.id)));
  const terakhir = new Map<string, string>();
  for (const r of riwayat || []) {
    if (!r || !r.id) continue;
    const lama = terakhir.get(String(r.id)) || "";
    if (String(r.tanggal) > lama) terakhir.set(String(r.id), String(r.tanggal));
  }
  return artikelTayang(daftar, sekarang)
    .filter((a: any) => a && a.id && !sudah.has(String(a.id)))
    .sort((a: any, b: any) => {
      const ra = terakhir.get(String(a.id)) || "";
      const rb = terakhir.get(String(b.id)) || "";
      if (!ra && rb) return -1;
      if (ra && !rb) return 1;
      if (ra !== rb) return ra.localeCompare(rb);
      return umurTulisan(a).localeCompare(umurTulisan(b));
    })
    .slice(0, Math.max(0, batas));
}

/**
 * Bahan segar untuk satu artikel: kendaraan yang disebut di isi (maksimal 12,
 * kalau tidak ada yang disebut pakai 8 jarak terjauh) plus 6 berita terbaru.
 * Alamat berita ikut menjadi sumber yang boleh dikutip.
 */
export function bahanSegar(content: any, artikel: any): { bahan: string; sumberBoleh: string[] } {
  const isi = `${artikel?.title || ""}\n${artikel?.body || ""}`.toLowerCase();
  const semua = [...((content && content.cars) || []), ...((content && content.motors) || [])].filter(
    (v: any) => v && v.id && v.brand && v.name
  );
  const sebut = (v: any) =>
    `- ${v.brand} ${v.name}: harga ${v.priceText || (v.price != null ? `Rp ${v.price}` : "-")}, jarak ${v.rangeKm != null ? `${v.rangeKm} km` : "-"}, baterai ${v.batteryKwh != null ? `${v.batteryKwh} kWh` : "-"}, tenaga ${v.powerHp != null ? `${v.powerHp} hp` : "-"}`;
  let pilih = semua.filter((v: any) => isi.includes(`${String(v.brand).toLowerCase()} ${String(v.name).toLowerCase()}`)).slice(0, 12);
  if (!pilih.length) pilih = [...semua].sort((a: any, b: any) => (b.rangeKm || 0) - (a.rangeKm || 0)).slice(0, 8);
  const berita = (((content && content.berita) || []) as any[]).filter((b) => b && b.title && b.url).slice(0, 6);
  const baris = [...pilih.map(sebut)];
  if (berita.length) {
    baris.push("Berita terbaru:");
    for (const b of berita) baris.push(`- ${b.title} (${b.source || "media"}): ${b.url}`);
  }
  return {
    bahan: baris.join("\n"),
    sumberBoleh: berita.map((b: any) => String(b.url)),
  };
}

const SKEMA_SEGAR = {
  type: "object",
  properties: {
    body: { type: "string", maxLength: 20000 },
    excerpt: { type: "string", maxLength: 200 },
    ringkasan: { type: "string", maxLength: 300 },
    sources: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: { label: { type: "string", maxLength: 120 }, url: { type: "string", maxLength: 500 } },
        required: ["label", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["body", "excerpt", "ringkasan", "sources"],
  additionalProperties: false,
};

function instruksiSegar(artikel: any): string {
  return [
    "Kamu penyunting panduan kendaraan listrik berbahasa Indonesia. Tugasmu MENYEGARKAN naskah yang diberikan, bukan menulis baru.",
    "Pertahankan struktur, subjudul, panjang, dan gaya tulisan aslinya. Judul tidak berubah (tidak ada di sini).",
    "Perbarui HANYA fakta yang usang (harga, spesifikasi, ketersediaan, status model) memakai ANGKA DARI BAHAN. Yang tidak ada di bahan TIDAK BOLEH muncul sebagai angka baru.",
    "Kalau tidak ada yang usang, kembalikan isi apa adanya dan tulis ringkasan berisi kata 'tetap'.",
    "ATURAN KERAS: field sources HANYA berisi alamat dari daftar yang diberikan di bawah, atau dari daftar lama artikel (diberikan juga). Menulis alamat lain berarti gagal.",
    "Jawab hanya dengan JSON sesuai skema: body (naskah Markdown penuh), excerpt (2 kalimat), ringkasan (satu kalimat perubahan), sources.",
  ].join("\n");
}

export interface HasilBersih {
  berubah: boolean;
  tetap: boolean;
  body: string;
  excerpt: string;
  sources: { label: string; url: string }[];
  ringkasan: string;
  alasan: string;
}

/**
 * Pagar hasil penyegaran. Sumber lama manusia tidak pernah dibuang — yang baru
 * hanya boleh menampung yang lolos daftar putih. Skrip dan pola berbahaya
 * dibuang; penyaring skema (`safeUrl`) tetap dipasang saat render.
 */
export function bersihkanSegar(hasil: any, artikel: any, sumberBoleh: string[]): HasilBersih {
  const kosong: HasilBersih = { berubah: false, tetap: false, body: "", excerpt: "", sources: [], ringkasan: "", alasan: "" };
  let body = String(hasil?.body || "").replace(/<script[\s\S]*?<\/script\s*>/gi, "").trim();
  const lama = String(artikel?.body || "").trim();
  if (!body || body.length < MIN_ISI) return { ...kosong, alasan: "terlaluPendek" };
  const batasSusut = Math.max(MIN_ISI, Math.floor(lama.length * 0.5));
  if (lama.length >= MIN_ISI && body.length < batasSusut) return { ...kosong, alasan: "terpotong" };
  if (body === lama) return { ...kosong, tetap: true, body: lama, ringkasan: String(hasil?.ringkasan || "tetap").slice(0, 300) };

  const boleh = new Set((sumberBoleh || []).map((u) => String(u).trim().toLowerCase()));
  const lamaSah = new Map<string, string>();
  for (const s of Array.isArray(artikel?.sources) ? artikel.sources : []) {
    const url = String(s?.url || "").trim();
    const label = String(s?.label || "").trim().slice(0, 120);
    if (label && url && safeUrl(url)) lamaSah.set(url.toLowerCase(), label);
  }
  const baru = (Array.isArray(hasil?.sources) ? hasil.sources : [])
    .map((s: any) => ({ label: String(s?.label || "").trim().slice(0, 120), url: String(s?.url || "").trim() }))
    .filter((s: any) => s.label && s.url && safeUrl(s.url) && (boleh.has(s.url.toLowerCase()) || lamaSah.has(s.url.toLowerCase())));
  const gabung = [...baru];
  for (const [rendah, label] of lamaSah) {
    if (gabung.length >= 8) break;
    if (gabung.some((g) => g.url.toLowerCase() === rendah)) continue;
    const asli = (Array.isArray(artikel?.sources) ? artikel.sources : []).find((s: any) => String(s?.url || "").trim().toLowerCase() === rendah);
    gabung.push({ label, url: String(asli?.url || "").trim() });
  }
  const excerpt = String(hasil?.excerpt || "").trim().slice(0, 200) || String(artikel?.excerpt || "").trim().slice(0, 200);
  return {
    berubah: true,
    tetap: false,
    body: body.slice(0, 20000),
    excerpt,
    sources: gabung.slice(0, 8),
    ringkasan: String(hasil?.ringkasan || "").trim().slice(0, 300),
    alasan: "",
  };
}

async function segarkanSatu(
  apiKey: string,
  artikel: any,
  bahan: string,
  sumberBoleh: string[]
): Promise<{ bersih: HasilBersih | null; biayaRupiah: number; errorKey: string }> {
  const model = modelBawaan();
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), BATAS_MS_SEGAR);
  let biaya = 0;
  try {
    const lamaSumber = (Array.isArray(artikel?.sources) ? artikel.sources : [])
      .map((s: any) => String(s?.url || "").trim())
      .filter(Boolean);
    const daftarBoleh = [...new Set([...sumberBoleh, ...lamaSumber])];
    const res = await jalankanRiset({
      apiKey,
      model,
      effort: "low",
      maxOutputTokens: 16_000,
      instructions: instruksiSegar(artikel),
      input: `NASKAH LAMA:\n${String(artikel?.body || "").slice(0, 18000)}\n\nBAHAN SEGAR (angka hanya dari sini):\n${bahan}\n\nDaftar alamat yang boleh dikutip (JANGAN tulis yang lain):\n${daftarBoleh.map((u) => `- ${u}`).join("\n")}\n\nJawab hanya dengan JSON sesuai skema.`,
      schema: SKEMA_SEGAR,
      // Tanpa ini batas BATAS_MS_SEGAR tidak berlaku pada panggilan utama.
      signal: ac.signal,
    });
    if (res.usage) biaya += biayaDariUsage(res.usage, model, new Date()).rupiah;

    const rapi = res.ok
      ? { ok: true as const, hasil: res.hasil, usage: undefined as any }
      : res.mentah && res.errorKey && BISA_DIRAPIKAN.has(res.errorKey)
        ? await rapikanJadiJson({ apiKey, schema: SKEMA_SEGAR, mentah: res.mentah, signal: ac.signal })
        : { ok: false as const, hasil: undefined, usage: undefined as any, errorKey: res.errorKey };
    if (rapi.usage) biaya += biayaDariUsage(rapi.usage, model, new Date()).rupiah;
    if (!rapi.ok) return { bersih: null, biayaRupiah: biaya, errorKey: (rapi as any).errorKey || "err.ai.jawabanTidakTerbaca" };
    const bersih = bersihkanSegar((rapi as any).hasil, artikel, daftarBoleh);
    if (!bersih.berubah && !bersih.tetap) return { bersih: null, biayaRupiah: biaya, errorKey: bersih.alasan === "terpotong" ? "err.ai.jawabanTerpotong" : "err.ai.jawabanTidakTerbaca" };
    return { bersih, biayaRupiah: biaya, errorKey: "" };
  } catch {
    return { bersih: null, biayaRupiah: biaya, errorKey: galatTidakTerhubung() };
  } finally {
    clearTimeout(batas);
  }
}

/**
 * Menjalankan satu putaran: segarkan sampai BATAS_SEHARI artikel tayang.
 * Hanya yang berubah yang disimpan dan dicap — sisanya dicatat "tetap".
 */
export async function jalankanSegar({ paksa = false }: { paksa?: boolean } = {}): Promise<any> {
  const status = bacaSegar();

  if (status.jalan) return { dilewati: true, alasan: "sedangJalan" };
  if (!paksa && !status.pengaturan.aktif) return { dilewati: true, alasan: "nonaktif" };
  if (!paksa) {
    const hari = tanggalWib();
    if (status.tanggal === hari && status.hasil && status.hasil.ok) return { dilewati: true, alasan: "sudahHariIni" };
  }

  if (!siapRiset()) return { dilewati: true, alasan: "tanpaKunci" };
  const apiKey = kunciMesin(mesinAktif());

  status.jalan = true;
  mulaiJalan("artikel-segar");
  tulisSegar(status);

  const hasil = { ...hasilKosong(), tanggal: tanggalWib() };
  try {
    const segar = readContent();
    const antre = pilihSegar(segar.artikel, status.riwayat, hasil.tanggal);
    for (const target of antre) {
      const { bahan, sumberBoleh } = bahanSegar(segar, target);
      const segarkan = await segarkanSatu(apiKey, target, bahan, sumberBoleh);
      hasil.biayaRupiah += segarkan.biayaRupiah;
      const kunciRiwayat: RiwayatSegar = { id: String(target.id), tanggal: hasil.tanggal, hasil: "gagal" };
      if (!segarkan.bersih || segarkan.errorKey) {
        if (!hasil.errorKey) hasil.errorKey = segarkan.errorKey;
        hasil.gagal += 1;
        status.riwayat = [...status.riwayat, kunciRiwayat].slice(-120);
        continue;
      }
      if (segarkan.bersih.tetap) {
        hasil.tetap += 1;
        status.riwayat = [...status.riwayat, { ...kunciRiwayat, hasil: "tetap" }].slice(-120);
        continue;
      }
      const kini = new Date().toISOString();
      const termuat = readContent();
      const temu = (termuat.artikel || []).find((a: any) => a && String(a.id) === String(target.id));
      if (!temu) {
        hasil.gagal += 1;
        status.riwayat = [...status.riwayat, kunciRiwayat].slice(-120);
        continue;
      }
      const simpan = normalizeArtikel({
        ...temu,
        body: segarkan.bersih.body,
        excerpt: segarkan.bersih.excerpt,
        sources: segarkan.bersih.sources,
        aiAssisted: true,
        updatedAt: kini,
        updatedBy: "auto",
      });
      termuat.artikel = (termuat.artikel || []).map((a: any) =>
        a && String(a.id) === String(target.id) ? simpan : a
      );
      writeContent(termuat);
      hasil.ok = true;
      hasil.diperbarui = [...hasil.diperbarui, String(target.title || target.id)].slice(0, BATAS_SEHARI);
      status.riwayat = [...status.riwayat, { ...kunciRiwayat, hasil: "diperbarui" }].slice(-120);
    }
    if (!hasil.errorKey) hasil.ok = true;
    status.tanggal = hasil.tanggal;
    status.hasil = hasil;
    return { dilewati: false, ...hasil };
  } catch (e: any) {
    hasil.errorKey = String((e && e.message) || e);
    status.tanggal = hasil.tanggal;
    status.hasil = hasil;
    return { dilewati: false, ...hasil };
  } finally {
    status.jalan = false;
    selesaiJalan("artikel-segar");
    tulisSegar(status);
  }
}

let sudahHari = "";

/**
 * Dipanggil middleware di setiap permintaan. Tidak ditunggu dan tidak pernah
 * melempar — sama seperti `jadwalkanArtikel()`.
 */
export function jadwalkanSegar(): void {
  try {
    if (sudahHari === tanggalWib()) return;
    const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
    // Sesudah draf otomatis (05.00) supaya tidak berebut kuota AI dengannya.
    if (jam < JAM_MULAI) return;
    sudahHari = tanggalWib();
    void jalankanSegar().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
