import crypto from "node:crypto";
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
import { normalizeArtikel, KATEGORI_ARTIKEL } from "./artikel.js";
import { modelBawaan, siapRiset, tanggalWib } from "./ai-jobs";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { mulaiJalan, selesaiJalan, sedangJalan } from "./kunci-jalan.js";

/**
 * Penulis artikel otomatis harian.
 *
 * Berita (`berita-harian.ts`) mengkurasi tautan milik penerbit lain; koleksi
 * `artikel` adalah tulisan orisinal situs ini — dan mesin ini menulis dan
 * MENERBITKAN satu tulisan setiap hari (`status: "published"`), langsung
 * tampil di `/artikel` tanpa menunggu ditekan Terbit.
 *
 * Tiga pagar yang membuatnya aman berjalan sendiri:
 *
 *   1. **Sekali sehari, satu tulisan.** Tanggal terakhir disimpan di
 *      `data/artikel-harian.json`. Kalau 7 draf otomatis masih menunggu
 *      telaah, mesin berhenti menambah — menumpuk tulisan tak terbaca hanya
 *      membakar kuota.
 *   2. **Sumber anti-khayal.** Model hanya boleh memakai alamat yang diberikan
 *      di bahan (berita terbaru, angka katalog); alamat lain dibuang sebelum
 *      disimpan. Angka spesifikasi tidak boleh dikarang — yang tidak ada di
 *      bahan tidak boleh muncul di naskah.
 *   3. **Pembersihan draf tua.** Draf otomatis yang 30 hari tidak disentuh
 *      dihapus (yang seminggu pertama tidak pernah). Apa pun yang sudah
 *      diterbitkan manusia tidak pernah disentuh — itu arsip, bukan antrean.
 *
 * Dipicu middleware sekali sehari lewat `jadwalkanArtikel()`, dan bisa
 * dipaksa dari panel (tombol tulis draf). Tanpa kunci AI selalu dilewati.
 */

const BERKAS = () => path.resolve(process.cwd(), "data/artikel-harian.json");

/** Batas keras satu penulisan, supaya antrean tidak membeku selamanya. */
const BATAS_MS_TULIS = 5 * 60 * 1000;
/** Batas satu putaran (tulis + rapikan + pangkas), lihat `kunci-jalan.js`. */
const BATAS_MS_PUTARAN = 20 * 60 * 1000;
/** Berhenti menambah draf baru kalau yang menunggu telaah sudah sebanyak ini. */
export const MAKS_DRAF_TUNGGU = 7;
/** Draf otomatis yang tak tersentuh lebih lama dari ini dibersihkan. */
export const UMUR_HAPUS_HARI = 30;
/** Draf semuda ini tidak pernah dibersihkan, apa pun yang terjadi. */
export const UMUR_AMAN_HARI = 7;
/** Putaran harian dimulai setelah jam ini (WIB), sesudah penarikan berita. */
export const JAM_MULAI = 5;

/** Topik panduan abadi yang diputar — selalu relevan, tidak lekang sehari. */
export const TOPIK_PANDUAN = [
  "tips merawat baterai kendaraan listrik",
  "panduan pertama mengisi daya di SPKLU",
  "cara menghitung biaya pengisian di rumah",
  "memilih motor listrik untuk harian",
  "memilih mobil listrik untuk keluarga",
  "kesalahan umum pemilik EV baru",
];

export interface TopikArtikel {
  strategi: "berita" | "banding" | "panduan";
  /** Kunci anti-ulang: kelompok berita, pasangan id, atau judul panduan. */
  kunci: string;
  judulKerja: string;
  bahan: string;
  /** Alamat yang BOLEH dikutip — di luar ini dibuang. */
  sumberBoleh: string[];
  /** URL video YouTube dari berita sumber, untuk disematkan di artikel. */
  videoEmbed?: string;
}

export interface StatusArtikelHarian {
  pengaturan: { aktif: boolean };
  jalan: boolean;
  tanggal: string;
  hasil: {
    ok: boolean;
    tanggal: string;
    strategi: string;
    judul: string;
    id: string;
    drafTunggu: number;
    dipangkas: number;
    biayaRupiah: number;
    errorKey: string;
  } | null;
  riwayat: { tanggal: string; strategi: string; kunci: string }[];
}

