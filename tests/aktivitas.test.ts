import assert from "node:assert/strict";
import { describe, it, before, beforeEach } from "node:test";

/**
 * Penulisan dan pembacaan log aktivitas.
 *
 * Dijalankan dari direktori sementara supaya `data/activity.json` milik
 * pengembang tidak ikut terbaca maupun tertimpa — modul ini menulis ke
 * `process.cwd()/data`.
 *
 * Yang diuji di sini bukan formatnya, melainkan dua keputusan yang membuat log
 * ini bisa dibaca sama sekali: penyimpanan beruntun digabung, dan tindakan
 * massal diringkas. Tanpa keduanya, satu sesi menyunting tampilan sanggup
 * mengusir seluruh jejak audit seminggu keluar dari batas 200 entri.
 */

let aktivitas: typeof import("../src/lib/activity");
let fs: typeof import("node:fs");
let path: typeof import("node:path");

const ANA = { id: "u-ana", name: "Ana", username: "ana" };
const BUDI = { id: "u-budi", name: "Budi", username: "budi" };

const ubah = (col: string, id: string, title: string, fields: string[]) =>
  ({ col, id, title, jenis: "ubah", fields }) as any;

before(async () => {
  const os = await import("node:os");
  fs = await import("node:fs");
  path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evkita-uji-"));
  process.chdir(dir);
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });

  aktivitas = await import("../src/lib/activity");
});

beforeEach(() => {
  const file = path.join(process.cwd(), "data", "activity.json");
  if (fs.existsSync(file)) fs.rmSync(file);
});

describe("penggabungan penyimpanan beruntun", () => {
  it("dua penyuntingan pada item yang sama jadi satu baris berisi gabungan fieldnya", () => {
    aktivitas.logContentChanges(ANA, [ubah("cars", "byd-atto-3", "BYD Atto 3", ["price"])]);
    aktivitas.logContentChanges(ANA, [ubah("cars", "byd-atto-3", "BYD Atto 3", ["rangeKm"])]);

    const entries = aktivitas.listActivity(10);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "content.edit");
    assert.equal(entries[0].meta.fields, "price,rangeKm");
    assert.equal(entries[0].meta.n, 2);
  });

  it("field yang disunting berulang kali tidak menumpuk", () => {
    for (let i = 0; i < 5; i++) {
      aktivitas.logContentChanges(ANA, [{ col: "site", id: "", title: "", jenis: "ubah", fields: ["heroTitle"] } as any]);
    }
    const entries = aktivitas.listActivity(10);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].meta.fields, "heroTitle");
  });

  it("dua orang yang menyunting item yang sama TIDAK digabung", () => {
    // "Siapa yang mengubah ini" adalah alasan utama log ini ada.
    aktivitas.logContentChanges(ANA, [ubah("cars", "byd-atto-3", "BYD Atto 3", ["price"])]);
    aktivitas.logContentChanges(BUDI, [ubah("cars", "byd-atto-3", "BYD Atto 3", ["rangeKm"])]);

    const entries = aktivitas.listActivity(10);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.userName), ["Budi", "Ana"]);
  });

  it("dua item berbeda tetap jadi dua baris", () => {
    aktivitas.logContentChanges(ANA, [ubah("cars", "byd-atto-3", "BYD Atto 3", ["price"])]);
    aktivitas.logContentChanges(ANA, [ubah("cars", "wuling-air-ev", "Wuling Air ev", ["price"])]);
    assert.equal(aktivitas.listActivity(10).length, 2);
  });

  it("penambahan dan penghapusan tidak pernah digabung", () => {
    // Keduanya peristiwa sekali jadi; menggabungkannya menghilangkan salah satu.
    aktivitas.logContentChanges(ANA, [{ col: "cars", id: "a", title: "A", jenis: "tambah", fields: [] } as any]);
    aktivitas.logContentChanges(ANA, [{ col: "cars", id: "b", title: "B", jenis: "tambah", fields: [] } as any]);
    const entries = aktivitas.listActivity(10);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.action), ["content.add", "content.add"]);
  });
});

