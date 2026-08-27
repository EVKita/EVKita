import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { readContent, writeContent } from "../../lib/store";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized } from "../../lib/api";

export const GET: APIRoute = ({ cookies }) => {
  if (!currentUser(cookies)) return unauthorized();
  return json({ ok: true, content: readContent() });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const content = writeContent(body);
  logActivity(me, "content.save");
  return json({ ok: true, content });
};
