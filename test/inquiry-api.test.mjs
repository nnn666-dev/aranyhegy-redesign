// /api/inquiry + admin list, against `netlify dev` on :8888 (ADMIN_PASSWORD must be set in the dev env; CMS_NO_RATELIMIT=1 for the burst checks)
const B = process.env.BASE || "http://localhost:8888", PW = process.env.TEST_PW || "teszt-jelszo-123";
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const post = async (p, b, h = {}) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }); return [r.status, await r.json().catch(() => ({}))]; };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const base = { kind: "house", in: day(40), out: day(41), name: "Teszt Elek", email: "teszt@example.com", phone: "+36 30 123 4567", message: "Szeretnénk <b>kérdezni</b>", lang: "hu", terms: true };
let s, r;
[s, r] = await post("/api/inquiry", base); ok(s === 200 && r.ok && /^AJ-[0-9A-F]{8}$/.test(r.id), "valid request accepted, id " + r.id); const id1 = r.id;
[s, r] = await post("/api/inquiry", { ...base, email: "", phone: "+36301234567", name: "Csak Telefon" }); ok(s === 200 && r.ok, "phone only is enough");
[s, r] = await post("/api/inquiry", { ...base, phone: "", email: "csak@example.com", name: "Csak Email", kind: "four", lang: "de" }); ok(s === 200 && r.ok, "e-mail only, kind four, lang de");
[s, r] = await post("/api/inquiry", { ...base, email: "", phone: "" }); ok(s === 400 && r.error === "contact", "no contact rejected: " + r.error);
[s, r] = await post("/api/inquiry", { ...base, email: "nem-email" }); ok(s === 400 && r.error === "email", "bad e-mail rejected: " + r.error);
[s, r] = await post("/api/inquiry", { ...base, phone: "12" }); ok(s === 400 && r.error === "phone", "bad phone rejected: " + r.error);
[s, r] = await post("/api/inquiry", { ...base, name: "A" }); ok(s === 400 && r.error === "name", "short name rejected");
[s, r] = await post("/api/inquiry", { ...base, terms: false }); ok(s === 400 && r.error === "terms", "terms required");
[s, r] = await post("/api/inquiry", { ...base, in: day(-3), out: day(-2) }); ok(s === 400 && r.error === "past", "past date rejected");
[s, r] = await post("/api/inquiry", { ...base, in: day(10), out: day(10) }); ok(s === 400 && r.error === "order", "same-day rejected");
[s, r] = await post("/api/inquiry", { ...base, in: day(10), out: day(80) }); ok(s === 400 && r.error === "toolong", "over 30 nights rejected");
[s, r] = await post("/api/inquiry", { ...base, kind: "zafir" }); ok(s === 400 && r.error === "kind", "unknown kind rejected");
[s, r] = await post("/api/inquiry", { ...base, in: "2027-02-30", out: "2027-03-01" }); ok(s === 400 && r.error === "dates", "impossible date rejected");
[s, r] = await post("/api/inquiry", { ...base, website: "http://spam" }); ok(s === 200 && r.ok && r.id === "AJ-00000000", "honeypot answers ok but stores nothing");
const g = await fetch(B + "/api/inquiry"); ok(g.status === 405, "GET refused (405)");
// admin side
let cookie = "", csrf = "";
const call = async (p, body) => { const h = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { "x-csrf": csrf } : {}) };
  const rr = await fetch(B + "/api/admin/" + p, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = rr.headers.get("set-cookie"); if (sc && /__Host-sid=/.test(sc)) cookie = sc.split(";")[0]; return [rr.status, await rr.json().catch(() => ({}))]; };
[s, r] = await call("inquiries"); ok(s === 401, "list needs login -> " + s);
[s, r] = await call("login", { action: "password", password: PW }); ok(s === 200 && r.csrf, "admin login"); csrf = r.csrf;
[s, r] = await call("inquiries"); const mine = (r.list || []).find((x) => x.id === id1);
ok(s === 200 && mine && mine.status === "new" && mine.kind === "house" && mine.nights === 1 && ["both", "one", "none"].includes(mine.free), "admin sees the request: free=" + (mine && mine.free));
ok(mine && !/[<>]/.test(mine.message) && mine.message.includes("kérdezni"), "angle brackets stripped from stored message: " + (mine && mine.message));
ok(!(r.list || []).some((x) => x.id === "AJ-00000000"), "honeypot request was not stored");
ok(r.news >= 3, "unread counter " + r.news);
[s, r] = await call("inquiry-status", { id: id1, status: "done" }); ok(s === 200 && r.ok, "mark handled");
[s, r] = await call("inquiries"); ok(r.list.find((x) => x.id === id1).status === "done", "status persisted");
[s, r] = await call("inquiry-status", { id: "../../x", status: "done" }); ok(s === 400, "bad id rejected");
// rate limit: only meaningful when the dev server does not skip it
let limited = 0; for (let i = 0; i < 8; i++) { [s] = await post("/api/inquiry", { ...base, name: "Rate " + i }); if (s === 429) limited++; }
console.log("INFO rate-limited responses in a burst of 8:", limited, "(0 is expected when CMS_NO_RATELIMIT=1)");
console.log(fail ? "FAILED " + fail : "ALL PASSED"); process.exit(fail ? 1 : 0);
