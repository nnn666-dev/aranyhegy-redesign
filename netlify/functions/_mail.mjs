// E-mail through Resend (https://resend.com). Without RESEND_API_KEY nothing is sent and the result says so.
const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

export async function sendMail({ to, subject, html, text, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", reason: "no RESEND_API_KEY" };
  const body = {
    from: process.env.MAIL_FROM || "Aranyhegy Apartmanház <hello@aranyhegyapartmanhaz.hu>",
    to: [to], subject, html, text,
    reply_to: process.env.MAIL_REPLY_TO || "hello@aranyhegyapartmanhaz.hu",
  };
  if (process.env.OWNER_EMAIL) body.bcc = [process.env.OWNER_EMAIL];
  if (attachments && attachments.length) body.attachments = attachments;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "error", http: r.status, reason: String(j.message || j.name || "").slice(0, 160) };
    return { status: "sent", id: j.id };
  } catch (e) { return { status: "error", reason: String(e.message).slice(0, 160) }; }
}

const shell = (inner) => `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#14120e;line-height:1.55;font-size:16px">
<p style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#7a5a2c;margin:0 0 18px">Aranyhegy Apartmanház · Szada</p>${inner}
<hr style="border:0;border-top:1px solid #d9cdb4;margin:28px 0 14px">
<p style="font-size:13px;color:#6b6252;margin:0">Aranyhegy u. 110., 2111 Szada · +36 70 245 8403 · hello@aranyhegyapartmanhaz.hu</p></div>`;

const LOC = { hu: "hu-HU", en: "en-GB", de: "de-DE" };
const fmt = (iso, lang) => new Intl.DateTimeFormat(LOC[lang] || "hu-HU", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const money = (n, lang) => (lang === "en" ? n.toLocaleString("en-US") + " HUF" : lang === "de" ? n.toLocaleString("de-DE") + " Ft" : n.toLocaleString("hu-HU").replace(/\s/g, ".") + " Ft");

const huUntil = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCFullYear()}. ${new Intl.DateTimeFormat("hu-HU", { month: "long", timeZone: "UTC" }).format(d)} ${d.getUTCDate()}-ig`; };
export const PKG_NAME = {
  hu: { 1: "1 éjszaka két főre, egy apartmanban", 2: "2 éjszaka két főre, egy apartmanban", 3: "Egész ház, 1 éjszaka egy párnak", 4: "Egész ház, 2 éjszaka egy párnak" },
  en: { 1: "1 night for two, in one apartment", 2: "2 nights for two, in one apartment", 3: "Whole house, 1 night for a couple", 4: "Whole house, 2 nights for a couple" },
  de: { 1: "1 Nacht für zwei Personen, in einem Apartment", 2: "2 Nächte für zwei Personen, in einem Apartment", 3: "Ganzes Haus, 1 Nacht für ein Paar", 4: "Ganzes Haus, 2 Nächte für ein Paar" },
};
const pickLang = (l) => (l === "en" || l === "de" ? l : "hu");

export function voucherMail(v) {
  const L = pickLang(v.lang), pk = PKG_NAME[L][v.pkg], until = fmt(v.validUntil, L);
  if (L === "de") return {
    subject: "Euer Aranyhegy-Geschenkgutschein",
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Euer Geschenkgutschein ist fertig</h2>
<p>Danke, ${esc(v.buyer.name)}! Den druckbaren Gutschein haben wir als PDF angehängt.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0"><b>${esc(pk)}</b><br>Gutscheincode: <b style="letter-spacing:.08em">${esc(v.code)}</b><br>Gültig bis: ${esc(until)}${v.recipient ? `<br>Für: ${esc(v.recipient)}` : ""}</p>
<p>Die beschenkte Person wählt den Termin auf unserer Website („Gutschein einlösen“) oder telefonisch und nennt bei der Buchung den Code. Bei Fragen antwortet einfach auf diese E-Mail.</p>`),
    text: `Euer Aranyhegy-Geschenkgutschein\n${pk}\nCode: ${v.code}\nGültig bis: ${until}\nDen druckbaren Gutschein haben wir als PDF angehängt.`,
  };
  if (L === "en") return {
    subject: "Your Aranyhegy gift voucher",
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Your gift voucher is ready</h2>
<p>Thank you, ${esc(v.buyer.name)}. The printable voucher is attached as a PDF.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0"><b>${esc(pk)}</b><br>Voucher code: <b style="letter-spacing:.08em">${esc(v.code)}</b><br>Valid until: ${esc(until)}${v.recipient ? `<br>For: ${esc(v.recipient)}` : ""}</p>
<p>The recipient chooses the date on our website (“Redeem voucher”) or by phone, and gives the code when booking. If you have any question, just reply to this email.</p>`),
    text: `Your Aranyhegy gift voucher\n${pk}\nCode: ${v.code}\nValid until: ${until}\nThe printable voucher is attached as a PDF.`,
  };
  return {
    subject: "Az Aranyhegy ajándékutalványotok",
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Kész az ajándékutalvány</h2>
<p>Köszönjük, ${esc(v.buyer.name)}! A nyomtatható utalványt PDF-ben mellékeltük.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0"><b>${esc(pk)}</b><br>Utalvány kódja: <b style="letter-spacing:.08em">${esc(v.code)}</b><br>Érvényes: ${esc(huUntil(v.validUntil))}${v.recipient ? `<br>Kinek: ${esc(v.recipient)}` : ""}</p>
<p>A megajándékozott a weboldalunkon (“Utalvány beváltása”) vagy telefonon választhat dátumot, és foglaláskor megadja a kódot. Ha kérdésetek van, válaszoljatok erre a levélre.</p>`),
    text: `Az Aranyhegy ajándékutalványotok\n${pk}\nKód: ${v.code}\nÉrvényes: ${huUntil(v.validUntil)}\nA nyomtatható utalványt PDF-ben mellékeltük.`,
  };
}

