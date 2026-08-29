import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { can, listPublicUsers } from "../../lib/users";
import { listActivity, listActivityMonths, queryActivity } from "../../lib/activity";
import { json, unauthorized, forbidden } from "../../lib/api";

/**
 * Log aktivitas, dua kedalaman dalam satu endpoint.
 *
 * Tanpa parameter apa pun, jawabannya sama seperti dulu: sekian entri terbaru,
 * terbuka untuk siapa saja yang sudah masuk. Itulah yang dipakai panel kecil di
 * dasbor, dan menutupnya untuk Editor akan menghapus satu-satunya tanda bahwa
 * ada orang lain yang bekerja di katalog yang sama.
 *
 * Begitu ada saringan, halaman, atau bulan yang diminta — yaitu begitu ini
 * dipakai sebagai alat audit — kemampuan `activity` yang berlaku, sama seperti
 * halaman Pengguna dan Cadangan.
 */
export const GET: APIRoute = ({ cookies, url }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  const q = url.searchParams;
  const month = String(q.get("bulan") || "");
  const userId = String(q.get("pengguna") || "");
  const action = String(q.get("aksi") || "");
  const page = Number(q.get("hal")) || 1;
  const penuh = !!(month || userId || action || page > 1 || q.get("penuh"));

  if (!penuh) {
    const limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 20));
    return json({ ok: true, entries: listActivity(limit) });
  }

  if (!can(me, "activity")) return forbidden();

  const hasil = queryActivity({ month, userId, action, page, perPage: Number(q.get("perHal")) || 25 });

  return json({
    ok: true,
    ...hasil,
    months: listActivityMonths(),
    /*
     * Daftar pelaku untuk mengisi saringan — id dan nama saja.
     *
     * Diambil dari daftar akun, bukan dari log: akun yang belum pernah
     * melakukan apa pun tetap layak muncul sebagai pilihan, dan pilihan yang
     * hasilnya kosong lebih jujur daripada pilihan yang tidak pernah ada.
     */
    users: listPublicUsers().map((u) => ({ id: u.id, name: u.name || u.username })),
  });
};
