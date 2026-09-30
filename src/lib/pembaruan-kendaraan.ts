import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getEnv } from "./env";
import {
  mesinAktif,
  kunciMesin,
  jalankanRiset,
  rapikanJadiJson,
  biayaDariUsage,
  BISA_DIRAPIKAN,
} from "./ai-mesin";
import { buildSchema, buildInstructions } from "./ai-prompt.js";
import { bersihkanUsulan } from "./ai-usulan.js";
import { readContent, writeContent } from "./store";
import { readJson, writeJsonAtomic } from "./jsonfile";
import { biayaDari } from "./ai-biaya.js";
import { modelBawaan, siapRiset, tanggalWib } from "./ai-jobs";
import { logActivity } from "./activity";
import { IMAGE_EXT } from "./imagefile";
import {
  normalkanPengaturan,
  pilihKendaraan,
  patchOtomatis,
} from "./pembaruan.js";

/**
 * Mesin pembaruan data kendaraan otomatis.
 *
 * Fitur "auto update": server meriset kendaraan lewat DeepSeek (sumber web
 * resmi) sekali sehari dan menerapkan hasilnya langsung, TANPA persetujuan
 * manusia. Ini sengaja BERBEDA dari riset manual di editor — yang tetap
 * "AI mengusulkan, manusia menyetujui" — dan karena itu jalurnya terpisah
 * serta pagarnya lebih ketat (lihat `src/lib/pembaruan.js`).
 *
 * Dua jaring pengaman yang membuatnya aman berjalan sendiri, meniru pola
 * `berita-harian.ts` dan `peluncuran-rekam.ts`:
 *
 *   1. **Sekali sehari.** Tanggal (WIB) terakhir dijalankan disimpan di
 *      `data/pembaruan-kendaraan.json`. Muat ulang server tidak memicu
 *      penarikan kedua.
 *   2. **Tidak pernah menggagalkan permintaan.** `jadwalkanPembaruan()`
 *      dipanggil middleware tanpa `await`: riset yang lambat atau gagal tidak
 *      boleh membuat halaman pembaca lambat.
 *
 * "Kalau tidak ada data baru, data lama dipertahankan" dijamin di dua lapis:
 * `ai-usulan.js` membuang nilai null (AI tidak menemukan apa-apa), dan
 * `patchOtomatis()` membuang nilai yang sama persis dengan yang sudah ada.
 */

const BERKAS = () => path.resolve(process.cwd(), "data/pembaruan-kendaraan.json");

/** Batas keras satu riset kendaraan, supaya antrean tidak membeku selamanya. */
const BATAS_MS_PER_KENDARAAN = 3 * 60 * 1000;

export interface RincianPembaruan {
  col: string;
  nama: string;
  /** Nama field yang berubah dan diterapkan. Kosong berarti tidak ada perubahan. */
  diubah: string[];
  /** Kunci galat bila riset gagal. Kosong berarti berhasil. */
  errorKey: string;
}

export interface StatusPembaruan {
  pengaturan: ReturnType<typeof normalkanPengaturan>;
  jalan: boolean;
  terakhir: {
    tanggal: string;
    mulaiPada: number;
    selesaiPada: number;
    diproses: number;
    diubah: number;
    gagal: number;
    biayaRupiah: number;
    rincian: RincianPembaruan[];
  };
}

function terakhirKosong(): StatusPembaruan["terakhir"] {
  return {
    tanggal: "",
    mulaiPada: 0,
    selesaiPada: 0,
    diproses: 0,
    diubah: 0,
    gagal: 0,
    biayaRupiah: 0,
    rincian: [],
  };
}

/** Membaca pengaturan + status terakhir dari disk, dengan nilai aman. */
export function bacaPembaruan(): StatusPembaruan {
  const res = readJson<any>(BERKAS());
  const data = res.status === "ok" ? res.data : {};
  const terakhir = data?.terakhir && typeof data.terakhir === "object" ? data.terakhir : {};
  return {
    pengaturan: normalkanPengaturan(data?.pengaturan),
    jalan: !!data?.jalan,
    terakhir: {
      tanggal: String(terakhir.tanggal || ""),
      mulaiPada: Number(terakhir.mulaiPada) || 0,
      selesaiPada: Number(terakhir.selesaiPada) || 0,
      diproses: Number(terakhir.diproses) || 0,
      diubah: Number(terakhir.diubah) || 0,
      gagal: Number(terakhir.gagal) || 0,
      biayaRupiah: Number(terakhir.biayaRupiah) || 0,
      rincian: Array.isArray(terakhir.rincian) ? terakhir.rincian : [],
    },
  };
}

function tulisPembaruan(status: StatusPembaruan): void {
  try {
    writeJsonAtomic(BERKAS(), status);
  } catch {
    // Status bersifat best-effort; kegagalan menulisnya tidak fatal.
  }
}

/** Menyimpan perubahan pengaturan (dipanggil endpoint panel). */
export function simpanPengaturan(parsial: any): StatusPembaruan {
  const status = bacaPembaruan();
  const lama = status.pengaturan;
  status.pengaturan = normalkanPengaturan({ ...lama, ...(parsial || {}) });
  tulisPembaruan(status);
  return status;
}

