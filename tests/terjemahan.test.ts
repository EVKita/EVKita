import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  KUNCI_LEWAT,
  cocokkanStruktur,
  hashTeks,
  kumpulkanTeks,
  pecahPotongan,
  potongBatch,
  terapkanTerjemahan,
  terjemahContent,
} from "../src/lib/terjemahan";

/**
 * Lapisan terjemahan situs publik.
 *
 * Tidak ada uji di sini yang menyentuh jaringan atau kunci API: modelnya
 * diganti lewat `opsi.terjemah`, dan cachenya dialihkan ke direktori sementara.
 * Yang diuji justru bagian yang tidak bisa dibuktikan lewat panggilan model —
 * daftar teks yang boleh diterjemahkan, kunci cache yang berubah mengikuti
 * teksnya, dan jaminan bahwa kegagalan apa pun berakhir di teks Indonesia.
 */

const KONTEN = {
  revision: "12",
  site: {
    brandText: "EVKita",
    brandSuffix: ".com",
    logoMark: "EV",
    themePreset: "evkita",
    themeFont: "Inter",
    customCss: ".x { color: red; }",
    contactEmail: "halo@evkita.com",
    contactPhone: "0812-3456-7890",
    contactAddress: "Jalan Sudirman 1, Jakarta",
    heroTitle: "Kendaraan Listrik Indonesia",
    footerCopyright: "© 2026 {brand}. Hak cipta dilindungi.",
    showHero: true,
  },
  cars: [
    {
      id: "byd-atto-1",
      kind: "mobil",
      brand: "BYD",
      name: "Atto 1",
      bodyType: "Hatchback",
      status: "published",
      tagline: "Irit dan lincah",
      description: "Mobil kota yang hemat untuk perjalanan harian.",
      rangeStandard: "NEDC",
      driveType: "RWD",
      tags: ["hemat"],
      colors: ["Putih"],
      variantNames: ["Standard"],
      image: "/gambar/mobil/byd-atto-1.webp",
      price: 195000000,
      stale: false,
    },
  ],
  halaman: [
    {
      id: "tentang",
      slug: "tentang",
      title: "Tentang Kami",
      body: "## Sejarah\n\nSitus ini didirikan pada tahun 2020.\n\n- [Katalog](/katalog)",
      footerSlot: "menu",
      showInFooter: true,
    },
  ],
};

const SISIH = fs.mkdtempSync(path.join(os.tmpdir(), "terjemah-"));
after(() => {
  try {
    fs.rmSync(SISIH, { recursive: true, force: true });
  } catch {
    /* sudah hilang */
  }
});

let urut = 0;
function berkasBaru() {
  return path.join(SISIH, `en-${++urut}.json`);
}

describe("kumpulkanTeks", () => {
  it("mengumpulkan teks prosa dari seluruh koleksi", () => {
    const teks = kumpulkanTeks(KONTEN);
    for (const ada of [
      "Kendaraan Listrik Indonesia",
      "Jalan Sudirman 1, Jakarta",
      "Irit dan lincah",
      "Mobil kota yang hemat untuk perjalanan harian.",
      "Tentang Kami",
      "## Sejarah\n\nSitus ini didirikan pada tahun 2020.\n\n- [Katalog](/katalog)",
    ]) {
      assert.ok(teks.includes(ada), `harus mengumpulkan: ${ada}`);
    }
  });

  it("melewatkan identitas, pengelompokan, dan penunjuk", () => {
    const teks = kumpulkanTeks(KONTEN);
    for (const larang of [
      "byd-atto-1",
      "mobil",
      "BYD",
      "Atto 1",
      "Hatchback",
      "published",
      "NEDC",
      "RWD",
      "tentang",
      "menu",
      "/gambar/mobil/byd-atto-1.webp",
    ]) {
      assert.ok(!teks.includes(larang), `tidak boleh mengumpulkan: ${larang}`);
    }
  });

  it("melewatkan nilai bukan kalimat: angka, boolean, alamat, warna, istilah teknis", () => {
    const teks = kumpulkanTeks({
      price: 195000000,
      stale: false,
      kosong: null,
      pendek: "a",
      alamat: "https://example.com/x",
      relatif: "/katalog",
      jangkar: "#daftar",
      warna: "#37e0a6",
      angka: "1.500",
      telepon: "+62 812-3456-7890",
      istilah: "blur",
      tanggal: "2026-09-20T00:00:00.000Z",
      kalimat: "Buka pukul 08.00.",
    });
    assert.deepEqual(teks, ["Buka pukul 08.00."]);
  });

  it("sub-pohon kunci terlarang dilewati sebagai utuh, bukan hanya nilainya", () => {
    const teks = kumpulkanTeks({ gallery: [{ url: "/a.webp", alt: "Keterangan foto" }] });
    assert.deepEqual(teks, []);
  });

  it("elemen larik mewarisi kunci induknya", () => {
    const teks = kumpulkanTeks({ tags: ["hemat listrik"], highlights: ["Jarak tempuh jauh"] });
    assert.deepEqual(teks, ["Jarak tempuh jauh"]);
  });

  it("mengembalikan teks unik dan menerima kunci tambahan dari pemanggil", () => {
    const ganda = { a: "Sama", b: "Sama" };
    assert.deepEqual(kumpulkanTeks(ganda), ["Sama"]);
    assert.deepEqual(kumpulkanTeks({ khusus: "Jangan terjemahkan" }, { lewatiKunci: ["khusus"] }), []);
    assert.ok(KUNCI_LEWAT.has("status"));
  });
});

