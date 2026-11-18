// Gift voucher ordering. Creates a pending voucher and a Stripe Checkout session (or demo mode without a key).
import { store, json, bad, newToken } from "./_lib.mjs";
import { PKG, newCode, putVoucher, getVoucher } from "./_voucher.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const NAMES = { hu: { 1: "1 éjszaka két főre", 2: "2 éjszaka két főre", 3: "Egész ház, 1 éjszaka", 4: "Egész ház, 2 éjszaka" },
                en: { 1: "1 night for two", 2: "2 nights for two", 3: "Whole house, 1 night", 4: "Whole house, 2 nights" },
                de: { 1: "1 Nacht für zwei Personen", 2: "2 Nächte für zwei Personen", 3: "Ganzes Haus, 1 Nacht", 4: "Ganzes Haus, 2 Nächte" } };

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405, "method");
  let b; try { b = await req.json(); } catch { return bad("Invalid JSON"); }
  if (b.website) return json({ ok: true });
  const lang = b.lang === "en" ? "en" : b.lang === "de" ? "de" : "hu";
  const pkg = Number(b.pkg), P = PKG[pkg];
  if (!P) return bad("Unknown package", 400, "pkg");
  const name = clean(b.name, 80), email = clean(b.email, 120), recipient = clean(b.recipient, 60);
  if (name.length < 2) return bad("Name required", 400, "name");
  if (!EMAIL.test(email)) return bad("Valid email required", 400, "email");
  if (b.terms !== true) return bad("Terms must be accepted", 400, "terms");

  const st = store(); let code = newCode();
  for (let i = 0; i < 5 && (await getVoucher(st, code)); i++) code = newCode();
  const amount = P.price;                                   // never trust the client
  const v = { code, token: newToken(), status: "pending", pkg, nights: P.nights, house: P.house, amount, currency: "HUF", lang,
    buyer: { name, email }, recipient, created: new Date().toISOString(), demo: !process.env.STRIPE_SECRET_KEY };
  await putVoucher(st, v);

  if (!process.env.STRIPE_SECRET_KEY) return json({ ok: true, mode: "demo", code, token: v.token, amount });

  const origin = new URL(req.url).origin, back = origin + ({ en: "/en/", de: "/de/" }[lang] || "/");
  const f = new URLSearchParams();
  f.set("mode", "payment"); f.set("customer_email", email); f.set("locale", lang);
  f.set("success_url", `${back}?voucher=ok&c=${code}&t=${v.token}`);
  f.set("cancel_url", `${back}?voucher=cancel&c=${code}&t=${v.token}`);
  f.set("client_reference_id", code); f.set("metadata[voucher_code]", code); f.set("payment_intent_data[metadata][voucher_code]", code);
  f.set("expires_at", String(Math.floor(Date.now() / 1000) + 31 * 60));
  f.set("line_items[0][quantity]", "1"); f.set("line_items[0][price_data][currency]", "huf");
  f.set("line_items[0][price_data][unit_amount]", String(amount * 100)); // Stripe HUF is 2-decimal; verify once in test mode
  f.set("line_items[0][price_data][product_data][name]", `Aranyhegy ${{ en: "gift voucher", de: "Geschenkgutschein" }[lang] || "ajándékutalvány"}: ${NAMES[lang][pkg]}`);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: "Bearer " + process.env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const s = await r.json().catch(() => ({}));
  if (!r.ok || !s.url) { v.status = "failed"; await putVoucher(st, v); console.error("stripe voucher error", r.status); return json({ ok: false, error: "payment_unavailable" }, 502); }
  v.sessionId = s.id; await putVoucher(st, v);
  return json({ ok: true, mode: "stripe", url: s.url });
};
export const config = { path: "/api/voucher-order" };
