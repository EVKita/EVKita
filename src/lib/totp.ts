import crypto from "node:crypto";

/**
 * Kode sekali pakai berbasis waktu (TOTP, RFC 6238).
 *
 * Ditulis sendiri, dan itu keputusan yang sama dengan yang sudah diambil dua
 * kali di repo ini: menolak `sharp` demi paket rilis 2,8 MB, dan menolak
 * framework komponen demi panel tanpa dependensi. TOTP seluruhnya adalah
 * HMAC-SHA1 di atas nomor selang waktu — Node sudah punya HMAC-SHA1, dan yang
 * tersisa hanya base32 dan aritmetika. Yang tidak ditulis sendiri adalah
 * kriptografinya.
 *
 * Parameternya sengaja yang paling lazim (SHA-1, 6 digit, 30 detik) karena
 * itulah satu-satunya kombinasi yang PASTI didukung setiap aplikasi
 * autentikator, termasuk yang tidak membaca parameter dari URI-nya.
 */

const DIGITS = 6;
const PERIODE_DETIK = 30;

/**
 * Berapa selang waktu ke belakang dan ke depan yang masih diterima.
 *
 * Satu selang di tiap arah, yaitu toleransi ±30 detik. Jam ponsel yang meleset
 * setengah menit adalah hal biasa; yang tidak biasa adalah orang mengetik enam
 * digit dalam waktu kurang dari itu. Menerima lebih banyak berarti memperlebar
 * jendela tebakan tanpa alasan.
 */
const TOLERANSI = 1;

const ABJAD32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bit = 0;
  let nilai = 0;
  let out = "";
  for (const b of buf) {
    nilai = (nilai << 8) | b;
    bit += 8;
    while (bit >= 5) {
      out += ABJAD32[(nilai >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ABJAD32[(nilai << (5 - bit)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const bersih = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bit = 0;
  let nilai = 0;
  const out: number[] = [];
  for (const ch of bersih) {
    const i = ABJAD32.indexOf(ch);
    if (i < 0) continue;
    nilai = (nilai << 5) | i;
    bit += 5;
    if (bit >= 8) {
      out.push((nilai >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(out);
}

/** Rahasia baru: 20 byte acak, panjang yang dianjurkan RFC 4226 untuk SHA-1. */
export function buatRahasia(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Kode untuk satu selang waktu tertentu. */
function kodeUntuk(rahasia: Buffer, selang: number): string {
  const pesan = Buffer.alloc(8);
  // Nomor selang ditulis sebagai bilangan 64-bit big-endian. Bagian atasnya
  // baru terpakai setelah tahun 10.000-an, tapi menuliskannya nol secara
  // eksplisit lebih jelas daripada mengandalkan buffer yang kebetulan kosong.
  pesan.writeUInt32BE(Math.floor(selang / 0x100000000), 0);
  pesan.writeUInt32BE(selang >>> 0, 4);

  const hmac = crypto.createHmac("sha1", rahasia).update(pesan).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const angka =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(angka % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Kode yang berlaku sekarang. Dipakai pengujian, bukan jalur masuk. */
export function kodeSekarang(rahasiaBase32: string, sekarang = Date.now()): string {
  return kodeUntuk(base32Decode(rahasiaBase32), Math.floor(sekarang / 1000 / PERIODE_DETIK));
}

/**
 * Apakah kode ini benar?
 *
 * Perbandingannya `timingSafeEqual`, bukan `===`. Enam digit memang bisa
 * ditebak dalam sejuta percobaan — yang menahannya adalah pembatasan laju di
 * halaman masuk — tapi membocorkan berapa digit pertama yang sudah benar lewat
 * lama pembandingan akan memangkas sejuta itu menjadi enam puluh.
 */
export function periksaKode(rahasiaBase32: string, kode: unknown, sekarang = Date.now()): boolean {
  const bersih = String(kode ?? "").replace(/\D/g, "");
  if (bersih.length !== DIGITS) return false;

  const rahasia = base32Decode(rahasiaBase32);
  if (!rahasia.length) return false;

  const selang = Math.floor(sekarang / 1000 / PERIODE_DETIK);
  let cocok = false;
  for (let d = -TOLERANSI; d <= TOLERANSI; d++) {
    const harap = Buffer.from(kodeUntuk(rahasia, selang + d), "utf8");
    const diberi = Buffer.from(bersih, "utf8");
    // Seluruh selang tetap diperiksa walau sudah ketemu: berhenti lebih awal
    // membuat lama pemeriksaan bergantung pada selang mana yang cocok.
    if (harap.length === diberi.length && crypto.timingSafeEqual(harap, diberi)) cocok = true;
  }
  return cocok;
}

/**
 * Alamat `otpauth://` untuk dipindai atau dimasukkan ke aplikasi autentikator.
 *
 * `issuer` muncul dua kali — di label dan sebagai parameter — dan itu memang
 * yang dianjurkan: aplikasi lama membaca label, yang baru membaca parameter.
 */
export function otpauthUri(rahasiaBase32: string, akun: string, issuer = "EVKita"): string {
  const label = encodeURIComponent(`${issuer}:${akun}`);
  const q = new URLSearchParams({
    secret: rahasiaBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIODE_DETIK),
  });
  return `otpauth://totp/${label}?${q}`;
}

/** Rahasia dipotong berkelompok empat supaya bisa disalin dengan mata. */
export function rahasiaTerbaca(rahasiaBase32: string): string {
  return String(rahasiaBase32 || "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Abjad kode cadangan — bukan base32.
 *
 * Kode ini dibacakan lewat telepon, disalin dari kertas, dan diketik ulang
 * berbulan-bulan setelah dibuat, jadi karakter yang bentuknya bertabrakan
 * dibuang seluruhnya: I dan L (mirip 1), O (mirip 0), U (mudah tertukar
 * dengan V saat ditulis tangan), serta angka 0 dan 1 itu sendiri.
 *
 * Bebas dipilih karena kode cadangan tidak pernah di-decode kembali menjadi
 * byte — ia dibandingkan sebagai teks lewat hash.
 */
const ABJAD_CADANGAN = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/**
 * Kode cadangan: delapan kode sekali pakai untuk ketika ponselnya hilang.
 *
 * Tanpa ini, dua faktor bukan lapisan keamanan melainkan satu titik kegagalan
 * baru — ponsel yang hilang berarti akun yang hilang, dan satu-satunya jalan
 * masuk kembali adalah menyunting `data/users.json` lewat SSH.
 */
export function buatKodeCadangan(jumlah = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < jumlah; i++) {
    let kode = "";
    // `randomInt` menolak sisa pembagian yang tidak rata, jadi tiap huruf
    // benar-benar sama peluangnya — `% panjang` pada byte acak tidak.
    for (let n = 0; n < 10; n++) kode += ABJAD_CADANGAN[crypto.randomInt(ABJAD_CADANGAN.length)];
    out.push(`${kode.slice(0, 5)}-${kode.slice(5)}`);
  }
  return out;
}
