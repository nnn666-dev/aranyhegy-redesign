// Gift voucher domain logic: packages, codes, storage, PDF rendering, fulfilment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { store, todayBudapest, putBooking } from "./_lib.mjs";
import { sendMail, voucherMail } from "./_mail.mjs";

// Prices are decided here, on the server only. 90,000 = whole house per night (owner's price list).
export const PKG = {
  1: { nights: 1, house: false, price: 60000 },
  2: { nights: 2, house: false, price: 120000 },
  3: { nights: 1, house: true, price: 90000 },
  4: { nights: 2, house: true, price: 180000 },
};

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const newCode = () => {
  const b = crypto.randomBytes(8); let s = "";
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % 32];
  return `AHU-${s.slice(0, 4)}-${s.slice(4)}`;
};
export const normCode = (c) => {
  let s = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.startsWith("AHU")) s = s.slice(3);
  if (s.length !== 8 || [...s].some((ch) => !ALPHA.includes(ch))) return null;
  return `AHU-${s.slice(0, 4)}-${s.slice(4)}`;
};
export const addMonthsISO = (iso, m) => {
  const d = new Date(iso + "T00:00:00Z"); const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + m); if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
// "2028. március 10-ig" (suffix attaches to the day number, no period before it)
export const huDateUntil = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  const m = new Intl.DateTimeFormat("hu-HU", { month: "long", timeZone: "UTC" }).format(d);
  return `${d.getUTCFullYear()}. ${m} ${d.getUTCDate()}-ig`;
};
export const getVoucher = (st, code) => st.get("voucher/" + code, { type: "json" });
export const putVoucher = (st, v) => st.setJSON("voucher/" + v.code, v);

/** valid | expired | redeemed | unpaid */
export const voucherState = (v) => {
  if (!v || v.status === "pending") return "unpaid";
  if (v.status === "redeemed") return "redeemed";
  return todayBudapest() > v.validUntil ? "expired" : "valid";
};

// ---------- PDF ----------
const SC = 839.04 / 1748;
const roots = () => [process.env.LAMBDA_TASK_ROOT, process.cwd(), path.dirname(new URL(import.meta.url).pathname), path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..")].filter(Boolean);
function asset(rel) {
  for (const r of roots()) for (const p of [path.join(r, "netlify/assets", rel), path.join(r, "assets", rel)]) if (fs.existsSync(p)) return fs.readFileSync(p);
  throw new Error("asset not found: " + rel);
}

export async function renderVoucherPdf(v) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  doc.setTitle("Aranyhegy ajándékutalvány " + v.code); doc.setAuthor("Aranyhegy Apartmanház"); doc.setCreator("aranyhegyapartmanhaz.hu");
  const page = doc.addPage([839.04, 595.2]);
  page.drawImage(await doc.embedJpg(asset(`voucher-base-${v.pkg}.jpg`)), { x: 0, y: 0, width: 839.04, height: 595.2 });
  const jost = await doc.embedFont(asset("fonts/Jost-500.ttf"), { subset: true });
  const ink = rgb(0.078, 0.07, 0.055), gold = rgb(0.45, 0.35, 0.17);
  const Y = (y) => 595.2 - y * SC, X = (x) => x * SC;
  const fit = (txt, size, maxW) => { while (size > 9 && jost.widthOfTextAtSize(txt, size) > maxW) size -= 0.5; return size; };
  if (v.recipient) {
    const t = v.recipient.slice(0, 60), s = fit(t, 16, (1230 - 812) * SC);
    page.drawText(t, { x: X(812), y: Y(934), size: s, font: jost, color: ink });
  }
  const s2 = fit(v.code, 16, (1638 - 1282) * SC);
  page.drawText(v.code, { x: X(1282), y: Y(934), size: s2, font: jost, color: ink });
  const until = huDateUntil(v.validUntil);
  const note = `Érvényes: ${until}`, ns = fit(note, 11, (1668 - 1418) * SC);
  page.drawText(note, { x: X(1668) - jost.widthOfTextAtSize(note, ns), y: Y(1128), size: ns, font: jost, color: gold });
  return await doc.save();
}

// ---------- fulfilment (idempotent) ----------
export async function fulfilVoucher(st, code, extra = {}) {
  const v = await getVoucher(st, code);
  if (!v) return null;
  if (v.status !== "pending") return v;                 // already paid / redeemed: nothing to do twice
  Object.assign(v, extra, { status: "paid", paidAt: new Date().toISOString() });
  v.validUntil = addMonthsISO(todayBudapest(), 12);
  v.invoice = { status: "skipped", reason: "voucher invoicing needs the accountant's decision (multi-purpose voucher VAT)" };
  await putVoucher(st, v);
  try {
    const pdf = await renderVoucherPdf(v);
    const m = voucherMail(v);
    v.mail = await sendMail({ to: v.buyer.email, ...m, attachments: [{ filename: `aranyhegy-ajandekutalvany-${v.code}.pdf`, content: Buffer.from(pdf).toString("base64") }] });
  } catch (e) { v.mail = { status: "error", reason: String(e.message).slice(0, 160) }; console.error("voucher mail/pdf failed", v.code, e.message); }
  await putVoucher(st, v);
  v._new = true;
  return v;
}
