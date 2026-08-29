import { safeUrl } from "./url.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  /*
   * Garis bawah juga menandai penekanan — bentuk yang sama lazimnya diketik
   * orang. Yang dijaga di sini adalah `snake_case`: penandanya hanya diakui
   * kalau TIDAK menempel pada huruf di sisi luarnya, jadi `nama_field_ini`
   * tetap utuh sementara `_catatan_` menjadi miring.
   */
  t = t.replace(/(^|[^\w])__([^_\n]+)__(?!\w)/g, "$1<strong>$2</strong>");
  t = t.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  // Skema disaring, bukan cuma dikutip: `[x](javascript:...)` di dalam catatan
  // rilis akan berjalan saat ditekan di halaman Pembaruan. Tautan yang skemanya
  // ditolak jatuh kembali menjadi teks biasa.
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label, href) => {
    const url = safeUrl(href.replace(/&amp;/g, "&"));
    if (!url) return label;
    // Tautan ke dalam situs sendiri dibuka di tab yang sama. Halaman kebijakan
    // saling menunjuk, dan setiap tautan yang membuka tab baru di sana berarti
    // pembaca yang menyusuri tiga halaman berakhir dengan tiga tab.
    const luar = /^https?:/i.test(url);
    const atribut = luar ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${escapeHtml(url)}"${atribut}>${label}</a>`;
  });
  return t;
}

/**
 * Penanda judul yang bisa ditautkan: `## Hak kamu` → `id="hak-kamu"`.
 *
 * Halaman kebijakan dan syarat selalu dirujuk per bagian ("lihat bagian
 * Cookie"), dan tanpa penanda ini satu-satunya cara menunjuk ke sana adalah
 * menyuruh orang menggulir. Nomor di belakang dipasang saat judul yang sama
 * muncul dua kali — dua elemen ber-id sama membuat tautannya menunjuk yang
 * pertama saja.
 */
function headingId(text: string, used: Set<string>): string {
  const dasar =
    text
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bagian";
  let id = dasar;
  let n = 2;
  while (used.has(id)) id = `${dasar}-${n++}`;
  used.add(id);
  return id;
}

export function markdownToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  let out = "";
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  /** "" = tidak sedang di dalam daftar, "ul" = bertanda, "ol" = bernomor. */
  let listTag = "";
  /**
   * Baris-baris paragraf yang sedang dikumpulkan.
   *
   * Satu baris teks TIDAK sama dengan satu paragraf. Naskah panjang selalu
   * dilipat pada lebar tertentu di kotak penyuntingnya, dan tanpa penampung
   * ini setiap lipatan itu menjadi `<p>` tersendiri — jaraknya melebar di
   * tengah kalimat, dan paragraf yang sebenarnya tidak pernah terlihat sebagai
   * satu kesatuan. Yang memisahkan paragraf adalah baris kosong, sama seperti
   * di Markdown mana pun.
   */
  let paraBuf: string[] = [];
  const headingIds = new Set<string>();

  const flushList = () => {
    if (listTag) {
      out += `<${listTag}>` + listBuf.map((li) => `<li>${li}</li>`).join("") + `</${listTag}>`;
      listBuf = [];
      listTag = "";
    }
  };

  const flushPara = () => {
    if (paraBuf.length) {
      out += `<p>${inline(paraBuf.join(" "))}</p>`;
      paraBuf = [];
    }
  };

  /** Paragraf dan daftar tidak pernah terbuka bersamaan; yang mana pun, tutup. */
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (inCode) {
        out += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
        codeBuf = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushAll();
      continue;
    }

    // Garis pemisah: tiga tanda hubung atau lebih, sendirian di satu baris.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      out += "<hr />";
      continue;
    }

    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = h[1].length;
      const isi = inline(h[2]);
      out += `<h${level} id="${escapeHtml(headingId(h[2], headingIds))}">${isi}</h${level}>`;
      continue;
    }

    const li = trimmed.match(/^[-*+]\s+(.*)$/);
    if (li) {
      flushPara();
      // Berpindah jenis daftar berarti daftar sebelumnya sudah selesai.
      if (listTag && listTag !== "ul") flushList();
      listTag = "ul";
      listBuf.push(inline(li[1]));
      continue;
    }

    const oli = trimmed.match(/^\d{1,3}[.)]\s+(.*)$/);
    if (oli) {
      flushPara();
      if (listTag && listTag !== "ol") flushList();
      listTag = "ol";
      listBuf.push(inline(oli[1]));
      continue;
    }

    /*
     * Baris biasa di dalam daftar yang sedang terbuka adalah LANJUTAN butir
     * terakhir, bukan paragraf baru — butir daftar yang panjang juga dilipat.
     * Tanpa aturan ini, sambungan butir itu keluar dari daftarnya dan mendarat
     * sebagai paragraf sejajar di bawahnya.
     */
    if (listTag) {
      listBuf[listBuf.length - 1] += " " + inline(trimmed);
      continue;
    }
    paraBuf.push(trimmed);
  }

  flushAll();
  if (inCode) {
    out += `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`;
  }

  return out;
}
