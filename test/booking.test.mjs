// Unit tests for the booking logic with an in-memory store (no network).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as L from "../netlify/functions/_lib.mjs";
import { verify } from "../netlify/functions/stripe-webhook.mjs";
import { buildXml } from "../netlify/functions/_invoice.mjs";

// in-memory fake of the blob store (setJSON with onlyIfNew must be atomic-per-call)
const mem = new Map();
const st = {
  async get(k) { return mem.has(k) ? JSON.parse(mem.get(k)) : null; },
  async setJSON(k, v, o = {}) { if (o.onlyIfNew && mem.has(k)) return { modified: false }; mem.set(k, JSON.stringify(v)); return { modified: true }; },
  async delete(k) { mem.delete(k); },
};
const fut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let pass = 0; const t = async (name, fn) => { await fn(); pass++; console.log("ok -", name); };

await t("checkStay validates", () => {
  assert.equal(L.checkStay("2020-01-01", "2020-01-02", 2, "smaragd").error, "past");
  assert.equal(L.checkStay(fut(5), fut(5), 2, "smaragd").error, "order");
  assert.equal(L.checkStay(fut(5), fut(6), 3, "smaragd").error, "phone_only");
  assert.equal(L.checkStay(fut(5), fut(6), 2, "haz").error, "phone_only");
  assert.equal(L.checkStay(fut(5), fut(6), 2, "xx").error, "apt");
  assert.equal(L.checkStay("2026-02-30", "2026-03-02", 2, "smaragd").error, "dates");
  assert.equal(L.checkStay(fut(5), fut(8), 2, "haz-any").n, 3);
  assert.equal(L.checkStay(fut(5), fut(60), 2, "smaragd").error, "toolong");
});
await t("lock is exclusive and all-or-nothing", async () => {
  const n = L.nightsBetween(fut(10), fut(13));
  assert.equal(await L.lockNights(st, "smaragd", n, "A"), true);
  assert.equal(await L.lockNights(st, "smaragd", n, "B"), false, "second guest same dates");
  const overlap = L.nightsBetween(fut(12), fut(15));
  assert.equal(await L.lockNights(st, "smaragd", overlap, "C"), false, "overlap by one night");
  assert.equal(await st.get("night/smaragd/" + fut(14)), null, "failed attempt left no partial locks");
  assert.equal(await L.lockNights(st, "zafir", n, "D"), true, "other apartment still free");
  const back = L.nightsBetween(fut(13), fut(14));
  assert.equal(await L.lockNights(st, "smaragd", back, "E"), true, "check-out day is bookable (end exclusive)");
});
await t("concurrent attempts: exactly one wins", async () => {
  const n = L.nightsBetween(fut(30), fut(32));
  const r = await Promise.all(["P", "Q", "R", "S"].map((id) => L.lockNights(st, "smaragd", n, id)));
  assert.equal(r.filter(Boolean).length, 1);
});
await t("expired hold frees the dates", async () => {
  const n = L.nightsBetween(fut(40), fut(41));
  await st.setJSON("night/smaragd/" + n[0], { bid: "OLD", status: "held", exp: Date.now() - 1000 });
  assert.equal((await L.freeApartments(st, n, "smaragd")).length, 1);
  assert.equal(await L.lockNights(st, "smaragd", n, "NEW"), true);
});
await t("confirm is idempotent, cancel releases only pending", async () => {
  const n = L.nightsBetween(fut(50), fut(52));
  const b = { id: "AH-T1", status: "pending", apt: "zafir", in: fut(50), out: fut(52), nights: 2, amount: 120000 };
  await L.lockNights(st, "zafir", n, b.id); await L.putBooking(st, b);
  const c1 = await L.confirmBooking(st, b.id), c2 = await L.confirmBooking(st, b.id);
  assert.equal(c1.status, "confirmed"); assert.equal(c2.confirmedAt, c1.confirmedAt);
  await L.cancelHold(st, b.id);
  assert.equal((await L.getBooking(st, b.id)).status, "confirmed", "paid booking is not released");
  assert.equal((await st.get("night/zafir/" + n[0])).status, "confirmed");
});
await t("free apartments reflects confirmed nights", async () => {
  const free = await L.freeApartments(st, L.nightsBetween(fut(50), fut(52)), "haz-any");
  assert.deepEqual(free, ["smaragd"]);
});
await t("stripe signature verification", () => {
  const secret = "whsec_test", raw = '{"a":1}', ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  assert.equal(verify(raw, `t=${ts},v1=${sig}`, secret), true);
  assert.equal(verify(raw + " ", `t=${ts},v1=${sig}`, secret), false, "tampered body");
  assert.equal(verify(raw, `t=${ts},v1=${sig}`, "other"), false, "wrong secret");
  assert.equal(verify(raw, `t=${ts - 4000},v1=${crypto.createHmac("sha256", secret).update(`${ts - 4000}.${raw}`).digest("hex")}`, secret), false, "replay");
  assert.equal(verify(raw, "", secret), false);
});
await t("invoice xml escapes guest input", () => {
  const x = buildXml({ id: "AH-1", in: "2027-01-01", out: "2027-01-02", nights: 1, amount: 60000, lang: "hu", guest: { name: 'A<b>&"', email: "a@b.hu", phone: "123" } }, "KEY");
  assert.ok(!x.includes("<b>")); assert.ok(x.includes("&lt;b&gt;&amp;&quot;"));
});
console.log(`\n${pass} tests passed`);
