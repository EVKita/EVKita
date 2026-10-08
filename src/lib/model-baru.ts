import path from "node:path";
import {
  mesinAktif,
  kunciMesin,
  jalankanRiset,
  rapikanJadiJson,
  biayaDariUsage,
  galatBermasalah,
  galatTidakTerhubung,
  BISA_DIRAPIKAN,
} from "./ai-mesin";
import { buildSchema, buildInstructions } from "./ai-prompt.js";
import { bersihkanUsulan } from "./ai-usulan.js";
import { isFilled } from "./vehicle-spec.js";
import { cocokModel, jenisSinyal } from "./pemantau";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { modelBawaan, siapRiset, tanggalWib } from "./ai-jobs";
import { bacaPembaruan } from "./pembaruan-kendaraan";
import { logContentChanges } from "./activity";
import { mulaiJalan, selesaiJalan, sedangJalan } from "./kunci-jalan.js";

/**
 * Penemuan model baru otomatis.
 *
 * Pemantau (`pemantau.ts`) hanya menandai kendaraan yang SUDAH ada di katalog;
 * modul ini mengurus sisanya: kabar peluncuran yang tidak cocok dengan satu
 * pun kendaraan yang dikenal. Karena pemilik meminta model yang benar-benar
 * baru langsung masuk katalog tanpa klik panel, jalurnya menambah entri
 * TERBIT — dan karena itu pagarnya yang paling ketat di antara semua mesin
 * otomatis:
 *
 *   1. **Dua sumber independen.** Kandidat lolos kalau disebut ≥2 host berbeda
 *      dalam 7 hari terakhir. Satu blog mengigau tidak bisa mengisi katalog.
 *   2. **Bukan kembaran.** Nama dinormalkan dan diadu ke seluruh katalog
 *      (mobil DAN motor); yang mirip dengan yang sudah ada dibuang.
 *   3. **Jangkar resmi.** Riset spesifikasi memakai pipa yang sama dengan
 *      auto-update katalog, dan entri hanya dibuat kalau minimal satu fakta
 *      keras (harga/jarak/baterai) berkeyakinan "tinggi" (= dari situs resmi).
 *      Tanpa jangkar, kandidat dicoba lagi lain hari — tidak ditebak.
 *   4. **Maksimal MAKS_BARU_SEHARI per hari**, berbagi saklar "Auto-update
 *      Katalog" (ikut `bacaPembaruan().pengaturan.aktif`) — spending-nya satu
 *      keluarga dengan riset harian, bukan saklar kedua yang terlupa.
 *   5. **Jejak transparan.** Entri bertanda `aiAssisted` + `updatedBy: "auto"`,
 *      dan penambahannya tercatat di log aktivitas seperti tulisan tangan.
 *
 * Dipicu middleware sekali sehari lewat `jadwalkanModelBaru()` (jam 07.00
 * WIB, sesudah penyegar artikel), dan tidak pernah melempar.
 */

const BERKAS = () => path.resolve(process.cwd(), "data/model-baru.json");

/** Batas keras satu riset model, supaya antrean tidak membeku selamanya. */
const BATAS_MS_MODEL = 3 * 60 * 1000;
/** Batas satu putaran (ekstraksi + riset tiap kandidat), lihat `kunci-jalan.js`. */
const BATAS_MS_PUTARAN = 30 * 60 * 1000;
/** Model baru terbanyak yang ditambahkan per hari. */
export const MAKS_BARU_SEHARI = 2;
/** Putaran harian dimulai setelah jam ini (WIB). */
export const JAM_MULAI = 7;
/** Kabar peluncuran lebih tua dari ini dianggap basi. */
export const UMUR_KABAR_HARI = 7;
/** Fakta keras yang bisa menjadi jangkar entri baru. */
const JANGKAR = ["price", "rangeKm", "batteryKwh"];

