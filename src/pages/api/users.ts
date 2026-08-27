import type { APIRoute } from "astro";
import { currentUser } from "../../lib/auth";
import {
  can,
  canManage,
  createUser,
  deleteUser,
  findById,
  hashPassword,
  listPublicUsers,
  ownerCount,
  publicUser,
  saveUser,
  usernameTaken,
  normalizeLocale,
  PASSWORD_MIN,
  ROLES,
  type Role,
} from "../../lib/users";
import { logActivity } from "../../lib/activity";
import { json, apiError, unauthorized, forbidden } from "../../lib/api";

const USERNAME_RE = /^[A-Za-z0-9._]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asRole(v: unknown): Role {
  const s = String(v || "");
  return (ROLES as readonly string[]).includes(s) ? (s as Role) : "editor";
}

export const GET: APIRoute = ({ cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "users")) return forbidden();
  return json({ ok: true, users: listPublicUsers(), me: publicUser(me) });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "users")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const name = String(body?.name || "").trim();
  const username = String(body?.username || "").trim();
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");
  const role = asRole(body?.role);

  if (!name) return apiError("err.nameRequired");
  if (username.length < 3) return apiError("err.usernameShort");
  if (!USERNAME_RE.test(username)) return apiError("err.usernameFormat");
  if (usernameTaken(username)) return apiError("err.usernameTaken");
  if (email && !EMAIL_RE.test(email)) return apiError("err.emailInvalid");
  if (password.length < PASSWORD_MIN) return apiError("err.passwordShort", 400, { n: PASSWORD_MIN });
  // Hanya pemilik yang boleh mengangkat pemilik baru.
  if (role === "owner" && me.role !== "owner") return forbidden();

  const created = createUser({
    name,
    username,
    email,
    password,
    role,
    avatar: String(body?.avatar || ""),
    locale: normalizeLocale(body?.locale),
  });

  logActivity(me, "user.create", { name: created.name });
  return json({ ok: true, user: publicUser(created), users: listPublicUsers() });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "users")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const target = findById(String(body?.id || ""));
  if (!target) return apiError("err.userNotFound", 404);
  if (!canManage(me, target)) return apiError("users.cannotEditOwner", 403);

  const name = String(body?.name ?? target.name).trim();
  const username = String(body?.username ?? target.username).trim();
  const email = String(body?.email ?? target.email).trim();
  const role = body?.role === undefined ? target.role : asRole(body.role);
  const password = String(body?.password || "");

  if (!name) return apiError("err.nameRequired");
  if (username.length < 3) return apiError("err.usernameShort");
  if (!USERNAME_RE.test(username)) return apiError("err.usernameFormat");
  if (usernameTaken(username, target.id)) return apiError("err.usernameTaken");
  if (email && !EMAIL_RE.test(email)) return apiError("err.emailInvalid");
  if (password && password.length < PASSWORD_MIN) {
    return apiError("err.passwordShort", 400, { n: PASSWORD_MIN });
  }
  if (role === "owner" && me.role !== "owner") return forbidden();
  // Menurunkan pemilik terakhir akan mengunci panel dari siapa pun.
  if (target.role === "owner" && role !== "owner" && ownerCount() <= 1) {
    return apiError("err.lastOwner");
  }

  const next = { ...target, name, username, email, role };
  if (body?.avatar !== undefined) next.avatar = String(body.avatar || "");
  if (password) next.password = hashPassword(password);
  saveUser(next);

  logActivity(me, "user.update", { name: next.name });
  return json({ ok: true, user: publicUser(next), users: listPublicUsers() });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const me = currentUser(cookies);
  if (!me) return unauthorized();
  if (!can(me, "users")) return forbidden();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("err.badJson");
  }

  const target = findById(String(body?.id || ""));
  if (!target) return apiError("err.userNotFound", 404);
  if (target.id === me.id) return apiError("users.cannotDeleteSelf", 400);
  if (target.role === "owner") return apiError("users.cannotDeleteOwner", 400);

  deleteUser(target.id);
  logActivity(me, "user.delete", { name: target.name });
  return json({ ok: true, users: listPublicUsers() });
};
