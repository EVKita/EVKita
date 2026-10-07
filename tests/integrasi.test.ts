import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BAWAAN,
  adaTag,
  bersihkanAdsTxt,
  hostClerk,
  hostCsp,
  isiAdsTxt,
  normalisasi,
  periksa,
  statusGsc,
} from "../src/lib/integrasi.js";

/**
 * Integrasi Google.
 *
 * Satu aturan yang menjadi alasan seluruh berkas ini diuji: nilai yang
 * tersimpan di sini LANGSUNG menjadi bagian dari `<script>` di setiap halaman
 * publik, dan isi ads.txt langsung disajikan mentah di `/ads.txt`. Jadi yang
 * diuji bukan "apakah formulirnya bekerja", melainkan apakah nilai yang tidak
 * berbentuk id yang sah benar-benar DITOLAK — bukan dibersihkan lalu dipakai.
 */

describe("pemeriksaan id", () => {
  it("menerima ketiga bentuk id Analytics yang masih beredar", () => {
    for (const id of ["G-ABCD123456", "UA-12345678-1", "GT-ABCDE12"]) {
      assert.deepEqual(periksa({ gaId: id }).galat, [], id);
    }
  });

  it("menolak id Analytics yang tidak berbentuk", () => {
    for (const id of ["g-abc", "G-", "GA-123456", "sembarang"]) {
      assert.deepEqual(periksa({ gaId: id }).galat, ["err.integrasi.gaId"], id);
    }
  });

  it("menolak id yang menyelundupkan kode", () => {
    // Inilah kenapa polanya daftar-putih: nilainya berakhir di dalam <script>.
    const jahat = "G-ABCD123456');alert(1);//";
    assert.deepEqual(periksa({ gaId: jahat }).galat, ["err.integrasi.gaId"]);
    assert.equal(normalisasi({ gaAktif: true, gaId: jahat }).gaId, "");
  });

  it("memeriksa bentuk id penayang AdSense dan kode Search Console", () => {
    assert.deepEqual(periksa({ adsenseId: "ca-pub-1234567890123456" }).galat, []);
    assert.deepEqual(periksa({ adsenseId: "pub-123" }).galat, ["err.integrasi.adsenseId"]);
    assert.deepEqual(periksa({ gscToken: "a".repeat(43) }).galat, []);
    assert.deepEqual(periksa({ gscToken: "pendek" }).galat, ["err.integrasi.gscToken"]);
  });
});

describe("saklar tanpa isi", () => {
  it("menolak menyalakan layanan yang idnya belum diisi", () => {
    // Keadaan yang paling sering bikin orang kehilangan sore: panel bilang
    // "aktif", halaman tidak memuat apa pun, dan tidak ada yang menghubungkan
    // keduanya.
    assert.deepEqual(periksa({ gaAktif: true }).galat, ["err.integrasi.gaKosong"]);
    assert.deepEqual(periksa({ adsenseAktif: true }).galat, ["err.integrasi.adsenseKosong"]);
    assert.deepEqual(periksa({ gscAktif: true }).galat, ["err.integrasi.gscKosong"]);
  });
});

describe("normalisasi berkas", () => {
  it("mengisi bentuk lengkap dari berkas kosong", () => {
    assert.deepEqual(normalisasi(null), BAWAAN);
    assert.deepEqual(normalisasi("bukan objek"), BAWAAN);
  });

  it("mematikan saklar yang idnya tidak sah, meski berkasnya disunting tangan", () => {
    // data/integrasi.json bisa disunting lewat SSH; halaman publik tidak boleh
    // memuat apa pun dari sana tanpa diperiksa ulang.
    const s = normalisasi({ gaAktif: true, gaId: "rusak", adsenseAktif: true, adsenseId: "" });
    assert.equal(s.gaAktif, false);
    assert.equal(s.adsenseAktif, false);
  });

  it("membuang kunci asing tanpa jejak", () => {
    const s: any = normalisasi({ gaId: "G-ABCD123456", jahat: "<script>" });
    assert.equal(s.jahat, undefined);
  });
});

