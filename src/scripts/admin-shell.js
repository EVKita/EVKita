/**
 * Perilaku kerangka panel admin untuk halaman yang TIDAK memuat admin.js
 * (saat ini hanya /admin/update): buka-tutup sidebar, ingat lebar pilihan
 * terakhir, dan tombol keluar.
 *
 * admin.js punya salinan logika yang sama untuk /admin. Sengaja tidak
 * dipakai bersama karena berkas itu ikut memuat seluruh CMS — halaman
 * pembaruan tidak butuh apa pun dari sana.
 */
import { konfirmasi } from "./konfirmasi.js";

/**
 * Dialog konfirmasi dititipkan ke `window`, dan itu memang satu-satunya cara.
 *
 * Skrip halaman Pembaruan memakai `define:vars` untuk menerima teks yang sudah
 * diterjemahkan di server. Astro menjadikan skrip semacam itu skrip INLINE,
 * bukan modul yang dibundel — jadi `import` di dalamnya tidak berjalan. Berkas
 * ini yang dibundel, jadi ia yang membawakan dialognya.
 */
window.evkitaKonfirmasi = konfirmasi;

(function () {
  const app = document.getElementById("admin-app");
  if (!app) return;

  if (localStorage.getItem("evkita.sidebar") === "collapsed") app.classList.add("sidebar-collapsed");

  function toggleSidebar() {
    // Di layar sempit sidebar berperilaku sebagai drawer yang menimpa konten,
    // di layar lebar ia menciut jadi rel ikon.
    if (window.matchMedia("(max-width: 900px)").matches) {
      app.classList.toggle("sidebar-open");
      return;
    }
    const collapsed = app.classList.toggle("sidebar-collapsed");
    localStorage.setItem("evkita.sidebar", collapsed ? "collapsed" : "expanded");
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#sidebar-toggle")) { toggleSidebar(); return; }

    if (e.target.id === "sidebar-scrim") { app.classList.remove("sidebar-open"); return; }

    if (e.target.closest("#logout")) {
      e.preventDefault();
      fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/admin/login"; });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && app.classList.contains("sidebar-open")) app.classList.remove("sidebar-open");
  });
})();