function hasilKosong(): NonNullable<StatusArtikelHarian["hasil"]> {
  return {
    ok: false,
    tanggal: "",
    strategi: "",
    judul: "",
    id: "",
    drafTunggu: 0,
    dipangkas: 0,
    biayaRupiah: 0,
    errorKey: "",
  };
}

export function normalkanPengaturanArtikel(s: any): { aktif: boolean } {
  if (!s || typeof s !== "object") return { aktif: true };
  if (typeof (s as any).aktif === "undefined") return { aktif: true };
  return { aktif: !!(s as any).aktif };
}

export function bacaArtikelHarian(): StatusArtikelHarian {
  const res = readJson<any>(BERKAS());
  const data = res.status === "ok" ? res.data : {};
  return {
    pengaturan: normalkanPengaturanArtikel(data?.pengaturan),
    // `jalan` di disk bisa sisa putaran yang mati saat aplikasi dimulai ulang.
    jalan: !!data?.jalan && sedangJalan("artikel-harian", BATAS_MS_PUTARAN),
    tanggal: String(data?.tanggal || ""),
    hasil: data?.hasil && typeof data.hasil === "object" ? { ...hasilKosong(), ...data.hasil } : null,
    riwayat: Array.isArray(data?.riwayat) ? data.riwayat.filter((r: any) => r && r.kunci).slice(-90) : [],
  };
}

function tulisArtikelHarian(status: StatusArtikelHarian): void {
  try {
    writeJsonAtomic(BERKAS(), status);
  } catch {
    /* Status bersifat best-effort. */
  }
}

export function simpanPengaturanArtikel(parsial: any): StatusArtikelHarian {
  const status = bacaArtikelHarian();
  status.pengaturan = normalkanPengaturanArtikel({ ...status.pengaturan, ...(parsial || {}) });
  tulisArtikelHarian(status);
  return status;
}

/** Umur dalam hari dari stempel ISO ke sekarang; tak terbaca berarti tua. */
export function umurHari(iso: string, sekarang = Date.now()): number {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (sekarang - t) / (24 * 3600 * 1000);
}

/** Draf otomatis yang masih menunggu telaah manusia. */
export function drafTunggu(daftar: any[]): any[] {
  return (Array.isArray(daftar) ? daftar : []).filter((a) => a && a.auto === true && a.status === "draft");
}

/**
 * Memilih topik hari ini.
 *
 * Urutannya: rangkum berita terbaru yang se-tema → sandingkan dua kendaraan
 * sekelas → putar panduan abadi. Topik yang kuncinya dipakai 60 hari terakhir
 * dilewati supaya tidak menulis yang sama dua kali.
 */