/** Normalisasi nama untuk perbandingan: kecil, alfanumerik saja. */
export function bakuNama(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function hostDari(url: string): string {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function umurHariIso(iso: string, sekarang: number = Date.now()): number {
  const t = Date.parse(String(iso || "").trim());
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((sekarang - t) / (24 * 3600 * 1000));
}

export interface KabarModel {
  title: string;
  url: string;
}

/**
 * Kabar peluncuran yang tidak menyebut satu pun kendaraan katalog — bahan
 * mentah ekstraksi. Murni, tanpa sentuhan disk.
 */
export function kandidatPeluncuran(
  berita: any[],
  armada: { brand: string; name: string }[],
  sekarang: number = Date.now()
): KabarModel[] {
  const keluar: KabarModel[] = [];
  for (const b of berita || []) {
    const judul = String(b?.title || "").trim();
    const url = String(b?.url || "").trim();
    if (!judul || !url) continue;
    if (umurHariIso(String(b?.date || b?.updatedAt || ""), sekarang) > UMUR_KABAR_HARI) continue;
    if (jenisSinyal(`${judul} ${String(b?.excerpt || "")}`) !== "model") continue;
    const dikenal = (armada || []).some((v) => v && cocokModel(judul, String(v.brand), String(v.name)));
    if (dikenal) continue;
    keluar.push({ title: judul, url });
  }
  return keluar.slice(0, 25);
}

export interface KandidatModel {
  brand: string;
  model: string;
  kind: "mobil" | "motor";
  urls: string[];
}

const SKEMA_EKSTRAK = {
  type: "object",
  properties: {
    kandidat: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          brand: { type: "string", maxLength: 60 },
          model: { type: "string", maxLength: 80 },
          kind: { type: "string", enum: ["mobil", "motor"] },
          urls: { type: "array", maxItems: 6, items: { type: "string", maxLength: 500 } },
        },
        required: ["brand", "model", "kind", "urls"],
        additionalProperties: false,
      },
    },
  },
  required: ["kandidat"],
  additionalProperties: false,
};

/** Kunci anti-ulang: merek + model yang dinormalkan. */
export function kunciKandidat(brand: string, model: string): string {
  return `${bakuNama(brand)}|${bakuNama(model)}`;
}

/** Apakah merek+model ini sudah ada di katalog (mobil DAN motor diperiksa)? */
export function sudahAda(armada: { brand: string; name: string }[], brand: string, model: string): boolean {
  const b = bakuNama(brand);
  const m = bakuNama(model);
  if (!b || !m) return true;
  return (armada || []).some((v) => {
    if (!v) return false;
    const vb = bakuNama(v.brand);
    const vm = bakuNama(v.name);
    if (!vb || !vm) return false;
    if (vb === b && vm === m) return true;
    // "Seal" vs "BYD Seal": nama yang satu terkandung di yang lain dengan merek sama.
    if (vb === b && (vm.includes(m) || m.includes(vm))) return true;
    return false;
  });
}

/**
 * Saringan kandidat hasil ekstraksi AI. Murni — yang diuji di
 * `tests/model-baru.test.ts`.
 */
export function saringKandidat(
  ekstraksi: any,
  armada: { brand: string; name: string }[],
  riwayatKunci: string[]
): KandidatModel[] {
  const pernah = new Set((riwayatKunci || []).map((k) => String(k)));
  const keluar: KandidatModel[] = [];
  const lihat = new Set<string>();
  for (const k of (ekstraksi && ekstraksi.kandidat) || []) {
    const brand = String(k?.brand || "").trim().slice(0, 60);
    const model = String(k?.model || "").trim().slice(0, 80);
    const kind = k?.kind === "motor" ? "motor" : k?.kind === "mobil" ? "mobil" : "";
    if (!brand || !model || !kind) continue;
    const kunci = kunciKandidat(brand, model);
    if (lihat.has(kunci) || pernah.has(kunci)) continue;
    const urls = [...new Set((Array.isArray(k?.urls) ? k.urls : []).map((u: any) => String(u || "").trim()).filter(Boolean))];
    const host = new Set(urls.map(hostDari).filter(Boolean));
    // Dua host berbeda — satu berita yang dikutip ulang tidak cukup.
    if (host.size < 2) continue;
    if (sudahAda(armada, brand, model)) continue;
    lihat.add(kunci);
    keluar.push({ brand, model, kind: kind as "mobil" | "motor", urls });
  }
  return keluar;
}

