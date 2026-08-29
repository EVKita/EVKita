/**
 * Pembaca CSV.
 *
 * Impor yang ada hanya menerima JSON dengan bentuk yang persis sama seperti
 * ekspornya. Itu berguna untuk memindahkan data antar-pemasangan, tapi tidak
 * menolong sama sekali untuk kasus yang sesungguhnya: daftar SPKLU atau
 * bengkel yang datang sebagai spreadsheet. Menyalinnya satu per satu lewat
 * modal adalah pekerjaan berjam-jam.
 *
 * Ditulis sendiri, bukan memakai pustaka. Yang dibutuhkan cuma satu fungsi
 * kecil, dan paket rilis proyek ini seluruhnya 2,8 MB — angka yang dijaga
 * dengan menolak `sharp` dan menolak framework komponen.
 */

/**
 * Pemisah kolom, ditebak dari barisnya sendiri.
 *
 * Excel berbahasa Indonesia mengekspor CSV dengan TITIK KOMA, bukan koma,
 * karena koma sudah dipakai sebagai pemisah desimal. Berkas seperti itu adalah
 * bentuk paling umum yang akan sampai ke panel ini, dan membacanya sebagai
 * satu kolom raksasa akan terlihat seperti "impornya rusak" padahal berkasnya
 * baik-baik saja.
 *
 * Yang dihitung hanya pemisah DI LUAR tanda kutip: alamat yang ditulis
 * "Jl. Sudirman, Jakarta" tidak boleh ikut memilihkan koma.
 */
export function tebakPemisah(text) {
  const baris = String(text || "").split(/\r?\n/).find((b) => b.trim()) || "";
  const hitung = (ch) => {
    let n = 0;
    let dalamKutip = false;
    for (let i = 0; i < baris.length; i++) {
      const c = baris[i];
      if (c === '"') dalamKutip = !dalamKutip;
      else if (c === ch && !dalamKutip) n++;
    }
    return n;
  };
  const kandidat = [",", ";", "\t"].map((ch) => [ch, hitung(ch)]);
  kandidat.sort((a, b) => b[1] - a[1]);
  return kandidat[0][1] > 0 ? kandidat[0][0] : ",";
}

/**
 * Membaca CSV menjadi larik baris berisi larik sel.
 *
 * Menangani tanda kutip, kutip ganda sebagai kutip harfiah (`""`), baris baru
 * di dalam sel, CRLF, dan BOM di awal berkas. Sel yang tidak terkutip
 * dipangkas spasinya; yang terkutip TIDAK — spasi di dalam kutip ditulis
 * dengan sengaja.
 */
export function parseCsv(text, pemisah) {
  const s = String(text || "").replace(/^﻿/, "");
  const sep = pemisah || tebakPemisah(s);

  const baris = [];
  let sel = [];
  let buf = "";
  let dalamKutip = false;
  let terkutip = false;

  const tutupSel = () => {
    sel.push(terkutip ? buf : buf.trim());
    buf = "";
    terkutip = false;
  };
  const tutupBaris = () => {
    tutupSel();
    baris.push(sel);
    sel = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (dalamKutip) {
      if (c === '"') {
        if (s[i + 1] === '"') { buf += '"'; i++; }
        else dalamKutip = false;
      } else buf += c;
      continue;
    }

    if (c === '"') { dalamKutip = true; terkutip = true; continue; }
    if (c === sep) { tutupSel(); continue; }
    if (c === "\r") continue;
    if (c === "\n") { tutupBaris(); continue; }
    buf += c;
  }

  // Baris terakhir tanpa akhir baris tetap dihitung.
  if (buf !== "" || sel.length) tutupBaris();

  // Baris yang seluruh selnya kosong dibuang: berkas spreadsheet hampir selalu
  // berakhir dengan beberapa baris kosong, dan mengimpornya berarti membuat
  // entri tanpa nama.
  return baris.filter((b) => b.some((x) => String(x).trim() !== ""));
}

