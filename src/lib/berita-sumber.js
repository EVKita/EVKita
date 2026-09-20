/**
 * Sumber Berita Terkini dan aturan relevansinya.
 *
 * Berita di situs ini bukan tulisan kami sendiri: setiap kartu menampilkan
 * nama penerbitnya dan menautkan pembaca ke halaman aslinya. Karena itu sumber
 * yang dipakai adalah **RSS/Atom resmi** milik masing-masing penerbit — kanal
 * yang memang disediakan untuk dikutip ulang. Situs yang tidak menyediakan
 * feed tidak diambil paksa; ia cukup dilewati, dan pemilik situs bisa
 * menambah beritanya sendiri lewat panel.
 *
 * Daftar ini JavaScript polos tanpa API Node supaya bisa diuji langsung
 * (`tests/berita-rss.test.ts`) tanpa memuat penyimpan konten.
 */

/** Penerbit berita yang feed resminya bisa dibaca server. */
export const SUMBER_BERITA = [
  { id: "detikoto", nama: "detikOto", feed: "https://oto.detik.com/rss" },
  { id: "autonetmagz", nama: "AutonetMagz", feed: "https://autonetmagz.com/feed/" },
  { id: "cnnindonesia", nama: "CNN Indonesia", feed: "https://www.cnnindonesia.com/otomotif/rss" },
  { id: "antaranews", nama: "Antara News", feed: "https://www.antaranews.com/rss/otomotif.xml" },
];

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
];

/** Apakah judul/ringkasan ini membicarakan kendaraan listrik? */
export function relevanBerita(teks) {
  const s = String(teks || "");
  if (!s.trim()) return false;
  return POLA_EV.some((r) => r.test(s));
}