export function pilihTopik(content: any, riwayat: { kunci: string }[], hari: string): TopikArtikel | null {
  const dipakai = new Set((riwayat || []).map((r) => String(r && r.kunci)));
  const bebas = (kunci: string) => !dipakai.has(kunci);

  const berita = (((content && content.berita) || []) as any[])
    .filter((b) => b && b.title && b.url && umurHari(b.date || b.updatedAt) <= 10)
    .slice(0, 30);

  const kataKunci = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-zà-ÿ0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !["listrik", "motor", "mobil", "indonesia", "hybrid", "yang", "untuk", "dengan", "dari"].includes(w));

  const kelompok = new Map<string, any[]>();
  for (const b of berita) {
    for (const k of kataKunci(`${b.title} ${b.excerpt || ""}`)) {
      if (!kelompok.has(k)) kelompok.set(k, []);
      kelompok.get(k)!.push(b);
    }
  }
  const seTema = [...kelompok.entries()]
    .filter(([, items]) => {
      const unik = new Set(items.map((b) => String(b.url)));
      return unik.size >= 2;
    })
    .sort((a, b) => b[1].length - a[1].length);
  for (const [kunci, items] of seTema) {
    const unik = [...new Map(items.map((b: any) => [String(b.url), b])).values()].slice(0, 4);
    const kunciTopik = `berita:${kunci}`;
    if (!bebas(kunciTopik)) continue;
    const bahan = unik.map((b: any) => `- ${b.title} (${b.source || "media"}): ${b.url}`).join("\n");
    /* Ambil video YouTube pertama dari berita sumber kalau ada — disematkan di artikel. */
    const videoEmbed = unik.map((b: any) => String(b.video || "")).find((v) => /youtube|youtu\.be/i.test(v)) || "";
    return {
      strategi: "berita",
      kunci: kunciTopik,
      judulKerja: `Rangkuman: ${unik[0].title}`,
      bahan: `Berita terbaru seputar "${kunci}":\n${bahan}`,
      sumberBoleh: unik.map((b: any) => String(b.url)),
      videoEmbed: videoEmbed || undefined,
    };
  }

  const semua = [...((content && content.cars) || []), ...((content && content.motors) || [])].filter(
    (v: any) => v && v.id && v.brand && v.name
  );
  const perBodi = new Map<string, any[]>();
  for (const v of semua) {
    const bodi = String(v.bodyType || "Lainnya");
    if (!perBodi.has(bodi)) perBodi.set(bodi, []);
    perBodi.get(bodi)!.push(v);
  }
  const indeksHari = [...hari].reduce((n, c) => n + c.charCodeAt(0), 0);
  const bodiUrut = [...perBodi.entries()].filter(([, items]) => items.length >= 2).sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 0; i < bodiUrut.length; i++) {
    const [bodi, items] = bodiUrut[(indeksHari + i) % bodiUrut.length];
    const dua = [...items].sort((a, b) => (b.rangeKm || 0) - (a.rangeKm || 0)).slice(0, 2);
    const kunciTopik = `banding:${dua.map((v: any) => v.id).sort().join("+")}`;
    if (!bebas(kunciTopik)) continue;
    const sebut = (v: any) =>
      `- ${v.brand} ${v.name}: harga ${v.priceText || (v.price != null ? `Rp ${v.price}` : "-")}, jarak ${v.rangeKm != null ? `${v.rangeKm} km` : "-"}, baterai ${v.batteryKwh != null ? `${v.batteryKwh} kWh` : "-"}, tenaga ${v.powerHp != null ? `${v.powerHp} hp` : "-"}`;
    return {
      strategi: "banding",
      kunci: kunciTopik,
      judulKerja: `${dua[0].brand} ${dua[0].name} vs ${dua[1].brand} ${dua[1].name}`,
      bahan: `Dua ${bodi} listrik dari katalog:\n${dua.map(sebut).join("\n")}\nTulis panduan memilih di antara keduanya memakai ANGKA DI ATAS SAJA.`,
      sumberBoleh: [],
    };
  }

  for (let i = 0; i < TOPIK_PANDUAN.length; i++) {
    const panduan = TOPIK_PANDUAN[(indeksHari + i) % TOPIK_PANDUAN.length];
    const kunciTopik = `panduan:${panduan}`;
    if (!bebas(kunciTopik)) continue;
    return {
      strategi: "panduan",
      kunci: kunciTopik,
      judulKerja: panduan,
      bahan: `Topik panduan abadi: "${panduan}". Tulis dari pengetahuan umum yang mapan (tanpa angka spesifik model); kalau menyebut angka katalog, hanya yang umum dan beri rentang.`,
      sumberBoleh: [],
    };
  }
  return null;
}

/**
 * Sampul otomatis untuk draf harian.
 *
 * Kartu artikel tanpa gambar tampil sebagai kotak teks polos — di /artikel
 * maupun sorotan beranda — sehingga draf otomatis yang lahir tanpa sampul
 * hampir tidak pernah ditekan Terbitnya. Fungsinya memilih gambar milik
 * sendiri yang paling nyambung dengan topik, tanpa jaringan dan tanpa
 * menebak: perbandingan memakai foto salah satu kendaraannya, rangkuman
 * berita memakai foto berita asalnya (atau foto katalog kalau berita itu
 * tidak bergambar, mis. Kompas.com), panduan memakai foto katalog yang
 * diputar per hari. Kosong kalau katalog memang belum punya satu pun foto.
 * Murni: tidak membaca berkas, tidak memanggil model.
 */