describe("ads.txt", () => {
  it("merakit baris bawaan Google dari id penayang", () => {
    const isi = isiAdsTxt({ adsenseAktif: true, adsenseId: "ca-pub-1234567890123456" });
    assert.equal(isi, "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("tidak menyajikan apa pun saat AdSense mati", () => {
    // Berkas ads.txt KOSONG punya arti sendiri di mata perayap Google
    // ("tidak ada yang boleh menjual"), jadi jawabannya harus tidak ada berkas.
    assert.equal(isiAdsTxt({ adsenseAktif: false, adsenseId: "ca-pub-1234567890123456" }), "");
  });

  it("membuang seluruh baris yang mengandung karakter di luar daftar-putih", () => {
    // Bukan cuma karakternya: baris yang separuh benar dibaca Google sebagai
    // penayang lain.
    const isi = bersihkanAdsTxt(
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n<script>alert(1)</script>\n\nfoo.com, 42, RESELLER"
    );
    assert.deepEqual(isi.split("\n"), [
      "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0",
      "foo.com, 42, RESELLER",
    ]);
  });

  it("isi sendiri menggantikan baris bawaan", () => {
    const isi = isiAdsTxt({
      adsenseAktif: true,
      adsenseId: "ca-pub-1234567890123456",
      adsTxt: "lain.com, 99, DIRECT",
    });
    assert.equal(isi, "lain.com, 99, DIRECT\n");
  });
});

describe("domain yang dibuka di CSP", () => {
  it("tidak melonggarkan apa pun kalau tidak ada yang menyala", () => {
    const h = hostCsp(BAWAAN);
    assert.deepEqual(h.script, []);
    assert.deepEqual(h.frame, []);
    assert.equal(adaTag(BAWAAN), false);
  });

  it("membuka googletagmanager hanya saat Analytics menyala", () => {
    const h = hostCsp({ gaAktif: true, gaId: "G-ABCD123456" });
    assert.ok(h.script.includes("https://www.googletagmanager.com"));
    assert.deepEqual(h.frame, []);
  });

  it("membuka frame-src untuk AdSense — iklannya digambar di dalam iframe", () => {
    const h = hostCsp({ adsenseAktif: true, adsenseId: "ca-pub-1234567890123456" });
    assert.ok(h.script.includes("https://pagead2.googlesyndication.com"));
    assert.ok(h.frame.includes("https://googleads.g.doubleclick.net"));
  });

  it("Search Console tidak memuat skrip apa pun, jadi CSP tidak disentuh", () => {
    const h = hostCsp({ gscAktif: true, gscToken: "a".repeat(43) });
    assert.deepEqual(h.script, []);
    assert.equal(adaTag({ gscAktif: true, gscToken: "a".repeat(43) }), true);
  });
});

describe("cara verifikasi Search Console", () => {
  const ga = { gaAktif: true, gaId: "G-ABCD123456" };

  it("lewat Analytics tidak butuh kode, dan statusnya ikut tag Analytics", () => {
    assert.deepEqual(periksa({ ...ga, gscMetode: "analytics" }).galat, []);
    assert.deepEqual(statusGsc({ ...ga, gscMetode: "analytics" }), { aktif: true, lewat: "analytics" });
    assert.equal(statusGsc({ gscMetode: "analytics" }).aktif, false);
  });

  it("menolak verifikasi lewat Analytics saat Analytics mati", () => {
    assert.deepEqual(periksa({ gscMetode: "analytics" }).galat, ["err.integrasi.gscButuhGa"]);
  });

  it("lewat DNS selalu aktif dan tidak menyisipkan penanda", () => {
    assert.deepEqual(statusGsc({ gscMetode: "dns" }), { aktif: true, lewat: "dns" });
    assert.equal(adaTag({ gscMetode: "dns", gscAktif: true, gscToken: "a".repeat(43) }), false);
  });

  it("berkas lama tanpa metode tetap dibaca sebagai tag HTML", () => {
    const s = normalisasi({ gscAktif: true, gscToken: "a".repeat(43), gscMetode: "<script>" });
    assert.equal(s.gscMetode, "tag");
    assert.deepEqual(statusGsc(s), { aktif: true, lewat: "tag" });
  });
});

describe("kunci Clerk", () => {
  // Kunci publishable = "pk_<jenis>_" + base64("<host Frontend API>$").
  const kunciUntuk = (host: string, jenis = "test") =>
    `pk_${jenis}_${Buffer.from(`${host}$`).toString("base64")}`;
  const dev = kunciUntuk("ajaib-kucing-12.clerk.accounts.dev");
  const prod = kunciUntuk("clerk.evkita.com", "live");

  it("menurunkan host Frontend API dari kuncinya", () => {
    assert.equal(hostClerk(dev), "ajaib-kucing-12.clerk.accounts.dev");
    assert.equal(hostClerk(prod), "clerk.evkita.com");
    assert.deepEqual(periksa({ clerkKey: prod }).galat, []);
  });

  it("menolak host yang menyelundupkan apa pun selain nama domain", () => {
    // Host-nya berakhir di atribut src skrip dan di header CSP.
    for (const host of ['x.dev" onload="alert(1)', "evil.com/;script-src *", "localhost", "a b.com", "evil.com; frame-src *"]) {
      const k = kunciUntuk(host);
      assert.equal(hostClerk(k), "", host);
      assert.equal(normalisasi({ clerkKey: k }).clerkKey, "", host);
    }
    // Tanpa penanda "$" di ujung, bukan kunci Clerk.
    assert.equal(hostClerk(`pk_test_${Buffer.from("clerk.evkita.com").toString("base64")}`), "");
  });

  it("memberi pesan sendiri untuk secret key yang salah tempel", () => {
    // Dirakit dari potongan: bentuk utuh `sk_live_…` dicegat pemindai rahasia
    // GitHub sebagai kunci Stripe, padahal ini cuma contoh palsu.
    const rahasiaPalsu = ["sk", "live", "x".repeat(26)].join("_");
    assert.deepEqual(periksa({ clerkKey: rahasiaPalsu }).galat, ["err.integrasi.clerkRahasia"]);
    assert.deepEqual(periksa({ clerkKey: "pk_test_bukan-base64!!" }).galat, ["err.integrasi.clerkKey"]);
  });

  it("membuka CSP hanya untuk host Clerk yang dipasang", () => {
    assert.deepEqual(hostCsp({}).worker, []);
    const csp = hostCsp({ clerkKey: prod });
    assert.ok(csp.script.includes("https://clerk.evkita.com"));
    assert.ok(csp.connect.includes("https://clerk.evkita.com"));
    assert.ok(csp.frame.includes("https://challenges.cloudflare.com"));
    assert.deepEqual(csp.worker, ["'self'", "blob:"]);
  });
});
