// CMS admin: storage, sessions, login, audit. Store "cms" (strong consistency).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const cms = () => getStore({ name: "cms", consistency: "strong" });
export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });
export const err = (message, status = 400, code = "bad_request") => json({ ok: false, error: code, message }, status);

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const rnd = (n = 32) => crypto.randomBytes(n).toString("hex");
const eq = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return crypto.timingSafeEqual(x, y); };

export const IDLE_MS = 12 * 3600e3, ABS_MS = 7 * 86400e3, CODE_MS = 10 * 60e3;
export const methods = () => ({
  password: !!process.env.ADMIN_PASSWORD,
  email: !!(process.env.ADMIN_EMAIL && process.env.RESEND_API_KEY),
});
export const adminEmails = () => (process.env.ADMIN_EMAIL || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const ip = (req) => (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

/** simple fixed-window limiter in Blobs; returns true when allowed */
export async function allow(key, max, windowMs) {
  if (process.env.CMS_NO_RATELIMIT === "1" && process.env.NETLIFY_DEV) return true; // local tests only; ignored in production
  const st = cms(), k = "rl/" + sha(key).slice(0, 24) + "/" + Math.floor(Date.now() / windowMs);
  const cur = (await st.get(k, { type: "json" })) || { n: 0 };
  if (cur.n >= max) return false;
  await st.setJSON(k, { n: cur.n + 1 });
  return true;
}

export const cookieSid = (req) => { const m = /(?:^|;\s*)__Host-sid=([a-f0-9]{64})/.exec(req.headers.get("cookie") || ""); return m ? m[1] : null; };
export const setCookie = (sid, maxAge) => `__Host-sid=${sid}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

export async function newSession(req, who) {
  const sid = rnd(32), csrf = rnd(16), now = Date.now();
  await cms().setJSON("sess/" + sha(sid), { who, csrf, created: now, last: now, ua: (req.headers.get("user-agent") || "").slice(0, 120) });
  return { sid, csrf };
}

/** returns {sess, key} or null */
export async function session(req) {
  const sid = cookieSid(req); if (!sid) return null;
  const key = "sess/" + sha(sid), s = await cms().get(key, { type: "json" });
  if (!s) return null;
  const now = Date.now();
  if (now - s.created > ABS_MS || now - s.last > IDLE_MS) { await cms().delete(key); return null; }
  if (now - s.last > 60e3) { s.last = now; await cms().setJSON(key, s); }
  return { sess: s, key };
}

/** same-origin + CSRF header for every state-changing request */
export function csrfOk(req, sess) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const o = req.headers.get("origin"); const host = new URL(req.url).host;
  if (o) { try { if (new URL(o).host !== host) return false; } catch { return false; } }
  const h = req.headers.get("x-csrf") || "";
  return h.length > 8 && eq(h, sess.csrf);
}

export async function audit(who, action, detail = {}) {
  const ts = Date.now();
  try { await cms().setJSON(`audit/${String(ts).padStart(14, "0")}-${rnd(3)}`, { ts, who, action, ...detail }); } catch {}
}

export const checkPassword = (p) => !!process.env.ADMIN_PASSWORD && typeof p === "string" && p.length < 200 && eq(p, process.env.ADMIN_PASSWORD);
export const hashCode = (email, code) => sha(email + ":" + code + ":" + (process.env.ADMIN_PASSWORD || process.env.RESEND_API_KEY || "k"));
