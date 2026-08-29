/**
 * Apakah sebuah berkas unggahan masih dipakai konten?
 *
 * Dipisahkan dari endpointnya karena jawabannya menentukan sesuatu yang tidak
 * bisa dibatalkan: berkas unggahan TIDAK ikut ke dalam cadangan — `data/backups/`
 * hanya menyimpan `content.json` — jadi berkas yang salah dihapus hilang untuk
 * selamanya. Fungsi murni yang bisa diuji sendiri lebih pantas menjaga itu
 * daripada beberapa baris di tengah penangan permintaan.
 *
 * Yang dianggap "dipakai" sengaja lebih luas daripada yang tampil di situs:
 * gambar milik kendaraan berstatus draf ikut dihitung, begitu pula gambar yang
 * hanya dirujuk metadata media. Salah menganggap sesuatu terpakai hanya berarti
 * satu berkas tetap tersimpan; salah menganggapnya yatim berarti gambar hilang
 * dari halaman yang sedang tayang.
 */

/** Nama berkas yang boleh disentuh: tanpa garis miring, tanpa "..". */
export function namaBerkasAman(nama: unknown): boolean {
  const s = String(nama || "");
  return /^[a-zA-Z0-9._-]+$/.test(s) && !s.startsWith(".") && s !== "..";
}

const KOLEKSI = ["cars", "motors", "spklu", "bengkel", "berita", "halaman"];

/** Field `site` yang isinya alamat gambar. */
const FIELD_SITE = ["logoImage", "heroImage", "seoOgImage", "bgImage"];

/**
 * Semua alamat gambar yang dirujuk sebuah dokumen konten.
 *
 * @param tambahan Alamat dari luar `content.json` — saat ini foto profil, yang
 *   tinggal di `data/users.json`. Tanpa ini setiap foto profil akan dihitung
 *   sebagai berkas yatim dan ditawarkan untuk dihapus, dan sesudahnya wajah
 *   orang menghilang dari panelnya sendiri.
 */
export function urlTerpakai(content: any, tambahan: readonly string[] = []): Set<string> {
  const out = new Set<string>();
  const tambah = (v: unknown) => {
    const s = String(v || "").trim();
    if (s) out.add(s);
  };

  const site = content?.site || {};
  for (const k of FIELD_SITE) tambah(site[k]);

  for (const col of KOLEKSI) {
    const daftar = Array.isArray(content?.[col]) ? content[col] : [];
    for (const item of daftar) {
      tambah(item?.image);
      if (Array.isArray(item?.gallery)) for (const g of item.gallery) tambah(g);
    }
  }

  /*
   * Metadata media ikut dihitung. Judul dan teks alternatif yang sudah ditulis
   * orang adalah pekerjaan yang tersimpan pada alamat itu — kalau berkasnya
   * dihapus, pekerjaan itu jadi menunjuk ke tempat kosong. Jauh lebih murah
   * membiarkan berkasnya tetap ada dan menunggu metadatanya dibersihkan lebih
   * dulu.
   */
  const media = content?.media && typeof content.media === "object" ? content.media : {};
  for (const kunci of Object.keys(media)) tambah(kunci);

  for (const v of tambahan) tambah(v);

  return out;
}

/**
 * Apakah alamat ini dirujuk dokumen konten?
 *
 * Perbandingannya membuang query dan fragmen: alamat yang sama bisa tersimpan
 * dengan penanda cache di belakangnya, dan dua bentuk itu menunjuk berkas yang
 * sama persis.
 */
export function urlDipakai(content: any, url: string, tambahan: readonly string[] = []): boolean {
  const bersih = (s: string) => String(s || "").split(/[?#]/)[0];
  const target = bersih(url);
  if (!target) return false;
  for (const dipakai of urlTerpakai(content, tambahan)) {
    if (bersih(dipakai) === target) return true;
  }
  return false;
}
