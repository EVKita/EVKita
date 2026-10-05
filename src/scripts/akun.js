/**
 * Akun pengunjung lewat Clerk — sisi peramban.
 *
 * Markupnya dirender `MemberGate.astro` hanya bila publishable key Clerk
 * terpasang (Admin → Integrasi). Tanpa `#akunGate` skrip ini diam sepenuhnya,
 * jadi situs tanpa Clerk tidak memuat satu byte pun dari Clerk.
 *
 * Yang dikerjakan:
 *   1. Memuat clerk-js + bundel UI-nya langsung dari Frontend API Clerk
 *      (cara "script tag" di https://clerk.com/docs/quickstarts/javascript).
 *      Tidak ada paket npm: situs ini membundel seluruh dependensinya ke
 *      dist/, dan Clerk memang dirancang dimuat dari servernya sendiri.
 *   2. Popup "daftar / masuk" muncul sendiri `TUNDA_MS` setelah pengunjung
 *      TIBA di situs — dihitung sejak halaman pertama sesi itu, bukan sejak
 *      halaman yang sedang dibuka, supaya pindah halaman tidak mengulang
 *      hitungannya dari nol.
 *   3. Tombol "Masuk" di header membuka modal masuk Clerk; begitu pengunjung
 *      masuk, tombol itu ditukar dengan tombol profil Clerk (UserButton).
 *
 * Keputusan "sudah masuk atau belum" seluruhnya milik clerk-js. Popup tidak
 * pernah tampil sebelum Clerk selesai dimuat — lebih baik terlambat sedetik
 * daripada menawari daftar orang yang sudah punya akun.
 */

/** Popup muncul sekian lama setelah pengunjung tiba. */
const TUNDA_MS = 8000;
/** Ditutup dengan "Nanti saja" = tidak ditawari lagi selama sekian hari. */
const TUNDA_HARI = 3;

const KUNCI_MULAI = "evkita_akun_mulai";
const KUNCI_TUNDA = "evkita_akun_tunda";
const KUNCI_SUDAH = "evkita_akun_sudah";

/* Versi mayor dipatok, sesuai saran Clerk: minor/patch ikut diperbarui
   otomatis dari servernya, perubahan yang memutus tidak. */
