// Számlázz.hu (Számla Agent) invoice hook.
// STATUS: NOT TESTED against the live agent. Runs only when SZAMLAZZ_AGENT_KEY is set; otherwise it
// records "skipped" and the booking stays valid. Field names follow the public Számla Agent XSD
// (xmlszamla); confirm VAT key (e.g. "AAM"/"27") and invoice settings with the owner's accountant.
import { putBooking } from "./_lib.mjs";

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

const countryHu = (cc) => { try { return cc ? new Intl.DisplayNames(["hu"], { type: "region" }).of(cc) : "Magyarország"; } catch { return "Magyarország"; } };

export function buildXml(b, key) {
  const today = new Date().toISOString().slice(0, 10);
  const net = b.amount;                       // owner decides VAT treatment; default: VAT exempt line
  const vat = process.env.SZAMLAZZ_VAT || "AAM";
  const bl = (b.guest && b.guest.billing) || {};
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <beallitasok>
    <szamlaagentkulcs>${esc(key)}</szamlaagentkulcs>
    <eszamla>true</eszamla><szamlaLetoltes>false</szamlaLetoltes><valaszVerzio>1</valaszVerzio>
  </beallitasok>
  <fejlec>
    <keltDatum>${today}</keltDatum><teljesitesDatum>${b.out}</teljesitesDatum><fizetesiHataridoDatum>${today}</fizetesiHataridoDatum>
    <fizmod>Bankkártya</fizmod><penznem>HUF</penznem><szamlaNyelve>${b.lang === "en" ? "en" : "hu"}</szamlaNyelve>
    <megjegyzes>${esc("Foglalás: " + b.id)}</megjegyzes><rendelesSzam>${esc(b.id)}</rendelesSzam>
    <elolegszamla>false</elolegszamla><vegszamla>false</vegszamla><fizetve>true</fizetve><szamlaszamElotag>${esc(process.env.SZAMLAZZ_PREFIX || "AH")}</szamlaszamElotag>
  </fejlec>
  <elado></elado>
  <vevo>
    <nev>${esc(bl.company ? bl.companyName : b.guest.name)}</nev><orszag>${esc(countryHu(bl.country))}</orszag><irsz>${esc(bl.zip || "0000")}</irsz><telepules>${esc(bl.city || "-")}</telepules><cim>${esc(bl.street || "-")}</cim>
    <email>${esc(b.guest.email)}</email><sendEmail>true</sendEmail>${bl.company && bl.vat ? `<adoszam>${esc(bl.vat)}</adoszam>` : ""}<telefonszam>${esc(b.guest.phone)}</telefonszam>
  </vevo>
  <tetelek><tetel>
    <megnevezes>${esc(`Szállás ${b.in} - ${b.out}, ${b.nights} éj`)}</megnevezes>
    <mennyiseg>${b.nights}</mennyiseg><mennyisegiEgyseg>éj</mennyisegiEgyseg>
    <nettoEgysegar>${net / b.nights}</nettoEgysegar><afakulcs>${esc(vat)}</afakulcs>
    <nettoErtek>${net}</nettoErtek><afaErtek>0</afaErtek><bruttoErtek>${net}</bruttoErtek>
  </tetel></tetelek>
</xmlszamla>`;
}

export async function issueInvoice(st, b) {
  const key = process.env.SZAMLAZZ_AGENT_KEY;
  if (!key) { b.invoice = { status: "skipped", reason: "no SZAMLAZZ_AGENT_KEY" }; await putBooking(st, b); return; }
  const fd = new FormData();
  fd.append("action-xmlagentxmlfile", new Blob([buildXml(b, key)], { type: "text/xml" }), "invoice.xml");
  const r = await fetch("https://www.szamlazz.hu/szamla/", { method: "POST", body: fd });
  const ok = r.headers.get("szlahu_error_code") == null;
  b.invoice = { status: ok ? "issued" : "error", number: r.headers.get("szlahu_szamlaszam"), error: r.headers.get("szlahu_error") };
  await putBooking(st, b);
}
