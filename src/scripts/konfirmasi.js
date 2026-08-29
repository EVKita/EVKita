/**
 * Dialog konfirmasi panel admin.
 *
 * Menggantikan dua hal sekaligus:
 *
 *   1. `window.confirm()` bawaan peramban, yang masih dipakai halaman
 *      Pembaruan dan tombol "Kembalikan ke Bawaan" di menu Tampilan. Kotak itu
 *      tidak bisa diberi gaya, tidak mengenal tema gelap, tidak bisa menyebut
 *      apa yang sedang dipertaruhkan, dan di sebagian peramban ia muncul
 *      menempel di tepi atas jendela — jauh dari tombol yang barusan ditekan.
 *   2. Dialog `#confirm-modal` lama di /admin, yang bentuknya sudah benar tapi
 *      hanya hidup di satu halaman: markupnya ditulis di `admin/index.astro`,
 *      jadi halaman Pembaruan tidak punya akses ke sana sama sekali.
 *
 * Berkas ini berdiri sendiri — tidak mengimpor apa pun, membangun DOM-nya
 * sendiri saat pertama dipakai — supaya bisa dipanggil dari mana saja. Itu
 * sebabnya teksnya diterima sebagai argumen, bukan diambil dari kamus di sini:
 * halaman Pembaruan menerima teksnya dari server lewat `define:vars`, dan
 * /admin menerjemahkannya sendiri lewat `t()`.
 */

/** Lambang per nada. Isi <svg>, tanpa pembungkusnya — sama seperti ikon sidebar. */
const IKON = {
  danger: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  warning: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.4 2.4 0 1 1 3.2 2.3c-.5.2-.8.7-.8 1.3v.5M12 17h.01"/>',
  success: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.4 2.5 2.5 4.7-5.2"/>',
};

/** Kelas tombol utama per nada — memakai tombol yang sudah ada di admin.css. */
const KELAS_OK = {
  danger: "btn btn-danger",
  warning: "btn btn-primary",
  info: "btn btn-primary",
  question: "btn btn-primary",
  success: "btn btn-primary",
};

let root = null;
let pending = null;
let fokusSebelumnya = null;
/**
 * Apakah KITA yang mengunci gulir halaman?
 *
 * Dialog ini bisa muncul di atas modal lain (mis. "buang perubahan?" di atas
 * editor direktori), dan modal itu sudah memasang `html.modal-open` sendiri.
 * Melepasnya saat dialog ditutup akan membuat halaman di belakang modal yang
 * masih terbuka ikut bisa digulir.
 */
let sayaMengunciGulir = false;

function bangun() {
  if (root) return root;

  root = document.createElement("div");
  root.className = "kdialog-backdrop";
  root.setAttribute("hidden", "");
  root.innerHTML = `
    <div class="kdialog" role="alertdialog" aria-modal="true" aria-labelledby="kdialog-title" aria-describedby="kdialog-text">
      <div class="kdialog-head">
        <span class="kdialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></svg>
        </span>
        <div class="kdialog-copy">
          <h2 class="kdialog-title" id="kdialog-title"></h2>
          <p class="kdialog-text" id="kdialog-text"></p>
          <p class="kdialog-detail" hidden></p>
        </div>
      </div>
      <div class="kdialog-actions">
        <button type="button" class="btn btn-ghost" data-kdialog="batal"></button>
        <button type="button" class="btn btn-danger" data-kdialog="ok"></button>
      </div>
    </div>`;

  document.body.appendChild(root);

  root.addEventListener("click", (e) => {
    const tombol = e.target.closest("[data-kdialog]");
    if (tombol) { selesai(tombol.getAttribute("data-kdialog") === "ok"); return; }
    // Klik di luar kartunya sama artinya dengan Batal — jalan keluar yang
    // paling sering dicari orang, dan tidak pernah berarti "ya".
    if (e.target === root) selesai(false);
  });

  return root;
}

function kunciGulir(on) {
  const html = document.documentElement;
  if (on) {
    if (html.classList.contains("modal-open")) return;
    const celah = window.innerWidth - html.clientWidth;
    if (celah > 0) html.style.setProperty("--modal-scrollgap", celah + "px");
    html.classList.add("modal-open");
    sayaMengunciGulir = true;
    return;
  }
  if (!sayaMengunciGulir) return;
  html.classList.remove("modal-open");
  html.style.removeProperty("--modal-scrollgap");
  sayaMengunciGulir = false;
}