export function aktif(): boolean {
  return bacaPembaruan().pengaturan.aktif;
}

/**
 * Meriset satu kendaraan dan mengembalikan usulan yang sudah dibersihkan.
 *
 * Jalurnya meniru `mulaiRiset()` di `ai-jobs.ts`: riset penuh, dan kalau
 * jawabannya bukan JSON yang terbaca (kejadian yang sudah terbukti), ia
 * dirapikan lewat panggilan kedua yang murah, bukan dibuang.
 */
async function risetSatu(
  apiKey: string,
  kendaraan: { col: string; kind: "mobil" | "motor"; brand: string; name: string }
): Promise<{ usulan: any[]; biayaRupiah: number; errorKey: string }> {
  const model = modelBawaan();
  const schema = buildSchema(kendaraan.kind, null);
  const instructions = buildInstructions({
    kind: kendaraan.kind,
    brand: kendaraan.brand,
    name: kendaraan.name,
    today: tanggalWib(),
  });

  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), BATAS_MS_PER_KENDARAAN);

  let usulan: any[] = [];
  let biaya = 0;
  let errorKey = "";

  try {
    const res = await jalankanRiset({
      apiKey,
      model,
      effort: "high",
      maxOutputTokens: 64_000,
      instructions,
      input: `Riset ${kendaraan.brand} ${kendaraan.name} untuk pasar Indonesia. Jawab hanya dengan JSON sesuai skema.`,
      schema,
      signal: ac.signal,
    });

    if (res.usage) biaya += biayaDariUsage(res.usage, model, new Date()).rupiah;

    if (res.ok) {
      usulan = bersihkanUsulan(res.hasil, { kind: kendaraan.kind }).usulan;
    } else if (res.mentah && !!res.errorKey && BISA_DIRAPIKAN.has(res.errorKey)) {
      const rapi = await rapikanJadiJson({ apiKey, schema, mentah: res.mentah, signal: ac.signal });
      if (rapi.ok) {
        if (rapi.usage) biaya += biayaDariUsage(rapi.usage, model, new Date()).rupiah;
        usulan = bersihkanUsulan(rapi.hasil, { kind: kendaraan.kind }).usulan;
      } else {
        errorKey = rapi.errorKey || "err.ai.jawabanTidakTerbaca";
      }
    } else {
      errorKey = res.errorKey || galatBermasalah();
    }
  } catch {
    errorKey = galatTidakTerhubung();
  } finally {
    clearTimeout(batas);
  }

  return { usulan, biayaRupiah: biaya, errorKey };
}

const UPLOAD_DIR = () => path.resolve(process.cwd(), "data", "uploads");

/**
 * Mengambil media (video & gambar) dari halaman resmi kendaraan, kalau punya.
 *
 * Hanya mengisi yang masih KOSONG — media yang sudah diunggah penyunting tidak
 * pernah ditimpa. Video cukup disimpan sebagai alamat (YouTube/Vimeo, sama
 * seperti alur "Ambil media" di editor); gambar diunduh ke `data/uploads/` apa
 * adanya (tanpa dikecilkan, karena `sharp` sengaja tidak ada di paket rilis).
 *
 * `media-resmi` dimuat lewat `import()` dinamis, bukan impor statis: berkas itu
 * menarik `node:dns/promises`, dan biayanya tidak pantas ikut ke dalam bundel
 * middleware yang berjalan di SETIAP permintaan.
 */
async function ambilMediaUntuk(vehicle: any): Promise<Record<string, any>> {
  const patch: Record<string, any> = {};
  const sumber = String(vehicle?.sumberUrl || "").trim();
  if (!sumber) return patch;

  const { ambilMediaResmi, unduhGambarResmi } = await import("./media-resmi");
  const media = await ambilMediaResmi(sumber);
  if (!media.video.length && !media.gambar.length) return patch;

  if (!vehicle.video && media.video.length) patch.video = media.video[0];

  if (!vehicle.image && media.gambar.length) {
    const g = await unduhGambarResmi(media.gambar[0]);
    if (g) {
      const nama = crypto.randomBytes(8).toString("hex") + IMAGE_EXT[g.mime];
      try {
        fs.mkdirSync(UPLOAD_DIR(), { recursive: true });
        fs.writeFileSync(path.join(UPLOAD_DIR(), nama), g.buffer);
        patch.image = `/api/uploads/${nama}`;
      } catch {
        /* penyimpanan gambar bersifat best-effort */
      }
    }
  }

  return patch;
}

/**
 * Menjalankan satu putaran pembaruan: riset sejumlah kendaraan lalu terapkan
 * perubahan yang lolos pagar.
 *
 * @param paksa `true` mengabaikan penjaga "sekali sehari" dan saklar `aktif`
 *   (dipakai tombol "Jalankan sekarang" di panel). Tetap butuh kunci API.
 */
