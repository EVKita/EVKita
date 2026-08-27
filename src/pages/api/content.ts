import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { readContent, writeContent } from "../../lib/store";
import { logActivity } from "../../lib/activity";
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

  const content = writeContent(body);
  logActivity(me, "content.save");
  return json({ ok: true, content });
};
