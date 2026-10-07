/**
 * Perilaku kerangka panel admin untuk halaman yang TIDAK memuat admin.js
 * (Integrasi, Kontak, Pembaruan): buka-tutup sidebar, ingat lebar pilihan
 * terakhir, tombol keluar, kotak cari, dan sorotan `#jangkar`.
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

  // Penyimpanan peramban bisa dilempar (mode privat, situs diblokir);
  // lebar sidebar cuma kenyamanan, jadi kegagalannya didiamkan.
  try {
    if (localStorage.getItem("evkita.sidebar") === "collapsed") app.classList.add("sidebar-collapsed");
  } catch { /* abaikan */ }

  function toggleSidebar() {
    // Di layar sempit sidebar berperilaku sebagai drawer yang menimpa konten,
    // di layar lebar ia menciut jadi rel ikon.
    if (window.matchMedia("(max-width: 900px)").matches) {
      app.classList.toggle("sidebar-open");
      return;
    }
    const collapsed = app.classList.toggle("sidebar-collapsed");
    try { localStorage.setItem("evkita.sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* abaikan */ }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#sidebar-toggle")) { toggleSidebar(); return; }

    if (e.target.id === "sidebar-scrim") { app.classList.remove("sidebar-open"); return; }

    if (e.target.closest("#logout")) {
      e.preventDefault();
      fetch("/api/auth/logout", { method: "POST" }).finally(() => { location.href = "/admin/login"; });
    }
  });

  /* Pencarian. Halaman ini tidak memuat palet (ia butuh seluruh CMS), jadi
     kotak cari dan Ctrl/⌘+K mengantar ke /admin, yang membuka paletnya dengan
     kata yang sama. */
  const keCari = (q) => { location.href = "/admin?cari=" + encodeURIComponent(q || ""); };
  const kotakCari = document.getElementById("shell-search");
  if (kotakCari) {
    kotakCari.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); keCari(kotakCari.value.trim()); }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && app.classList.contains("sidebar-open")) app.classList.remove("sidebar-open");
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
      e.preventDefault();
      if (kotakCari) kotakCari.focus();
      else keCari("");
    }
  });

  /* Titik "ada versi baru" di sidebar. admin.js menyalakannya di /admin;
     tanpa ini titiknya selalu padam di halaman Integrasi dan Kontak. Titik
     itu hanya dirender untuk peran yang boleh memperbarui. */
  const titik = document.getElementById("update-dot");
  if (titik) {
    fetch("/api/version")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { titik.hidden = !(data && data.updateAvailable); })
      .catch(() => { /* pelengkap; diamkan kalau GitHub tak terjangkau */ });
  }

  /* Butir pencarian pengaturan membuka halaman ini dengan `#jangkar`;
     bagiannya digulir ke tengah dan disorot sebentar supaya mata langsung
     menemukannya. */
  const jangkar = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (jangkar) {
    requestAnimationFrame(() => {
      jangkar.scrollIntoView({ block: "start", behavior: "smooth" });
      jangkar.classList.add("cari-sorot");
      setTimeout(() => jangkar.classList.remove("cari-sorot"), 2200);
    });
  }
})();