export function sampulArtikel(content: any, topik: TopikArtikel, hari: string): string {
  const gambarKendaraan = (id: string): string => {
    const semua = [...((content && content.cars) || []), ...((content && content.motors) || [])];
    const temu = semua.find((v: any) => v && String(v.id) === String(id));
    const g = String((temu && temu.image) || "").trim();
    return /^https?:\/\//i.test(g) || g.startsWith("/") ? g : "";
  };
  if (topik.strategi === "banding") {
    const ids = String(topik.kunci || "")
      .replace(/^banding:/, "")
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of ids) {
      const g = gambarKendaraan(id);
      if (g) return g;
    }
    return "";
  }
  if (topik.strategi === "berita") {
    const berita = ((content && content.berita) || []) as any[];
    for (const u of topik.sumberBoleh || []) {
      const temu = berita.find((b: any) => b && String(b.url) === String(u));
      const g = String((temu && temu.image) || "").trim();
      if (g) return g;
    }
    /* Berita tanpa foto (mis. Kompas.com via Google News yang feed-nya tidak
       membawa gambar) jatuh ke foto katalog di bawah — bukan ke sampul
       kosong — supaya artikel yang terbit otomatis selalu bersampul. */
  }
  const semuaGambar = [...((content && content.cars) || []), ...((content && content.motors) || [])]
    .map((v: any) => String((v && v.image) || "").trim())
    .filter((g) => g && (/^https?:\/\//i.test(g) || g.startsWith("/")));
  if (!semuaGambar.length) return "";
  const indeks = [...String(hari || "")].reduce((n, c) => n + c.charCodeAt(0), 0);
  return semuaGambar[indeks % semuaGambar.length];
}

const SKEMA_DRAF = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 140 },
    excerpt: { type: "string", maxLength: 200 },
    body: { type: "string", maxLength: 20000 },
    category: { type: "string", enum: [...KATEGORI_ARTIKEL] },
    tags: { type: "array", maxItems: 6, items: { type: "string", maxLength: 40 } },
    sources: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: { label: { type: "string", maxLength: 120 }, url: { type: "string", maxLength: 500 } },
        required: ["label", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "excerpt", "body", "category", "tags", "sources"],
  additionalProperties: false,
};

function instruksiTulis(topik: TopikArtikel): string {
  return [
    "Kamu penulis panduan kendaraan listrik berbahasa Indonesia untuk pembaca awam yang cerdas.",
    "Tulis naskah Markdown: diawali ## ringkasan 2 kalimat, lalu 3-5 subjudul ##, tanpa judul H1 (judul ada di field sendiri).",
    "Minimal 350 kata. Bahasa Indonesia yang wajar, tanpa basa-basi promosi, tanpa emoji.",
    `Kategori persis salah satu dari: ${KATEGORI_ARTIKEL.join(", ")}.`,
    "ATURAN KERAS: setiap angka spesifikasi/harga HANYA dari bahan. Yang tidak ada di bahan TIDAK BOLEH muncul sebagai angka — tulis dengan kata umum.",
    "ATURAN KERAS: field sources HANYA berisi alamat dari daftar yang diberikan di bawah (atau kosong). Menulis alamat lain berarti gagal.",
    `Topik: ${topik.judulKerja}.`,
  ].join("\n");
}

