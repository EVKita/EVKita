/**
 * Tautan berita dari feed pencarian Google News.
 *
 * Sebagian penerbit Indonesia dan China hanya bisa dibaca lewat feed
 * pencarian Google News (lihat `berita-sumber.js`). Masalahnya, `<link>` di
 * feed itu menunjuk ke `news.google.com/rss/articles/...`, bukan ke halaman
 * penerbitnya. Dua akibatnya nyata:
 *
 *   1. Pembaca yang menekan kartu mendarat di halaman perantara Google,
 *      bukan di tulisan aslinya.
 *   2. Halaman perantara itu tidak punya `og:image`, sehingga `berita-gambar`
 *      tidak bisa mengambil foto dan kartunya tampil sebagai lencana huruf.
 *
 * Berkas ini menukar alamat perantara itu dengan alamat penerbit aslinya.
 * Caranya: halaman Google News menyimpan `data-n-a-sg` (tanda tangan) dan
 * `data-n-a-ts` (stempel waktu) untuk artikelnya; keduanya dikirim ke
 * endpoint `DotsSplashUi` milik Google, yang menjawab dengan alamat aslinya.
 *
 * **Seluruh proses ini best-effort.** Kalau Google mengubah bentuk halamannya,
 * fungsi ini mengembalikan string kosong dan pemanggil tetap memakai alamat
 * Google News seperti sebelumnya — berita tidak boleh hilang hanya karena
 * tautannya gagal ditukar. Tidak pernah melempar, dan selalu punya batas waktu.
 *
 * Berkas ini butuh jaringan (`fetch`), jadi uji satuannya hanya menyentuh
 * bagian murninya: `perluDiselesaikan()` dan `tautanDariJawaban()`.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Batas waktu satu penukaran alamat. Dua permintaan HTTP, bukan satu. */
const BATAS_MS = 9000;

/** Alamat Google News yang bentuknya bisa ditukar. Murni. */
export function perluDiselesaikan(url: string): boolean {
  return /^https?:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]+/i.test(String(url || "").trim());
}

/** Bagian artikel dari alamat Google News, atau string kosong. Murni. */
export function idGoogleNews(url: string): string {
  const m = String(url || "").match(/news\.google\.com\/rss\/articles\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

/**
 * Mencari alamat penerbit di dalam jawaban `DotsSplashUi`. Murni.
 *
 * Jawabannya berupa deretan JSON yang di-escape berlapis, jadi yang dilakukan
 * di sini adalah membuang escape lalu mengambil alamat http(s) pertama yang
 * bukan milik Google sendiri.
 */
export function tautanDariJawaban(teks: string): string {
  const bersih = String(teks || "").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, '"');
  const calon = bersih.match(/https?:\/\/[^\s"'\\]+/g) || [];
  for (const url of calon) {
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === "news.google.com" || host.endsWith(".google.com") || host === "google.com") continue;
    if (!/^https?:$/.test(new URL(url).protocol)) continue;
    return url;
  }
  return "";
}

/**
 * Menukar satu alamat Google News dengan alamat penerbitnya.
 * `""` berarti gagal — pemanggil memakai alamat semula.
 */
export async function selesaikanTautanGoogle(url: string): Promise<string> {
  if (!perluDiselesaikan(url)) return "";
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), BATAS_MS);
  try {
    const halaman = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: c.signal,
    });
    if (!halaman.ok) return "";
    const html = await halaman.text();
    const sg = (html.match(/data-n-a-sg="([^"]+)"/) || [])[1] || "";
    const ts = (html.match(/data-n-a-ts="([^"]+)"/) || [])[1] || "";
    const id = idGoogleNews(url);
    if (!sg || !ts || !id) return "";

    const dalam = JSON.stringify([
      "garturlreq",
      [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id,
      Number(ts),
      sg,
    ]);
    const freq = JSON.stringify([[["Fbv4je", dalam, null, "generic"]]]);
    const jawab = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": UA,
      },
      body: "f.req=" + encodeURIComponent(freq),
      signal: c.signal,
    });
    if (!jawab.ok) return "";
    return tautanDariJawaban(await jawab.text());
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}
