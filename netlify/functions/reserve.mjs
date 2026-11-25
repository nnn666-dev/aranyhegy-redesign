// Creates a held booking and (when STRIPE_SECRET_KEY is set) a Stripe Checkout session.
// Without the key it runs in DEMO mode: dates are held, /api/demo-pay can confirm them.
import {
  store, json, bad, checkStay, freeApartments, lockNights, releaseNights, putBooking, newId, newToken,
  PRICE, APTS, HOLD_MIN, parseDay, isoDay, todayBudapest, nightsBetween, confirmBooking,
} from "./_lib.mjs";
import { getVoucher, putVoucher, voucherState, normCode } from "./_voucher.mjs"; // STAGE-V1
import { cms, ip, allow, rnd } from "./_cms.mjs"; // STAGE196: offline-payment requests
import { sendMail } from "./_mail.mjs";

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

  // STAGE196: split name (last/first), billing address, company, payment method
  const lastN = clean(body.lastName, 60), firstN = clean(body.firstName, 60);
  const name = (lastN || firstN) ? (lang === "hu" ? `${lastN} ${firstN}` : `${firstN} ${lastN}`).trim() : clean(body.name, 80);
  const email = clean(body.email, 120), phone = clean(body.phone, 40);
  if ((lastN || firstN) && (lastN.length < 1 || firstN.length < 1)) return bad("Name required", 400, lastN ? "first_name" : "last_name");
  if (name.length < 2) return bad("Name required", 400, "name");
  if (!EMAIL.test(email)) return bad("Valid email required", 400, "email");
  if (phone.replace(/\D/g, "").length < 7) return bad("Valid phone required", 400, "phone");
  if (body.terms !== true) return bad("Terms must be accepted", 400, "terms");
  let billing = null;
  if (body.billing && typeof body.billing === "object") {
    const b = body.billing, country = String(b.country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return bad("Country required", 400, "country");
    const zip = clean(b.zip, 12), city = clean(b.city, 60), street = clean(b.street, 100);
    if (country === "HU" ? !/^\d{4}$/.test(zip) : zip.length < 3) return bad("Postal code invalid", 400, "zip");
    if (city.length < 2) return bad("City required", 400, "city");
    if (street.length < 3) return bad("Street required", 400, "street");
    billing = { country, zip, city, street };
    if (b.company === true) {
      const companyName = clean(b.companyName, 100), vat = clean(b.vat, 24);
      if (companyName.length < 2) return bad("Company name required", 400, "company");
      if (vat.replace(/[\s-]/g, "").length < 8) return bad("VAT number required", 400, "vat");
      billing.company = true; billing.companyName = companyName; billing.vat = vat;
    }
  }
  const payMethod = ["card", "transfer", "szep"].includes(body.payMethod) ? body.payMethod : "card";
  const szepType = payMethod === "szep" ? String(body.szepType || "") : "";
  if (payMethod === "szep" && !["otp", "mbh", "kh"].includes(szepType)) return bad("SZEP card type required", 400, "szep");

  const st = store();
  if (!vch && payMethod !== "card") {                           // STAGE196: bank transfer / SZEP card -> a booking request, dates are NOT locked
    if (!(await allow("req-ip:" + ip(req), 6, 3600e3)) || !(await allow("req-all", 120, 86400e3))) return json({ ok: false, error: "rate" }, 429);
    const free = await freeApartments(st, c.nights, "haz-any");
    const okApt = wantApt === "haz-any" ? free.length > 0 : wantApt === "haz" ? free.length === 2 : free.includes(wantApt);
    if (!okApt) return json({ ok: false, error: "unavailable" }, 409);
    const rid = "AJ-" + rnd(4).toUpperCase(), created = new Date().toISOString();
    const rec = { id: rid, kind: "booking", apt: wantApt, in: body.in, out: body.out, nights: c.n, guests: Number(body.guests), amount: PRICE * c.n, pay: payMethod === "szep" ? "szep-" + szepType : "transfer",
      name, email, phone, message: clean(body.note, 400), billing, lang, free: free.length === 2 ? "both" : "one", status: "new", created };
    await cms().setJSON("inq/" + created + "-" + rid, rec);
    const to = (process.env.OWNER_EMAIL || (process.env.ADMIN_EMAIL || "").split(",")[0] || "").trim();
    let mail = { status: "skipped" };
    if (to) mail = await sendMail({ to, subject: `Új foglalási kérelem (${rec.pay}): ${body.in} → ${body.out}`, text: `Foglalási kérelem ${rid}\n${name}\n${email} ${phone}\n${wantApt}, ${c.n} éj, ${rec.amount} Ft\nFizetés: ${rec.pay}\n${billing ? [billing.zip, billing.city, billing.street].join(", ") : ""}`, html: `<p>Foglalási kérelem <b>${rid}</b></p><p>${name}<br>${email} ${phone}</p><p>${wantApt}, ${c.n} éj, ${rec.amount} Ft<br>Fizetés: ${rec.pay}</p>` });
    await cms().setJSON("inq/" + created + "-" + rid, { ...rec, mail: mail.status });
    return json({ ok: true, mode: "request", id: rid, apt: wantApt, amount: rec.amount });
  }
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
    amount, currency: "HUF", lang, guest: { name, email, phone, note: clean(body.note, 400), billing: billing || undefined, payMethod: vch ? "voucher" : payMethod, terms2: body.terms2 === true },
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