export interface StatusModelBaru {
  jalan: boolean;
  tanggal: string;
  hasil: {
    ok: boolean;
    tanggal: string;
    ditambah: string[];
    ditolak: number;
    biayaRupiah: number;
    errorKey: string;
  } | null;
  /** Kunci kandidat yang sudah masuk katalog — jangan ditambahkan dua kali. */
  riwayat: string[];
}

function hasilKosong(): NonNullable<StatusModelBaru["hasil"]> {
  return { ok: false, tanggal: "", ditambah: [], ditolak: 0, biayaRupiah: 0, errorKey: "" };
}

export function bacaModelBaru(): StatusModelBaru {
  const res = readJson<any>(BERKAS());
  const data = res.status === "ok" ? res.data : {};
  return {
    // `jalan` di disk bisa sisa putaran yang mati saat aplikasi dimulai ulang.
    jalan: !!data?.jalan && sedangJalan("model-baru", BATAS_MS_PUTARAN),
    tanggal: String(data?.tanggal || ""),
    hasil: data?.hasil && typeof data.hasil === "object" ? { ...hasilKosong(), ...data.hasil } : null,
    riwayat: Array.isArray(data?.riwayat) ? data.riwayat.map((k: any) => String(k)).filter(Boolean) : [],
  };
}

function tulisModelBaru(status: StatusModelBaru): void {
  try {
    writeJsonAtomic(BERKAS(), status);
  } catch {
    /* status best-effort */
  }
}

