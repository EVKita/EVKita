import type { APIRoute } from "astro";
import { ruteJalan } from "../../lib/rute";
import { dariTeks } from "../../lib/geokode";
import { regionDariParam } from "../../lib/region.js";
import {
  bawaanRuteTampil,
  hitungBiayaRute,
  metrikRute,
  uangHalusTeks,
  jarakTeks,
} from "../../lib/kalk-region.js";
import { menitKeTeks } from "../../lib/pengisian.js";
import { makePubT, normalizePubLocale } from "../../lib/i18n/pub.js";

/**
 * Perkiraan rute: jarak jalan, waktu tempuh, dan biaya listrik vs bensin.
 *
 * Dikerjakan di SERVER, bukan di peramban, karena tiga hal:
 *  - penyedia rute dipanggil dari satu tempat (kunci dan batas waktunya tidak
 *    pernah sampai ke klien),
 *  - mata uang dan angka bawaannya diformat dengan fungsi yang sama dengan
 *    kalkulator lain — tidak ada format kedua yang bisa menyimpang,
 *  - hasilnya bisa di-cache sebentar, jadi rute yang sama tidak menagih kuota
 *    penyedia dua kali.
 *
 * Tanpa kunci API: OSRM publik. Kalau gagal, `ruteJalan()` menjawab perkiraan
 * garis lurus — endpoint tetap 200 dengan `sumber: "perkiraan"`.
 */

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAKS = 300;
const cache = new Map<string, { pada: number; data: unknown }>();

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function angkaAtau(v: string | null, bawaan: number): number {
  if (v === null || v.trim() === "") return bawaan;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : bawaan;
}

function simpanCache(kunci: string, data: unknown) {
  const sekarang = Date.now();
  for (const [k, isi] of cache) {
    if (sekarang - isi.pada > CACHE_MS) cache.delete(k);
  }
  cache.set(kunci, { pada: sekarang, data });
  while (cache.size > CACHE_MAKS) {
    const tertua = cache.keys().next().value;
    if (tertua === undefined) break;
    cache.delete(tertua);
  }
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams;
  const asal = dariTeks(q.get("from") || "");
  const tujuan = dariTeks(q.get("to") || "");
  if (!asal || !tujuan) return json({ ok: false, error: "koordinat" }, 400);

  const region = regionDariParam(q.get("region"));
  const bawaan = bawaanRuteTampil(region);

  /* Isian pembaca dalam satuan edisinya (MPG, $/gal untuk Amerika) lalu
     dijadikan metrik oleh `metrikRute()` — halaman tidak perlu tahu
     konversinya. */
  const metrik = metrikRute(region, {
    konsumsiKwh100: angkaAtau(q.get("ev"), bawaan.konsumsiKwh100),
    konsumsiBbm100: angkaAtau(q.get("bbm"), bawaan.konsumsiBbm100),
    hargaBbm: angkaAtau(q.get("hb"), bawaan.hargaBbm),
    tarif: angkaAtau(q.get("tarif"), bawaan.tarif),
  });

  const kunci = [
    region,
    asal.lat.toFixed(3),
    asal.lng.toFixed(3),
    tujuan.lat.toFixed(3),
    tujuan.lng.toFixed(3),
    metrik.konsumsiKwh100.toFixed(3),
    metrik.konsumsiBbm100.toFixed(3),
    metrik.hargaBbmPerLiter.toFixed(3),
    metrik.tarif.toFixed(3),
  ].join("|");

  const tersimpan = cache.get(kunci);
  if (tersimpan && Date.now() - tersimpan.pada <= CACHE_MS) {
    return json(tersimpan.data, 200);
  }

  const hasil = await ruteJalan(asal, tujuan, { region });
  const biaya = hitungBiayaRute(hasil.jarakKm, metrik);
  const lang = normalizePubLocale(q.get("lang"));
  const t = makePubT(lang);

  const data = {
    ok: true,
    jarakKm: hasil.jarakKm,
    jarakTeks: jarakTeks(hasil.jarakKm, region),
    menit: hasil.menit,
    menitTeks: menitKeTeks(hasil.menit, t),
    sumber: hasil.sumber,
    biaya: {
      listrik: uangHalusTeks(region, biaya.listrik),
      bensin: uangHalusTeks(region, biaya.bensin),
      hemat: uangHalusTeks(region, Math.abs(biaya.hemat)),
      /* Hemat bisa negatif di edisi bertarif listrik mahal — kalau begitu
         yang tampil tetap angka, tapi halaman memakai label "lebih mahal". */
      hematNegatif: biaya.hemat < 0,
    },
    atribusi: hasil.sumber === "rute",
  };

  simpanCache(kunci, data);
  return json(data, 200);
};
