/**
 * Aturan alamat gambar yang boleh diambil server dari situs lain.
 *
 * Mengambil sebuah URL "atas nama pengguna panel" terdengar sepele dan tidak.
 * Yang mengetik alamatnya adalah orang, tapi yang MENGETUK alamat itu adalah
 * server — dari dalam jaringan tempat server itu berdiri. Alamat seperti
 * `http://127.0.0.1:4322/api/users` atau `http://169.254.169.254/latest/meta-data/`
 * tidak bisa dibuka siapa pun dari luar, tapi bisa dibuka server ini dengan
 * mudah, dan jawabannya akan dikirim balik ke panel. Itu SSRF, dan ia tidak
 * butuh celah baru untuk terjadi — cukup fitur "ambil dari URL" yang menuruti
 * apa saja.
 *
 * Karena itu penyaringnya ada di sini, terpisah dari endpoint-nya: fungsi
 * murni tanpa jaringan dan tanpa Node, jadi `tests/gambar-url.test.ts` bisa
 * menguji aturan yang PERSIS sama dengan yang dipakai server.
 *
 * Dua lapis, dan keduanya perlu:
 *
 *   1. Bentuk alamatnya (di berkas ini, sebelum satu byte pun dikirim):
 *      hanya http/https, hanya port web, tanpa kredensial, dan hanya nama
 *      domain sungguhan — bukan alamat IP.
 *   2. Hasil penerjemahan namanya (di endpoint, lewat DNS): nama yang
 *      menunjuk ke alamat privat ditolak, termasuk di setiap pengalihan.
 */

/** Sisi terbesar berkas yang mau diambil. */
export const MAKS_AMBIL_BYTES = 20 * 1024 * 1024;

/**
 * Batasnya sengaja lebih longgar daripada batas unggah (8 MB).
 *
 * Yang diambil di sini adalah berkas ASLI dari situs orang — foto pers 6000
 * piksel belasan megabita adalah hal biasa. Ia tidak pernah disimpan apa
 * adanya: peramban mengecilkan dan mengubahnya ke AVIF/WebP lebih dulu, dan
 * yang sampai ke `/api/upload` adalah hasil itu, yang tetap tunduk pada batas
 * 8 MB seperti unggahan biasa.
 */

/** Berapa lama menunggu satu situs sebelum menyerah. */
export const BATAS_WAKTU_MS = 15000;

/** Berapa kali pengalihan diikuti. Setiap loncatan diperiksa ulang. */
export const MAKS_ALIHAN = 3;

/**
 * Akhiran domain yang tidak pernah menunjuk ke internet publik.
 *
 * `.local` dan `.internal` diselesaikan lewat mDNS/DNS internal ke mesin di
 * jaringan yang sama dengan server. Yang lain tidak pernah bisa dituju sama
 * sekali; menolaknya sejak awal lebih jelas daripada menunggu DNS gagal.
 */
const TLD_TERLARANG = new Set([
  "local",
  "localhost",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "test",
  "invalid",
  "example",
  "onion",
]);

/**
 * Nama domain yang wajar: label huruf/angka/strip, dipisah titik, dan
 * berakhiran huruf.
 *
 * Yang lebih penting daripada apa yang diterima adalah apa yang DITOLAK: pola
 * ini menolak seluruh alamat IP sekaligus — `127.0.0.1`, bentuk desimalnya
 * (`2130706433`), bentuk oktalnya (`0177.0.0.1`), bentuk heksanya
 * (`0x7f000001`), dan `[::1]`. Semuanya diterima `getaddrinfo` sebagai
 * localhost, dan semuanya adalah cara paling tua untuk melewati penyaring
 * yang cuma mencari string "127.0.0.1".
 *
 * Menolak IP mentah tidak menghilangkan apa pun yang dibutuhkan fitur ini:
 * gambar di situs lain selalu punya nama domain.
 */
const NAMA_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Apakah nama host ini boleh dihubungi? */
export function hostBoleh(host) {
  const nama = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, ""); // titik akhir bentuk absolut: "evkita.com." = "evkita.com"
  if (!nama || nama.length > 253) return false;
  if (!NAMA_DOMAIN.test(nama)) return false;
  return !TLD_TERLARANG.has(nama.slice(nama.lastIndexOf(".") + 1));
}

function angkaIpv4(ip) {
  const bagian = String(ip).split(".");
  if (bagian.length !== 4) return null;
  const n = [];
  for (const b of bagian) {
    if (!/^\d{1,3}$/.test(b)) return null;
    const v = Number(b);
    if (v > 255) return null;
    n.push(v);
  }
  return n;
}

/**
 * Apakah alamat IP ini di luar jangkauan yang boleh dihubungi?
 *
 * Dipanggil pada hasil DNS, bukan pada apa yang diketik orang — nama domain
 * yang tampak wajar bisa saja sengaja diarahkan ke `127.0.0.1`, dan itulah
 * bentuk SSRF yang paling sering terlewat.
 */
export function ipTerlarang(ip) {
  const alamat = String(ip || "").trim().toLowerCase();
  if (!alamat) return true;

  // IPv4 yang dibungkus IPv6 (`::ffff:127.0.0.1`) adalah IPv4 yang sama.
  const bungkus = alamat.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = angkaIpv4(bungkus ? bungkus[1] : alamat);

  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true; // 0.0.0.0/8 — "host ini"
    if (a === 10) return true; // privat
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + metadata awan
    if (a === 172 && b >= 16 && b <= 31) return true; // privat
    if (a === 192 && b === 168) return true; // privat
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0/24 + dokumentasi
    if (a === 198 && (b === 18 || b === 19)) return true; // uji beban
    if (a >= 224) return true; // multicast, cadangan, broadcast
    return false;
  }

  if (!alamat.includes(":")) return true; // bukan IPv4, bukan IPv6 — tidak dikenali
  if (alamat === "::" || alamat === "::1") return true;
  if (/^f[cd]/.test(alamat)) return true; // fc00::/7 — unique local
  if (/^fe[89ab]/.test(alamat)) return true; // fe80::/10 — link local
  if (alamat.startsWith("2002:")) return true; // 6to4, bisa membungkus IPv4 privat
  if (alamat.startsWith("64:ff9b:")) return true; // NAT64, sama alasannya
  return false;
}

/**
 * Memeriksa satu alamat sebelum dihubungi.
 *
 * @returns {{ok: true, url: string}|{ok: false, alasan: string}} `alasan`
 *   adalah kunci terjemahan, bukan kalimat jadi — sama seperti seluruh galat
 *   API di proyek ini.
 */
export function urlAmanUntukAmbil(mentah) {
  const teks = String(mentah || "").trim();
  if (!teks) return { ok: false, alasan: "err.ambilUrlKosong" };

  let url;
  try {
    url = new URL(teks);
  } catch {
    return { ok: false, alasan: "err.ambilUrlSalah" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, alasan: "err.ambilUrlSkema" };
  }
  // `http://evkita.com@127.0.0.1/` dibaca orang sebagai evkita.com dan dibaca
  // peramban sebagai 127.0.0.1. Alamat yang berarti dua hal ditolak, bukan
  // ditebak.
  if (url.username || url.password) return { ok: false, alasan: "err.ambilUrlSalah" };

  const port = url.port;
  if (port && port !== "80" && port !== "443") {
    return { ok: false, alasan: "err.ambilUrlPort" };
  }
  if (!hostBoleh(url.hostname)) return { ok: false, alasan: "err.ambilUrlHost" };

  return { ok: true, url: url.href };
}
