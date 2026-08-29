import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { urlAmanUntukAmbil, ipTerlarang, hostBoleh } from "../src/lib/gambar-url.js";

/**
 * Penjaga fitur "ambil gambar dari URL".
 *
 * Yang diuji di sini bukan kerapian, melainkan satu hal: server tidak boleh
 * bisa disuruh mengetuk pintu di jaringannya sendiri. Setiap baris di bawah
 * mewakili satu cara yang benar-benar dipakai orang untuk menyamarkan alamat
 * lokal sebagai alamat biasa.
 */

describe("urlAmanUntukAmbil — bentuk alamat", () => {
  it("melewatkan alamat gambar biasa", () => {
    for (const url of [
      "https://www.byd.com/id/car/seal.jpg",
      "http://gambar.evkita.com/a/b.png?v=2",
      "https://cdn.contoh.co.id:443/x.webp",
    ]) {
      const hasil = urlAmanUntukAmbil(url);
      assert.equal(hasil.ok, true, `seharusnya lolos: ${url}`);
    }
  });

  it("menolak skema selain http dan https", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://contoh.com/x.jpg",
      "data:image/png;base64,iVBORw0KGgo=",
      "javascript:alert(1)",
      "gopher://contoh.com/",
    ]) {
      assert.equal(urlAmanUntukAmbil(url).ok, false, `seharusnya ditolak: ${url}`);
    }
  });

  it("menolak alamat IP dalam bentuk apa pun", () => {
    /*
     * Semua baris ini menunjuk localhost, dan semuanya diterima
     * `getaddrinfo`. Penyaring yang cuma mencari teks "127.0.0.1" akan
     * meloloskan lima di antaranya.
     */
    for (const url of [
      "http://127.0.0.1/x.jpg",
      "http://127.1/x.jpg",
      "http://2130706433/x.jpg",
      "http://0177.0.0.1/x.jpg",
      "http://0x7f000001/x.jpg",
      "http://[::1]/x.jpg",
      "http://[::ffff:127.0.0.1]/x.jpg",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/x.jpg",
      "http://192.168.1.1/x.jpg",
    ]) {
      assert.equal(urlAmanUntukAmbil(url).ok, false, `seharusnya ditolak: ${url}`);
    }
  });

  it("menolak nama yang tidak pernah menunjuk ke internet publik", () => {
    for (const url of [
      "http://localhost/x.jpg",
      "http://server.local/x.jpg",
      "http://metadata.internal/x.jpg",
      "http://mesin.lan/x.jpg",
      "http://situs/x.jpg",
    ]) {
      assert.equal(urlAmanUntukAmbil(url).ok, false, `seharusnya ditolak: ${url}`);
    }
  });

  it("menolak alamat yang berarti dua hal berbeda", () => {
    // Dibaca orang sebagai evkita.com; dihubungi peramban sebagai 127.0.0.1.
    assert.equal(urlAmanUntukAmbil("http://evkita.com@127.0.0.1/x.jpg").ok, false);
    assert.equal(urlAmanUntukAmbil("http://pengguna:sandi@contoh.com/x.jpg").ok, false);
  });

  it("menolak port di luar port web", () => {
    // Fitur ini mengambil gambar dari situs, bukan mengetuk layanan internal.
    for (const url of [
      "http://contoh.com:22/x.jpg",
      "http://contoh.com:6379/x.jpg",
      "http://contoh.com:4322/api/users",
    ]) {
      assert.equal(urlAmanUntukAmbil(url).ok, false, `seharusnya ditolak: ${url}`);
    }
    assert.equal(urlAmanUntukAmbil("http://contoh.com:80/x.jpg").ok, true);
    assert.equal(urlAmanUntukAmbil("https://contoh.com:443/x.jpg").ok, true);
  });

  it("nilai kosong dan sampah tidak melempar, cuma ditolak", () => {
    for (const v of [null, undefined, "", "   ", "bukan alamat", "://", 42]) {
      assert.equal(urlAmanUntukAmbil(v as unknown as string).ok, false);
    }
  });

  it("alasan penolakan berupa kunci terjemahan, bukan kalimat", () => {
    // Panel menerjemahkannya sendiri; kalimat jadi dari server tidak akan
    // pernah berbahasa Inggris atau Mandarin.
    const hasil = urlAmanUntukAmbil("file:///etc/passwd");
    assert.equal(hasil.ok, false);
    assert.match((hasil as { alasan: string }).alasan, /^err\./);
  });
});

describe("hostBoleh", () => {
  it("menerima nama domain wajar, termasuk bentuk absolut", () => {
    assert.equal(hostBoleh("evkita.com"), true);
    assert.equal(hostBoleh("cdn.gambar.evkita.co.id"), true);
    assert.equal(hostBoleh("EVKita.COM"), true);
    assert.equal(hostBoleh("evkita.com."), true);
  });

  it("menolak nama tanpa titik dan akhiran berangka", () => {
    assert.equal(hostBoleh("evkita"), false);
    assert.equal(hostBoleh("contoh.123"), false);
    assert.equal(hostBoleh(""), false);
    assert.equal(hostBoleh(undefined), false);
  });
});

describe("ipTerlarang — hasil penerjemahan nama", () => {
  it("menolak seluruh jangkauan yang tidak boleh dihubungi", () => {
    for (const ip of [
      "0.0.0.0",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254", // metadata AWS/GCP — sasaran SSRF paling klasik
      "100.64.0.1",
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "2002:7f00:1::",
      "64:ff9b::7f00:1",
      "",
      "bukan-ip",
    ]) {
      assert.equal(ipTerlarang(ip), true, `seharusnya ditolak: ${ip}`);
    }
  });

  it("melewatkan alamat publik", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "158.69.117.157", // server EVKita sendiri, dilihat dari luar
      "172.15.0.1", // tepat di luar 172.16/12
      "172.32.0.1", // tepat di luar sisi satunya
      "2606:4700::1111",
    ]) {
      assert.equal(ipTerlarang(ip), false, `seharusnya lolos: ${ip}`);
    }
  });
});
