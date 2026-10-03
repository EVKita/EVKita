import type { APIRoute } from "astro";
import { sessionUserId } from "../../../lib/auth";
import { MEMBER_COOKIE } from "../../../lib/member.js";
import { getEnv } from "../../../lib/env";
import { json } from "../../../lib/api";
import { checkLimit, recordFailure, clientKey } from "../../../lib/ratelimit";
import { readContent } from "../../../lib/store";
import { hanyaTayang } from "../../../lib/tayang.js";
import { normalizePubLocale } from "../../../lib/i18n/pub.js";
import {
  tanyaGemini,
  pilihKonteks,
  ringkasKonteks,
  susunInstruksi,
  MODEL_BAWAAN_GEMINI,
} from "../../../lib/gemini-tanya";
import {
  catatPertanyaan,
  galatPertanyaan,
  TANYA_KUOTA_HARIAN,
} from "../../../lib/tanya.js";

/**
 * Tanya EVKita: chatbot publik di hero beranda, dijawab Gemini.
 *
 * Aturan yang memegang berkas ini — semuanya lahir dari satu fakta: setiap
 * pertanyaan memotong saldo pemilik situs.
 *
 * - HANYA anggota yang sudah masuk boleh bertanya. Tanpa cookie anggota yang
 *   sah, jawabannya 401 sebelum satu pun token dibeli.
 * - Kuota harian per anggota (`tanya.js`), ditambah pembatas laju sesaat
 *   (`ratelimit.ts`) supaya skrip tidak bisa memborong dalam semenit.
 * - Kunci Gemini TIDAK PERNAH keluar dari endpoint ini. Peramban hanya
 *   mengirim pertanyaan dan menerima jawaban.
 * - Tanpa riwayat: tiap pertanyaan berdiri sendiri. Tidak ada state
 *   percakapan di server, tidak ada yang perlu disimpan.
 * - Konteks katalog (maksimal 8 kendaraan yang cocok kata) diselipkan ke
 *   instruksi supaya angka situs sendiri lebih diutamakan daripada ingatan
 *   model. Di luar itu model boleh menjawab umum — dan wajib mengaku kalau
 *   tidak tahu (lihat `susunInstruksi()` di `gemini.ts`).
 */

function konteksDari(content: any, pertanyaan: string) {
  const semua = [...(content.cars || []), ...(content.motors || [])].filter(hanyaTayang());
  const ringkas = semua.map((v: any) => ({
    brand: v.brand || "",
    name: v.name || "",
    bodyType: v.bodyType || "",
    rangeKm: v.rangeKm ?? null,
    batteryKwh: v.batteryKwh ?? null,
    price: v.price ?? null,
    priceText: v.priceText || "",
  }));
  return ringkasKonteks(pilihKonteks(ringkas, pertanyaan));
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const anggotaId = sessionUserId(cookies.get(MEMBER_COOKIE)?.value);
  if (!anggotaId) return json({ ok: false, errorKey: "err.tanya.perluMasuk" }, 401);

  /* Rem sesaat: alamat DAN anggota sekaligus, supaya memalsukan alamat saja
     tidak cukup untuk lewat. Pola yang sama dengan login panel. */
  const kunciLaju = [clientKey(request, clientAddress), `tanya:${anggotaId}`];
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

  const kuota = catatPertanyaan(anggotaId, new Date());
  if (!kuota.boleh) {
    return json(
      { ok: false, errorKey: "err.tanya.kuotaHabis", sisa: 0, kuota: TANYA_KUOTA_HARIAN },
      403
    );
  }

  const kunciApi = getEnv("GEMINI_API_KEY", "");
  if (!kunciApi) return json({ ok: false, errorKey: "err.tanya.belumSiap" }, 503);

  const lang = normalizePubLocale(
    badan?.lang || cookies.get("evkita_lang")?.value || "id"
  );
  const content = readContent();
  const instruksi = susunInstruksi(lang, konteksDari(content, pertanyaan));

  const hasil = await tanyaGemini({
    apiKey: kunciApi,
    model: getEnv("GEMINI_MODEL", "") || MODEL_BAWAAN_GEMINI,
    pertanyaan,
    instruksi,
  });

  if (!hasil.ok) {
    if (hasil.errorKey === "err.tanya.sibuk") recordFailure(kunciLaju);
    return json({ ok: false, errorKey: hasil.errorKey, sisa: kuota.sisa }, 502);
  }

  return json({ ok: true, jawaban: hasil.teks, sisa: kuota.sisa, kuota: TANYA_KUOTA_HARIAN });
};