describe("terapkanTerjemahan", () => {
  it("mengganti teks yang ada di peta dan membiarkan sisanya apa adanya", () => {
    const asal = "Judul asli";
    const objek = { title: asal, id: "x", status: "published", body: "Tidak ada di peta." };
    const hasil = terapkanTerjemahan(objek, { [asal]: "Original title" });

    assert.equal(hasil.title, "Original title");
    assert.equal(hasil.id, "x");
    assert.equal(hasil.status, "published");
    assert.equal(hasil.body, "Tidak ada di peta.");
    // Input tidak pernah disentuh.
    assert.equal(objek.title, asal);
    assert.notEqual(hasil, objek);
  });

  it("kunci terlarang tidak diganti walaupun ada di peta", () => {
    const hasil = terapkanTerjemahan({ id: "x", title: "Judul" }, { x: "ID-EN", "Judul": "Title" });
    assert.equal(hasil.id, "x");
    assert.equal(hasil.title, "Title");
  });

  it("placeholder dan tujuan tautan Markdown ikut terbawa", () => {
    const sumber =
      "Ketentuan di {brand} tahun {tahun}. Buka [katalog](/katalog) dan [tentang](/tentang).";
    const gantian =
      "Terms at {brand} in {tahun}. Open the [catalogue](/katalog) and [about](/tentang).";
    const hasil = terapkanTerjemahan({ body: sumber }, { [sumber]: gantian });
    assert.equal(hasil.body, gantian);
    assert.deepEqual(kumpulkanTeks(hasil), [gantian]);
  });

  it("round-trip: kumpulkan → ganti → kumpulkan lagi menghasilkan terjemahannya", () => {
    const objek = { site: { heroTitle: "Selamat datang" }, cars: [{ tagline: "Irit dan lincah" }] };
    const peta: Record<string, string> = {};
    for (const t of kumpulkanTeks(objek)) peta[t] = `[EN] ${t}`;

    const hasil = terapkanTerjemahan(objek, peta);
    assert.deepEqual(kumpulkanTeks(hasil), ["[EN] Selamat datang", "[EN] Irit dan lincah"]);
    // Karena kuncinya teks asli, terjemahan hasil ganti tidak diincar lagi.
    assert.equal(hasil.site.heroTitle, "[EN] Selamat datang");
  });
});

describe("hashTeks", () => {
  it("berubah kalau teksnya berubah, stabil kalau tidak", () => {
    assert.equal(hashTeks("Mobil listrik"), hashTeks("Mobil listrik"));
    assert.notEqual(hashTeks("Mobil listrik"), hashTeks("Mobil listrik "));
    assert.notEqual(hashTeks("Mobil listrik"), hashTeks("Mobil Listrik"));
    assert.match(hashTeks("apa pun"), /^[0-9a-f]{40}$/);
  });

  it("satu karakter sudah cukup untuk membuat entri cache yang baru", () => {
    const lama = { judul: "Tentang Kami" };
    const baru = { judul: "Tentang Kami." };
    assert.notEqual(hashTeks(kumpulkanTeks(lama)[0]), hashTeks(kumpulkanTeks(baru)[0]));
  });
});

describe("pecahPotongan", () => {
  it("menyambung kembali hasilnya menjadi teks yang persis sama", () => {
    const teks = Array.from({ length: 400 }, (_, i) => `Paragraf nomor ${i} berisi teks yang cukup panjang.`).join(
      "\n\n"
    );
    assert.ok(teks.length > 8000);

    const potongan = pecahPotongan(teks, 8000);
    assert.ok(potongan.length > 1);
    assert.ok(potongan.every((p) => p.length <= 8000));
    assert.equal(potongan.join(""), teks);
  });

  it("memotong di batas paragraf, bukan di tengah kalimat", () => {
    const paragraf = ["A".repeat(4000), "B".repeat(4000), "C".repeat(4000)];
    const teks = paragraf.join("\n\n");
    const potongan = pecahPotongan(teks, 8000);

    assert.equal(potongan.join(""), teks);
    assert.ok(potongan.every((p) => p.length <= 8000));
    // Tiap potongan hanya berisi paragraf utuh — tidak ada huruf yang
    // terpotong di tengah potongan (pemisahnya boleh menempel di pinggir).
    assert.deepEqual(
      potongan.map((p) => p.replace(/^\n+|\n+$/g, "")),
      paragraf
    );
  });

  it("teks pendek tidak dipotong sama sekali", () => {
    assert.deepEqual(pecahPotongan("pendek"), ["pendek"]);
  });
});