export function bookingMail(b, aptLabel) {
  const L = pickLang(b.lang), i = fmt(b.in, L), o = fmt(b.out, L);
  const pay = b.voucher ? (L === "en" ? `Paid with gift voucher ${b.voucher}` : L === "de" ? `Mit Geschenkgutschein beglichen: ${b.voucher}` : `Kiegyenlítve ajándékutalvánnyal: ${b.voucher}`) : money(b.amount, L);
  if (L === "de") return {
    subject: `Buchungsbestätigung ${b.id} · Aranyhegy`,
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Eure Buchung ist bestätigt</h2>
<p>Danke, ${esc(b.guest.name)}! Wir freuen uns auf euch.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0">Buchungsnummer: <b>${esc(b.id)}</b><br>${esc(aptLabel)}<br>${esc(i)} → ${esc(o)} (${b.nights} ${b.nights > 1 ? "Nächte" : "Nacht"})<br>Gäste: ${b.guests}<br>${esc(pay)}</p>
<p>Anreise ab 15:00 Uhr, Abreise bis 11:00 Uhr. Vor der Anreise schicken wir euch den Link zum Hochladen der gesetzlich vorgeschriebenen Gästedaten (NTAK/VIZA). Den Code des Schlüsselkastens erhaltet ihr am Anreisetag per SMS.</p>`),
    text: `Buchung bestätigt ${b.id}\n${aptLabel}\n${i} - ${o}\n${pay}\nAnreise ab 15:00 Uhr, Abreise bis 11:00 Uhr.`,
  };
  if (L === "en") return {
    subject: `Booking confirmed ${b.id} · Aranyhegy`,
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Your booking is confirmed</h2>
<p>Thank you, ${esc(b.guest.name)}. We look forward to welcoming you.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0">Reference: <b>${esc(b.id)}</b><br>${esc(aptLabel)}<br>${esc(i)} → ${esc(o)} (${b.nights} night${b.nights > 1 ? "s" : ""})<br>Guests: ${b.guests}<br>${esc(pay)}</p>
<p>Check-in from 15:00, check-out by 11:00. Before arrival we send a link to upload the guest data required by law (NTAK/VIZA); the key safe code follows by SMS on the day of arrival.</p>`),
    text: `Booking confirmed ${b.id}\n${aptLabel}\n${i} - ${o}\n${pay}\nCheck-in from 15:00, check-out by 11:00.`,
  };
  return {
    subject: `Foglalás visszaigazolása ${b.id} · Aranyhegy`,
    html: shell(`<h2 style="font-weight:400;font-size:24px;margin:0 0 12px">Foglalásotok megerősítve</h2>
<p>Köszönjük, ${esc(b.guest.name)}! Szeretettel várunk benneteket.</p>
<p style="background:#f4efe6;border-left:3px solid #b8915a;padding:12px 16px;margin:18px 0">Azonosító: <b>${esc(b.id)}</b><br>${esc(aptLabel)}<br>${esc(i)} → ${esc(o)} (${b.nights} éj)<br>Vendégek: ${b.guests} fő<br>${esc(pay)}</p>
<p>Érkezés 15:00-tól, távozás 11:00-ig. Érkezés előtt elküldjük a törvény által előírt vendégadatok feltöltéséhez szükséges linket (NTAK/VIZA), a kulcsdoboz kódját az érkezés napján SMS-ben kapjátok.</p>`),
    text: `Foglalás megerősítve ${b.id}\n${aptLabel}\n${i} - ${o}\n${pay}\nÉrkezés 15:00-tól, távozás 11:00-ig.`,
  };
}
