import type { APIRoute } from "astro";
import { makeSession, checkCredentials } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  if (!checkCredentials(body?.username, body?.password)) {
    return new Response(JSON.stringify({ ok: false, error: "Username atau password salah." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = makeSession();
  cookies.set("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
