// Shared helpers for the Aranyhegy booking API (Netlify Functions v2 + Netlify Blobs)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// STAGE-V1: whole-house stays are only bookable with a gift voucher code (otherwise phone only)
export const APTS = { smaragd: "Smaragd", zafir: "Zafír" };
export const HOUSE_PRICE = 90000;
export const PRICE = 60000;          // HUF per night per apartment (server is the single source of truth)
export const HOLD_MIN = 30;          // unpaid hold, minutes (Stripe Checkout minimum expiry is 30 min)
export const MAX_NIGHTS = 30;
export const MAX_GUESTS_ONLINE = 2;  // 3-4 guests / whole house are phone-only

export const store = () => getStore({ name: "bookings", consistency: "strong" });

export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

export const bad = (msg, status = 400, code = "bad_request") => json({ ok: false, error: code, message: msg }, status);

const D = /^\d{4}-\d{2}-\d{2}$/;
export const parseDay = (s) => {
  if (!D.test(s || "")) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d) || d.toISOString().slice(0, 10) !== s ? null : d;
};
export const isoDay = (d) => d.toISOString().slice(0, 10);
export const todayBudapest = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date()); // YYYY-MM-DD

export function nightsBetween(a, b) {
  const out = [];
  for (let d = parseDay(a); d < parseDay(b); d = new Date(d.getTime() + 86400000)) out.push(isoDay(d));
  return out;
}

/** Validates the search part; returns {error} or {nights:[...], n} */
export function checkStay(inn, out, guests, apt) {
  const a = parseDay(inn), b = parseDay(out);
  if (!a || !b) return { error: "dates" };
  if (inn < todayBudapest()) return { error: "past" };
  if (b <= a) return { error: "order" };
  const nights = nightsBetween(inn, out);
  if (nights.length > MAX_NIGHTS) return { error: "toolong" };
  const g = Number(guests);
  if (!Number.isInteger(g) || g < 1 || g > 4) return { error: "guests" };
  if (g > MAX_GUESTS_ONLINE || apt === "haz") return { error: "phone_only" };
  if (apt !== "haz-any" && !APTS[apt]) return { error: "apt" };
  return { nights, n: nights.length };
}

const nightKey = (apt, day) => `night/${apt}/${day}`;

/** A night is taken if a lock exists and is confirmed, or is a hold that has not expired. */
async function readLock(st, apt, day) {
  const v = await st.get(nightKey(apt, day), { type: "json" });
  if (!v) return null;
  if (v.status === "held" && v.exp < Date.now()) return null;
  return v;
}

export async function freeApartments(st, nights, wanted) {
  const cands = wanted === "haz-any" ? Object.keys(APTS) : [wanted];
  const free = [];
  for (const apt of cands) {
    let ok = true;
    for (const day of nights) if (await readLock(st, apt, day)) { ok = false; break; }
    if (ok) free.push(apt);
  }
  return free;
}

/** Atomically takes every night of one apartment, or none. */
export async function lockNights(st, apt, nights, bid) {
  const taken = [];
  for (const day of nights) {
    const key = nightKey(apt, day);
    const cur = await st.get(key, { type: "json" });
    if (cur && cur.status === "held" && cur.exp < Date.now()) await st.delete(key); // expired hold
    const res = await st.setJSON(key, { bid, status: "held", exp: Date.now() + HOLD_MIN * 60000 }, { onlyIfNew: true });
    if (res && res.modified === false) {
      for (const k of taken) { const c = await st.get(k, { type: "json" }); if (c && c.bid === bid) await st.delete(k); } // only our own locks
      return false;
    }
    taken.push(key);
  }
  // Defence in depth: re-read every night and make sure the lock is still ours. If the store's
  // conditional write were ever not atomic (last-writer-wins), the loser backs out here.
  await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 25)));
  for (const key of taken) {
    const v = await st.get(key, { type: "json" });
    if (!v || v.bid !== bid) {
      for (const k of taken) { const c = await st.get(k, { type: "json" }); if (c && c.bid === bid) await st.delete(k); }
      return false;
    }
  }
  return true;
}

export async function releaseNights(st, apt, nights, bid) {
  for (const day of nights) {
    const key = nightKey(apt, day);
    const cur = await st.get(key, { type: "json" });
    if (cur && cur.bid === bid && cur.status === "held") await st.delete(key);
  }
}

export async function confirmNights(st, apt, nights, bid) {
  for (const day of nights) await st.setJSON(nightKey(apt, day), { bid, status: "confirmed" });
}

export const newId = () => "AH-" + crypto.randomBytes(4).toString("hex").toUpperCase();
export const newToken = () => crypto.randomBytes(16).toString("hex");
export const getBooking = (st, id) => st.get("booking/" + id, { type: "json" });
export const putBooking = (st, b) => st.setJSON("booking/" + b.id, b);

export const publicView = (b) => ({
  id: b.id, status: b.status, apt: b.apt, aptName: APTS[b.apt], in: b.in, out: b.out,
  nights: b.nights, guests: b.guests, amount: b.amount, demo: !!b.demo,
});

const aptsOf = (b) => (b.apt === "haz" ? Object.keys(APTS) : [b.apt]);
export const aptLabel = (b) => (b.apt === "haz" ? (b.lang === "en" ? "Whole house" : "Egész ház") : APTS[b.apt]);

/** Confirms a booking once (idempotent), then sends the confirmation email once. */
export async function confirmBooking(st, id, extra = {}) {
  const b = await getBooking(st, id);
  if (!b) return null;
  if (b.status === "confirmed") return b;
  const days = nightsBetween(b.in, b.out);
  for (const a of aptsOf(b)) await confirmNights(st, a, days, b.id);
  Object.assign(b, extra, { status: "confirmed", confirmedAt: new Date().toISOString() });
  await putBooking(st, b);
  try {
    const { sendMail, bookingMail } = await import("./_mail.mjs");
    b.mail = await sendMail({ to: b.guest.email, ...bookingMail(b, aptLabel(b)) });
  } catch (e) { b.mail = { status: "error", reason: String(e.message).slice(0, 120) }; }
  await putBooking(st, b);
  return b;
}

export async function cancelHold(st, id, status = "expired") {
  const b = await getBooking(st, id);
  if (!b || b.status !== "pending") return b;
  for (const a of aptsOf(b)) await releaseNights(st, a, nightsBetween(b.in, b.out), b.id);
  if (b.voucher && !b.voucherUsed) { // never consumed, nothing to give back
  }
  b.status = status;
  await putBooking(st, b);
  return b;
}
