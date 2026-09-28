/**
 * Anggota pengunjung — orang yang masuk lewat pintu login situs publik.
 *
 * Bedakan dari `users.ts`: itu akun PANEL (pemilik/admin/editor yang menyunting
 * konten), ini akun PENGUNJUNG (pembaca yang diminta masuk setelah dua klik).
 * Keduanya tidak pernah bertemu — sesi panel tidak membuat pintu pengunjung
 * terbuka, dan sebaliknya.
 *
 * Satu-satunya jalan masuk yang terverifikasi saat ini adalah token ID Google
 * (Google Identity Services). Tokennya diperiksa di sini, kunci publiknya
 * diambil dari Google dan di-cache sejam. Bentuknya JWT RS256 yang
 * ditandatangani Google — bukan klaim yang dipercaya begitu saja.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MEMBER_COOKIE = "evkita_member";

const MEMBERS_FILE = () => path.join(path.resolve(process.cwd(), "data"), "members.json");
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Kunci publik Google di-cache sejam — diambil ulang hanya kalau kadaluarsa. */
let cacheSertifikat = null;

export class GalatAnggota extends Error {}

/* ------------------------------------------------------------------ *
 * JWT — dipecah dan diperiksa tanpa pustaka tambahan
 * ------------------------------------------------------------------ */

function b64urlHancur(bagian) {
  const normal = String(bagian || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normal, "base64");
}

/** Memecah token jadi {kepala, isi, tertanda}. Melempar kalau bentuknya salah. */
export function pecahToken(token) {
  const potong = String(token || "").split(".");
  if (potong.length !== 3) throw new GalatAnggota("bentuk");
  let kepala;
  let isi;
  try {
    kepala = JSON.parse(b64urlHancur(potong[0]).toString("utf8"));
    isi = JSON.parse(b64urlHancur(potong[1]).toString("utf8"));
  } catch {
    throw new GalatAnggota("bentuk");
  }
  return { kepala, isi, tertanda: `${potong[0]}.${potong[1]}`, tanda: b64urlHancur(potong[2]) };
}

/**
 * Memeriksa token ID Google terhadap sekumpulan kunci (JWKS Google).
 *
 * Murni dan bisa diuji tanpa jaringan: `jwks` berbentuk larik kunci JWK
 * (`{ kid, kty: "RSA", n, e }`). Yang diperiksa: algoritma, kecocokan `kid`,
 * tanda tangan, penerbit, `aud` (harus persis client ID kita), kedaluwarsa,
 * dan keberadaan email.
 *
 * @returns {{ id: string; email: string; nama: string }}
 */
export function cocokTokenGoogle(token, clientId, jwks) {
  const { kepala, isi, tertanda, tanda } = pecahToken(token);

  if (!kepala || kepala.alg !== "RS256" || !kepala.kid) throw new GalatAnggota("algoritma");
  const kunci = (Array.isArray(jwks) ? jwks : []).find((k) => k && k.kid === kepala.kid && k.kty === "RSA");
  if (!kunci || !kunci.n || !kunci.e) throw new GalatAnggota("kunci");

  let publik;
  try {
    publik = crypto.createPublicKey({ key: { kty: "RSA", n: kunci.n, e: kunci.e }, format: "jwk" });
  } catch {
    throw new GalatAnggota("kunci");
  }
  let sah = false;
  try {
    sah = crypto.verify("sha256", Buffer.from(tertanda, "utf8"), publik, tanda);
  } catch {
    sah = false;
  }
  if (!sah) throw new GalatAnggota("tanda");

  const penerbit = ["accounts.google.com", "https://accounts.google.com"];
  if (!penerbit.includes(isi.iss)) throw new GalatAnggota("penerbit");
  if (isi.aud !== clientId) throw new GalatAnggota("audien");
  const sekarang = Math.floor(Date.now() / 1000);
  if (typeof isi.exp !== "number" || isi.exp <= sekarang - 60) throw new GalatAnggota("kedaluwarsa");
  const email = String(isi.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GalatAnggota("email");

  return { id: `g:${String(isi.sub || email)}`, email, nama: String(isi.name || email.split("@")[0]) };
}

async function sertifikatGoogle() {
  const sekarang = Date.now();
  if (cacheSertifikat && cacheSertifikat.kadaluarsa > sekarang) return cacheSertifikat.kunci;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new GalatAnggota("sertifikat");
  const data = await res.json();
  const kunci = Array.isArray(data?.keys) ? data.keys : [];
  if (!kunci.length) throw new GalatAnggota("sertifikat");
  cacheSertifikat = { kunci, kadaluarsa: sekarang + 60 * 60 * 1000 };
  return kunci;
}

/** Jalan lengkap: ambil kunci Google lalu cocokkan. Melempar `GalatAnggota`. */
export async function verifikasiTokenGoogle(token, clientId) {
  if (!token || String(token).length > 8000) throw new GalatAnggota("bentuk");
  const kunci = await sertifikatGoogle();
  return cocokTokenGoogle(token, clientId, kunci);
}

/* ------------------------------------------------------------------ *
 * Penyimpanan anggota — `data/members.json`, ikut .gitignore
 * ------------------------------------------------------------------ */

function tulisAtomik(file, teks) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sementara = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(sementara, teks, "utf8");
  fs.renameSync(sementara, file);
}

export function bacaAnggotaSemua() {
  try {
    const data = JSON.parse(fs.readFileSync(MEMBERS_FILE(), "utf8"));
    return Array.isArray(data?.members) ? data.members : [];
  } catch {
    return [];
  }
}

/** Mencatat atau memutakhirkan anggota dari klaim Google yang sudah cocok. */
export function simpanAnggota(klaim) {
  const semua = bacaAnggotaSemua();
  const sekarang = new Date().toISOString();
  let ketemu = semua.find((m) => m && m.id === klaim.id);
  if (!ketemu) {
    ketemu = { id: klaim.id, email: klaim.email, nama: klaim.nama, dibuat: sekarang };
    semua.push(ketemu);
  }
  ketemu.email = klaim.email;
  ketemu.nama = klaim.nama;
  ketemu.masukTerakhir = sekarang;
  tulisAtomik(MEMBERS_FILE(), JSON.stringify({ members: semua }, null, 2));
  return ketemu;
}
