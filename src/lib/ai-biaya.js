/**
 * Biaya riset AI: tarif DeepSeek, jam sibuk, dan perkiraan rupiahnya.
 *
 * Angka di sini adalah satu-satunya alasan pemilih model di panel bisa
 * menyebut harga. Tanpa itu, memilih antara `flash` dan `pro` berarti memilih
 * antara dua nama yang tidak berarti apa-apa.
 *
 * Semua tarif dari api-docs.deepseek.com/quick_start/pricing, dibaca
 * 28 Agustus 2026. **Tarif DeepSeek berubah cukup sering** — kalau angkanya
 * terasa meleset jauh dari tagihan yang sebenarnya, di sinilah tempat
 * memperbaruinya, dan tidak ada tempat kedua.
 *
 * Sengaja JavaScript polos tanpa API khusus Node.
 */

/** USD per 1 juta token, tarif SIBUK. Tarif sepi persis separuhnya. */
export const TARIF = {
  "deepseek-v4-flash": { masukCache: 0.014, masuk: 0.44, keluar: 1.32 },
  "deepseek-v4-pro": { masukCache: 0.044, masuk: 1.32, keluar: 3.96 },
  "deepseek-v4-flash-vision-exp": { masukCache: 0.014, masuk: 0.44, keluar: 1.32 },
};

export const MODEL_BAWAAN = "deepseek-v4-flash";

/** Model yang boleh dipilih dari panel, urut dari yang termurah. */
export const MODEL_PILIHAN = ["deepseek-v4-flash", "deepseek-v4-pro"];

/**
 * Kurs yang dipakai untuk MENAMPILKAN perkiraan dalam rupiah.
 *
 * Ditulis sebagai satu angka tetap, bukan diambil dari layanan kurs: yang
 * dibutuhkan pembaca panel adalah "ini sekitar berapa ribu rupiah", dan
 * ketelitian dua desimal tidak menambah apa pun pada keputusan itu. Tagihan
 * yang sesungguhnya tetap dalam dolar di akun DeepSeek.
 */
export const KURS_USD = 16_500;

/**
 * Apakah saat ini jam sibuk DeepSeek?
 *
 * Jam sibuk: 01.00–04.00 dan 06.00–10.00 UTC, Senin sampai Jumat. Sisanya
 * tarif sepi, setengah harga.
 *
 * Dalam WIB itu berarti **08.00–11.00 dan 13.00–17.00** — persis jam kerja di
 * Indonesia. Jadi tarif yang berlaku saat panel dibuka hampir selalu yang
 * mahal, dan itu justru alasan angkanya perlu ditampilkan.
 *
 * @param {Date} sekarang Diberikan pemanggil, bukan dibaca di sini, supaya
 *   fungsinya bisa diuji dengan hasil yang tetap.
 */
export function jamSibuk(sekarang) {
  const hari = sekarang.getUTCDay(); // 0 Minggu … 6 Sabtu
  if (hari === 0 || hari === 6) return false;
  const jam = sekarang.getUTCHours();
  return (jam >= 1 && jam < 4) || (jam >= 6 && jam < 10);
}

function tarifBerlaku(model, sekarang) {
  const dasar = TARIF[model] || TARIF[MODEL_BAWAAN];
  if (jamSibuk(sekarang)) return dasar;
  return { masukCache: dasar.masukCache / 2, masuk: dasar.masuk / 2, keluar: dasar.keluar / 2 };
}

/**
 * Biaya NYATA satu riset, dari objek `usage` yang dikembalikan DeepSeek.
 *
 * @param {{ input_tokens?: number, output_tokens?: number,
 *           input_tokens_details?: { cached_tokens?: number } }} usage
 * @returns {{ usd: number, rupiah: number }}
 */
export function biayaDari(usage, model, sekarang) {
  const t = tarifBerlaku(model, sekarang);
  const masukTotal = Number(usage?.input_tokens || 0);
  const masukCache = Math.min(Number(usage?.input_tokens_details?.cached_tokens || 0), masukTotal);
  const masukBaru = Math.max(0, masukTotal - masukCache);
  const keluar = Number(usage?.output_tokens || 0);

  const usd =
    (masukBaru / 1e6) * t.masuk + (masukCache / 1e6) * t.masukCache + (keluar / 1e6) * t.keluar;

  return { usd, rupiah: Math.round(usd * KURS_USD) };
}

/**
 * Perkiraan pemakaian token satu riset, per mode.
 *
 * Angka kasar dan memang begitu adanya — biaya sebenarnya baru diketahui
 * setelah risetnya jalan, dan panel menggantinya dengan angka nyata begitu
 * jawabannya datang. Yang dibutuhkan sebelum itu hanya besaran yang cukup
 * benar untuk memutuskan "pakai flash atau pro".
 */
export const PERKIRAAN_TOKEN = {
  /** Riset dari nol: sepuluh putaran pencarian. */
  lengkap: { masuk: 100_000, cache: 300_000, keluar: 20_000 },
  /** Melengkapi field yang kosong: lingkupnya lebih sempit. */
  lengkapi: { masuk: 70_000, cache: 200_000, keluar: 12_000 },
  /** Cek harga: dua-tiga putaran, tanpa penalaran dalam. */
  harga: { masuk: 25_000, cache: 60_000, keluar: 3_000 },
};

/** Perkiraan biaya SEBELUM riset dijalankan, untuk ditampilkan di tombol. */
export function perkiraanBiaya(mode, model, sekarang) {
  const p = PERKIRAAN_TOKEN[mode] || PERKIRAAN_TOKEN.lengkap;
  return biayaDari(
    {
      input_tokens: p.masuk + p.cache,
      input_tokens_details: { cached_tokens: p.cache },
      output_tokens: p.keluar,
    },
    model,
    sekarang
  );
}
