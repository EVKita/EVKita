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
  pilihTampil,
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
 * - Katalog dicari DULU di situs sendiri: yang cocok (maksimal 4) dikirim
 *   sebagai kartu pilihan di atas jawaban AI; kalau tidak ada yang cocok,
 *   hanya jawaban AI yang tampil. Konteks katalog (maksimal 8 kendaraan yang
 *   cocok kata) juga diselipkan ke instruksi supaya angka situs sendiri lebih
 *   diutamakan daripada ingatan model. Di luar itu model boleh menjawab umum
 *   — dan wajib mengaku kalau tidak tahu (lihat `susunInstruksi()`).
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
    }));
  const ringkas = [...rakit(content.cars, "mobil"), ...rakit(content.motors, "motor")];
  return {
    teks: ringkasKonteks(pilihKonteks(ringkas, pertanyaan)),
    kandidat: pilihTampil(ringkas, pertanyaan),
  };
}

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

  const kuota = catatPertanyaan(identitas, new Date());
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
  const konteks = konteksDari(content, pertanyaan);
  const instruksi = susunInstruksi(lang, konteks.teks);

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

  return json({ ok: true, jawaban: hasil.teks, kandidat: konteks.kandidat, sisa: kuota.sisa, kuota: TANYA_KUOTA_HARIAN });
};
