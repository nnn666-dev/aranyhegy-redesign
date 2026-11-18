import { renderVoucherPdf, newCode, normCode, addMonthsISO, voucherState, PKG } from "../netlify/functions/_voucher.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
let n = 0; const t = async (m, f) => { await f(); n++; console.log("ok -", m); };
await t("codes: unambiguous alphabet, normalisation", () => {
  for (let i = 0; i < 500; i++) { const c = newCode(); assert.match(c, /^AHU-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/); assert.equal(normCode(c), c); }
  assert.equal(normCode("ahu k7m2 x9fq"), "AHU-K7M2-X9FQ"); assert.equal(normCode("AHU-K7M2-X9F0"), null); assert.equal(normCode(""), null); assert.equal(normCode("x"), null);
});
await t("12 months validity incl. month-end", () => {
  assert.equal(addMonthsISO("2027-03-10", 12), "2028-03-10"); assert.equal(addMonthsISO("2028-02-29", 12), "2029-02-28");
});
await t("voucher states", () => {
  assert.equal(voucherState(null), "unpaid"); assert.equal(voucherState({ status: "pending" }), "unpaid");
  assert.equal(voucherState({ status: "redeemed" }), "redeemed"); assert.equal(voucherState({ status: "paid", validUntil: "2099-01-01" }), "valid");
  assert.equal(voucherState({ status: "paid", validUntil: "2020-01-01" }), "expired");
});
await t("prices are server-side and consistent with the price list", () => {
  assert.deepEqual(Object.values(PKG).map((p) => p.price), [60000, 120000, 90000, 180000]);
});
for (const pkg of [1, 2, 3, 4]) await t(`PDF renders for package ${pkg} (with recipient, accents)`, async () => {
  const pdf = await renderVoucherPdf({ code: "AHU-K7M2-X9FQ", pkg, recipient: "Kovács Ödön és Ágnes", validUntil: "2028-03-10" });
  assert.ok(pdf.length > 100000); assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  fs.writeFileSync(`/Users/zotya/.hermes/cache/scratch/voucher_out_${pkg}.pdf`, pdf);
});
await t("PDF renders without recipient and with a very long name", async () => {
  await renderVoucherPdf({ code: "AHU-K7M2-X9FQ", pkg: 1, recipient: "", validUntil: "2028-03-10" });
  await renderVoucherPdf({ code: "AHU-K7M2-X9FQ", pkg: 4, recipient: "Nagyonhosszú Vezetéknév-Kettős Keresztnév Harmadik", validUntil: "2028-03-10" });
});
console.log(n + " voucher unit tests passed");