function idUnik(brand: string, model: string, terpakai: Set<string>): string {
  const dasar =
    `${bakuNama(brand)}-${bakuNama(model)}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "model-baru";
  let id = dasar;
  for (let n = 2; terpakai.has(id); n++) id = `${dasar}-${n}`;
  terpakai.add(id);
  return id;
}

async function ekstrakKandidat(apiKey: string, kabar: KabarModel[]): Promise<{ ekstraksi: any; biayaRupiah: number; errorKey: string }> {
  const model = modelBawaan();
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), BATAS_MS_MODEL);
  let biaya = 0;
  try {
    const res = await jalankanRiset({
      apiKey,
      model,
      effort: "low",
      maxOutputTokens: 4000,
      instructions: [
        "Kamu mengekstrak model kendaraan listrik yang BARU diluncurkan dari daftar judul berita berbahasa Indonesia.",
        "Keluarkan HANYA model yang beritanya bertanda peluncuran (meluncur, diluncurkan, resmi hadir, diperkenalkan, all new, harga resmi, pre-booking).",
        "kind: 'mobil' untuk mobil, 'motor' untuk motor/sepeda motor/skuter. Ragu-ragu berarti jangan keluarkan.",
        "urls: alamat berita yang menyebut model itu (dari daftar yang diberikan, JANGAN tulis yang lain).",
        "Jawab hanya dengan JSON sesuai skema.",
      ].join("\n"),
      input: `DAFTAR BERITA:\n${kabar.map((k) => `- ${k.title}: ${k.url}`).join("\n")}\n\nJawab hanya dengan JSON sesuai skema.`,
      schema: SKEMA_EKSTRAK,
      signal: ac.signal,
    });
    if (res.usage) biaya += biayaDariUsage(res.usage, model, new Date()).rupiah;
    if (res.ok) return { ekstraksi: res.hasil, biayaRupiah: biaya, errorKey: "" };
    if (res.mentah && res.errorKey && BISA_DIRAPIKAN.has(res.errorKey)) {
      const rapi = await rapikanJadiJson({ apiKey, schema: SKEMA_EKSTRAK, mentah: res.mentah, signal: ac.signal });
      if (rapi.usage) biaya += biayaDariUsage(rapi.usage, model, new Date()).rupiah;
      if (rapi.ok) return { ekstraksi: rapi.hasil, biayaRupiah: biaya, errorKey: "" };
      return { ekstraksi: null, biayaRupiah: biaya, errorKey: rapi.errorKey || "err.ai.jawabanTidakTerbaca" };
    }
    return { ekstraksi: null, biayaRupiah: biaya, errorKey: res.errorKey || galatBermasalah() };
  } catch {
    return { ekstraksi: null, biayaRupiah: biaya, errorKey: galatTidakTerhubung() };
  } finally {
    clearTimeout(batas);
  }
}

async function risetModelBaru(
  apiKey: string,
  kandidat: KandidatModel
): Promise<{ nilai: Record<string, any>; biayaRupiah: number; errorKey: string }> {
  const model = modelBawaan();
  const schema = buildSchema(kandidat.kind, null);
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), BATAS_MS_MODEL);
  let biaya = 0;
  try {
    const res = await jalankanRiset({
      apiKey,
      model,
      effort: "high",
      maxOutputTokens: 64_000,
      instructions: buildInstructions({
        kind: kandidat.kind,
        brand: kandidat.brand,
        name: kandidat.model,
        today: tanggalWib(),
        hint: "Model yang baru diluncurkan dan belum ada di katalog — prioritaskan harga dan spesifikasi versi Indonesia dari pemberitaan peluncuran dan situs resmi.",
      }),
      input: `Riset ${kandidat.brand} ${kandidat.model} untuk pasar Indonesia. Jawab hanya dengan JSON sesuai skema.`,
      schema,
      signal: ac.signal,
    });
    if (res.usage) biaya += biayaDariUsage(res.usage, model, new Date()).rupiah;
    const bersih = res.ok
      ? bersihkanUsulan(res.hasil, { kind: kandidat.kind }).usulan
      : res.mentah && res.errorKey && BISA_DIRAPIKAN.has(res.errorKey)
        ? await (async () => {
            const rapi = await rapikanJadiJson({ apiKey, schema, mentah: res.mentah, signal: ac.signal });
            if (rapi.usage) biaya += biayaDariUsage(rapi.usage, model, new Date()).rupiah;
            if (!rapi.ok) return null;
            return bersihkanUsulan(rapi.hasil, { kind: kandidat.kind }).usulan;
          })()
        : null;
    if (!bersih) return { nilai: {}, biayaRupiah: biaya, errorKey: res.errorKey || "err.ai.jawabanTidakTerbaca" };
    // Jangkar: minimal satu fakta keras dari sumber resmi, kalau tidak entri
    // tidak dibuat — dicoba lagi lain hari, bukan ditebak.
    const jangkar = bersih.some((u: any) => u && JANGKAR.includes(u.key) && isFilled(u.nilai) && u.keyakinan === "tinggi");
    if (!jangkar) return { nilai: {}, biayaRupiah: biaya, errorKey: "jangkarKurang" };
    const nilai: Record<string, any> = {};
    for (const u of bersih) {
      if (!u || !u.key || !isFilled(u.nilai)) continue;
      // Nilai resmi dulu; sisanya menyusul lewat putaran auto-update biasa.
      if (u.keyakinan !== "tinggi") continue;
      nilai[u.key] = u.nilai;
    }
    return { nilai, biayaRupiah: biaya, errorKey: "" };
  } catch {
    return { nilai: {}, biayaRupiah: biaya, errorKey: galatTidakTerhubung() };
  } finally {
    clearTimeout(batas);
  }
}

/**
 * Satu putaran: ekstrak kandidat dari kabar peluncuran, riset yang lolos
 * saringan (maksimal MAKS_BARU_SEHARI), tambahkan yang berjangkar sebagai
 * entri TERBIT. Berbagi saklar aktif dengan auto-update katalog.
 */
export async function jalankanModelBaru({ paksa = false }: { paksa?: boolean } = {}): Promise<any> {
  const status = bacaModelBaru();

  if (status.jalan) return { dilewati: true, alasan: "sedangJalan" };
  if (!paksa && !bacaPembaruan().pengaturan.aktif) return { dilewati: true, alasan: "nonaktif" };
  if (!paksa) {
    const hari = tanggalWib();
    if (status.tanggal === hari && status.hasil && status.hasil.ok) return { dilewati: true, alasan: "sudahHariIni" };
  }

  if (!siapRiset()) return { dilewati: true, alasan: "tanpaKunci" };
  const apiKey = kunciMesin(mesinAktif());

  status.jalan = true;
  mulaiJalan("model-baru");
  tulisModelBaru(status);

  const hasil = { ...hasilKosong(), tanggal: tanggalWib() };
  try {
    const segar = readContent();
    const armada = [...(segar.cars || []), ...(segar.motors || [])].map((v: any) => ({
      brand: String(v?.brand || ""),
      name: String(v?.name || ""),
    }));
    const kabar = kandidatPeluncuran(segar.berita, armada);
    if (kabar.length) {
      const ekstraksi = await ekstrakKandidat(apiKey, kabar);
      hasil.biayaRupiah += ekstraksi.biayaRupiah;
      if (!ekstraksi.ekstraksi) {
        if (!hasil.errorKey) hasil.errorKey = ekstraksi.errorKey;
      } else {
        const saring = saringKandidat(ekstraksi.ekstraksi, armada, status.riwayat).slice(0, MAKS_BARU_SEHARI);
        for (const kandidat of saring) {
          const riset = await risetModelBaru(apiKey, kandidat);
          hasil.biayaRupiah += riset.biayaRupiah;
          const kunci = kunciKandidat(kandidat.brand, kandidat.model);
          if (riset.errorKey || !Object.keys(riset.nilai).length) {
            hasil.ditolak += 1;
            if (!hasil.errorKey) hasil.errorKey = riset.errorKey;
            continue;
          }
          const termuat = readContent();
          const col = kandidat.kind === "motor" ? "motors" : "cars";
          const terpakai = new Set<string>();
          for (const c of ["cars", "motors"]) for (const v of (termuat[c] || []) as any[]) if (v?.id) terpakai.add(String(v.id));
          const kini = new Date().toISOString();
          const entri = {
            id: idUnik(kandidat.brand, kandidat.model, terpakai),
            brand: kandidat.brand,
            name: kandidat.model,
            ...riset.nilai,
            year: Number(tanggalWib().slice(0, 4)),
            status: "published",
            aiAssisted: true,
            updatedAt: kini,
            updatedBy: "auto",
          };
          (termuat[col] as any[]).push(entri);
          writeContent(termuat);
          logContentChanges(null, [{ col, id: String(entri.id), title: `${entri.brand} ${entri.name}`, jenis: "tambah", fields: [] }]);
          hasil.ditambah = [...hasil.ditambah, `${entri.brand} ${entri.name}`];
          status.riwayat = [...status.riwayat, kunci].slice(-200);
        }
      }
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
    selesaiJalan("model-baru");
    tulisModelBaru(status);
  }
}

let sudahHari = "";

/**
 * Dipanggil middleware di setiap permintaan. Tidak ditunggu dan tidak pernah
 * melempar — sama seperti `jadwalkanSegar()`.
 */
export function jadwalkanModelBaru(): void {
  try {
    if (sudahHari === tanggalWib()) return;
    const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
    // Sesudah penyegar artikel (06.00) supaya belanja AI harian berurutan.
    if (jam < JAM_MULAI) return;
    sudahHari = tanggalWib();
    void jalankanModelBaru().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
