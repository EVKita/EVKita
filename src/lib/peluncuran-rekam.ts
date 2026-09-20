import fs from "node:fs";
import path from "node:path";
import { readContent, writeContent } from "./store";
import { bacaRentang } from "./trafik-rekam";
import { hariWib } from "./trafik.js";
import { AMBANG_VIRAL, kandidatViral } from "./peluncuran.js";

/**
 * Pencatat model viral.
 *
 * Membaca statistik kunjungan yang sudah ada, mencari halaman kendaraan yang
 * melewati `AMBANG_VIRAL` dalam dua hari terakhir (perkiraan "24 jam" dari
 * angka harian WIB), lalu menandai kendaraannya `stale` supaya muncul di
 * daftar "Perlu ditinjau" pada dasbor panel.
 *
 * Sengaja TIDAK menulis data baru dan TIDAK memanggil AI: halaman yang ramai
 * hanya berarti "periksa ini", bukan "tulis apa pun yang dicari AI". Penyunting
 * yang memutuskan, persis seperti prinsip riset AI yang sudah ada.
 */

const BERKAS = path.resolve(process.cwd(), "data/peluncuran.json");

/** Hasil pemantauan terakhir. Bentuknya selalu ada supaya panel tidak perlu menebak. */
export function bacaPeluncuran(): { tanggal: string; ambang: number; kandidat: any[] } {
  try {
    const isi = JSON.parse(fs.readFileSync(BERKAS, "utf8"));
    return {
      tanggal: String(isi?.tanggal || ""),
      ambang: Number(isi?.ambang) || AMBANG_VIRAL,
      kandidat: Array.isArray(isi?.kandidat) ? isi.kandidat : [],
    };
  } catch {
    return { tanggal: "", ambang: AMBANG_VIRAL, kandidat: [] };
  }
}

/** Menghitung ulang kandidat viral dan menandai kendaraannya. */
export function deteksiViral() {
  const ringkas = bacaRentang(2);
  const peta: Record<string, number> = {};
  for (const h of ringkas.sekarang.halaman || []) peta[h.label] = h.n;
  const kandidat = kandidatViral(peta, AMBANG_VIRAL);

  const hasil = { tanggal: hariWib(), ambang: AMBANG_VIRAL, kandidat };
  try {
    fs.mkdirSync(path.dirname(BERKAS), { recursive: true });
    fs.writeFileSync(BERKAS, JSON.stringify(hasil));
  } catch {
    /* pencatatan bersifat best-effort */
  }

  if (kandidat.length) {
    try {
      const content = readContent();
      let berubah = false;
      for (const k of kandidat) {
        const daftar = k.kind === "motor" ? content.motors : content.cars;
        const item = (daftar || []).find((v: any) => v.id === k.slug);
        if (item && !item.stale) {
          item.stale = true;
          berubah = true;
        }
      }
      if (berubah) writeContent(content);
    } catch {
      /* penandaan gagal tidak boleh menggagalkan pemantauan */
    }
  }

  return hasil;
}

let sudahHari = "";

/** Dipanggil middleware; sekali sehari, tidak ditunggu, tidak pernah melempar. */
export function jadwalkanPeluncuran(): void {
  try {
    const hari = hariWib();
    if (sudahHari === hari) return;
    sudahHari = hari;
    deteksiViral();
  } catch {
    /* tidak ada yang boleh menjatuhkan middleware */
  }
}