/** Menahan Tab di dalam dialog: di luar sana tidak ada apa pun yang boleh disentuh. */
function jebakFokus(e) {
  const fokusable = root.querySelectorAll("[data-kdialog]");
  const pertama = fokusable[0];
  const terakhir = fokusable[fokusable.length - 1];
  if (e.shiftKey && document.activeElement === pertama) { e.preventDefault(); terakhir.focus(); }
  else if (!e.shiftKey && document.activeElement === terakhir) { e.preventDefault(); pertama.focus(); }
}

function onKeydown(e) {
  if (!pending) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); selesai(false); return; }
  if (e.key === "Tab") { jebakFokus(e); return; }
  if (e.key === "Enter" && !e.target.closest("[data-kdialog]")) {
    // Enter di luar tombol berarti "lanjutkan". Kalau fokusnya sedang di salah
    // satu tombol, biarkan peramban yang menanganinya — kalau tidak, menekan
    // Enter saat fokus di Batal akan mengiyakan, dan itu kebalikan dari yang
    // dimaksud orangnya.
    e.preventDefault();
    selesai(true);
  }
}

/** Menunggu animasi keluar selesai, dengan batas waktu supaya tidak pernah menggantung. */
function setelahAnimasi(el, lakukan) {
  let sudah = false;
  const sekali = () => {
    if (sudah) return;
    sudah = true;
    el.removeEventListener("transitionend", sekali);
    lakukan();
  };
  el.addEventListener("transitionend", sekali);
  // Dua alasan cadangan ini wajib ada: `prefers-reduced-motion` memangkas
  // transisinya jadi nyaris nol (kadang tanpa memicu transitionend sama
  // sekali), dan tab yang tidak aktif membekukan animasi seluruhnya.
  setTimeout(sekali, 260);
}

function selesai(nilai) {
  if (!pending) return;
  const beri = pending;
  pending = null;

  document.removeEventListener("keydown", onKeydown, true);
  root.classList.remove("is-open");
  root.classList.add("is-closing");

  setelahAnimasi(root.querySelector(".kdialog"), () => {
    root.classList.remove("is-closing");
    root.setAttribute("hidden", "");
    kunciGulir(false);
    // Fokus dikembalikan ke tombol yang tadi ditekan. Tanpa ini fokus jatuh ke
    // <body> dan pemakai papan ketik harus menelusuri halaman dari awal lagi.
    if (fokusSebelumnya && document.contains(fokusSebelumnya)) fokusSebelumnya.focus();
    fokusSebelumnya = null;
  });

  beri(nilai);
}

/**
 * Menampilkan dialog konfirmasi. Mengembalikan janji berisi `true` kalau
 * tombol utamanya ditekan.
 *
 * @param {Object} opts
 * @param {string} opts.title Judul singkat — apa yang akan terjadi.
 * @param {string} [opts.text] Kalimat penjelas.
 * @param {string} [opts.detail] Baris kecil di bawahnya: konsekuensi, jumlah, nama berkas.
 * @param {string} opts.okText Label tombol utama. Sebut TINDAKANNYA, bukan "OK".
 * @param {string} [opts.cancelText] Label tombol batal.
 * @param {"danger"|"warning"|"info"|"question"|"success"} [opts.tone]
 */
export function konfirmasi(opts) {
  const o = opts || {};
  const nada = IKON[o.tone] ? o.tone : "danger";
  const el = bangun();

  // Panggilan baru saat masih ada yang terbuka: yang lama dijawab "tidak"
  // lebih dulu supaya janjinya tidak pernah tergantung selamanya.
  if (pending) selesai(false);

  fokusSebelumnya = document.activeElement;

  el.querySelector(".kdialog-icon svg").innerHTML = IKON[nada];
  el.querySelector(".kdialog-icon").setAttribute("data-tone", nada);
  el.querySelector(".kdialog-title").textContent = o.title || "";

  const teks = el.querySelector(".kdialog-text");
  teks.textContent = o.text || "";
  teks.hidden = !o.text;

  const detail = el.querySelector(".kdialog-detail");
  detail.textContent = o.detail || "";
  detail.hidden = !o.detail;

  const batal = el.querySelector('[data-kdialog="batal"]');
  const ok = el.querySelector('[data-kdialog="ok"]');
  batal.textContent = o.cancelText || "Batal";
  ok.textContent = o.okText || "OK";
  ok.className = KELAS_OK[nada];

  el.removeAttribute("hidden");
  kunciGulir(true);
  // Satu bingkai jeda supaya peramban sempat mencatat keadaan awalnya —
  // tanpa ini kelas `is-open` masuk di bingkai yang sama dan tidak ada
  // transisi apa pun yang berjalan.
  requestAnimationFrame(() => el.classList.add("is-open"));

  document.addEventListener("keydown", onKeydown, true);
  setTimeout(() => ok.focus(), 40);

  return new Promise((resolve) => {
    pending = resolve;
  });
}

export default konfirmasi;
