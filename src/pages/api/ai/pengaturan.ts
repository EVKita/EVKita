import type { APIRoute } from "astro";
import { currentUser } from "../../../lib/auth";
import { can } from "../../../lib/users";
import { getEnv, writeEnvFile } from "../../../lib/env";
import { logActivity } from "../../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../../lib/api";
import { checkLimit, clearLimit, clientKey, recordFailure } from "../../../lib/ratelimit";
import { fetchBalance, keyLooksValid, keyTail, type BalanceResult } from "../../../lib/deepseek";

/**
 * Pengaturan AI: memasang, mengganti, dan menghapus kunci API DeepSeek.
 *
 * Aturan yang memegang seluruh berkas ini:
 *
 *   Kunci masuk lewat sini, dan TIDAK PERNAH keluar lagi.
 *
 * Tidak ada satu pun jawaban dari endpoint ini yang memuat kuncinya. Yang
 * dikembalikan hanya "terpasang atau belum", empat karakter terakhirnya, dan
 * saldo akunnya. Konsekuensinya kunci tidak pernah sampai ke peramban — jadi
 * ia tidak ada di DOM, tidak ada di riwayat permintaan, dan tidak bisa dibaca
 * ekstensi peramban siapa pun.
 *
 * Kunci disimpan di `.env` lewat `writeEnvFile()` — berkas yang sama yang sudah
 * dipakai wizard `/install`, dan yang sudah ikut dicadangkan `deploy.sh`, jadi
 * memperbarui versi tidak menghapusnya. `getEnv()` membacanya saat dipanggil,
 * bukan saat aplikasi mulai, jadi kunci yang baru disimpan langsung terpakai
 * tanpa perlu memuat ulang PM2.
 */

const KEY_NAME = "DEEPSEEK_API_KEY";

/**
 * Saldo yang sudah dibaca, disimpan sebentar.
 *
 * Tanpa ini, setiap kali seseorang berpindah ke tab AI kita memanggil DeepSeek
 * lagi — dan berpindah tab adalah hal yang orang lakukan puluhan kali dalam
 * satu sesi. Satu menit cukup untuk membuat angkanya tetap terasa hidup tanpa
 * membanjiri siapa pun; tombol "Perbarui" melewati cache ini kalau memang
 * angkanya sedang ditunggu.
 */
const BALANCE_TTL_MS = 60 * 1000;
let balanceCache: { at: number; forKey: string; result: BalanceResult } | null = null;

async function readBalance(key: string, fresh: boolean): Promise<BalanceResult> {
  const now = Date.now();
  if (
    !fresh &&
    balanceCache &&
    balanceCache.forKey === key &&
    now - balanceCache.at < BALANCE_TTL_MS
  ) {
    return balanceCache.result;
  }
  const result = await fetchBalance(key);
  balanceCache = { at: now, forKey: key, result };
  return result;
}

/** Bentuk yang dikirim ke panel. Perhatikan: tidak ada field untuk kuncinya. */
function statePayload(key: string, balance: BalanceResult | null) {
  const terpasang = !!key;
  const saldo =
    balance && balance.ok
      ? {
          tersedia: balance.available,
          baris: balance.balances.map((b) => ({
            mataUang: b.currency,
            total: b.total,
            hadiah: b.granted,
            isiUlang: b.toppedUp,
          })),
        }
      : null;

  return {
    ok: true,
    terpasang,
    ekor: terpasang ? keyTail(key) : "",
    saldo,
    saldoErrorKey: balance && !balance.ok ? balance.errorKey : "",
    diperiksaPada: balance ? new Date().toISOString() : "",
  };
}

export const GET: APIRoute = async ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();

  const key = getEnv(KEY_NAME, "");
  if (!key) return json(statePayload("", null));

  const balance = await readBalance(key, url.searchParams.get("segar") === "1");
  return json(statePayload(key, balance));
};

export const PUT: APIRoute = async ({ request, cookies, clientAddress }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();

  /*
   * Pembatasan laju dipasang pada alamat DAN id pengguna sekaligus, sama
   * seperti halaman masuk. Tanpa ini, endpoint yang menjawab "kunci ini sah
   * atau tidak" adalah alat penebak kunci yang sempurna — dan setiap tebakan
   * membebani DeepSeek atas nama kita, bukan atas nama penebaknya.
   */
  const limitKeys = [clientKey(request, clientAddress), `ai-key:${me.id}`];
  const limit = checkLimit(limitKeys);
  if (limit.blocked) {
    return apiError("err.ai.terlaluSering", 429, { detik: limit.retryAfter });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const apiKey = String(body?.apiKey || "").trim();
  if (!apiKey) return apiError("err.ai.belumAdaKunci");
  if (!keyLooksValid(apiKey)) {
    recordFailure(limitKeys);
    return apiError("err.ai.bentukKunci");
  }

  /*
   * Diuji LEBIH DULU, baru disimpan. Urutan ini yang membedakan halaman ini
   * dari sekadar kotak teks: kunci yang salah ketik gagal sekarang, di depan
   * orang yang baru saja menempelkannya dan masih ingat dari mana ia berasal —
   * bukan tiga hari kemudian, di tengah pekerjaan orang lain, sebagai galat
   * yang tidak ada hubungannya dengan apa pun yang sedang mereka lakukan.
   */
  const balance = await fetchBalance(apiKey);
  if (!balance.ok) {
    // Hanya kunci yang DITOLAK yang dihitung sebagai percobaan gagal. DeepSeek
    // yang sedang bermasalah atau jaringan yang putus bukan kesalahan orang
    // yang menyimpan, dan tidak boleh membuat mereka terkunci.
    if (balance.errorKey === "err.ai.kunciSalah") recordFailure(limitKeys);
    return apiError(balance.errorKey, balance.errorKey === "err.ai.kunciSalah" ? 400 : 502);
  }

  writeEnvFile({ [KEY_NAME]: apiKey });
  balanceCache = { at: Date.now(), forKey: apiKey, result: balance };
  clearLimit(limitKeys);

  logActivity(me, "ai.keySet");

  return json(statePayload(apiKey, balance));
};

export const DELETE: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "ai")) return forbidden();

  if (!getEnv(KEY_NAME, "")) return apiError("err.ai.belumAdaKunci");

  // `null` menghapus barisnya dari `.env`, bukan menulisnya sebagai nilai
  // kosong. Lihat catatan di `writeEnvFile()`.
  writeEnvFile({ [KEY_NAME]: null });
  balanceCache = null;
  logActivity(me, "ai.keyRemoved");

  return json(statePayload("", null));
};
