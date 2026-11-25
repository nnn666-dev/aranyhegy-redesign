// reserve with the new data-entry fields + billing + offline payment requests; needs `netlify dev` on :8888 with ADMIN_PASSWORD=teszt-jelszo-123
const B = process.env.BASE || "http://localhost:8888", PW = process.env.TEST_PW || "teszt-jelszo-123";
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const post = async (p, b) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return [r.status, await r.json().catch(() => ({}))]; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const off = 700 + Math.floor(Math.random() * 600);   // far-future, random window to avoid old local store entries
const base = { guests: 2, firstName: "Éva", lastName: "Nagy", email: "eva@example.com", phone: "+36 301234567", terms: true, terms2: true, lang: "hu",
  billing: { country: "HU", zip: "2111", city: "Szada", street: "Fő utca 1.", company: false } };
let s, r;
[s, r] = await post("/api/reserve", { ...base, in: day(off), out: day(off + 1), apt: "smaragd" }); ok(s === 200 && r.ok && (r.mode === "demo" || r.mode === "stripe"), "card booking with billing accepted: mode " + r.mode);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, zip: "21" } }); ok(s === 400 && r.error === "zip", "HU zip must be 4 digits -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, country: "Hungary" } }); ok(s === 400 && r.error === "country", "country must be ISO2 -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, city: "" } }); ok(s === 400 && r.error === "city", "city required -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, street: "x" } }); ok(s === 400 && r.error === "street", "street required -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, company: true, companyName: "Teszt Kft." } }); ok(s === 400 && r.error === "vat", "company without VAT number -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 5), out: day(off + 6), apt: "smaragd", billing: { ...base.billing, company: true, companyName: "Teszt Kft.", vat: "12345678-1-13" } }); ok(s === 200 && r.ok, "company booking with VAT accepted");
[s, r] = await post("/api/reserve", { ...base, in: day(off + 8), out: day(off + 9), apt: "smaragd", billing: { country: "GB", zip: "SW1A 1AA", city: "London", street: "10 Downing Street" } }); ok(s === 200 && r.ok, "foreign address + UK postcode accepted");
[s, r] = await post("/api/reserve", { ...base, in: day(off + 12), out: day(off + 13), apt: "smaragd", firstName: "", lastName: "Nagy" }); ok(s === 400 && r.error === "first_name", "first name required -> " + r.error);
[s, r] = await post("/api/reserve", { ...base, in: day(off + 12), out: day(off + 13), apt: "smaragd", payMethod: "szep", szepType: "" }); ok(s === 400 && r.error === "szep", "SZEP without card type -> " + r.error);
// legacy payload (name only, no billing) still works
[s, r] = await post("/api/reserve", { name: "Régi Minta", email: "regi@example.com", phone: "+36 30 111 2233", guests: 2, terms: true, lang: "hu", in: day(off + 20), out: day(off + 21), apt: "zafir" }); ok(s === 200 && r.ok, "legacy payload (name only, no billing) still accepted");
// offline payment requests: dates are NOT locked
const w1 = [day(off + 30), day(off + 31)];
[s, r] = await post("/api/reserve", { ...base, in: w1[0], out: w1[1], apt: "zafir", payMethod: "transfer" }); ok(s === 200 && r.mode === "request" && /^AJ-[0-9A-F]{8}$/.test(r.id), "transfer -> booking request " + r.id); const idT = r.id;
let q = await (await fetch(`${B}/api/quote?in=${w1[0]}&out=${w1[1]}&guests=2&apt=zafir`)).json(); ok(q.available === true, "request does not lock the dates (still available)");
[s, r] = await post("/api/reserve", { ...base, in: day(off + 33), out: day(off + 34), apt: "zafir", payMethod: "szep", szepType: "mbh" }); ok(s === 200 && r.mode === "request", "SZEP (MBH) -> booking request"); const idS = r.id;
[s, r] = await post("/api/reserve", { ...base, in: day(off + 36), out: day(off + 37), apt: "haz-any", payMethod: "transfer" }); ok(s === 200 && r.mode === "request", "any-apartment request accepted");
// unavailable dates refuse a request
const w2 = [day(off + 40), day(off + 42)];
[s, r] = await post("/api/reserve", { ...base, in: w2[0], out: w2[1], apt: "smaragd" }); ok(s === 200, "hold smaragd for the unavailable check");
[s, r] = await post("/api/reserve", { ...base, in: w2[0], out: w2[1], apt: "smaragd", payMethod: "transfer", email: "masik@example.com" }); ok(s === 409 && r.error === "unavailable", "request for a held apartment -> 409 unavailable");
[s, r] = await post("/api/reserve", { ...base, in: day(off + 45), out: day(off + 46), apt: "zafir", payMethod: "transfer", website: "http://spam" }); ok(s === 200 && !r.id, "honeypot ignored on request path");
// admin sees the requests
let cookie = "", csrf = "";
const call = async (p, body) => { const h = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf": csrf } : {}) };
  const rr = await fetch(B + "/api/admin/" + p, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = rr.headers.get("set-cookie"); if (sc && /__Host-sid=/.test(sc)) cookie = sc.split(";")[0]; return [rr.status, await rr.json().catch(() => ({}))]; };
[s, r] = await call("login", { action: "password", password: PW }); csrf = r.csrf; ok(s === 200 && csrf, "admin login");
[s, r] = await call("inquiries"); const t = (r.list || []).find((x) => x.id === idT), z = (r.list || []).find((x) => x.id === idS);
ok(t && t.kind === "booking" && t.pay === "transfer" && t.amount === 60000 && t.billing && t.billing.city === "Szada" && t.name === "Nagy Éva" && t.phone === "+36 301234567", "admin list: transfer request with billing, name order, amount " + (t && t.amount));
ok(z && z.pay === "szep-mbh", "admin list: SZEP request stores the card type " + (z && z.pay));
// invoice XML uses the billing address
const inv = await import("../netlify/functions/_invoice.mjs");
const xml = inv.buildXml({ id: "AH-T", in: "2027-01-01", out: "2027-01-02", nights: 1, amount: 60000, lang: "hu", guest: { name: "Nagy Éva", email: "e@x.hu", phone: "+36 30", billing: { country: "DE", zip: "10115", city: "Berlin", street: "Hauptstr. 5", company: true, companyName: "Muster GmbH", vat: "DE123456789" } } }, "KEY");
ok(/<nev>Muster GmbH<\/nev><orszag>Németország<\/orszag><irsz>10115<\/irsz><telepules>Berlin<\/telepules><cim>Hauptstr\. 5<\/cim>/.test(xml) && /<adoszam>DE123456789<\/adoszam><telefonszam>/.test(xml), "invoice XML: company name, country in Hungarian, address, VAT number");
const xml2 = inv.buildXml({ id: "AH-T", in: "2027-01-01", out: "2027-01-02", nights: 1, amount: 60000, lang: "hu", guest: { name: "Nagy Éva", email: "e@x.hu", phone: "+36 30" } }, "KEY");
ok(/<nev>Nagy Éva<\/nev><orszag>Magyarország<\/orszag><irsz>0000<\/irsz>/.test(xml2), "invoice XML: legacy booking keeps the old defaults");
console.log(fail ? "FAILED " + fail : "ALL PASSED"); process.exit(fail ? 1 : 0);
