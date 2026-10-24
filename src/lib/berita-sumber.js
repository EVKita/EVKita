/**
 * Sumber Berita Terkini dan aturan relevansinya.
 *
 * Berita di situs ini bukan tulisan kami sendiri: setiap kartu menampilkan
 * nama penerbitnya dan menautkan pembaca ke halaman aslinya. Karena itu sumber
 * yang dipakai adalah **RSS/Atom resmi** milik masing-masing penerbit — kanal
 * yang memang disediakan untuk dikutip ulang. Pengecualiannya adalah situs
 * yang RSS-nya sudah dimatikan — untuknya dipakai feed pencarian Google News
 * yang dibatasi ke situsnya (lihat catatan per sumber di bawah).
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
 * masing-masing — sekali putaran harian menyegarkan Indonesia, Amerika,
 * dan China sekaligus. Tanpa wilayah berarti Indonesia (seluruh sumber
 * lama tidak perlu diubah).
 */
export const SUMBER_BERITA = [
  /* ─── EDISI INDONESIA ─── */

  /** Feed langsung RSS resmi — diverifikasi aktif Oktober 2026. */
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
   * Oto.com (Kompas Gramedia): portal otomotif digital terbesar Indonesia
   * yang punya konten test drive, harga OTR, dan berita peluncuran EV
   * terlengkap. Feed Google News dibatasi ke EV agar tidak tercampur konten
   * bensin.
   */
  {
    id: "otocom",
    nama: "Oto.com",
    feed: "https://news.google.com/rss/search?q=site%3Aoto.com%20%28listrik%20OR%20EV%20OR%20hybrid%20OR%20SPKLU%20OR%20baterai%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - Oto.com",
    wilayah: "id",
  },

  /*
   * Liputan6.com Otomotif (Emtek): salah satu portal berita terbesar
   * Indonesia dengan kanal otomotif aktif. Sering pertama melaporkan harga
   * resmi dan peluncuran EV lokal (VinFast, Polytron, Volta, Alva).
   */
  {
    id: "liputan6",
    nama: "Liputan6",
    feed: "https://news.google.com/rss/search?q=site%3Aliputan6.com%20%28mobil%20listrik%20OR%20motor%20listrik%20OR%20kendaraan%20listrik%20OR%20SPKLU%20OR%20EV%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - Liputan6.com",
    wilayah: "id",
  },

  /*
   * GridOto (Grid Network / Kompas Gramedia): portal otomotif dengan konten
   * test drive EV yang teknis dan mendalam. Sering menerbitkan laporan
   * konsumsi baterai, perbandingan model, dan tips pemilik EV.
   */
  {
    id: "gridoto",
    nama: "GridOto",
    feed: "https://news.google.com/rss/search?q=site%3Agridoto.com%20%28listrik%20OR%20EV%20OR%20SPKLU%20OR%20baterai%20OR%20hybrid%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - GridOto.com",
    wilayah: "id",
  },

  /*
   * Motor Plus Online (Grid Network): sumber utama berita motor dan skuter
   * listrik Indonesia — Alva One, Gesits, Smoot, Polytron Fox R, Honda
   * EM1, Yamaha E-01, dll. Satu-satunya yang secara spesifik membahas
   * infrastruktur Stasiun Penukaran Baterai (SPB).
   */
  {
    id: "motorplus",
    nama: "Motor Plus",
    feed: "https://news.google.com/rss/search?q=site%3Amotorplus-online.com%20%28listrik%20OR%20EV%20OR%20baterai%20OR%20SPKLU%20OR%20SPB%20OR%20swap%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - Motor Plus",
    wilayah: "id",
  },

  /*
   * Otomotif.net (Tribun Network): jaringan media besar dengan liputan luas
   * spesifikasi, harga, dan test drive EV. Sering wawancara langsung
   * pabrikan di GIIAS dan IIMS — berita eksklusif yang tidak muncul di feed
   * lain.
   */
  {
    id: "otomotifnet",
    nama: "Otomotif.net",
    feed: "https://news.google.com/rss/search?q=site%3Aotomotif.net%20%28listrik%20OR%20EV%20OR%20hybrid%20OR%20SPKLU%20OR%20baterai%29&hl=id&gl=ID&ceid=ID%3Aid",
    stripJudul: " - Otomotif.net",
    wilayah: "id",
  },

  /* ─── EDISI AMERIKA ─── */

  /*
   * InsideEVs dan Electrek: dua penerbit EV Amerika yang feed RSS-nya
   * terbuka dan sudah diverifikasi (Oktober 2026). Beritanya ditandai
   * wilayah "us" saat ditarik, jadi putaran harian yang sama mengisi
   * kedua edisi sekaligus.
   */
  { id: "insideevs", nama: "InsideEVs", feed: "https://insideevs.com/feed/", wilayah: "us" },
  { id: "electrek", nama: "Electrek", feed: "https://electrek.co/feed/", wilayah: "us" },

  /*
   * CleanTechnica: publikasi teknologi bersih terkemuka di Amerika, RSS
   * publik aktif. Paling mendalam dalam liputan kebijakan EV, rekap penjualan
   * bulanan, dan analisis teknologi baterai. Tidak sekadar berita peluncuran.
   */
  {
    id: "cleantechnica",
    nama: "CleanTechnica",
    feed: "https://cleantechnica.com/feed/",
    wilayah: "us",
  },

  /*
   * EV Magazine: berita industri EV global dari sudut pandang bisnis dan
   * manufaktur — kebijakan IRA, infrastruktur pengisian federal, dan berita
   * pabrik baterai Amerika. Feed Google News, diverifikasi aktif Okt 2026.
   */
  {
    id: "evmagazine",
    nama: "EV Magazine",
    feed: "https://news.google.com/rss/search?q=site%3Aev-magazine.com%20%28EV%20OR%20electric%20OR%20battery%20OR%20charging%29&hl=en&gl=US&ceid=US%3Aen",
    stripJudul: " - EV Magazine",
    wilayah: "us",
  },

  /* ─── EDISI CHINA ─── */

  /*
   * CnEVPost dan Gasgoo: liputan EV China berbahasa Inggris lewat feed
   * pencarian Google News yang dibatasi ke situsnya — pola yang sama dengan
   * Kompas.com di atas. CnEVPost dan Gasgoo tidak menyediakan RSS publik
   * yang stabil, jadi kanal resmi Google News yang dipakai; yang disimpan
   * tetap sama — hanya judul, ringkasan, tanggal, dan TAUTAN ke artikel
   * aslinya.
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

  /*
   * Yicai Global: lembaga media ekonomi-bisnis Tiongkok berbahasa Inggris,
   * salah satu sumber paling andal untuk data penjualan EV China, kebijakan
   * industri (MIIT, CAAM, CPCA), dan berita merek NEV terkini. Feed Google
   * News ini yang paling stabil dibandingkan alternatif lain.
   */
  {
    id: "yicaiglobal",
    nama: "Yicai Global",
    feed: "https://news.google.com/rss/search?q=site%3Ayicaiglobal.com%20%28EV%20OR%20electric%20OR%20NEV%20OR%20battery%20OR%20BYD%20OR%20NIO%20OR%20CATL%29&hl=en&gl=SG&ceid=SG%3Aen",
    stripJudul: " - Yicai Global",
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
 *
 * Diperbarui Oktober 2026 — ditambah merek/model baru: Volta, Rakata, United E-Motor,
 * Viar, Honda e:N, Honda EM1, Yamaha E-01/E-Vino, Neta, Ora, Maxwell, Zeekr,
 * AITO, Huawei, Polestar, Stellantis, Ram 1500 REV, Dodge Charger Daytona.
 */
export const POLA_EV = [
  /\b(ev|bev|phev|hev|mhev)\b/i,
  /listrik|elektrik|elektrifikasi/i,
  /baterai|battery|charging|pengisian daya|ngecas|spklu|swap baterai|stasiun pengisian/i,
  /hybrid/i,
  /mobil listrik|motor listrik|skuter listrik|sepeda listrik|bus listrik/i,
  /* Merek EV Indonesia dan Asia yang aktif di pasar lokal */
  /\b(byd|wuling|hyundai|ioniq|vinfast|chery|omoda|jaecoo|geely|aion|polytron|alva|gesits|smoot|tesla|nio|xpeng|leapmotor|changan|gac|denza|jaecoo|volta|united e-motor|viar|rakata|neta|ora|maxwell|beijing|dfac)\b/i,
  /* Honda dan Yamaha EV — keduanya juga jual bensin, jadi perlu pola model spesifik */
  /\b(honda em1|honda e:n|honda ev|yamaha e-01|yamaha e-vino|yamaha nmax electric|yamaha fazzio electric)\b/i,
  /* Merek dan model khas Amerika — feed AS memakai kata ini, bukan "listrik" */
  /\b(rivian|lucid|ford|chevrolet|f-150|silverado|equinox|blazer|bolt|mustang|mach-e|cybertruck|prologue|lyriq|model [3ysx]|polestar|fisker|lordstown|canoo|workhorse|ram 1500|dodge charger|jeep avenger|stellantis)\b/i,
  /* Merek dan model khas China — feed CnEVPost/Gasgoo/Yicai memakai kata ini */
  /\b(xiaomi|su7|yu7|nio|et5|et7|es6|ec6|onvo|xpeng|p7|g6|g9|mona|zeekr|007|009|li auto|lixiang|l9|l8|l7|mega|avatr|deepal|fangchengbao|yangwang|denza|hongqi|leapmotor|catl|byd yuan|seal 06|song plus|qin plus|aito|m9|m7|huawei|hiphix|luxeed|stelato|wanjie)\b/i,
  /* Istilah industri baterai dan infrastruktur pengisian */
  /\b(solid.?state battery|lfp|nmc|blade battery|cell.?to.?pack|800v|ultra.?fast charging|v3 supercharger|hpc|hgrs|gbt|ccs|chademo|ocpp)\b/i,
];

/** Apakah judul/ringkasan ini membicarakan kendaraan listrik? */
export function relevanBerita(teks) {
  const s = String(teks || "");
  if (!s.trim()) return false;
  return POLA_EV.some((r) => r.test(s));
}
