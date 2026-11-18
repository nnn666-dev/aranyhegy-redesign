// Taken nights for the booking calendar. Public, read-only, no guest data: only which nights are taken per apartment.
import { store, json, parseDay, isoDay, todayBudapest } from "./_lib.mjs";

const KEY = /^night\/(smaragd|zafir)\/(\d{4}-\d{2}-\d{2})$/;

export default async (req) => {
  if (req.method !== "GET") return json({ ok: false, error: "method" }, 405);
  const u = new URL(req.url);
  const from = u.searchParams.get("from") || todayBudapest();
  const a = parseDay(from);
  if (!a) return json({ ok: false, error: "dates" }, 400);
  const days = Math.min(Math.max(parseInt(u.searchParams.get("days") || "560", 10) || 560, 1), 600);
  const end = isoDay(new Date(a.getTime() + days * 864e5));
  const st = store();
  const keys = [];
  for await (const page of st.list({ prefix: "night/", paginate: true })) for (const b of page.blobs) {
    const m = KEY.exec(b.key);
    if (m && m[2] >= from && m[2] < end) keys.push([m[1], m[2], b.key]);
  }
  const out = { smaragd: [], zafir: [] };
  for (let i = 0; i < keys.length; i += 25) {
    const part = await Promise.all(keys.slice(i, i + 25).map(async ([apt, day, key]) => {
      const v = await st.get(key, { type: "json" });
      if (!v || (v.status === "held" && v.exp < Date.now())) return null;
      return [apt, day];
    }));
    for (const p of part) if (p) out[p[0]].push(p[1]);
  }
  out.smaragd.sort(); out.zafir.sort();
  return json({ ok: true, from, days, ...out }, 200, { "cache-control": "public, max-age=15" });
};
export const config = { path: "/api/calendar" };
