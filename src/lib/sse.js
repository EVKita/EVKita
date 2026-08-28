/**
 * Pengurai Server-Sent Events yang bertahap.
 *
 * Bukan pustaka umum — hanya sebanyak yang dibutuhkan untuk membaca aliran
 * jawaban DeepSeek, tapi sengaja tidak tahu apa-apa soal DeepSeek supaya bisa
 * diuji sendiri tanpa jaringan.
 *
 * Dua hal yang membuatnya tidak sesederhana `split("\n\n")`:
 *
 *   1. Potongan yang datang dari jaringan **tidak** berhenti di batas peristiwa.
 *      Satu blok JSON bisa terbelah di tengah kata, jadi sisa yang belum utuh
 *      harus disimpan sampai potongan berikutnya datang.
 *   2. DeepSeek menyisipkan komentar `: keep-alive` selama server masih
 *      menyiapkan jawabannya. Baris itu sah menurut spesifikasi SSE dan harus
 *      dilewati diam-diam — kalau tidak, riset yang lama akan terbaca sebagai
 *      jawaban yang rusak.
 *
 * Sengaja JavaScript polos tanpa API khusus Node.
 */

/** Satu peristiwa: `{ event, data }`. `data` masih berupa teks. */
function uraiBlok(blok) {
  let event = "";
  const data = [];

  for (const baris of blok.split("\n")) {
    // Baris komentar (termasuk `: keep-alive`). Dilewati tanpa jejak.
    if (baris.startsWith(":")) continue;

    const titikDua = baris.indexOf(":");
    const nama = titikDua === -1 ? baris : baris.slice(0, titikDua);
    // Spesifikasi SSE membuang SATU spasi sesudah titik dua, bukan semuanya.
    let nilai = titikDua === -1 ? "" : baris.slice(titikDua + 1);
    if (nilai.startsWith(" ")) nilai = nilai.slice(1);

    if (nama === "event") event = nilai;
    else if (nama === "data") data.push(nilai);
    // `id` dan `retry` tidak dipakai di sini.
  }

  if (!event && !data.length) return null;
  return { event, data: data.join("\n") };
}

/**
 * Membuat pengurai baru. Panggil `feed()` untuk tiap potongan teks yang datang;
 * ia mengembalikan peristiwa yang sudah utuh, dan menyimpan sisanya.
 */
export function createSseParser() {
  let sisa = "";

  return {
    feed(chunk) {
      // Baris pemisah SSE boleh CRLF maupun LF. Dibakukan lebih dulu supaya
      // pencarian batas peristiwa cukup satu bentuk.
      sisa += String(chunk == null ? "" : chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      const hasil = [];
      let batas;
      while ((batas = sisa.indexOf("\n\n")) !== -1) {
        const blok = sisa.slice(0, batas);
        sisa = sisa.slice(batas + 2);
        const ev = uraiBlok(blok);
        if (ev) hasil.push(ev);
      }
      return hasil;
    },

    /**
     * Peristiwa terakhir yang tidak diakhiri baris kosong.
     *
     * Aliran yang benar selalu menutup peristiwa terakhirnya, jadi ini
     * normalnya kosong. Ia tetap ada karena aliran yang terputus di tengah
     * lebih baik menyerahkan apa yang sempat terbaca daripada membuangnya.
     */
    flush() {
      const blok = sisa.trim();
      sisa = "";
      if (!blok) return [];
      const ev = uraiBlok(blok);
      return ev ? [ev] : [];
    },
  };
}

/** `data` yang berupa JSON. Mengembalikan null kalau tidak bisa diurai. */
export function jsonData(peristiwa) {
  if (!peristiwa || !peristiwa.data) return null;
  try {
    return JSON.parse(peristiwa.data);
  } catch {
    return null;
  }
}
