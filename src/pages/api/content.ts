import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { readContent, writeContent, normalizeContent } from "../../lib/store";
import { logContentChanges } from "../../lib/activity";
import { bandingkanKonten, type Perubahan } from "../../lib/perubahan";
import { json, apiError, unauthorized } from "../../lib/api";

export const GET: APIRoute = ({ cookies }) => {
  if (!currentUser(cookies)) return unauthorized();
  return json({ ok: true, content: readContent() });
};

/**
 * Batas ukuran dokumen konten. Tanpa ini satu akun Editor bisa mengirim
 * dokumen puluhan megabita, dan sejak saat itu SETIAP permintaan halaman
 * publik ikut membacanya. Empat megabita jauh di atas ukuran wajar: seluruh
 * katalog 40 kendaraan saat ini hanya ±57 KB.
 */
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;

export const PUT: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_CONTENT_BYTES) {
    return apiError("err.contentTooBig", 413, { mb: Math.round(MAX_CONTENT_BYTES / 1048576) });
  }

  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > MAX_CONTENT_BYTES) {
      return apiError("err.contentTooBig", 413, { mb: Math.round(MAX_CONTENT_BYTES / 1048576) });
    }
    body = JSON.parse(raw);
  } catch {
    return apiError("err.badJson");
  }

  /**
   * Pemeriksaan tabrakan.
   *
   * Panel mengirim kembali `revision` dari dokumen yang dimuatnya. Kalau isi di
   * disk sudah berganti sejak saat itu, ada orang lain yang menyimpan lebih
   * dulu — dan menerima kiriman ini berarti menghapus pekerjaan mereka tanpa
   * satu pun peringatan. Jawabannya 409 beserta isi terbaru, supaya panel bisa
   * menawarkan pilihan alih-alih menebak.
   *
   * `force` adalah pilihan sadar dari orang yang melihat peringatan itu dan
   * memutuskan tetap menimpa.
   */
  const current = readContent();
  const sent = String(body?.revision || "");
  if (current.revision && sent !== current.revision && body?.force !== true) {
    return json(
      {
        ok: false,
        errorKey: "err.contentConflict",
        errorVars: {},
        error: "Konten sudah diubah orang lain sejak halaman ini dimuat.",
        conflict: true,
        content: current,
      },
      409
    );
  }

  /**
   * Apa yang sebenarnya berubah?
   *
   * Panel mengirim SELURUH dokumen setiap kali menyimpan, jadi permintaan ini
   * sendiri tidak memberi tahu apa pun. Perbandingannya dilakukan di sini,
   * bukan di panel: yang boleh dipercaya adalah isi yang benar-benar tersimpan
   * di disk, bukan laporan dari pihak yang mengirim perubahannya.
   *
   * Keduanya dinormalkan lebih dulu supaya yang dibandingkan adalah dokumen
   * dengan bentuk yang sama. Tanpa itu, penyimpanan pertama setelah pembaruan
   * versi akan melaporkan setiap field baru sebagai perubahan.
   */
  const berikutnya = normalizeContent(body);
  const perubahan = bandingkanKonten(current, berikutnya);
  stempelPengubah(berikutnya, perubahan, me.name || me.username);

  const content = writeContent(berikutnya);
  logContentChanges(me, perubahan);
  return json({ ok: true, content });
};

/**
 * Menandai item yang berubah dengan waktu dan nama pengubahnya.
 *
 * Dilakukan di server, bukan di panel, karena hanya di sini yang tahu item
 * MANA yang benar-benar berbeda — panel dulu menstempel `updatedAt` pada
 * kendaraan yang tombol Simpan-nya ditekan, termasuk ketika tidak ada satu pun
 * nilai yang berubah, dan tidak pernah menstempel item direktori sama sekali.
 *
 * `updatedBy` menyimpan NAMA, bukan id. Ia hanya label yang dibaca manusia di
 * baris daftar, dan Editor tidak boleh membaca daftar pengguna — menyimpan id
 * di sini berarti separuh panel tidak akan pernah bisa menerjemahkannya. Jejak
 * audit yang sesungguhnya ada di `data/activity.json`, yang menyimpan id dan
 * nama sekaligus.
 */
function stempelPengubah(content: any, perubahan: Perubahan[], nama: string): void {
  const sekarang = new Date().toISOString();
  for (const p of perubahan) {
    if (p.jenis !== "tambah" && p.jenis !== "ubah") continue;
    const daftar = content?.[p.col];
    if (!Array.isArray(daftar)) continue; // "site" dan "media" bukan daftar item
    const item = daftar.find((x: any) => String(x?.id) === p.id);
    if (!item) continue;
    item.updatedAt = sekarang;
    item.updatedBy = nama;
  }
}
