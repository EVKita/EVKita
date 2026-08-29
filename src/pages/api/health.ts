import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import { readContent } from "../../lib/store";
import { usersFileIsUnreadable } from "../../lib/users";

/**
 * Titik periksa ringan untuk PM2, pemantau uptime, dan `install.sh`.
 *
 * Sebelum ini satu-satunya cara memastikan aplikasi hidup adalah mengambil
 * beranda penuh — yang berarti membaca dan menormalkan seluruh konten hanya
 * untuk menjawab "hidup?". Endpoint ini juga melaporkan dua hal yang tidak
 * terlihat dari luar dan bisa membuat panel gagal diam-diam: direktori `data/`
 * yang tidak bisa ditulis, dan berkas akun yang rusak.
 *
 * Sengaja TANPA autentikasi — pemantau tidak punya sesi — jadi isinya dijaga
 * supaya tidak membocorkan apa pun: tidak ada nama pengguna, tidak ada jalur
 * berkas, tidak ada isi konfigurasi.
 */
export const GET: APIRoute = () => {
  let version = "dev";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    version = String(pkg.version || "dev");
  } catch {
    /* paket tanpa package.json — anggap versi pengembangan */
  }

  let dataWritable = false;
  try {
    const dir = path.resolve(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    dataWritable = true;
  } catch {
    dataWritable = false;
  }

  const content = readContent();
  const usersBroken = usersFileIsUnreadable();
  const ok = dataWritable && !usersBroken;

  return new Response(
    JSON.stringify({
      ok,
      version,
      uptime: Math.round(process.uptime()),
      dataWritable,
      usersFileReadable: !usersBroken,
      counts: {
        cars: (content.cars || []).length,
        motors: (content.motors || []).length,
        spklu: (content.spklu || []).length,
        bengkel: (content.bengkel || []).length,
        berita: (content.berita || []).length,
        halaman: (content.halaman || []).length,
      },
    }),
    {
      // Status non-200 saat ada yang salah supaya pemantau bereaksi tanpa
      // perlu mengurai isi jawabannya.
      status: ok ? 200 : 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
};
