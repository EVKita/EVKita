import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import { listActivity } from "../../lib/activity";
import { json, unauthorized } from "../../lib/api";

export const GET: APIRoute = ({ cookies, url }) => {
  if (!currentUser(cookies)) return unauthorized();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  return json({ ok: true, entries: listActivity(limit) });
};
