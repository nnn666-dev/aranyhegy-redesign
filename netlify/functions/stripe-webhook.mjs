// Stripe webhook: verifies the signature, then confirms or releases the booking.
import crypto from "node:crypto";
import { store, json, bad, confirmBooking, cancelHold } from "./_lib.mjs";
import { issueInvoice } from "./_invoice.mjs";
import { fulfilVoucher, getVoucher, putVoucher } from "./_voucher.mjs";

export function verify(raw, header, secret, now = Date.now(), tolerance = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = parts.t, sig = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sig.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > tolerance) return false;
  const exp = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sig.some((s) => s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp)));
}

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return bad("webhook not configured", 503, "not_configured");
  const raw = await req.text();
  if (!verify(raw, req.headers.get("stripe-signature"), secret)) return bad("bad signature", 400, "signature");

  const ev = JSON.parse(raw);
  const obj = ev.data && ev.data.object;
  const vcode = obj && obj.metadata && obj.metadata.voucher_code;
  const id = obj && ((obj.metadata && obj.metadata.booking_id) || (!vcode && obj.client_reference_id));
  const st = store();
  if (vcode) {                                                     // gift voucher payment
    if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
      if (obj.payment_status !== "paid") return json({ ok: true, waiting: true });
      const v = await fulfilVoucher(st, vcode, { paymentIntent: obj.payment_intent });
      return json({ ok: true, voucher: !!v });
    }
    if (ev.type === "checkout.session.expired" || ev.type === "checkout.session.async_payment_failed") {
      const v = await getVoucher(st, vcode); if (v && v.status === "pending") { v.status = "failed"; await putVoucher(st, v); }
      return json({ ok: true, voucher: "failed" });
    }
    return json({ ok: true, ignored: ev.type });
  }
  if (!id) return json({ ok: true, ignored: true });

  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    if (obj.payment_status !== "paid") return json({ ok: true, waiting: true });
    const b = await confirmBooking(st, id, { paymentIntent: obj.payment_intent, paidAt: new Date().toISOString() });
    if (b && !b.invoice) {
      try { await issueInvoice(st, b); } catch (e) { console.error("invoice failed", id, e.message); }
    }
    return json({ ok: true, confirmed: !!b });
  }
  if (ev.type === "checkout.session.expired" || ev.type === "checkout.session.async_payment_failed") {
    await cancelHold(st, id, "expired");
    return json({ ok: true, released: true });
  }
  return json({ ok: true, ignored: ev.type });
};
export const config = { path: "/api/stripe-webhook" };
