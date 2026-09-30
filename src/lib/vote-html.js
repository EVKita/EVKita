/**
 * Markup VoteKita — satu sumber untuk server dan browser.
 *
 * Panel voting pengunjung di sisi kanan beranda: 10 mobil dan 10 motor
 * terfavorit, voting bintang 1–5, rata-rata, jumlah suara, dan peringkat yang
 * diurut ulang setiap ada suara masuk.
 *
 * Sengaja JavaScript polos tanpa API Node, supaya bisa dipakai dua tempat:
 * frontmatter `.astro` (dirender server, baris awalnya) dan
 * `src/scripts/app.js` (browser, menggambar ulang tiap ada suara masuk).
 * Karena markupnya berasal dari fungsi yang sama, keduanya tidak bisa
 * berselisih — kontraknya: `aside#voteKita`, daftar `ol#voteMobil` /
 * `ol#voteMotor`, baris beratribut `data-vote-kind` + `data-vote-id`, tombol
 * `data-vote-stars="1..5"`, baris jumlah berklas `vote-count`.
 *
 * Teksnya TIDAK ditulis langsung di sini: semuanya lewat fungsi `t` yang
 * diberikan pemanggil (`t("pub.vote.suara")` dan kawan-kawan sudah ada di
 * `src/lib/i18n/pub.js` untuk ketiga bahasa).
 */

/** Loloskan teks untuk atribut/isi HTML. */
function escVote(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Jalur bintang material (ikon "star" gaya Material). */
const BINTANG_PATH =
  "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/**
 * Satu ikon bintang. Warnanya `currentColor`, jadi yang menentukan tampilannya
 * adalah kelas/pembungkusnya — atau isi `fill` langsung bila diberi warna
 * (`#f59e0b`) maupun gradien (`url(#...)` untuk setengah bintang).
 */
export function starSvg(fill, cls) {
  const isi = fill || "currentColor";
  const kelas = cls ? `vote-svg ${cls}` : "vote-svg";
  return `<svg class="${escVote(kelas)}" viewBox="0 0 24 24" fill="${escVote(isi)}" aria-hidden="true" focusable="false"><path d="${BINTANG_PATH}"/></svg>`;
}

/** Kuning emas untuk bintang yang terisi — sama di tema terang dan gelap. */
const EMAS = "#f59e0b";

/**
 * Lima bintang TAMPILAN (bukan tombol): penuh emas, setengah lewat gradien
 * sebaris, sisanya redup. `uid` membedakan id gradien tiap baris supaya tidak
 * bertabrakan dalam satu halaman.
 */
export function starsHtml(avg, uid) {
  const nilai = Number(avg) || 0;
  const tag = String(uid === null || uid === undefined ? "vote" : uid).replace(/[^a-zA-Z0-9_-]/g, "") || "vote";
  let keluar = "";
  for (let i = 1; i <= 5; i++) {
    if (nilai >= i) {
      keluar += `<span class="vote-star penuh">${starSvg(EMAS, "")}</span>`;
    } else if (nilai >= i - 0.5) {
      const gid = `vg-${tag}-${i}`;
      keluar +=
        `<span class="vote-star separuh">` +
        `<svg class="vote-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
        `<defs><linearGradient id="${escVote(gid)}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="50%" stop-color="${EMAS}"/>` +
        `<stop offset="50%" stop-color="var(--border, #cbd5e1)"/>` +
        `</linearGradient></defs>` +
        `<path d="${BINTANG_PATH}" fill="url(#${escVote(gid)})"/>` +
        `</svg></span>`;
    } else {
      keluar += `<span class="vote-star kosong">${starSvg("currentColor", "")}</span>`;
    }
  }
  return `<span class="vote-display" aria-hidden="true">${keluar}</span>`;
}

/**
 * Rata-rata dari satu catatan suara `{ s, v }` (`s` = jumlah bintang, `v` =
 * jumlah suara). Tanpa suara berarti nol — bukan `NaN`.
 */
export function avgOf(stat) {
  const jumlah = Number(stat && stat.s);
  const suara = Number(stat && stat.v);
  if (!suara || suara <= 0 || !Number.isFinite(jumlah)) return 0;
  return jumlah / suara;
}

/**
 * Peringkat suara ala Shining Awards: suara TERBANYAK dulu, seri oleh
 * rata-rata tertinggi, seri lagi oleh urutan asal (stabil — yang lebih dulu
 * di katalog tetap di atas). Yang paling banyak dipilih di atas, yang paling
 * sedikit (atau belum dipilih) di bawah. Mengembalikan paling banyak `limit`
 * butir `{ v, avg, votes }`.
 */
export function rankVotes(vehicles, agg, limit = 10) {
  const ember = agg && typeof agg === "object" ? agg : {};
  const daftar = Array.isArray(vehicles) ? vehicles : [];
  const hasil = daftar.map((v, i) => {
    const stat = v ? ember[v.id] : undefined;
    const suara = Number(stat && stat.v) || 0;
    return { v, avg: avgOf(stat), votes: suara > 0 ? Math.floor(suara) : 0, idx: i };
  });
  hasil.sort((a, b) => b.votes - a.votes || b.avg - a.avg || a.idx - b.idx);
  const batas = limit === undefined ? 10 : Number(limit);
  const potong = Number.isFinite(batas) && batas >= 0 ? Math.floor(batas) : 10;
  return hasil.slice(0, potong).map(({ v, avg, votes }) => ({ v, avg, votes }));
}

/**
 * Saring kendaraan untuk kotak cari VoteKita: ketik merek/model langsung
 * keluar beserta gambarnya. Pencocokan huruf-kecil atas gabungan
 * `brand + name + id`, urutan asal dipertahankan (pemanggil memberi daftar
 * yang sudah berperingkat). Kueri kosong mengembalikan daftar apa adanya.
 */
export function saringKendaraan(daftar, query) {
  const list = Array.isArray(daftar) ? daftar : [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) => {
    const v = (r && r.v) || r || {};
    const hay = `${v.brand || ""} ${v.name || ""} ${v.id || ""}`.toLowerCase();
    return q.split(/\s+/).every((pot) => pot && hay.includes(pot));
  });
}

