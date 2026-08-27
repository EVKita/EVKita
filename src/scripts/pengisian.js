"use strict";

import {
  hitungPengisian,
  modePengisian,
  teksDurasi,
  kwhKeTeks,
  kmKeTeks,
  teksRingkasPengisian,
  catatanHasil,
} from "../lib/pengisian.js";
import { rupiahPenuh, rupiahHalus } from "../lib/hemat.js";

/*
 * Sisi browser kalkulator biaya pengisian.
 *
 * Hitungannya TIDAK ditulis ulang di sini: fungsi yang dipanggil sama persis
 * dengan yang dipakai halaman saat merender di server. Kalkulator yang
 * menjawab beda antara sebelum dan sesudah skrip dimuat adalah kalkulator yang
 * tidak bisa dipercaya siapa pun.
 */

const $ = (id) => document.getElementById(id);

const form = $("pengisianForm");
if (form) {
  const KENDARAAN = Array.isArray(window.__EV_PENGISIAN__) ? window.__EV_PENGISIAN__ : [];

  const fields = {
    kendaraan: $("f-kendaraan"),
    batteryKwh: $("f-baterai"),
    socAwal: $("f-awal"),
    socAkhir: $("f-akhir"),
    dayaKw: $("f-daya"),
    tarif: $("f-tarif"),
  };

  const out = {
    summary: $("p-summary"),
    durasi: $("p-durasi"),
    biaya: $("p-biaya"),
    perKwh: $("p-per-kwh"),
    energi: $("p-energi"),
    ditagih: $("p-ditagih"),
    km: $("p-km"),
    catatan: $("p-catatan"),
  };

  const val = (el) => (el ? el.value : "");

  const kendaraanTerpilih = () => KENDARAAN.find((x) => x.id === val(fields.kendaraan)) || null;

  const render = () => {
    const daya = val(fields.dayaKw);
    const v = kendaraanTerpilih();

    /* Batas daya kendaraan diambil dari kolom yang sesuai dengan mode-nya: DC
       dan AC punya batas yang berbeda, dan memakai yang keliru akan menjanjikan
       pengisian yang tidak mungkin terjadi. */
    const mode = modePengisian(daya);
    const dayaMaksKendaraan = v ? (mode === "dc" ? v.chargeDcKw : v.chargeAcKw) : null;

    const h = hitungPengisian({
      batteryKwh: val(fields.batteryKwh),
      socAwal: val(fields.socAwal),
      socAkhir: val(fields.socAkhir),
      dayaKw: daya,
      tarif: val(fields.tarif),
      dayaMaksKendaraan,
      rangeKm: v ? v.rangeKm : null,
    });

    if (out.summary) out.summary.textContent = teksRingkasPengisian(h);
    if (out.durasi) out.durasi.textContent = teksDurasi(h);
    if (out.biaya) out.biaya.textContent = rupiahPenuh(h.biaya);
    if (out.perKwh) out.perKwh.textContent = h.biayaPerKwh !== null ? rupiahHalus(h.biayaPerKwh) : "—";
    if (out.energi) out.energi.textContent = kwhKeTeks(h.energiMasuk);
    if (out.ditagih) out.ditagih.textContent = kwhKeTeks(h.energiDitagih);
    if (out.km) out.km.textContent = kmKeTeks(h.kmDidapat);

    if (out.catatan) {
      // Dibangun ulang setiap render: catatan yang tertinggal dari hitungan
      // sebelumnya akan memperingatkan soal keadaan yang sudah tidak berlaku.
      out.catatan.textContent = "";
      for (const teks of catatanHasil(h)) {
        const li = document.createElement("li");
        li.textContent = teks;
        out.catatan.appendChild(li);
      }
    }

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
    /* Isian yang KOSONG tetap ditulis sebagai `key=`, bukan dibuang. Membuangnya
       membuat halaman yang dimuat ulang mengembalikan nilai bawaan ke field yang
       barusan sengaja dikosongkan — jawabannya berubah tanpa ada yang mengubah
       apa pun. URL-nya sedikit lebih panjang; yang ditukar adalah kepercayaan. */
    const put = (key, el) => p.set(key, val(el));
    put("kendaraan", fields.kendaraan);
    put("baterai", fields.batteryKwh);
    put("awal", fields.socAwal);
    put("akhir", fields.socAkhir);
    put("daya", fields.dayaKw);
    put("tarif", fields.tarif);
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
  };

  /* Ganti kendaraan = isi ulang kapasitas baterainya. Sisanya milik pembaca. */
  if (fields.kendaraan) {
    fields.kendaraan.addEventListener("change", () => {
      const v = kendaraanTerpilih();
      if (v && fields.batteryKwh) fields.batteryKwh.value = v.batteryKwh;
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
