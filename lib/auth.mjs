import crypto from "node:crypto";

const COOKIE = "trip";
const DAYS = 120;

function secret() {
  return `${process.env.SESSION_SECRET || "egipt"}|${process.env.SITE_PASSWORD || ""}`;
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

// Forgiving compare: ignores spaces at the ends and upper/lower case.
export function passwordOk(input) {
  const expected = (process.env.SITE_PASSWORD || "").trim().toLowerCase();
  const given = String(input || "").trim().toLowerCase();
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function authCookie() {
  const exp = String(Date.now() + DAYS * 86400000);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function isAuthed(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}