/**
 * Satu baris peringkat, lengkap dan mandiri: peringkat, foto (atau lencana
 * huruf), nama bertaut, bintang tampilan + angka rata-rata, lima tombol vote,
 * dan baris jumlah suara.
 *
 * `o = { t, href, img, myVote, lang }` — `rank` boleh ditambah pemanggil untuk
 * nomor urutnya. `t` fungsi terjemah yang sudah terikat ke bahasa pembaca,
 * `lang` (`id`/`en`/`zh`) hanya untuk format angka. `hidden: true`
 * menyembunyikan baris (dipakai tombol "Pilihan lain": lima pertama tampil,
 * sisanya menunggu dibuka) tanpa mengubah peringkatnya. `totalSuara` jumlah
 * seluruh suara sejenis untuk bilah persen ala Shining Awards; `favorit: true`
 * menandai pilihan pengunjung ini sendiri.
 */
export function voteRowHtml(v, stat, o) {
  const pil = o || {};
  const t = typeof pil.t === "function" ? pil.t : (kunci) => kunci;
  const kind = pil.kind || (v && v.kind) || "mobil";
  const id = String((v && v.id) || "");
  const href = pil.href || (kind === "motor" ? "/motor/" : "/mobil/") + id;
  const nama = `${(v && v.brand) || ""} ${(v && v.name) || ""}`.trim() || id;
  const avg = avgOf(stat);
  const suara = Number(stat && stat.v) || 0;
  const lang = pil.lang || "id";
  const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "id-ID";
  const avgTeks = Number(avg.toFixed(1)).toLocaleString(locale);
  const saya = Number(pil.myVote) || 0;
  const gambar = pil.img || (v && v.image) || "";
  const thumb = gambar
    ? `<img class="vote-thumb" src="${escVote(gambar)}" alt="${escVote(nama)}" loading="lazy" decoding="async">`
    : `<span class="vote-thumb vote-huruf" aria-hidden="true">${escVote((nama.trim().charAt(0) || "?").toUpperCase())}</span>`;

  let tombol = "";
  for (let n = 1; n <= 5; n++) {
    const aktif = n <= saya;
    tombol +=
      `<button type="button" class="vote-btn${aktif ? " on" : ""}"` +
      ` data-vote-stars="${n}" aria-pressed="${aktif ? "true" : "false"}"` +
      ` aria-label="${escVote(t("pub.vote.bintang", { n }))}">${starSvg("currentColor", "")}</button>`;
  }
  const hitung =
    suara > 0 ? escVote(t("pub.vote.suara", { n: suara })) : escVote(t("pub.vote.belum"));

  /* Bilah persen ala Shining Awards: bagian suara baris ini dari seluruh
     suara sejenisnya. Tipis (4px) di dalam info — ukuran dan posisi baris
     tidak berubah. */
  const total = Number(pil.totalSuara) || 0;
  let barisPersen = "";
  if (total > 0 && suara > 0) {
    const persen = Math.max(0, Math.min(100, (suara / total) * 100));
    const lebar = (Math.round(persen * 10) / 10).toLocaleString(locale);
    barisPersen =
      `<span class="vote-bar" aria-hidden="true"><span class="vote-isi" style="width:${escVote(String(Math.round(persen * 10) / 10))}%"></span></span>` +
      `<span class="vote-persen">${escVote(lebar)}%</span>`;
  }

  const lencana = pil.favorit
    ? `<span class="vote-fav" title="${escVote(t("pub.vote.satu"))}">★ ${escVote(t("pub.vote.favorit"))}</span>`
    : "";

  return (
    `<li class="vote-row"${pil.hidden ? " hidden" : ""} data-vote-kind="${escVote(kind)}" data-vote-id="${escVote(id)}">` +
    `<span class="vote-rank">${escVote(pil.rank === undefined || pil.rank === null ? "" : pil.rank)}</span>` +
    thumb +
    `<div class="vote-info">` +
    `<a class="vote-name" href="${escVote(href)}">${escVote(nama)}${lencana}</a>` +
    `<span class="vote-meta">${starsHtml(avg, `${kind}-${id}`)}<span class="vote-avg">${escVote(avgTeks)}</span>${barisPersen}</span>` +
    `<div class="vote-btns" role="group" aria-label="${escVote(nama)}">${tombol}</div>` +
    `<span class="vote-count">${hitung}</span>` +
    `</div></li>`
  );
}
