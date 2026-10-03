import fs from "node:fs";
import path from "node:path";
import { urlAmanUntukAmbil } from "./gambar-url.js";

/**
 * Thumbnail kartu "Berita Terkini": diambil dari situs sumbernya sendiri.
 *
 * Setiap berita menunjuk ke penerbitnya (`url`), dan penerbit memasang foto
 * di Open Graph/Twitter Card halamannya. Berkas ini membaca foto itu SEKALI,
 * lalu menyimpannya di `data/berita-gambar.json` — pemuatan beranda berikutnya
 * tidak menyentuh situs orang lagi sampai catatannya berumur tujuh hari.
 *
 * Aturan yang memegang berkas ini:
 * - Alamat yang dibaca HANYA berasal dari `content.json` milik sendiri (yang
 *   ditulis penyunting lewat panel), bukan dari pengunjung. Tidak ada endpoint
 *   publik baru di sini, jadi tidak ada permukaan SSRF baru.
 * - Penjagaan ke mana server boleh mengetuk SAMA dengan `/api/media-halaman`
 *   dan `media-resmi.ts`: `urlAmanUntukAmbil()` + pemeriksaan DNS di
 *   `ambilMediaResmi()`. Foto yang terpilih pun diperiksa ulang sebelum
 *   disimpan — penerbit yang menaruh `file:///etc/passwd` di og:image-nya
 *   tidak akan lolos.
 * - Tidak pernah melempar. Gagal mengambil berarti barisnya tampil tanpa foto,
 *   sama seperti sebelumnya — bukan beranda yang rusak.
 * - Render tidak pernah menulis `content.json`. Yang ditulis hanya berkas
 *   cache (ikut `.gitignore`), dan kegagalan menulis cache diabaikan diam-diam.
 */

const BERKAS_CACHE = () => path.join(path.resolve(process.cwd(), "data"), "berita-gambar.json");

/** Umur catatan cache: tujuh hari. Foto berita tidak berganti tiap jam. */
export const UMUR_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
/** Pagar jumlah entri supaya berkas tidak tumbuh tanpa batas. */
export const MAKS_ENTRI = 300;
/** Satu situs lambat tidak boleh menahan seluruh beranda. */
const BATAS_SATU_SITUS_MS = 8000;

interface Entri {
  image: string;
  at: string;
}

/** Kunci kanonik: http/https disamakan, garis miring akhir dibuang. Murni. */
export function kunciKanonik(mentah: string): string {
  let s = String(mentah || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    s = u.href.replace(/\/$/, "");
    return s;
  } catch {
    return "";
  }
}

/** Catatan masih segar kalau umurnya di bawah `UMUR_CACHE_MS`. Murni. */
export function masihSegar(at: string, sekarang: number): boolean {
  const t = Date.parse(String(at || ""));
  if (!Number.isFinite(t)) return false;
  return sekarang - t < UMUR_CACHE_MS;
}

/** Buang entri terlama sampai tinggal `MAKS_ENTRI`. Murni. */
export function pangkasCache(semua: Record<string, Entri>): Record<string, Entri> {
  const kunci = Object.keys(semua);
  if (kunci.length <= MAKS_ENTRI) return semua;
  kunci.sort((a, b) => String(semua[a]?.at || "").localeCompare(String(semua[b]?.at || "")));
  const keluar: Record<string, Entri> = {};
  for (const k of kunci.slice(kunci.length - MAKS_ENTRI)) keluar[k] = semua[k];
  return keluar;
}

function bacaCache(): Record<string, Entri> {
  try {
    const data = JSON.parse(fs.readFileSync(BERKAS_CACHE(), "utf8"));
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, Entri>;
    }
  } catch {
    /* belum ada atau rusak — mulai dari kosong */
  }
  return {};
}

function tulisCache(semua: Record<string, Entri>): void {
  try {
    const file = BERKAS_CACHE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sementara = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(sementara, JSON.stringify(pangkasCache(semua)), "utf8");
    fs.renameSync(sementara, file);
  } catch {
    /* cache yang gagal ditulis bukan alasan merusak render */
  }
}

/**
 * Mengambil foto pertama yang sah dari halaman sumber. Impor `media-resmi`
 * dibuat dinamis supaya logika murni di atas bisa dipakai tanpa Node —
 * dan supaya pengujian tidak ikut memuat `node:dns`.
 */
async function unduhAlamat(artikelUrl: string): Promise<string> {
  const { ambilMediaResmi } = await import("./media-resmi");
  const media = await ambilMediaResmi(artikelUrl);
  const daftar = Array.isArray(media?.gambar) ? media.gambar : [];
  for (const g of daftar) {
    // Foto penerbit bisa relatif (`/foto/x.jpg`) — `ekstrakMedia` sudah
    // menjadikannya absolut terhadap halaman sumbernya.
    if (urlAmanUntukAmbil(String(g || "")).ok) return String(g);
  }
  return "";
}

function denganBatas<T>(janji: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    janji,
    new Promise<null>((selesai) => setTimeout(() => selesai(null), ms)),
  ]);
}

/**
 * Satu thumbnail untuk satu alamat berita. "" kalau tidak ada yang layak —
 * pemanggil merender baris tanpa foto, persis seperti sebelumnya.
 */
export async function gambarBerita(artikelUrl: string): Promise<string> {
  try {
    const kunci = kunciKanonik(artikelUrl);
    if (!kunci) return "";
    // Bentuknya diperiksa DULU (murni, tanpa jaringan): "javascript:…" dan
    // sampah sejenisnya tidak perlu membuka koneksi untuk ditolak.
    if (!urlAmanUntukAmbil(kunci).ok) return "";

    const cache = bacaCache();
    const ada = cache[kunci];
    if (ada && typeof ada.image === "string" && masihSegar(ada.at, Date.now())) {
      return ada.image;
    }

    const image = (await denganBatas(unduhAlamat(kunci), BATAS_SATU_SITUS_MS)) || "";
    cache[kunci] = { image, at: new Date().toISOString() };
    tulisCache(cache);
    return image;
  } catch {
    return "";
  }
}

/** Thumbnail untuk sekelompok alamat sekaligus — pararel, tetap tidak melempar. */
export async function petaGambarBerita(artikelUrls: string[]): Promise<Record<string, string>> {
  const unik = [...new Set((artikelUrls || []).map(kunciKanonik).filter(Boolean))];
  const keluar: Record<string, string> = {};
  await Promise.all(
    unik.map(async (u) => {
      keluar[u] = await gambarBerita(u);
    })
  );
  return keluar;
}
