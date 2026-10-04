import type { APIRoute } from "astro";
import { sessionUserId } from "../../../lib/auth";
import { MEMBER_COOKIE } from "../../../lib/member.js";
import { getEnv } from "../../../lib/env";
import { json } from "../../../lib/api";
import { checkLimit, recordFailure, clientKey } from "../../../lib/ratelimit";
import { readContent } from "../../../lib/store";
import { hanyaTayang } from "../../../lib/tayang.js";
import { normalizePubLocale, PUB_COOKIE } from "../../../lib/i18n/pub.js";
import {
  tanyaGemini,
  pilihKonteks,
  pilihTampil,
  cariDisebut,
  ringkasKonteks,
  susunInstruksi,
  MODEL_BAWAAN_GEMINI,
} from "../../../lib/gemini-tanya";
import {
  catatPertanyaan,
  kembalikanPertanyaan,
  galatPertanyaan,
  TANYA_KUOTA_HARIAN,
} from "../../../lib/tanya.js";

/**
 * Tanya EVKita: chatbot publik di hero beranda, dijawab Gemini.
 *
 * Terbuka untuk umum — tanpa wajib masuk. Remnya berlapis karena setiap
 * pertanyaan memotong saldo Gemini pemilik situs:
 *
 * - Kuota harian per identitas (`tanya.js`): anggota yang masuk memakai id-nya,
 *   pengunjung anonim memakai alamat IP-nya.
 * - Pembatas laju sesaat (`ratelimit.ts`) supaya skrip tidak bisa memborong
 *   dalam semenit.
 * - Kunci Gemini TIDAK PERNAH keluar dari endpoint ini. Peramban hanya
 *   mengirim pertanyaan dan menerima jawaban.
 * - Tanpa riwayat: tiap pertanyaan berdiri sendiri. Tidak ada state
 *   percakapan di server, tidak ada yang perlu disimpan.
 * - Seluruh katalog yang TAYANG diselipkan ke instruksi sebagai satu baris
 *   ringkas per kendaraan (yang disebut/cocok dengan pertanyaan di urutan
 *   teratas). Katalognya kecil — puluhan baris — jadi model bisa
 *   merekomendasikan dari data situs sendiri walaupun pertanyaannya tidak
 *   menyebut nama, mis. "SUV di bawah 500 juta". Di luar itu model boleh
 *   menjawab umum — dan wajib mengaku kalau tidak tahu (`susunInstruksi()`).
 * - Kartu ber-foto (maksimal 4) dipilih SETELAH jawaban datang: kendaraan yang
 *   disebut di pertanyaan, yang cocok kata, lalu yang disebut di jawaban AI.
 *   Hanya kendaraan katalog yang bisa jadi kartu (`pilihTampil()`).
 */

function konteksDari(content: any, pertanyaan: string) {
  /* `kind` ditempel per koleksi di sini (bukan mengandalkan hasil baca) —
     salah koleksi berarti tautan kartu mengarah ke halaman yang salah. */
  const rakit = (daftar: any, kind: string) =>
    (daftar || []).filter(hanyaTayang()).map((v: any) => ({
      id: String(v.id || ""),
      kind,
      brand: v.brand || "",
      name: v.name || "",
      bodyType: v.bodyType || "",
      rangeKm: v.rangeKm ?? null,
      batteryKwh: v.batteryKwh ?? null,
      price: v.price ?? null,
      priceText: v.priceText || "",
      image: v.image || "",
      year: Number.isFinite(Number(v.year)) && v.year ? Number(v.year) : null,
    }));
  const semua = [...rakit(content.cars, "mobil"), ...rakit(content.motors, "motor")];
  /* Yang relevan di urutan teratas, sisanya menyusul — model cenderung
     memperhatikan baris awal lebih dulu. Dibatasi supaya katalog yang kelak
     membesar tidak membengkakkan biaya per pertanyaan. */
  const depan = [...cariDisebut(semua, pertanyaan, 12), ...pilihKonteks(semua, pertanyaan, 12)];
  const urut = [...new Set([...depan, ...semua])].slice(0, MAKS_BARIS_KONTEKS);
  return { teks: ringkasKonteks(urut), semua };
}

/** Batas baris katalog di instruksi — ±20 token per baris. */
const MAKS_BARIS_KONTEKS = 120;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  /* Tanpa wajib masuk: anggota memakai id-nya, anonim memakai alamat IP.
     Keduanya berbagi kuota harian yang sama besar. */
  const anggotaId = sessionUserId(cookies.get(MEMBER_COOKIE)?.value);
  const kunciIp = clientKey(request, clientAddress);
  const identitas = anggotaId ? `anggota:${anggotaId}` : kunciIp;

  /* Rem sesaat: alamat DAN anggota sekaligus kalau masuk, supaya memalsukan
     alamat saja tidak cukup untuk lewat. Pola yang sama dengan login panel. */
  const kunciLaju = anggotaId ? [kunciIp, `tanya:${anggotaId}`] : [kunciIp];
  const laju = checkLimit(kunciLaju);
  if (laju.blocked) {
    return json({ ok: false, errorKey: "err.tanya.terlaluSering", detik: laju.retryAfter }, 429);
  }

  let badan: any;
  try {
    badan = await request.json();
  } catch {
    return json({ ok: false, errorKey: "err.tanya.kosong" }, 400);
  }
  const pertanyaan = String(badan?.pertanyaan || "").trim();
  const galat = galatPertanyaan(pertanyaan);
  if (galat) {
    recordFailure(kunciLaju);
    return json({ ok: false, errorKey: galat }, 400);
  }

  // Kunci diperiksa SEBELUM kuota dicatat: chatbot yang belum aktif tidak
  // boleh memakan jatah pertanyaan pengunjung.
  const kunciApi = getEnv("GEMINI_API_KEY", "");
  if (!kunciApi) return json({ ok: false, errorKey: "err.tanya.belumSiap" }, 503);
  const kuota = catatPertanyaan(identitas, new Date());
  if (!kuota.boleh) {
    return json(
      { ok: false, errorKey: "err.tanya.kuotaHabis", sisa: 0, kuota: TANYA_KUOTA_HARIAN },
      403
    );
  }

  const lang = normalizePubLocale(
    badan?.lang || cookies.get(PUB_COOKIE)?.value || "id"
  );
  const content = readContent();
  const konteks = konteksDari(content, pertanyaan);
  const instruksi = susunInstruksi(lang, konteks.teks);

  const hasil = await tanyaGemini({
    apiKey: kunciApi,
    model: getEnv("GEMINI_MODEL", "") || MODEL_BAWAAN_GEMINI,
    pertanyaan,
    instruksi,
    // Kalau model utama tumbang, coba model cadangan — pengunjung lebih baik
    // dijawab model lain daripada membaca "AI sedang bermasalah".
    cadangan: true,
  });

  if (!hasil.ok) {
    if (hasil.errorKey === "err.tanya.sibuk") recordFailure(kunciLaju);
    // Jawaban tidak pernah sampai — jatah pertanyaannya dikembalikan.
    const sisa = kembalikanPertanyaan(identitas, new Date());
    return json({ ok: false, errorKey: hasil.errorKey, sisa, kuota: TANYA_KUOTA_HARIAN }, 502);
  }

  const kandidat = pilihTampil(konteks.semua, pertanyaan, 4, hasil.teks);
  return json({ ok: true, jawaban: hasil.teks, kandidat, sisa: kuota.sisa, kuota: TANYA_KUOTA_HARIAN });
};
