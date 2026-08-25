import type { APIRoute } from "astro";
import { isAuthed } from "../../lib/auth";
import { readContent, writeContent } from "../../lib/store";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = ({ cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);
  return json({ ok: true, content: readContent() });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!isAuthed(cookies)) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "JSON tidak valid" }, 400);
  }

  const content = writeContent(body);
  return json({ ok: true, content });
};
