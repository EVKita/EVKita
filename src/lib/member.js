/**
 * Anggota pengunjung — orang yang masuk lewat pintu login situs publik.
 *
 * Bedakan dari `users.ts`: itu akun PANEL (pemilik/admin/editor yang menyunting
 * konten), ini akun PENGUNJUNG. Keduanya tidak pernah bertemu — sesi panel
 * tidak membuat pintu pengunjung terbuka, dan sebaliknya.
 *
 * Login Google lewat Client ID sendiri (Google Identity Services) sudah
 * dibuang: daftar, masuk, dan Google kini ditangani Clerk, yang menyimpan
 * akunnya sendiri. Yang tersisa di sini hanya nama cookie sesi anggota, yang
 * masih dibaca header situs dan Tanya EVKita — cookie lama yang masih hidup di
 * peramban pengunjung tetap dikenali sampai kedaluwarsa.
 */

export const MEMBER_COOKIE = "evkita_member";
