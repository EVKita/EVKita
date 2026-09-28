/**
 * Uji lapisan anggota pengunjung — murni dan luring.
 *
 * Verifikasi tanda tangan RSA diuji dengan pasangan kunci yang dibuat saat
 * itu juga: token "Google" dirakit dan ditandatangani di sini, lalu diperiksa
 * `cocokTokenGoogle()` dengan kunci publiknya. Tanpa jaringan, tanpa rahasia.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pecahToken, cocokTokenGoogle, GalatAnggota } from "../src/lib/member.js";

const CLIENT_ID = "123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com";

function b64url(obj) {
  return Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Membuat token bertanda tangan dengan klaim yang bisa diubah per uji. */
function buatToken(kunciPrivat, kid, klaim, alg = "RS256") {
  const kepala = b64url({ alg, kid, typ: "JWT" });
  const isi = b64url(klaim);
  const tertanda = `${kepala}.${isi}`;
  const tanda = crypto.sign("sha256", Buffer.from(tertanda, "utf8"), kunciPrivat);
  const b64 = tanda.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${tertanda}.${b64}`;
}

function klaimBaik() {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "110169484474386276334",
    email: "pengunjung@contoh.id",
    email_verified: true,
    name: "Pengunjung Contoh",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
}

describe("pecahToken", () => {
  it("menolak yang bukan tiga bagian", () => {
    assert.throws(() => pecahToken("abc"), GalatAnggota);
    assert.throws(() => pecahToken("a.b.c.d"), GalatAnggota);
  });
});

describe("cocokTokenGoogle", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const jwks = [{ kid: "kunci-1", kty: "RSA", n: jwk.n, e: jwk.e }];

  it("menerima token yang sah", () => {
    const token = buatToken(privateKey, "kunci-1", klaimBaik());
    const hasil = cocokTokenGoogle(token, CLIENT_ID, jwks);
    assert.equal(hasil.email, "pengunjung@contoh.id");
    assert.equal(hasil.nama, "Pengunjung Contoh");
    assert.ok(hasil.id.startsWith("g:"));
  });

  it("menolak tanda tangan yang rusak", () => {
    const token = buatToken(privateKey, "kunci-1", klaimBaik());
    const rusak = token.slice(0, -4) + "AAAA";
    assert.throws(() => cocokTokenGoogle(rusak, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak kid yang tidak dikenal", () => {
    const token = buatToken(privateKey, "kunci-lain", klaimBaik());
    assert.throws(() => cocokTokenGoogle(token, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak audien yang salah", () => {
    const token = buatToken(privateKey, "kunci-1", { ...klaimBaik(), aud: "milik-orang-lain" });
    assert.throws(() => cocokTokenGoogle(token, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak token kedaluwarsa", () => {
    const token = buatToken(privateKey, "kunci-1", {
      ...klaimBaik(),
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    assert.throws(() => cocokTokenGoogle(token, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak penerbit yang salah", () => {
    const token = buatToken(privateKey, "kunci-1", { ...klaimBaik(), iss: "https://contoh.id" });
    assert.throws(() => cocokTokenGoogle(token, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak algoritma selain RS256", () => {
    const { privateKey: ec } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const kepala = b64url({ alg: "ES256", kid: "kunci-1" });
    const isi = b64url(klaimBaik());
    const tertanda = `${kepala}.${isi}`;
    const tanda = crypto.sign("sha256", Buffer.from(tertanda, "utf8"), ec);
    const b64 = tanda.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    assert.throws(() => cocokTokenGoogle(`${tertanda}.${b64}`, CLIENT_ID, jwks), GalatAnggota);
  });

  it("menolak email yang tidak sah", () => {
    const token = buatToken(privateKey, "kunci-1", { ...klaimBaik(), email: "bukan-email" });
    assert.throws(() => cocokTokenGoogle(token, CLIENT_ID, jwks), GalatAnggota);
  });
});
