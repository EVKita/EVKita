import nodemailer from "nodemailer";
import { getEnv } from "./env";

/**
 * Pengaturan SMTP untuk formulir kontak.
 *
 * Aturan yang memegang seluruh berkas ini, sama seperti kunci API DeepSeek:
 *
 *   Kata sandi masuk lewat panel, dan TIDAK PERNAH keluar lagi.
 *
 * Nilai-nilainya disimpan di `.env` lewat `writeEnvFile()` — berkas yang sama
 * yang sudah dipakai wizard `/install` dan halaman Pengaturan AI, dan yang
 * sudah ikut dicadangkan `deploy.sh`. `getEnv()` membacanya saat dipanggil,
 * bukan saat aplikasi mulai, jadi pengaturan yang baru disimpan langsung
 * terpakai tanpa perlu memuat ulang PM2.
 *
 * Tidak ada satu pun jawaban panel yang memuat kata sandinya. Yang dikirim
 * hanya "terpasang atau belum" dan field lain yang memang bukan rahasia.
 */

const KEY = {
  host: "SMTP_HOST",
  port: "SMTP_PORT",
  user: "SMTP_USER",
  pass: "SMTP_PASS",
  from: "SMTP_FROM",
  secure: "SMTP_SECURE",
} as const;

export interface KonfigurasiSmtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Alamat "dari". Kosong berarti memakai `user`. */
  from: string;
  /** Sambungkan lewat TLS sejak awal (port 465), bukan STARTTLS. */
  secure: boolean;
}

export function bacaSmtp(): KonfigurasiSmtp | null {
  const host = getEnv(KEY.host, "").trim();
  const user = getEnv(KEY.user, "").trim();
  const pass = getEnv(KEY.pass, "");
  if (!host || !user || !pass) return null;

  const portRaw = getEnv(KEY.port, "587").trim();
  const port = Number(portRaw);
  return {
    host,
    port: Number.isFinite(port) && port > 0 && port <= 65535 ? port : 587,
    user,
    pass,
    from: getEnv(KEY.from, "").trim() || user,
    secure: getEnv(KEY.secure, "").trim() === "true",
  };
}

/** Apakah SMTP sudah terpasang lengkap? Dipakai footer untuk memilih formulir. */
export function smtpTerpasang(): boolean {
  return bacaSmtp() !== null;
}

/**
 * Bentuk yang aman dikirim ke panel. Sengaja TIDAK memuat kata sandi — ia
 * tidak boleh sampai ke DOM.
 */
export function smtpState() {
  const terpasang = smtpTerpasang();
  return {
    ok: true,
    terpasang,
    host: getEnv(KEY.host, "").trim(),
    port: getEnv(KEY.port, "587").trim(),
    user: getEnv(KEY.user, "").trim(),
    from: getEnv(KEY.from, "").trim(),
    secure: getEnv(KEY.secure, "").trim() === "true",
  };
}

/**
 * Mengirim email.
 *
 * `bacaSmtp()` yang memastikan pengaturannya lengkap, jadi pemanggil bisa
 * memeriksa `smtpTerpasang()` lebih dulu untuk memberi pesan yang lebih ramah.
 * Galat yang dilempar di sini adalah galat asli dari nodemailer/SMTP — isinya
 * dipakai panel sebagai keterangan rinci saat uji kirim.
 */
export async function kirimEmail(o: {
  ke: string;
  balasKe?: string;
  subjek: string;
  teks: string;
}): Promise<void> {
  const cfg = bacaSmtp();
  if (!cfg) throw new Error("SMTP belum dikonfigurasi");

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    await transport.sendMail({
      from: cfg.from,
      to: o.ke,
      replyTo: o.balasKe,
      subject: o.subjek,
      text: o.teks,
    });
  } finally {
    transport.close();
  }
}
