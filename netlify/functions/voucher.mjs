// Voucher status, demo payment, validation and PDF download.
import { store, json, bad } from "./_lib.mjs";
import { getVoucher, voucherState, fulfilVoucher, normCode, renderVoucherPdf, putVoucher, voucherFileName } from "./_voucher.mjs";

const view = (v) => ({ code: v.code, status: v.status, state: voucherState(v), pkg: v.pkg, nights: v.nights, house: v.house, validUntil: v.validUntil || null,
  demo: !!v.demo, mail: v.mail ? v.mail.status : null, recipient: v.recipient || "" });

export default async (req) => {
  const u = new URL(req.url), st = store();
  const act = u.searchParams.get("a") || "status";
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return bad("Invalid JSON"); }
    const code = normCode(b.code); if (!code) return bad("code", 400, "code");
    const v = await getVoucher(st, code);
    if (!v || v.token !== b.t) return bad("not found", 404, "not_found");
    if (b.action === "demo-pay") {
      if (process.env.STRIPE_SECRET_KEY || !v.demo) return bad("disabled", 403, "disabled");
      if (v.status === "pending" && Date.now() - Date.parse(v.created) > 31 * 60000) return bad("expired", 410, "expired");
      return json({ ok: true, voucher: view((await fulfilVoucher(st, code, { paymentIntent: "demo" })) || v) });
    }
    if (b.action === "resend") {
      if (v.status === "pending" || v.status === "failed") return bad("not paid", 409, "unpaid");
      v.resends = (v.resends || 0) + 1; if (v.resends > 3) return bad("limit", 429, "limit"); await putVoucher(st, v);
      const { sendMail, voucherMail } = await import("./_mail.mjs");
      const pdf = await renderVoucherPdf(v);
      v.mail = await sendMail({ to: v.buyer.email, ...voucherMail(v), attachments: [{ filename: voucherFileName(v), content: Buffer.from(pdf).toString("base64") }] });
      await putVoucher(st, v); return json({ ok: true, mail: v.mail.status });
    }
    return bad("action", 400, "action");
  }
  const code = normCode(u.searchParams.get("code") || u.searchParams.get("c"));
  if (!code) return json({ ok: false, error: "invalid_code" }, 404);
  const v = await getVoucher(st, code);
  if (!v) return json({ ok: false, error: "not_found" }, 404);
  if (act === "check") {                       // public: only tells whether it is redeemable, never buyer data
    const s = voucherState(v);
    return json({ ok: true, state: s, pkg: v.pkg, nights: v.nights, house: v.house, validUntil: v.validUntil || null });
  }
  if (v.token !== u.searchParams.get("t")) return bad("not found", 404, "not_found");
  if (act === "pdf") {
    if (v.status === "pending" || v.status === "failed") return bad("not paid", 409, "unpaid");
    const pdf = await renderVoucherPdf(v);
    return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${voucherFileName(v)}"`, "cache-control": "no-store" } });
  }
  return json({ ok: true, voucher: view(v) });
};
export const config = { path: "/api/voucher" };