describe("potongBatch", () => {
  it("tidak melebihi batas jumlah dan batas karakter, tanpa kehilangan indeks", () => {
    const daftar = Array.from({ length: 130 }, (_, i) => `x`.repeat(300));
    const batch = potongBatch(daftar);

    assert.deepEqual(
      batch.flat(),
      daftar.map((_, i) => i)
    );
    for (const b of batch) {
      assert.ok(b.length <= 60);
      const karakter = b.reduce((n, i) => n + daftar[i].length, 0);
      assert.ok(karakter <= 8000, `karakter batch ${karakter} > 8000`);
    }
  });

  it("membatasi jumlah elemen walaupun teksnya kecil-kecil", () => {
    const batch = potongBatch(Array.from({ length: 130 }, () => "x"));
    assert.deepEqual(batch.map((b) => b.length), [60, 60, 10]);
  });

  it("satu teks yang lebih panjang dari batas tetap masuk sendirian", () => {
    const batch = potongBatch(["y".repeat(9000), "z"]);
    assert.deepEqual(batch, [[0], [1]]);
  });
});

describe("cocokkanStruktur", () => {
  it("menerima terjemahan yang mempertahankan placeholder dan tujuan tautan", () => {
    assert.equal(
      cocokkanStruktur("Baca [panduan](/panduan) untuk {brand}.", "Read the [guide](/panduan) for {brand}.").ok,
      true
    );
    // Urutan placeholder bebas; yang penting isinya sama.
    assert.equal(cocokkanStruktur("{a} dan {b}", "{b} and {a}").ok, true);
  });

  it("menolak terjemahan yang membuang placeholder", () => {
    const hasil = cocokkanStruktur("Ketentuan di {brand} berlaku.", "Terms apply.");
    assert.equal(hasil.ok, false);
    assert.match(hasil.alasan, /placeholder/i);
  });

  it("menolak terjemahan yang mengubah tujuan tautan", () => {
    const hasil = cocokkanStruktur("Lihat [katalog](/katalog).", "See the [catalogue](/lain).");
    assert.equal(hasil.ok, false);
    assert.match(hasil.alasan, /tautan/i);
  });

  it("menolak terjemahan kosong", () => {
    assert.equal(cocokkanStruktur("Terisi", "   ").ok, false);
  });
});

