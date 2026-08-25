import type { APIRoute } from "astro";

export const POST: APIRoute = ({ cookies }) => {
  cookies.delete("admin_session", { path: "/" });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
