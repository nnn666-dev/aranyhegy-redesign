// DEMO ONLY: simulates a successful payment so the full flow can be tested without Stripe.
// Hard-disabled as soon as STRIPE_SECRET_KEY exists, so it can never confirm a real booking for free.
import { store, json, bad, getBooking, confirmBooking, cancelHold, publicView } from "./_lib.mjs";

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);
  if (process.env.STRIPE_SECRET_KEY) return bad("disabled", 403, "disabled");
  let body; try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  const st = store(), b = await getBooking(st, body.id);
  if (!b || b.token !== body.t || !b.demo) return bad("not found", 404, "not_found");
  if (body.action === "cancel") { return json({ ok: true, booking: publicView(await cancelHold(st, b.id, "cancelled")) }); }
  if (b.status === "pending" && Date.now() - Date.parse(b.created) > 31 * 60000) {
    return json({ ok: false, error: "expired", booking: publicView(await cancelHold(st, b.id, "expired")) }, 410);
  }
  return json({ ok: true, booking: publicView(await confirmBooking(st, b.id, { paidAt: new Date().toISOString(), paymentIntent: "demo" })) });
};
export const config = { path: "/api/demo-pay" };