describe("terjemahContent", () => {
  it("selain Bahasa Inggris dan Mandarin mengembalikan konten yang sama persis, tanpa bekerja", async () => {
    for (const lang of ["id", "id-ID", "fr", undefined, ""]) {
      assert.equal(await terjemahContent(KONTEN, lang as any), KONTEN);
    }
  });

  it("menerjemahkan ke Mandarin lewat cache sendiri dengan arah id → zh", async () => {
    const berkas = berkasBaru();
    const diminta: any[] = [];
    const terjemah = async (daftar: string[], bahasa?: any) => {
      diminta.push(bahasa);
      return daftar.map((t) => `[ZH] ${t}`);
    };

    const hasil = await terjemahContent(KONTEN, "zh", { terjemah, berkas });
    assert.equal(hasil.site.heroTitle, "[ZH] Kendaraan Listrik Indonesia");
    assert.equal(hasil.cars[0].tagline, "[ZH] Irit dan lincah");
    // Field terlarang tetap tidak tersentuh, konten asli tidak berubah.
    assert.equal(hasil.cars[0].brand, "BYD");
    assert.equal(KONTEN.site.heroTitle, "Kendaraan Listrik Indonesia");
    // Penerjemah dipanggil dengan arah yang benar.
    assert.ok(diminta.length > 0);
    for (const b of diminta) assert.deepEqual(b, { dari: "id", ke: "zh" });
  });

  it("menerjemahkan, menyimpan ke cache, dan tidak memanggil model dua kali", async () => {
    const berkas = berkasBaru();
    const panggilan: string[][] = [];
    const terjemah = async (daftar: string[]) => {
      panggilan.push([...daftar]);
      return daftar.map((t) => `[EN] ${t}`);
    };

    const hasil = await terjemahContent(KONTEN, "en", { terjemah, berkas });
    assert.equal(hasil.site.heroTitle, "[EN] Kendaraan Listrik Indonesia");
    assert.equal(hasil.cars[0].tagline, "[EN] Irit dan lincah");
    // Field terlarang tidak tersentuh.
    assert.equal(hasil.cars[0].brand, "BYD");
    assert.equal(hasil.cars[0].status, "published");
    assert.equal(hasil.halaman[0].footerSlot, "menu");
    // Konten asli tidak pernah diubah.
    assert.equal(KONTEN.site.heroTitle, "Kendaraan Listrik Indonesia");

    const cache = JSON.parse(fs.readFileSync(berkas, "utf8"));
    assert.equal(cache[hashTeks("Kendaraan Listrik Indonesia")], "[EN] Kendaraan Listrik Indonesia");
    assert.equal(cache[hashTeks("BYD")], undefined);

    // Render kedua: seluruh teks sudah ada di cache.
    panggilan.length = 0;
    const kedua = await terjemahContent(KONTEN, "en", { terjemah, berkas });
    assert.equal(panggilan.length, 0);
    assert.equal(kedua.site.heroTitle, "[EN] Kendaraan Listrik Indonesia");
  });

  it("teks yang diedit menghasilkan kunci baru dan hanya itu yang dikirim ulang", async () => {
    const berkas = berkasBaru();
    const panggilan: string[][] = [];
    const terjemah = async (daftar: string[]) => {
      panggilan.push([...daftar]);
      return daftar.map((t) => `[EN] ${t}`);
    };

    await terjemahContent(KONTEN, "en", { terjemah, berkas });
    panggilan.length = 0;

    // Satu judul diganti satu karakter — sisanya persis sama.
    const diedit = structuredClone(KONTEN);
    diedit.halaman[0].title = "Tentang Kami ";

    await terjemahContent(diedit, "en", { terjemah, berkas });
    assert.deepEqual(panggilan, [["Tentang Kami "]]);
  });

  it("galat penerjemahan berakhir dengan konten Indonesia asli", async () => {
    const berkas = berkasBaru();
    const jaringanMati = async () => {
      throw new Error("jaringan mati");
    };
    assert.equal(await terjemahContent(KONTEN, "en", { terjemah: jaringanMati, berkas }), KONTEN);

    const jumlahSalah = async (daftar: string[]) => daftar.slice(0, -1);
    assert.equal(await terjemahContent(KONTEN, "en", { terjemah: jumlahSalah, berkas }), KONTEN);

    const placeholderHilang = async (daftar: string[]) => daftar.map(() => "Tanpa placeholder");
    assert.equal(await terjemahContent(KONTEN, "en", { terjemah: placeholderHilang, berkas }), KONTEN);
  });

  it("panggilan yang datang bersamaan tidak menerjemahkan teks yang sama dua kali", async () => {
    const berkas = berkasBaru();
    let jumlah = 0;
    const terjemah = async (daftar: string[]) => {
      jumlah += daftar.length;
      await new Promise((r) => setTimeout(r, 25));
      return daftar.map((t) => `[EN] ${t}`);
    };

    const [a, b] = await Promise.all([
      terjemahContent(KONTEN, "en", { terjemah, berkas }),
      terjemahContent(KONTEN, "en", { terjemah, berkas }),
    ]);

    assert.equal(jumlah, kumpulkanTeks(KONTEN).length);
    assert.equal(a.site.heroTitle, b.site.heroTitle);
    assert.equal(a.site.heroTitle, "[EN] Kendaraan Listrik Indonesia");
  });

  it("teks panjang dipecah per paragraf lalu disambung kembali jadi satu entri", async () => {
    const berkas = berkasBaru();
    const panjang = Array.from({ length: 500 }, (_, i) => `Paragraf ${i} berisi kalimat yang cukup untuk memaksa pemotongan.`).join(
      "\n\n"
    );
    const konten = { halaman: [{ id: "panjang", slug: "panjang", title: "Panjang", body: panjang }] };

    const masukan: string[] = [];
    const terjemah = async (daftar: string[]) => {
      masukan.push(...daftar);
      return daftar.map((t) => `[EN] ${t}`);
    };

    const hasil = await terjemahContent(konten, "en", { terjemah, berkas });
    assert.ok(masukan.length > 1, "harus terbagi jadi beberapa permintaan");
    assert.ok(masukan.every((t) => t.length <= 8000));
    // Tiap potongan diterjemahkan sendiri-sendiri, lalu disambung persis
    // seperti aslinya — tidak ada paragraf yang terbuang atau terduplikasi.
    const harapan = pecahPotongan(panjang)
      .map((p) => `[EN] ${p}`)
      .join("");
    assert.equal(hasil.halaman[0].body, harapan);

    const cache = JSON.parse(fs.readFileSync(berkas, "utf8"));
    assert.equal(cache[hashTeks(panjang)], harapan);
  });
});
