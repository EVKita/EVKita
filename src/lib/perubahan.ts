/**
 * Membandingkan dua dokumen konten dan menyebutkan apa yang berbeda.
 *
 * Panel mengirim SELURUH `content.json` setiap kali menyimpan, jadi permintaan
 * simpan itu sendiri tidak memberi tahu apa pun tentang apa yang berubah.
 * Selama ini log aktivitas menuliskan satu baris `content.save` untuk setiap
 * penyimpanan, dan baris itu tidak bisa menjawab satu pun pertanyaan yang
 * membuat orang membuka log: siapa yang mengubah harga mobil ini, kapan
 * deskripsinya diganti, siapa yang menghapus SPKLU itu.
 *
 * Berkas ini yang menjawabnya. Ia murni — tidak membaca berkas, tidak menulis
 * apa pun — supaya bisa diuji sendiri dan dipakai server tanpa efek samping.
 */

/** Koleksi item yang punya id dan bisa dibandingkan satu per satu. */
export const KOLEKSI = ["cars", "motors", "spklu", "bengkel", "berita", "halaman"] as const;

export type JenisPerubahan = "tambah" | "ubah" | "hapus" | "urut";

export interface Perubahan {
  /** Nama koleksi, atau "site" / "media" untuk dua bagian yang bukan daftar. */
  col: string;
  id: string;
  /** Nama yang dikenali manusia — dipakai apa adanya di log. */
  title: string;
  jenis: JenisPerubahan;
  /** Nama field yang berbeda. Kosong untuk penambahan, penghapusan, dan urutan. */
  fields: string[];
}

/**
 * Field yang tidak pernah dihitung sebagai perubahan.
 *
 * Semuanya turunan, bukan sesuatu yang diketik orang: `variants` dihitung dari
 * `variantNames`, `kind` dari koleksi asalnya, dan dua stempel waktu di bawah
 * justru DIISI oleh proses yang memakai hasil perbandingan ini. Kalau ikut
 * dibandingkan, setiap penyimpanan akan melaporkan dirinya sendiri sebagai
 * perubahan dan tidak ada satu pun penyimpanan yang pernah terlihat kosong.
 */
const ABAIKAN = new Set(["id", "kind", "variants", "updatedAt", "updatedBy"]);

function sama(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Nilai kosong punya banyak bentuk di dokumen ini — null dari angka yang
  // dikosongkan, "" dari teks, undefined dari field yang belum pernah ada.
  // Menganggapnya berbeda akan melaporkan perubahan yang tidak pernah terjadi.
  const kosong = (v: unknown) => v === null || v === undefined || v === "";
  if (kosong(a) && kosong(b)) return true;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function judulItem(col: string, item: any): string {
  if (!item) return "";
  if (col === "berita" || col === "halaman") return String(item.title || "").trim();
  if (col === "cars" || col === "motors") {
    return [item.brand, item.name].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  }
  return String(item.name || "").trim();
}

/**
 * Nama field yang berbeda antara dua bentuk item.
 *
 * Diekspor karena dipakai dua arah: mencatat perubahan saat menyimpan, DAN
 * membandingkan sebuah item dengan versinya di dalam cadangan (lihat
 * `api/backups.ts`). Dua perbandingan yang berbeda aturannya akan membuat
 * riwayat menyebut field yang tidak pernah dicatat log, dan sebaliknya.
 */
export function fieldBerbeda(lama: any, baru: any): string[] {
  const kunci = new Set([...Object.keys(lama || {}), ...Object.keys(baru || {})]);
  const out: string[] = [];
  for (const k of kunci) {
    if (ABAIKAN.has(k)) continue;
    if (!sama(lama?.[k], baru?.[k])) out.push(k);
  }
  return out.sort();
}

function indeks(list: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const item of Array.isArray(list) ? list : []) {
    const id = String(item?.id || "");
    if (id) map.set(id, item);
  }
  return map;
}

const urutan = (list: any[]) => (Array.isArray(list) ? list : []).map((x) => String(x?.id || "")).join("\n");

/**
 * Nama berkas dari sebuah alamat gambar — dipakai sebagai label perubahan
 * metadata media. Alamat penuhnya terlalu panjang untuk satu baris log, dan
 * yang membuat sebuah gambar dikenali memang nama berkasnya.
 */
function namaBerkas(url: string): string {
  const bersih = String(url || "").split(/[?#]/)[0];
  return bersih.slice(bersih.lastIndexOf("/") + 1) || bersih;
}

export function bandingkanKonten(lama: any, baru: any): Perubahan[] {
  const out: Perubahan[] = [];

  for (const col of KOLEKSI) {
    const a = indeks(lama?.[col]);
    const b = indeks(baru?.[col]);

    for (const [id, item] of b) {
      const sebelum = a.get(id);
      if (!sebelum) {
        out.push({ col, id, title: judulItem(col, item), jenis: "tambah", fields: [] });
        continue;
      }
      const fields = fieldBerbeda(sebelum, item);
      if (fields.length) out.push({ col, id, title: judulItem(col, item), jenis: "ubah", fields });
    }

    for (const [id, item] of a) {
      if (!b.has(id)) out.push({ col, id, title: judulItem(col, item), jenis: "hapus", fields: [] });
    }

    /*
     * Urutan dilaporkan hanya kalau ISI koleksinya sama persis. Menyeret satu
     * baris ke atas memang mengubah urutan, tapi begitu ada item yang juga
     * ditambah atau dihapus, urutan pasti ikut berbeda — dan melaporkannya di
     * situ hanya menambah baris yang tidak memberi tahu apa-apa.
     */
    if (a.size === b.size && [...a.keys()].every((id) => b.has(id)) && urutan(lama?.[col]) !== urutan(baru?.[col])) {
      out.push({ col, id: "", title: "", jenis: "urut", fields: [] });
    }
  }

  const siteFields = fieldBerbeda(lama?.site, baru?.site);
  if (siteFields.length) out.push({ col: "site", id: "", title: "", jenis: "ubah", fields: siteFields });

  const mediaFields = fieldBerbeda(lama?.media, baru?.media).map(namaBerkas);
  if (mediaFields.length) out.push({ col: "media", id: "", title: "", jenis: "ubah", fields: mediaFields });

  return out;
}
