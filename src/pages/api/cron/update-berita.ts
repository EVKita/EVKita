import type { APIRoute } from "astro";
import { perbaruiBerita } from "../../../lib/berita-harian";
import { readEnvFile } from "../../../lib/env";

export const POST: APIRoute = async ({ request }) => {
  const env = readEnvFile();
  const cronSecret = env.CRON_SECRET;
  
  const authHeader = request.headers.get("Authorization");
  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const hasil = await perbaruiBerita({ paksa: true });
    return new Response(JSON.stringify({ ok: true, hasil }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};