const SRC_UI = (host) => `https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`;
const SRC_JS = (host) => `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;

function baca(store, kunci) {
  try {
    return window[store].getItem(kunci);
  } catch {
    return null;
  }
}
function tulis(store, kunci, nilai) {
  try {
    window[store].setItem(kunci, nilai);
  } catch {
    /* mode privat: popup tetap jalan, hanya tidak diingat */
  }
}

function muatSkrip(src, attrs = {}) {
  return new Promise((selesai, gagal) => {
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.async = false; // urutan dijaga: bundel UI wajib ada sebelum clerk-js
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => selesai();
    s.onerror = () => gagal(new Error(src));
    document.head.appendChild(s);
  });
}

export function pasangAkun() {
  const gate = document.getElementById("akunGate");
  if (!gate) return;

  const kunci = gate.dataset.clerkKey || "";
  const host = gate.dataset.clerkHost || "";
  if (!kunci || !host) return;

  /** @type {any} */
  let clerk = null;
  let dibuka = false;
  const pemicu = Array.from(document.querySelectorAll("[data-member-buka]"));

  /* ---------------- Memuat Clerk ---------------- */

  const siap = (async () => {
    await muatSkrip(SRC_UI(host));
    await muatSkrip(SRC_JS(host), { "data-clerk-publishable-key": kunci });
    const C = /** @type {any} */ (window).Clerk;
    if (!C) throw new Error("Clerk");
    await C.load({ ui: { ClerkUI: /** @type {any} */ (window).__internal_ClerkUICtor } });
    clerk = C;
    return C;
  })();

  siap
    .then((C) => {
      gambarHeader();
      C.addListener(() => {
        gambarHeader();
        if (C.isSignedIn) tutup();
      });
      jadwalkanPopup();
    })
    .catch(() => {
      /* Clerk gagal dimuat (jaringan, pemblokir iklan, CSP). Popup tidak
         ditampilkan sama sekali — tombol yang tidak bisa berbuat apa-apa
         lebih buruk daripada tidak ada tombol. */
    });

  /* ---------------- Tombol akun di header ---------------- */

  /** Tukar tombol "Masuk" dengan tombol profil Clerk, atau sebaliknya. */
  function gambarHeader() {
    if (!clerk) return;
    for (const btn of pemicu) {
      let wadah = btn.nextElementSibling;
      if (!wadah || !wadah.hasAttribute("data-akun-profil")) {
        wadah = document.createElement("span");
        wadah.setAttribute("data-akun-profil", "");
        wadah.className = "akun-profil";
        btn.after(wadah);
      }
      if (clerk.isSignedIn) {
        btn.hidden = true;
        wadah.hidden = false;
        if (!wadah.hasAttribute("data-terpasang")) {
          clerk.mountUserButton(wadah);
          wadah.setAttribute("data-terpasang", "");
        }
      } else {
        btn.hidden = false;
        wadah.hidden = true;
        if (wadah.hasAttribute("data-terpasang")) {
          clerk.unmountUserButton(wadah);
          wadah.removeAttribute("data-terpasang");
        }
      }
    }
  }

  for (const btn of pemicu) {
    btn.addEventListener("click", () => {
      /* Dari laci mobile, lacinya ditutup dulu supaya tidak mengganjal. */
      const navTutup = document.getElementById("navClose");
      if (navTutup && document.body.classList.contains("nav-open")) navTutup.click();
      bukaClerk("masuk");
    });
  }

  /* ---------------- Popup daftar / masuk ---------------- */

  function bukaClerk(jenis) {
    const err = gate.querySelector("[data-akun-err]");
    siap
      .then((C) => {
        tutup();
        if (jenis === "daftar") C.openSignUp();
        else C.openSignIn();
      })
      .catch(() => {
        if (err && dibuka) err.hidden = false;
      });
  }

  function buka() {
    if (dibuka || !clerk || clerk.isSignedIn) return;
    dibuka = true;
    tulis("sessionStorage", KUNCI_SUDAH, "1");
    gate.hidden = false;
    document.documentElement.classList.add("modal-open");
    const utama = gate.querySelector("[data-akun-daftar]");
    if (utama) /** @type {HTMLElement} */ (utama).focus();
  }

  function tutup() {
    if (!dibuka) return;
    dibuka = false;
    gate.hidden = true;
    document.documentElement.classList.remove("modal-open");
  }

  function nanti() {
    tulis("localStorage", KUNCI_TUNDA, String(Date.now()));
    tutup();
  }

  /** Masih dalam masa "nanti saja", atau sudah ditawari di sesi ini? */
  function ditunda() {
    if (baca("sessionStorage", KUNCI_SUDAH)) return true;
    const sejak = parseInt(baca("localStorage", KUNCI_TUNDA) || "0", 10) || 0;
    return !!sejak && Date.now() - sejak < TUNDA_HARI * 24 * 3600 * 1000;
  }

  function jadwalkanPopup() {
    if (!clerk || clerk.isSignedIn || ditunda()) return;
    let mulai = parseInt(baca("sessionStorage", KUNCI_MULAI) || "0", 10) || 0;
    if (!mulai) {
      mulai = Date.now();
      tulis("sessionStorage", KUNCI_MULAI, String(mulai));
    }
    const sisa = Math.max(0, TUNDA_MS - (Date.now() - mulai));
    setTimeout(cobaBuka, sisa);
  }

  function cobaBuka() {
    if (!clerk || clerk.isSignedIn || ditunda()) return;
    /* Jangan menumpuk di atas pintu konten, kotak cari, laci mobile, atau
       modal Clerk yang sudah dibuka sendiri lewat tombol header. Ditunggu
       sampai semuanya tertutup. */
    const konten = document.getElementById("contentGate");
    const sibuk =
      (konten && !konten.hidden) ||
      document.documentElement.classList.contains("modal-open") ||
      document.body.classList.contains("nav-open") ||
      !!document.querySelector(".cl-modalBackdrop");
    if (sibuk) {
      setTimeout(cobaBuka, 1500);
      return;
    }
    buka();
  }

  gate.querySelector("[data-akun-daftar]")?.addEventListener("click", () => bukaClerk("daftar"));
  gate.querySelector("[data-akun-masuk]")?.addEventListener("click", () => bukaClerk("masuk"));
  for (const el of gate.querySelectorAll("[data-akun-nanti]")) el.addEventListener("click", nanti);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dibuka) nanti();
  });
}
