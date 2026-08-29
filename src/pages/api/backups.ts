import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can } from "../../lib/users";
import { listBackups, readBackup, readContent, writeContent } from "../../lib/store";
import { logActivity, logContentChanges } from "../../lib/activity";
import { bandingkanKonten, fieldBerbeda, judulItem, KOLEKSI } from "../../lib/perubahan";
import { ringkasRiwayat } from "../../lib/riwayat.js";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";

/** Berapa cadangan terbaru yang ikut dibaca isinya. Sisanya cukup nama & waktunya. */
const RINGKAS_MAKS = 30;

const jumlahIsi = (snapshot: any) =>
  Object.fromEntries(KOLEKSI.map((col) => [col, Array.isArray(snapshot?.[col]) ? snapshot[col].length : 0]));

/**
 * Daftar cadangan, beserta cukup keterangan untuk memilihnya.
 *
 * Sebelumnya jawabannya hanya nama, waktu, dan ukuran berkas. Memilih cadangan
 * karena itu adalah menebak — "84 KB, kemarin 14.20" tidak memberi tahu siapa
 * pun apakah di dalamnya ada mobil yang dicari. Dan pemulihan adalah operasi
 * yang mengganti SEGALANYA, jadi ini justru layar yang paling tidak boleh
 * mengandalkan tebakan.
 */
function daftar() {
  const semua = listBackups();
  return semua.map((b, i) => {
    if (i >= RINGKAS_MAKS) return b;
    const isi = readBackup(b.name);
    return isi ? { ...b, isi: jumlahIsi(isi) } : b;
  });
}

export const GET: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "backups")) return forbidden();

  const q = url.searchParams;
  const nama = String(q.get("nama") || "");
  const col = String(q.get("col") || "");
  const id = String(q.get("id") || "");

  /* Riwayat satu item: setiap cadangan yang memuat versi BERBEDA dari item ini. */
  if (col && id) {
    if (!KOLEKSI.includes(col as any)) return apiError("err.previewBadTarget", 400);
    const sekarang = (readContent()[col] || []).find((x: any) => String(x.id) === id) || null;

    const versi = listBackups()
      .slice(0, RINGKAS_MAKS)
      .map((b) => {
        const isi = readBackup(b.name);
        const item = isi ? (isi[col] || []).find((x: any) => String(x.id) === id) : null;
        return item ? { name: b.name, time: b.time, item } : null;
      })
      .filter(Boolean) as { name: string; time: string; item: any }[];

    return json({
      ok: true,
      sekarang,
      versi: ringkasRiwayat(versi).map((v) => ({
        ...v,
        // Field yang berbeda dari isi SEKARANG — itu pertanyaan yang dibawa
        // orang ke layar ini, bukan "apa bedanya dengan cadangan sebelumnya".
        beda: sekarang ? fieldBerbeda(v.item, sekarang) : [],
      })),
    });
  }

  /* Perbandingan satu cadangan dengan isi sekarang. */
  if (nama) {
    const isi = readBackup(nama);
    if (!isi) return apiError("backups.failTitle", 404);
    // Mengunduh SATU cadangan tertentu, bukan hanya "isi sekarang". Menyimpan
    // salinan versi lama sebelum memulihkannya adalah hal paling wajar yang
    // dilakukan orang di layar ini, dan selama ini tidak ada jalannya.
    if (q.get("unduh")) return json({ ok: true, content: isi });
    return json({ ok: true, isi: jumlahIsi(isi), perubahan: bandingkanKonten(isi, readContent()) });
  }

  return json({ ok: true, backups: daftar() });
};

/**
 * Memulihkan — seluruh dokumen, atau satu item saja.
 *
 * Yang kedua itu yang baru, dan ia yang sebenarnya paling sering dibutuhkan.
 * Memulihkan seluruh dokumen untuk membetulkan satu mobil berarti ikut
 * membuang setiap perubahan orang lain sejak cadangan itu dibuat.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "backups")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const name = String(body?.name || "");
  const snapshot = readBackup(name);
  if (!snapshot) return apiError("backups.failTitle", 404);

  const col = String(body?.col || "");
  const id = String(body?.id || "");

  if (col && id) {
    if (!KOLEKSI.includes(col as any)) return apiError("err.previewBadTarget", 400);
    const lama = (snapshot[col] || []).find((x: any) => String(x.id) === id);
    if (!lama) return apiError("err.previewBadTarget", 404);

    const sekarang = readContent();
    const daftarKini = Array.isArray(sekarang[col]) ? [...sekarang[col]] : [];
    const idx = daftarKini.findIndex((x: any) => String(x.id) === id);
    // Item yang sudah terlanjur dihapus dikembalikan ke ujung daftar; yang
    // masih ada ditimpa di tempatnya, supaya urutan katalog tidak ikut berubah.
    if (idx >= 0) daftarKini[idx] = { ...lama };
    else daftarKini.push({ ...lama });

    const berikutnya = { ...sekarang, [col]: daftarKini };
    const perubahan = bandingkanKonten(sekarang, berikutnya);
    // Selalu bercadangan: memulihkan item yang salah harus tetap bisa dibatalkan.
    const content = writeContent(berikutnya, { snapshotAlways: true });
    logContentChanges(me, perubahan);
    logActivity(me, "backup.restoreItem", { name, title: judulItem(col, lama) });
    return json({ ok: true, content });
  }

  // Pemulihan SELALU mencadangkan isi saat ini lebih dulu, mengabaikan jeda
  // antar-cadangan — kalau tidak, memulihkan versi yang salah tidak bisa
  // dibatalkan karena isi sebelumnya tidak pernah tersimpan.
  const content = writeContent(snapshot, { snapshotAlways: true });
  logActivity(me, "backup.restore", { name });
  return json({ ok: true, content });
};
