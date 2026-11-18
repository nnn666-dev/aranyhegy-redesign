// Creates a held booking and (when STRIPE_SECRET_KEY is set) a Stripe Checkout session.
// Without the key it runs in DEMO mode: dates are held, /api/demo-pay can confirm them.
import {
  store, json, bad, checkStay, freeApartments, lockNights, releaseNights, putBooking, newId, newToken,
  PRICE, APTS, HOLD_MIN, parseDay, isoDay, todayBudapest, nightsBetween, confirmBooking,
} from "./_lib.mjs";
import { getVoucher, putVoucher, voucherState, normCode } from "./_voucher.mjs"; // STAGE-V1

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function checkVoucherStay(inn, out) {
  const a = parseDay(inn), b = parseDay(out);
  if (!a || !b) return { error: "dates" };
  if (inn < todayBudapest()) return { error: "past" };
  if (b <= a) return { error: "order" };
  const nights = nightsBetween(inn, out);
  return { nights, n: nights.length };
}
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405, "method");
  let body;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  if (body.website) return json({ ok: true }); // honeypot

  const lang = body.lang === "en" ? "en" : body.lang === "de" ? "de" : "hu";
  const vcode = body.voucher ? normCode(body.voucher) : null;
  if (body.voucher && !vcode) return bad("Invalid voucher code", 400, "voucher");
  let vch = null;
  if (vcode) {
    vch = await getVoucher(store(), vcode);
    if (!vch) return bad("Voucher not found", 404, "voucher_not_found");
    const vs = voucherState(vch);
    if (vs !== "valid") return bad("Voucher " + vs, 409, "voucher_" + vs);
  }
  if (vch && !vch.house && body.apt === "haz") return bad("Voucher is for one apartment", 400, "voucher_apt");
  const wantApt = vch && vch.house ? "haz" : (body.apt || "haz-any");
  const c = vch && vch.house ? checkVoucherStay(body.in, body.out) : checkStay(body.in, body.out, body.guests, body.apt || "haz-any");
  if (c.error) return bad("Invalid stay: " + c.error, 400, c.error);
  if (vch && c.n !== vch.nights) return bad(`Voucher is for ${vch.nights} night(s)`, 400, "voucher_nights");
  if (vch && body.in > vch.validUntil) return bad("Arrival after the voucher's validity", 400, "voucher_after");
  if (vch && !vch.house && body.apt === "haz") return bad("Voucher is for one apartment", 400, "voucher_apt");

  const name = clean(body.name, 80), email = clean(body.email, 120), phone = clean(body.phone, 30);
  if (name.length < 2) return bad("Name required", 400, "name");
  if (!EMAIL.test(email)) return bad("Valid email required", 400, "email");
  if (phone.replace(/\D/g, "").length < 7) return bad("Valid phone required", 400, "phone");
  if (body.terms !== true) return bad("Terms must be accepted", 400, "terms");

  const st = store();
  const id = newId(), token = newToken();
  const amount = vch ? 0 : PRICE * c.n;                         // never trust the client price; voucher covers the stay
  let apt = null;
  if (wantApt === "haz") {                                      // whole house: both apartments or nothing
    const a1 = await lockNights(st, "smaragd", c.nights, id);
    if (a1) { if (await lockNights(st, "zafir", c.nights, id)) apt = "haz"; else await releaseNights(st, "smaragd", c.nights, id); }
  } else {
    const order = body.apt === "haz-any" ? await freeApartments(st, c.nights, "haz-any") : [body.apt];
    for (const cand of order) if (await lockNights(st, cand, c.nights, id)) { apt = cand; break; }
  }
  if (!apt) return json({ ok: false, error: "unavailable" }, 409);
  if (vch) {                                                    // claim the voucher exactly once
    const fresh = await getVoucher(st, vcode);
    if (!fresh || fresh.status !== "paid" || fresh.bookingId) {
      if (apt === "haz") { await releaseNights(st, "smaragd", c.nights, id); await releaseNights(st, "zafir", c.nights, id); } else await releaseNights(st, apt, c.nights, id);
      return bad("Voucher already used", 409, "voucher_redeemed");
    }
    fresh.status = "redeemed"; fresh.bookingId = id; fresh.redeemedAt = new Date().toISOString();
    await putVoucher(st, fresh);
    const check = await getVoucher(st, vcode);
    if (check.bookingId !== id) {                               // lost a race with another redemption
      if (apt === "haz") { await releaseNights(st, "smaragd", c.nights, id); await releaseNights(st, "zafir", c.nights, id); } else await releaseNights(st, apt, c.nights, id);
      return bad("Voucher already used", 409, "voucher_redeemed");
    }
  }

  const booking = {
    id, token, status: "pending", apt, in: body.in, out: body.out, nights: c.n, guests: Number(body.guests),
    amount, currency: "HUF", lang, guest: { name, email, phone, note: clean(body.note, 400) },
    created: new Date().toISOString(), demo: !process.env.STRIPE_SECRET_KEY, voucher: vcode || undefined,
  };
  await putBooking(st, booking);
  if (vch) {                                                    // fully covered by the voucher: confirm immediately, no payment
    const done = await confirmBooking(st, id);
    return json({ ok: true, mode: "voucher", id, token, apt, aptName: apt === "haz" ? ({ en: "Whole house", de: "Ganzes Haus" }[lang] || "Egész ház") : APTS[apt], amount: 0, status: done.status });
  }

  const origin = new URL(req.url).origin;
  const back = origin + ({ en: "/en/", de: "/de/" }[lang] || "/");

  if (!process.env.STRIPE_SECRET_KEY) {
    return json({ ok: true, mode: "demo", id, token, apt, aptName: APTS[apt], amount, holdMinutes: HOLD_MIN });
  }

  const f = new URLSearchParams();
  f.set("mode", "payment");
  f.set("success_url", `${back}?booking=ok&id=${id}&t=${token}`);
  f.set("cancel_url", `${back}?booking=cancel&id=${id}&t=${token}`);
  f.set("customer_email", email);
  f.set("locale", lang);
  f.set("expires_at", String(Math.floor(Date.now() / 1000) + HOLD_MIN * 60 + 30));
  f.set("client_reference_id", id);
  f.set("metadata[booking_id]", id);
  f.set("payment_intent_data[metadata][booking_id]", id);
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "huf");
  // Stripe HUF amounts are sent in 2-decimal form (x100). Verify once in test mode.
  f.set("line_items[0][price_data][unit_amount]", String(amount * 100));
  f.set("line_items[0][price_data][product_data][name]",
    `Aranyhegy Apartmanház, ${APTS[apt]}: ${body.in} → ${body.out} (${c.n} ${{ en: "night(s)", de: "Nacht/Nächte" }[lang] || "éj"})`);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" },
    body: f,
  });
  const s = await r.json();
  if (!r.ok || !s.url) {
    await releaseNights(st, apt, c.nights, id);
    booking.status = "failed"; await putBooking(st, booking);
    console.error("stripe error", r.status, s && s.error && s.error.type);
    return json({ ok: false, error: "payment_unavailable" }, 502);
  }
  booking.sessionId = s.id; await putBooking(st, booking);
  return json({ ok: true, mode: "stripe", id, url: s.url });
};
export const config = { path: "/api/reserve" };
