"use strict";

import { hitungHemat, rupiahPenuh, rupiahHalus, dolarPenuh, dolarHalus, teksBalikModal, teksRingkas, MIL_KM, GALON_LITER, MPG_PER_KML } from "../lib/hemat.js";
import { makePubT, normalizePubLocale } from "../lib/i18n/pub.js";

/* Bahasa situs publik: cookie pilihan pembaca menang; tanpanya ikuti bahasa
   halaman yang dirender server (`<html lang>`). Urutan ini sama dengan
   middleware — lihat catatan yang sama di `app.js`. */
function readPubLang() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)evkita_pub_lang=([^;]+)/);
    if (m && m[1]) return normalizePubLocale(m[1]);
    return normalizePubLocale(document.documentElement.getAttribute("lang"));
  } catch {
    return "id";
  }
}
const t = makePubT(readPubLang());

/*
 * Sisi browser kalkulator hemat.
 *
 * Hitungannya TIDAK ditulis ulang di sini: fungsi yang dipanggil sama persis
 * dengan yang dipakai halaman saat merender di server. Kalkulator yang
 * menjawab beda antara sebelum dan sesudah skrip dimuat adalah kalkulator yang
 * tidak bisa dipercaya siapa pun.
 */

const $ = (id) => document.getElementById(id);

const form = $("kalkForm");
if (form) {
  const MOBIL = Array.isArray(window.__EV_KALK__) ? window.__EV_KALK__ : [];
  /* Edisi kalkulator dari atribut yang dipasang server — dolar, galon, dan
     mil bila us. Mesin hitung tetap metrik: konversi di batas, dua arah. */
  const REGION_US = form.dataset.region === "us";
  const uangPenuh = REGION_US ? dolarPenuh : rupiahPenuh;
  const uangHalus = REGION_US ? dolarHalus : rupiahHalus;
  const bagi = (v, f) => (v === "" ? "" : v / f);
  const kali = (v, f) => (v === "" ? "" : v * f);

  const fields = {
    mobil: $("f-mobil"),
    kwhPer100: $("f-kwh"),
    elecPrice: $("f-listrik"),
    fuelPrice: $("f-bbm"),
    kmPerLiter: $("f-kml"),
    kmPerMonth: $("f-km"),
    evPrice: $("f-harga-ev"),
    icePrice: $("f-harga-bensin"),
  };

  const out = {
    summary: $("r-summary"),
    ev: $("r-ev"),
    evKm: $("r-ev-km"),
    ice: $("r-ice"),
    iceKm: $("r-ice-km"),
    saving: $("r-saving"),
    savingYear: $("r-saving-year"),
    payback: $("r-payback"),
  };

  const val = (el) => (el ? el.value : "");

  const render = () => {
    const h = hitungHemat(
      REGION_US
        ? {
            kwhPer100: bagi(val(fields.kwhPer100), MIL_KM),
            elecPrice: val(fields.elecPrice),
            kmPerLiter: kali(val(fields.kmPerLiter), 1 / MPG_PER_KML),
            fuelPrice: bagi(val(fields.fuelPrice), GALON_LITER),
            kmPerMonth: kali(val(fields.kmPerMonth), MIL_KM),
            evPrice: val(fields.evPrice),
            icePrice: val(fields.icePrice),
          }
        : {
            kwhPer100: val(fields.kwhPer100),
            elecPrice: val(fields.elecPrice),
            kmPerLiter: val(fields.kmPerLiter),
            fuelPrice: val(fields.fuelPrice),
            kmPerMonth: val(fields.kmPerMonth),
            evPrice: val(fields.evPrice),
            icePrice: val(fields.icePrice),
          }
    );
    /* Biaya per km mesin dikali mil untuk edisi Amerika. */
    const perMil = (n) => (n === null || n === undefined ? null : n * MIL_KM);

    if (out.summary) out.summary.textContent = teksRingkas(h, t, { region: REGION_US ? "us" : "id" });
    if (out.ev) out.ev.textContent = uangPenuh(h.evMonthly);
    if (out.evKm) out.evKm.textContent = uangHalus(REGION_US ? perMil(h.evPerKm) : h.evPerKm);
    if (out.ice) out.ice.textContent = uangPenuh(h.iceMonthly);
    if (out.iceKm) out.iceKm.textContent = uangHalus(REGION_US ? perMil(h.icePerKm) : h.icePerKm);
    if (out.saving) out.saving.textContent = uangPenuh(h.savingMonthly);
    if (out.savingYear) out.savingYear.textContent = uangPenuh(h.savingYearly);
    if (out.payback) out.payback.textContent = teksBalikModal(h, t);

    syncUrl();
  };

  /*
   * Angka yang sedang dipakai ditulis ke URL supaya hasil hitungan bisa
   * dibagikan — dan supaya memuat ulang halaman tidak mengembalikan semuanya
   * ke nilai bawaan. replaceState, bukan pushState: mengubah satu angka bukan
   * perpindahan halaman, dan tombol "kembali" tidak boleh berubah jadi tombol
   * "batalkan satu ketikan".
   */
  const syncUrl = () => {
    const p = new URLSearchParams();
    const put = (key, el) => {
      const v = val(el);
      if (v !== "" && v !== null) p.set(key, v);
    };
    put("mobil", fields.mobil);
    put("kwh", fields.kwhPer100);
    put("listrik", fields.elecPrice);
    put("bbm", fields.fuelPrice);
    put("kml", fields.kmPerLiter);
    put("km", fields.kmPerMonth);
    put("hargaEv", fields.evPrice);
    put("hargaBensin", fields.icePrice);
    /* Edisinya ikut di URL — tanpanya interaksi pertama menendang pembaca
       edisi Amerika kembali ke kalkulator Indonesia. */
    if (REGION_US) p.set("region", "us");
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
  };

  /* Ganti mobil = isi ulang konsumsi dan harganya. Yang lain milik pembaca. */
  if (fields.mobil) {
    fields.mobil.addEventListener("change", () => {
      const m = MOBIL.find((x) => x.id === fields.mobil.value);
      if (!m) return;
      if (fields.kwhPer100) fields.kwhPer100.value = m.kwhPer100;
      if (fields.evPrice) fields.evPrice.value = m.price || "";
      render();
    });
  }

  form.addEventListener("input", render);

  document.querySelectorAll(".kalk-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.value = btn.dataset.value;
      render();
    });
  });

  // Tanpa JavaScript formulir ini dikirim sebagai GET dan server yang
  // menghitung. Dengan JavaScript, pengiriman itu tidak perlu terjadi.
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  render();
}
