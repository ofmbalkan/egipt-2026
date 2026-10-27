import { authCookie, clearCookie, isAuthed, json, passwordOk } from "../../lib/auth.mjs";

export default async (req) => {
  if (req.method === "GET") return json({ authed: isAuthed(req) });

  if (req.method === "DELETE") return json({ ok: true }, 200, { "set-cookie": clearCookie() });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {}
    if (!passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json({ ok: false }, 401);
    }
    return json({ ok: true }, 200, { "set-cookie": authCookie() });
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/login" };