/** Hasil tulisan yang lolos pagar, atau alasan penolakannya. */
export function bersihkanDraf(hasil: any, topik: TopikArtikel): { draf: any | null; alasan: string } {
  const title = String(hasil?.title || "").trim();
  const body = String(hasil?.body || "").trim();
  if (!title || body.length < 1200) return { draf: null, alasan: "terlaluPendek" };
  const boleh = new Set(topik.sumberBoleh.map((u) => String(u).trim().toLowerCase()));
  const sources = (Array.isArray(hasil?.sources) ? hasil.sources : [])
    .map((s: any) => ({ label: String(s?.label || "").trim().slice(0, 120), url: String(s?.url || "").trim() }))
    .filter((s: any) => s.label && s.url && boleh.has(s.url.toLowerCase()))
    .slice(0, 6);
  if (!sources.length && topik.sumberBoleh.length > 0) return { draf: null, alasan: "tanpaSumber" };
  return {
    draf: {
      title: title.slice(0, 140),
      excerpt: String(hasil?.excerpt || "").trim().slice(0, 200) || body.replace(/[#*>]/g, "").split(/\s+/).slice(0, 30).join(" "),
      body: body.slice(0, 20000),
      category: KATEGORI_ARTIKEL.includes(hasil?.category) ? hasil.category : "Panduan",
      tags: [...new Set((Array.isArray(hasil?.tags) ? hasil.tags : []).map((t: any) => String(t || "").trim()).filter(Boolean))].slice(0, 6),
      sources,
    },
    alasan: "",
  };
}

async function tulisSatu(
  apiKey: string,
  topik: TopikArtikel
): Promise<{ draf: any | null; biayaRupiah: number; errorKey: string }> {
  const model = modelBawaan();
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), BATAS_MS_TULIS);
  let biaya = 0;
  try {
    const bahanSumber =
      topik.sumberBoleh.length > 0
        ? `\nDaftar alamat yang boleh dikutip (JANGAN tulis yang lain):\n${topik.sumberBoleh.map((u) => `- ${u}`).join("\n")}`
        : "";
    const res = await jalankanRiset({
      apiKey,
      model,
      effort: "low",
      maxOutputTokens: 16_000,
      instructions: instruksiTulis(topik),
      input: `${topik.bahan}${bahanSumber}\n\nJawab hanya dengan JSON sesuai skema.`,
      schema: SKEMA_DRAF,
      // Tanpa ini batas BATAS_MS_TULIS tidak pernah berlaku pada panggilan
      // utama, dan riset yang menggantung menahan putaran selamanya.
      signal: ac.signal,
    });
    if (res.usage) biaya += biayaDariUsage(res.usage, model, new Date()).rupiah;

    const rapi = res.ok
      ? { ok: true as const, hasil: res.hasil, usage: undefined as any }
      : res.mentah && res.errorKey && BISA_DIRAPIKAN.has(res.errorKey)
        ? await rapikanJadiJson({ apiKey, schema: SKEMA_DRAF, mentah: res.mentah, signal: ac.signal })
        : { ok: false as const, hasil: undefined, usage: undefined as any, errorKey: res.errorKey };
    if (rapi.usage) biaya += biayaDariUsage(rapi.usage, model, new Date()).rupiah;
    if (!rapi.ok) return { draf: null, biayaRupiah: biaya, errorKey: (rapi as any).errorKey || "err.ai.jawabanTidakTerbaca" };
    const { draf, alasan } = bersihkanDraf((rapi as any).hasil, topik);
    if (!draf) return { draf: null, biayaRupiah: biaya, errorKey: alasan === "tanpaSumber" ? "err.ai.tanpaSumber" : "err.ai.jawabanTidakTerbaca" };
    /* Sisipkan embed video YouTube kalau topik membawanya — diletakkan tepat
       sebelum ## sumber supaya muncul di akhir isi artikel. Format tautan
       teks aman untuk Markdown dan tidak membutuhkan iframe di sini. */
    if (topik.videoEmbed) {
      const youtubeId = topik.videoEmbed.match(/(?:embed\/|youtu\.be\/|v=|v\/)([\w-]{11})/)?.[1];
      if (youtubeId) {
        draf.body = `${draf.body}\n\n> 🎬 **Video:** [Tonton di YouTube](https://www.youtube.com/watch?v=${youtubeId})`;
      }
    }
    return { draf, biayaRupiah: biaya, errorKey: "" };
  } catch {
    return { draf: null, biayaRupiah: biaya, errorKey: galatTidakTerhubung() };
  } finally {
    clearTimeout(batas);
  }
}

/**
 * Membersihkan draf otomatis yang tua.
 *
 * Hanya yang masih draf DAN bertanda `auto` DAN 30 hari tak tersentuh. Yang
 * seminggu pertama tidak pernah; yang sudah diterbitkan manusia tidak pernah.
 * @returns jumlah yang dihapus
 */
export function pangkasDrafLama(daftar: any[], sekarang = Date.now()): { daftar: any[]; dipangkas: number } {
  const simpan: any[] = [];
  let dipangkas = 0;
  for (const a of Array.isArray(daftar) ? daftar : []) {
    const tua = umurHari(a && (a.updatedAt || a.createdAt), sekarang);
    if (a && a.auto === true && a.status === "draft" && tua > UMUR_HAPUS_HARI && tua > UMUR_AMAN_HARI) {
      dipangkas++;
      continue;
    }
    simpan.push(a);
  }
  return { daftar: simpan, dipangkas };
}