/**
 * Memisahkan baris kepala dari isinya.
 *
 * Kolom tanpa judul diberi nama urutannya, bukan dibiarkan kosong: pemetaan
 * kolom di panel menampilkan judul itu, dan pilihan tanpa nama tidak bisa
 * dipilih dengan yakin oleh siapa pun.
 */
export function bacaTabel(text, pemisah) {
  const baris = parseCsv(text, pemisah);
  if (!baris.length) return { header: [], rows: [] };
  const header = baris[0].map((h, i) => String(h || "").trim() || `#${i + 1}`);
  const rows = baris.slice(1).map((b) => {
    const isi = header.map((_, i) => String(b[i] === undefined ? "" : b[i]));
    return isi;
  });
  return { header, rows };
}

/** Membakukan sebuah judul kolom untuk dicocokkan: tanpa spasi, tanpa tanda baca. */
export function bakukan(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Menebak field mana yang dimaksud tiap kolom.
 *
 * Dicocokkan dua arah: ke nama kunci (`operator`) dan ke labelnya yang sudah
 * diterjemahkan ("Operator", "Area / Kota"). Kolom yang tidak dikenali
 * dibiarkan kosong dan menunggu orangnya memilih — menebak asal untuk kolom
 * yang tidak jelas jauh lebih merugikan daripada tidak menebak sama sekali,
 * karena tebakan yang salah tetap terlihat seperti pilihan yang disengaja.
 *
 * @param {string[]} header
 * @param {{k: string, l: string}[]} defs
 * @returns {string[]} kunci field per kolom, "" berarti belum dipetakan
 */
export function tebakPemetaan(header, defs) {
  const peta = new Map();
  for (const d of defs) {
    peta.set(bakukan(d.k), d.k);
    peta.set(bakukan(d.l), d.k);
    // Label sering membawa keterangan dalam kurung ("Harga (Rupiah, angka)");
    // yang dipakai orang di judul kolom hampir selalu bagian depannya saja.
    const depan = String(d.l || "").split("(")[0];
    if (depan) peta.set(bakukan(depan), d.k);
  }

  const terpakai = new Set();

  // Langkah satu: kecocokan persis. Ini yang paling bisa dipercaya, jadi ia
  // mengambil haknya lebih dulu sebelum tebakan apa pun ikut bicara.
  const hasil = header.map((h) => {
    const k = peta.get(bakukan(h));
    // Satu field hanya boleh diisi satu kolom. Dua kolom yang memetakan ke
    // field yang sama akan membuat yang belakangan diam-diam menimpa yang depan.
    if (!k || terpakai.has(k)) return "";
    terpakai.add(k);
    return k;
  });

  /*
   * Langkah dua: awalan.
   *
   * Judul kolom yang ditulis orang hampir selalu lebih pendek daripada label
   * di panel — "Nama" untuk "Nama Bengkel", "Jenis" untuk "Jenis Bengkel",
   * "Harga" untuk "Harga (Rupiah, angka)". Tanpa langkah ini kolom yang paling
   * sering ada di spreadsheet justru kolom yang paling sering tidak terpetakan.
   *
   * Label TERPENDEK yang cocok yang dipilih, supaya hasilnya tidak bergantung
   * pada urutan definisi field.
   */
  const kandidat = defs
    .map((d) => ({ k: d.k, n: bakukan(d.l) }))
    .filter((x) => x.n)
    .sort((a, b) => a.n.length - b.n.length);

  return hasil.map((k, i) => {
    if (k) return k;
    const h = bakukan(header[i]);
    if (h.length < 3) return ""; // "id", "no", "#1" — terlalu pendek untuk ditebak
    const cocok = kandidat.find((c) => !terpakai.has(c.k) && (c.n.startsWith(h) || h.startsWith(c.n)));
    if (!cocok) return "";
    terpakai.add(cocok.k);
    return cocok.k;
  });
}
