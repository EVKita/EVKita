import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { currentUser } from "../../../lib/auth";
import { can, listPublicUsers } from "../../../lib/users";
import { readContent } from "../../../lib/store";
import { urlDipakai, namaBerkasAman } from "../../../lib/uploads";
import { json, apiError, unauthorized, forbidden } from "../../../lib/api";

/**
 * Isi direktori `data/uploads/`.
 *
 * Pustaka Media selama ini BUKAN daftar berkas melainkan daftar alamat yang
 * sedang dipakai konten. Akibatnya sederhana dan permanen: begitu sebuah
 * gambar dilepas dari satu mobil, berkasnya tetap ada di disk tapi tidak
 * pernah muncul lagi di panel — dan tidak ada satu pun tombol hapus di seluruh
 * antarmuka. Direktori itu hanya bisa tumbuh.
 *
 * Endpoint ini yang membuatnya bisa dilihat, dan DELETE di bawahnya yang
 * membuatnya bisa dirapikan.
 */

const UPLOAD_DIR = () => path.resolve(process.cwd(), "data", "uploads");

/** Foto profil tinggal di data/users.json, bukan di content.json. */
const avatarUrls = () => listPublicUsers().map((u) => u.avatar).filter(Boolean);

export const GET: APIRoute = ({ cookies }) => {
  if (!currentUser(cookies)) return unauthorized();

  let nama: string[];
  try {
    nama = fs.readdirSync(UPLOAD_DIR());
  } catch {
    // Direktori belum ada berarti belum ada yang pernah diunggah, bukan galat.
    return json({ ok: true, files: [] });
  }

  const content = readContent();
  const avatar = avatarUrls();

  const files = nama
    .filter((n) => namaBerkasAman(n))
    .map((n) => {
      const url = `/api/uploads/${n}`;
      let size = 0;
      let mtime = "";
      try {
        const st = fs.statSync(path.join(UPLOAD_DIR(), n));
        if (!st.isFile()) return null;
        size = st.size;
        mtime = st.mtime.toISOString();
      } catch {
        return null;
      }
      return { url, name: n, size, mtime, used: urlDipakai(content, url, avatar) };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.mtime).localeCompare(String(a.mtime)));

  return json({ ok: true, files });
};

/**
 * Menghapus satu berkas unggahan.
 *
 * Dua penjagaan, dan keduanya di server:
 *
 *   1. Hanya berkas yang TIDAK dirujuk konten. Panel memang sudah menandai
 *      mana yang yatim, tapi penandaan itu dihitung dari salinan konten di
 *      browser — yang bisa basi, dan yang bisa dikarang. Yang menentukan
 *      adalah isi `content.json` saat permintaan ini tiba.
 *   2. Hanya pemilik dan admin. Berkas unggahan tidak ikut ke dalam cadangan
 *      konten (`data/backups/` hanya menyimpan content.json), jadi
 *      penghapusannya tidak punya tombol urung — dan operasi tanpa tombol
 *      urung satu golongan dengan Cadangan dan Pembaruan.
 */
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "media.delete")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const diminta: string[] = Array.isArray(body?.names) ? body.names.map((x: any) => String(x)) : [];
  if (!diminta.length) return apiError("err.uploadNoFile");

  const content = readContent();
  const avatar = avatarUrls();
  let dihapus = 0;
  let dilewati = 0;

  for (const nama of diminta) {
    if (!namaBerkasAman(nama)) { dilewati++; continue; }
    if (urlDipakai(content, `/api/uploads/${nama}`, avatar)) { dilewati++; continue; }
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR(), nama));
      dihapus++;
    } catch {
      // Sudah hilang duluan bukan kegagalan: hasil akhirnya sama.
      dilewati++;
    }
  }

  return json({ ok: true, dihapus, dilewati });
};
