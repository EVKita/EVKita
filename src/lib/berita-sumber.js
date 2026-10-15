/**
 * Sumber Berita Terkini dan aturan relevansinya.
 *
 * Berita di situs ini bukan tulisan kami sendiri: setiap kartu menampilkan
 * nama penerbitnya dan menautkan pembaca ke halaman aslinya. Karena itu sumber
 * yang dipakai adalah **RSS/Atom resmi** milik masing-masing penerbit — kanal
 * yang memang disediakan untuk dikutip ulang. Pengecualiannya satu:
 * Kompas.com yang RSS-nya sudah dimatikan — untuknya dipakai feed pencarian
 * Google News yang dibatasi ke situsnya (lihat catatan di `SUMBER_BERITA`).
 * Situs yang tidak menyediakan feed dan tidak tercakup cara itu tidak
 * diambil paksa; ia cukup dilewati, dan pemilik situs bisa
 * menambah beritanya sendiri lewat panel.
 *
 * Daftar ini JavaScript polos tanpa API Node supaya bisa diuji langsung
 * (`tests/berita-rss.test.ts`) tanpa memuat penyimpan konten.
 */

/** Penerbit berita yang feed resminya bisa dibaca server.
 *
 * Tiap sumber membawa `wilayah`: berita hasil tarikan ditandai edisinya
 * masing-masing — sekali putaran harian menyegarkan Indonesia DAN Amerika.
 * Tanpa wilayah berarti Indonesia (seluruh sumber lama tidak perlu diubah).
 */
export const SUMBER_BERITA = [
  { id: "detikoto", nama: "detikOto", feed: "https://oto.detik.com/rss", wilayah: "id" },
  { id: "autonetmagz", nama: "AutonetMagz", feed: "https://autonetmagz.com/feed/", wilayah: "id" },
  { id: "cnnindonesia", nama: "CNN Indonesia", feed: "https://www.cnnindonesia.com/otomotif/rss", wilayah: "id" },
  { id: "antaranews", nama: "Antara News", feed: "https://www.antaranews.com/rss/otomotif.xml", wilayah: "id" },
  /*
   * Kompas.com tidak lagi menyediakan RSS publik (`/getrss/*` sudah 404,
   * tidak ada tautan RSS di kanal otomotifnya) — jadi feed resminya tidak
   * bisa dipakai langsung. Sebagai gantinya dipakai feed pencarian Google
   * News yang dibatasi ke `site:kompas.com` dengan kata kunci EV: kanal
   * resmi yang memang disediakan untuk dibaca mesin, dan yang disimpan tetap
   * sama seperti sumber lain — hanya judul, ringkasan, tanggal, dan TAUTAN
   * ke artikel aslinya. Judul bawaan Google News selalu diakhiri
   * " - Kompas.com", jadi akhiran itu dibuang lewat `stripJudul` supaya
   * kartu tidak menampilkan nama penerbit dua kali.
   */
  {
    id: "kompas",
    nama: "Kompas.com",
    feed: "https://news.google.com/rss/search?q=site%3Akompas.com%20%28mobil%20listrik%20OR%20motor%20listrik%20OR%20kendaraan%20listrik%20OR%20bus%20listrik%20OR%20SPKLU%20OR%20swap%20baterai%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - Kompas.com",
    wilayah: "id",
  },
  /*
   * Edisi Amerika: dua penerbit EV Amerika yang feed RSS-nya terbuka dan
   * sudah diverifikasi (Oktober 2026). Beritanya ditandai wilayah "us" saat
   * ditarik, jadi putaran harian yang sama mengisi kedua edisi sekaligus.
   */
  { id: "insideevs", nama: "InsideEVs", feed: "https://insideevs.com/feed/", wilayah: "us" },
  { id: "electrek", nama: "Electrek", feed: "https://electrek.co/feed/", wilayah: "us" },
  /*
   * Edisi China: liputan EV China berbahasa Inggris lewat feed pencarian
   * Google News yang dibatasi ke situsnya — pola yang sama dengan Kompas.com
   * di atas. CnEVPost dan Gasgoo tidak menyediakan RSS publik yang stabil,
   * jadi kanal resmi Google News yang dipakai; yang disimpan tetap sama —
   * hanya judul, ringkasan, tanggal, dan TAUTAN ke artikel aslinya.
   */
  {
    id: "cnevpost",
    nama: "CnEVPost",
    feed: "https://news.google.com/rss/search?q=site%3Acnevpost.com%20%28EV%20OR%20electric%20OR%20battery%20OR%20NIO%20OR%20XPeng%20OR%20BYD%20OR%20Xiaomi%29&hl=en&gl=SG&ceid=SG%3Aen",
    stripJudul: " - CnEVPost",
    wilayah: "cn",
  },
  {
    id: "gasgoo",
    nama: "Gasgoo",
    feed: "https://news.google.com/rss/search?q=site%3Agasgoo.com%20%28EV%20OR%20electric%20OR%20battery%20OR%20NEV%29&hl=en&gl=SG&ceid=SG%3Aen",
    stripJudul: " - Gasgoo",
    wilayah: "cn",
  },
];