describe("peringkasan tindakan massal", () => {
  it("empat item atau lebih dalam satu koleksi jadi satu baris", () => {
    const banyak = ["a", "b", "c", "d", "e"].map((id) => ubah("motors", id, id.toUpperCase(), ["status"]));
    aktivitas.logContentChanges(ANA, banyak);

    const entries = aktivitas.listActivity(10);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "content.bulkEdit");
    assert.equal(entries[0].meta.col, "motors");
    assert.equal(entries[0].meta.n, 5);
  });

  it("tiga item masih dicatat satu per satu", () => {
    const sedikit = ["a", "b", "c"].map((id) => ubah("motors", id, id.toUpperCase(), ["status"]));
    aktivitas.logContentChanges(ANA, sedikit);
    assert.equal(aktivitas.listActivity(10).length, 3);
  });

  it("koleksi yang berbeda dihitung terpisah", () => {
    aktivitas.logContentChanges(ANA, [
      ...["a", "b", "c", "d"].map((id) => ubah("motors", id, id, ["status"])),
      ubah("cars", "z", "Z", ["price"]),
    ]);
    const entries = aktivitas.listActivity(10);
    assert.deepEqual(entries.map((e) => e.action).sort(), ["content.bulkEdit", "content.edit"]);
  });
});

describe("membaca log", () => {
  it("menyaring berdasarkan golongan aksi, bukan nama aksi mentah", () => {
    aktivitas.logActivity(ANA, "login");
    aktivitas.logContentChanges(BUDI, [ubah("cars", "x", "X", ["price"])]);

    assert.equal(aktivitas.queryActivity({ action: "konten" }).total, 1);
    assert.equal(aktivitas.queryActivity({ action: "masuk" }).total, 1);
    assert.equal(aktivitas.queryActivity({ action: "ai" }).total, 0);
    // Nama aksi persis tetap diterima, supaya satu jenis bisa ditautkan.
    assert.equal(aktivitas.queryActivity({ action: "content.edit" }).total, 1);
  });

  it("menyaring berdasarkan pengguna", () => {
    aktivitas.logActivity(ANA, "login");
    aktivitas.logActivity(BUDI, "login");
    assert.equal(aktivitas.queryActivity({ userId: "u-ana" }).total, 1);
    assert.equal(aktivitas.queryActivity({ userId: "tidak-ada" }).total, 0);
  });

  it("membagi hasil menjadi halaman dan tidak pernah melewati halaman terakhir", () => {
    for (let i = 0; i < 7; i++) aktivitas.logActivity(ANA, "login", { n: i });
    const hal1 = aktivitas.queryActivity({ perPage: 3 });
    assert.equal(hal1.total, 7);
    assert.equal(hal1.pages, 3);
    assert.equal(hal1.entries.length, 3);

    const kejauhan = aktivitas.queryActivity({ perPage: 3, page: 99 });
    assert.equal(kejauhan.page, 3, "halaman di luar jangkauan dijepit ke yang terakhir");
    assert.equal(kejauhan.entries.length, 1);
  });

  it("bulan berjalan ikut muncul sebagai pilihan walau belum pernah diarsipkan", () => {
    aktivitas.logActivity(ANA, "login");
    const bulan = aktivitas.listActivityMonths();
    assert.equal(bulan.length >= 1, true);
    assert.match(bulan[0], /^\d{4}-\d{2}$/);
  });

  it("menyaring per bulan memakai entri yang masih ada di log aktif", () => {
    aktivitas.logActivity(ANA, "login");
    const bulan = aktivitas.listActivityMonths()[0];
    assert.equal(aktivitas.queryActivity({ month: bulan }).total, 1);
    assert.equal(aktivitas.queryActivity({ month: "1999-01" }).total, 0);
  });
});