export async function jalankanPembaruan({ paksa = false }: { paksa?: boolean } = {}): Promise<any> {
  const status = bacaPembaruan();

  if (status.jalan) return { dilewati: true, alasan: "sedangJalan" };
  if (!paksa && !status.pengaturan.aktif) return { dilewati: true, alasan: "nonaktif" };
  if (!paksa) {
    const hari = tanggalWib();
    if (status.terakhir.tanggal === hari) return { dilewati: true, alasan: "sudahHariIni" };
  }

  if (!siapRiset()) {
    return { dilewati: true, alasan: "tanpaKunci" };
  }
  const apiKey = getEnv("DEEPSEEK_API_KEY", "");

  status.jalan = true;
  status.terakhir = {
    ...terakhirKosong(),
    tanggal: tanggalWib(),
    mulaiPada: Date.now(),
  };
  tulisPembaruan(status);

  try {
    const content = readContent();
    const dipilih = pilihKendaraan(content, status.pengaturan);

    const tambalan: { col: string; id: string; patch: Record<string, any> }[] = [];
    const rincian: RincianPembaruan[] = [];
    let biayaTotal = 0;
    let gagal = 0;

    for (const k of dipilih) {
      const daftarKolom = (content as any)[k.col] || [];
      const vehicle = daftarKolom.find((v: any) => v.id === k.id) || null;

      const hasil = await risetSatu(apiKey, k);
      biayaTotal += hasil.biayaRupiah;

      // Nilai null sudah dibuang di ai-usulan; patch otomatis hanya menerapkan
      // yang lolos pagar keyakinan dan benar-benar berbeda dari yang lama.
      const patch = patchOtomatis(hasil.usulan, vehicle, status.pengaturan.keyakinanMin);

      // Media diambil setelah spesifikasi, hanya bila ada halaman resmi dan
      // masih ada gambar/video yang kosong — supaya tidak ada fetch halaman
      // yang sia-sia untuk kendaraan yang medianya sudah lengkap.
      const mediaPatch =
        vehicle && !hasil.errorKey && vehicle.sumberUrl && (!vehicle.image || !vehicle.video)
          ? await ambilMediaUntuk(vehicle)
          : {};
      const semuaPatch = { ...patch, ...mediaPatch };

      if (hasil.errorKey && Object.keys(semuaPatch).length === 0) {
        gagal++;
        rincian.push({ col: k.col, nama: `${k.brand} ${k.name}`, diubah: [], errorKey: hasil.errorKey });
        continue;
      }

      if (Object.keys(semuaPatch).length === 0) {
        rincian.push({ col: k.col, nama: `${k.brand} ${k.name}`, diubah: [], errorKey: hasil.errorKey });
        continue;
      }

      tambalan.push({ col: k.col, id: k.id, patch: semuaPatch });
      rincian.push({
        col: k.col,
        nama: `${k.brand} ${k.name}`,
        diubah: Object.keys(semuaPatch),
        errorKey: "",
      });
    }

    let diubah = 0;
    if (tambalan.length) {
      // Baca ulang sebelum menulis: riset memakan waktu, dan penyunting bisa
      // saja menyimpan di tengah jalan. Patch diterapkan per id, jadi perubahan
      // panel yang tidak menyinggung kendaraan yang sama tetap selamat.
      const segar = readContent();
      const kini = new Date().toISOString();
      for (const t of tambalan) {
        const daftar = segar[t.col];
        const item = (daftar || []).find((v: any) => v.id === t.id);
        if (!item) continue;
        Object.assign(item, t.patch);
        item.updatedAt = kini;
        item.updatedBy = "auto";
        diubah++;
      }
      if (diubah > 0) writeContent(segar);
    }

    status.terakhir.selesaiPada = Date.now();
    status.terakhir.diproses = dipilih.length;
    status.terakhir.diubah = diubah;
    status.terakhir.gagal = gagal;
    status.terakhir.biayaRupiah = biayaTotal;
    status.terakhir.rincian = rincian;

    logActivity(null, "ai.autoUpdate", { n: diubah, diproses: dipilih.length });
    return {
      dilewati: false,
      diproses: dipilih.length,
      diubah,
      gagal,
      biayaRupiah: biayaTotal,
      rincian,
    };
  } catch (e: any) {
    status.terakhir.selesaiPada = Date.now();
    status.terakhir.gagal = 1;
    status.terakhir.rincian = [
      { col: "", nama: "", diubah: [], errorKey: String((e && e.message) || e) },
    ];
    return { dilewati: false, error: String((e && e.message) || e) };
  } finally {
    status.jalan = false;
    tulisPembaruan(status);
  }
}

let sudahHari = "";

/**
 * Dipanggil middleware di setiap permintaan. Sekali sehari, tidak ditunggu,
 * tidak pernah melempar — sama seperti `jadwalkanBerita()`.
 */
export function jadwalkanPembaruan(): void {
  try {
    const status = bacaPembaruan();
    if (!status.pengaturan.aktif) return;

    const hari = tanggalWib();
    if (sudahHari === hari) return;
    sudahHari = hari;

    const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
    if (jam < status.pengaturan.mulaiJam) return;

    void jalankanPembaruan().catch(() => {});
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
