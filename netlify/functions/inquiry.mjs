// Whole-house / two-couple inquiry. No payment: the owner is told, answers by phone or e-mail.
// Stored in the "cms" blob store under inq/<time>-<id> so the admin can list it; mail goes out only when RESEND_API_KEY exists.
import { cms, json, ip, allow, rnd } from "./_cms.mjs";
import { store, parseDay, nightsBetween, todayBudapest, freeApartments, MAX_NIGHTS } from "./_lib.mjs";
import { sendMail } from "./_mail.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, n) => String(s ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const fail = (error, status = 400) => json({ ok: false, error }, status);
const KINDS = { house: "Egész ház, 2 fő", four: "Két apartman együtt, 3-4 fő" };
const ACK = {
  hu: { s: "Megkaptuk az ajánlatkérésedet", h: "Köszönjük az ajánlatkérést! Megnézzük, szabad-e az időpont, és hamarosan válaszolunk.", f: "Érkezés", t: "Távozás", r: "Azonosító" },
  en: { s: "We received your request", h: "Thank you for your request! We will check whether the dates are free and reply shortly.", f: "Arrival", t: "Departure", r: "Reference" },
  de: { s: "Wir haben eure Anfrage erhalten", h: "Danke für eure Anfrage! Wir prüfen, ob die Termine frei sind, und antworten bald.", f: "Anreise", t: "Abreise", r: "Referenz" },
};

export default async (req) => {
  if (req.method !== "POST") return fail("method", 405);
  let b; try { b = await req.json(); } catch { return fail("json"); }
  if (b.website) return json({ ok: true, id: "AJ-00000000" });                       // honeypot: pretend success
  if (b.terms !== true) return fail("terms");
  const kind = b.kind === "four" ? "four" : b.kind === "house" ? "house" : null;
  if (!kind) return fail("kind");
  const lang = b.lang === "en" ? "en" : b.lang === "de" ? "de" : "hu";
  const inn = String(b.in || ""), out = String(b.out || "");
  if (!parseDay(inn) || !parseDay(out)) return fail("dates");
  if (inn < todayBudapest()) return fail("past");
  if (out <= inn) return fail("order");
  const nights = nightsBetween(inn, out);
  if (nights.length > MAX_NIGHTS) return fail("toolong");
  const name = clean(b.name, 80), email = clean(b.email, 120), phone = clean(b.phone, 30), message = clean(b.message, 500);
  if (name.length < 2) return fail("name");
  if (!email && !phone) return fail("contact");
  if (email && !EMAIL.test(email)) return fail("email");
  if (phone && (!/^[+\d][\d\s()\-./]{5,}$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 16)) return fail("phone");

  const who = ip(req);
  if (!(await allow("inq-ip:" + who, 5, 3600e3)) || !(await allow("inq-all", 80, 86400e3))) return fail("rate", 429);

  // availability hint for the owner (never shown to the guest)
  let free = "unknown";
  try {
    const f = await freeApartments(store(), nights, "haz-any");
    free = kind === "house" || kind === "four" ? (f.length === 2 ? "both" : f.length === 1 ? "one" : "none") : "unknown";
  } catch { /* hint only */ }

  const id = "AJ-" + rnd(4).toUpperCase();
  const rec = { id, kind, in: inn, out, nights: nights.length, name, email, phone, message, lang, free, status: "new", created: new Date().toISOString() };
  await cms().setJSON("inq/" + rec.created + "-" + id, rec);

  // notify (skipped without RESEND_API_KEY; the admin list is the source of truth)
  const to = (process.env.OWNER_EMAIL || (process.env.ADMIN_EMAIL || "").split(",")[0] || "").trim();
  const freeHu = { both: "mindkét apartman szabad", one: "csak az egyik apartman szabad", none: "nincs szabad apartman", unknown: "nem ellenőrizhető" }[free];
  const row = (k, v) => `<tr><td style="padding:2px 14px 2px 0;color:#6b6252">${esc(k)}</td><td>${esc(v)}</td></tr>`;
  let mail = { status: "skipped", reason: "no owner e-mail" };
  if (to) {
    mail = await sendMail({ to, subject: `Új ajánlatkérés: ${KINDS[kind]}, ${inn} → ${out}`,
      html: `<table style="font:15px/1.5 Georgia,serif">${row("Azonosító", id)}${row("Típus", KINDS[kind])}${row("Érkezés", inn)}${row("Távozás", out)}${row("Éjszaka", nights.length)}${row("Szabad-e", freeHu)}${row("Név", name)}${row("E-mail", email || "-")}${row("Telefon", phone || "-")}${row("Nyelv", lang)}${row("Üzenet", message || "-")}</table>`,
      text: `Új ajánlatkérés ${id}\n${KINDS[kind]}\n${inn} -> ${out} (${nights.length} éj)\nSzabad-e: ${freeHu}\n${name}\n${email}\n${phone}\n${message}` });
  }
  let ack = { status: "skipped" };
  if (email) {
    const A = ACK[lang];
    ack = await sendMail({ to: email, subject: A.s, text: `${A.h}\n${A.r}: ${id}\n${A.f}: ${inn}\n${A.t}: ${out}\n\nAranyhegy Apartmanház · +36 70 245 8403`,
      html: `<div style="font:16px/1.55 Georgia,serif;max-width:520px"><p>${esc(A.h)}</p><p>${esc(A.r)}: <b>${esc(id)}</b><br>${esc(A.f)}: ${esc(inn)}<br>${esc(A.t)}: ${esc(out)}</p><p style="color:#6b6252;font-size:13px">Aranyhegy Apartmanház · +36 70 245 8403</p></div>` });
  }
  await cms().setJSON("inq/" + rec.created + "-" + id, { ...rec, mail: mail.status, ack: ack.status });
  return json({ ok: true, id });
};
export const config = { path: "/api/inquiry" };
