/**
 * tools/force-update.mjs
 *
 * Skrip CLI untuk memaksa refresh berita, artikel, dan pembaruan katalog
 * kendaraan HARI INI — tanpa harus menunggu middleware dipanggil.
 *
 * Dijalankan dari root proyek:
 *   node tools/force-update.mjs           # semua
 *   node tools/force-update.mjs berita    # hanya berita
 *   node tools/force-update.mjs artikel   # hanya artikel harian
 *   node tools/force-update.mjs katalog   # hanya katalog kendaraan
 *
 * Catatan: skrip ini memuat modul server — harus dijalankan di lingkungan
 * Node yang sama dengan aplikasi (bukan di browser). Tidak perlu kunci API
 * untuk berita; artikel dan katalog membutuhkan kunci AI yang tersimpan di .env.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Muat .env agar kunci AI tersedia (memakai API bawaan Node 20+)
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch {}
}

// Ubah working directory ke root agar path data/ benar
process.chdir(ROOT);

const mode = process.argv[2] || "semua";
const jalanBerita = mode === "semua" || mode === "berita";
const jalanArtikel = mode === "semua" || mode === "artikel";
const jalanKatalog = mode === "semua" || mode === "katalog";

console.log(`\n[force-update] Mode: ${mode} — ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n`);

if (jalanBerita) {
  console.log("📰 Memperbarui berita dari semua sumber RSS...");
  try {
    const { perbaruiBerita } = await import("../src/lib/berita-harian.js");
    const hasil = await perbaruiBerita({ paksa: true });
    if (hasil.dilewati) {
      console.log("   ⏭  Dilewati:", hasil.alasan || "(tidak diketahui)");
    } else if (hasil.error) {
      console.error("   ❌ Gagal:", hasil.error);
    } else {
      console.log(`   ✅ Ditambah: ${hasil.ditambah} berita | Total: ${hasil.total} | Sumber gagal: ${(hasil.gagal || []).join(", ") || "tidak ada"}`);
    }
  } catch (e) {
    console.error("   ❌ Error memuat modul berita:", e.message);
  }
}

if (jalanArtikel) {
  console.log("\n✍️  Menulis artikel harian otomatis (ID + US + CN)...");
  try {
    const { jalankanArtikel } = await import("../src/lib/artikel-harian.js");
    const hasil = await jalankanArtikel({ paksa: true });
    if (hasil.dilewati) {
      console.log("   ⏭  Dilewati:", hasil.alasan || "(tidak diketahui)");
    } else if (hasil.errorKey && !hasil.ok) {
      console.error("   ❌ Gagal:", hasil.errorKey);
    } else {
      console.log(`   ✅ ID: ${hasil.ok ? hasil.judul || "OK" : "gagal"}`);
      console.log(`   ✅ US: ${hasil.hasilUs?.ok ? hasil.hasilUs.judul || "OK" : (hasil.hasilUs?.errorKey || "gagal")}`);
      console.log(`   ✅ CN: ${hasil.hasilCn?.ok ? hasil.hasilCn.judul || "OK" : (hasil.hasilCn?.errorKey || "gagal")}`);
    }
  } catch (e) {
    console.error("   ❌ Error memuat modul artikel:", e.message);
  }
}

if (jalanKatalog) {
  console.log("\n🚗 Memperbarui katalog kendaraan via AI...");
  try {
    const { jalankanPembaruan } = await import("../src/lib/pembaruan-kendaraan.js");
    const hasil = await jalankanPembaruan({ paksa: true });
    if (hasil.dilewati) {
      console.log("   ⏭  Dilewati:", hasil.alasan || "(tidak diketahui)");
    } else if (hasil.error) {
      console.error("   ❌ Gagal:", hasil.error);
    } else {
      console.log(`   ✅ Diproses: ${hasil.diproses} | Diubah: ${hasil.diubah} | Gagal: ${hasil.gagal} | Biaya: Rp${hasil.biayaRupiah?.toLocaleString("id-ID") || 0}`);
    }
  } catch (e) {
    console.error("   ❌ Error memuat modul pembaruan:", e.message);
  }
}

console.log("\n[force-update] Selesai.\n");
process.exit(0);