/**
 * Menjalankan satu putaran: tulis dan TERBITKAN satu artikel (kalau antrean
 * draf belum penuh), lalu pangkas draf tua. Sengaja langsung terbit —
 * pemilik meminta artikel baru tampil di `/artikel` setiap hari tanpa
 * menekan Terbit. Yang gagal lolos pagar di bawah tidak disimpan sama sekali.
 */
export async function jalankanArtikel({ paksa = false }: { paksa?: boolean } = {}): Promise<any> {
  const status = bacaArtikelHarian();

  if (status.jalan) return { dilewati: true, alasan: "sedangJalan" };
  if (!paksa && !status.pengaturan.aktif) return { dilewati: true, alasan: "nonaktif" };
  if (!paksa) {
    const hari = tanggalWib();
    if (status.tanggal === hari && status.hasil && status.hasil.ok) return { dilewati: true, alasan: "sudahHariIni" };
  }

  if (!siapRiset()) return { dilewati: true, alasan: "tanpaKunci" };
  const apiKey = kunciMesin(mesinAktif());

  status.jalan = true;
  mulaiJalan("artikel-harian");
  tulisArtikelHarian(status);

  const hasil = { ...hasilKosong(), tanggal: tanggalWib() };
  try {
    const segar = readContent();
    const tunggu = drafTunggu(segar.artikel).length;
    hasil.drafTunggu = tunggu;

    if (tunggu < MAKS_DRAF_TUNGGU) {
      const topik = pilihTopik(segar, status.riwayat, hasil.tanggal);
      if (!topik) {
        hasil.errorKey = "topikHabis";
      } else {
        const tulis = await tulisSatu(apiKey, topik);
        hasil.biayaRupiah = tulis.biayaRupiah;
        if (tulis.draf && !tulis.errorKey) {
          const kini = new Date().toISOString();
          const id = `auto-${hasil.tanggal}-${crypto.randomBytes(3).toString("hex")}`;
          const artikel = normalizeArtikel({
            ...tulis.draf,
            id,
            slug: "",
            author: "EVKita",
            date: hasil.tanggal,
            status: "published",
            publishAt: "",
            aiAssisted: true,
            auto: true,
            /* Sampul relevan otomatis supaya kartu artikel langsung terlihat
               menarik di /artikel dan beranda. Gambar milik sendiri, tanpa
               mengunduh apa pun. */
            image: sampulArtikel(segar, topik, hasil.tanggal),
            updatedAt: kini,
            updatedBy: "auto",
          });
          const termuat = readContent();
          termuat.artikel = [artikel, ...(termuat.artikel || [])];
          writeContent(termuat);
          hasil.ok = true;
          hasil.strategi = topik.strategi;
          hasil.judul = artikel.title;
          hasil.id = artikel.id;
          status.riwayat = [...status.riwayat, { tanggal: hasil.tanggal, strategi: topik.strategi, kunci: topik.kunci }].slice(-90);
        } else {
          hasil.errorKey = tulis.errorKey;
        }
      }
    } else {
      hasil.ok = true;
      hasil.errorKey = "penuh";
    }

    /* Pembersihan jalan setiap putaran — murah, tanpa AI. */
    const akhir = readContent();
    const pangkas = pangkasDrafLama(akhir.artikel);
    if (pangkas.dipangkas > 0) {
      akhir.artikel = pangkas.daftar;
      writeContent(akhir);
    }
    hasil.dipangkas = pangkas.dipangkas;
    hasil.drafTunggu = drafTunggu(readContent().artikel).length;

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
    selesaiJalan("artikel-harian");
    tulisArtikelHarian(status);
  }
}

let sudahHari = "";

/**
 * Dipanggil middleware di setiap permintaan. Tidak ditunggu dan tidak pernah
 * melempar — sama seperti `jadwalkanBerita()`.
 */
export function jadwalkanArtikel(): void {
  try {
    if (sudahHari === tanggalWib()) return;
    const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
    // Sesudah penarikan berita (04.00) supaya bahan rangkuman hari ini sudah ada.
    if (jam < JAM_MULAI) return;
    sudahHari = tanggalWib();
    void jalankanArtikel().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