/**
 * Membuang akhiran judul bawaan feed (mis. " - Kompas.com" dari Google
 * News) supaya kartu tidak menyebut penerbitnya dua kali — label sumber
 * sudah tampil sendiri di kartu. Tanpa `stripJudul`, judul dikembalikan
 * apa adanya. JavaScript polos supaya bisa diuji langsung.
 */
export function judulBersih(sumber, judul) {
  const akhiran = sumber && typeof sumber.stripJudul === "string" ? sumber.stripJudul : "";
  const t = String(judul || "");
  if (akhiran && t.endsWith(akhiran)) return t.slice(0, -akhiran.length).trim();
  return t;
}

/**
 * Pola yang membuat sebuah berita dianggap layak tampil.
 *
 * Situs ini soal kendaraan listrik, dan feed yang dipakai adalah feed otomotif
 * umum — tanpa penyaring ini Berita Terkini akan penuh kabar mesin bensin.
 * Polanya sengaja lebar: yang dibuang adalah berita yang jelas-jelas tidak
 * berhubungan, bukan yang sekadar tidak menyebut "EV".
 */
export const POLA_EV = [
  /\b(ev|bev|phev|hev|mhev)\b/i,
  /listrik|elektrik|elektrifikasi/i,
  /baterai|battery|charging|pengisian daya|ngecas|spklu|swap baterai/i,
  /hybrid/i,
  /mobil listrik|motor listrik|skuter listrik|sepeda listrik/i,
  /\b(byd|wuling|hyundai|ioniq|vinfast|chery|omoda|jaecoo|geely|aion|polytron|alva|gesits|smoot|tesla|nio|xpeng|leapmotor|changan|gac|denza|jaecoo)\b/i,
  /* Merek dan model khas Amerika — feed AS memakai kata ini, bukan "listrik". */
  /\b(rivian|lucid|ford|chevrolet|f-150|silverado|equinox|blazer|bolt|mustang|mach-e|cybertruck|prologue|lyriq|model [3ysx])\b/i,
  /* Merek dan model khas China — feed CnEVPost/Gasgoo memakai kata ini. */
  /\b(xiaomi|su7|yu7|nio|et5|et7|es6|ec6|onvo|xpeng|p7|g6|g9|mona|zeekr|007|009|li auto|lixiang|l9|l8|l7|mega|avatr|deepal|fangchengbao|yangwang|denza|hongqi|Leapmotor|cneu|cltc|catl|byd yuan|seal 06|song plus|qin plus)\b/i,
];

/** Apakah judul/ringkasan ini membicarakan kendaraan listrik? */
export function relevanBerita(teks) {
  const s = String(teks || "");
  if (!s.trim()) return false;
  return POLA_EV.some((r) => r.test(s));
}
