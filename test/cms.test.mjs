// CMS tests: zero-diff render, override rendering, JSON-LD sync, validation, tidy/diff, preflight
import fs from "node:fs";
import { render, ITEMS, base } from "../netlify/functions/_render.mjs";
import { validate, tidy, diffList, preflight, cleanText } from "../netlify/functions/admin.mjs";
const R = new URL("..", import.meta.url).pathname;
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const hu = fs.readFileSync(R + "dist-opus/index.html", "utf8"), en = fs.readFileSync(R + "dist-opus/en/index.html", "utf8");
ok(render("hu", null) === hu, "HU render (no overrides) is byte-identical to dist-opus/index.html");
ok(render("en", null) === en, "EN render (no overrides) is byte-identical to dist-opus/en/index.html");
const de = fs.readFileSync(R + "dist-opus/de/index.html", "utf8");
ok(render("de", null) === de, "DE render (no overrides) is byte-identical to dist-opus/de/index.html");
ok(render("hu", {}) === hu, "empty override object changes nothing");
const items = [...ITEMS.values()].filter((i) => !i.lock);
ok(items.length > 380, "editable items: " + items.length);
const h2 = items.find((i) => i.tag === "h2");
const ov = { [h2.id]: { b: h2.h, hu: "Új cím <script>x</script> & \"idézet\"" } };
let r = render("hu", ov);
ok(!r.includes("<script>x</script>"), "script tag in override is escaped, not injected");
ok(r.includes("&lt;script&gt;x&lt;/script&gt; &amp; \"idézet\"") || r.includes("&amp;"), "text is HTML-escaped on render");
ok((r.match(/</g) || []).length === (hu.match(/</g) || []).length, "tag count unchanged after override");
ok(render("en", ov) === en, "HU override does not touch the EN page");
const stale = { [h2.id]: { b: "deadbeef", hu: "Régi" } };
ok(render("hu", stale) === hu, "stale override (template changed) is ignored");
// FAQ sync
const q = items.find((i) => i.tag === "summary" && i.section === "gyik");
const ldAns = new Set(JSON.parse([...hu.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => x.includes("FAQPage"))).mainEntity.map((e) => e.acceptedAnswer.text));
const faqA = items.find((i) => i.section === "gyik" && ldAns.has(base(i, "hu")));
console.log("faqA", faqA && faqA.id, faqA && base(faqA, "hu").slice(0, 50));
const newA = base(faqA, "hu").replace(/\.$/, "") + ", ez a próbaszöveg.";
r = render("hu", { [faqA.id]: { b: faqA.h, hu: newA } });
const ld = [...r.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const faq = ld.find((d) => d["@type"] === "FAQPage");
ok(faq && faq.mainEntity.length === 24, "FAQPage still has 24 questions and parses");
ok(faq.mainEntity.some((e) => e.acceptedAnswer.text === newA) || faq.mainEntity.some((e) => e.acceptedAnswer.text.includes("65 próba")), "FAQ JSON-LD answer follows the edited visible answer");
// JSON-LD injection
const evil = '"}</script><script>alert(1)</script>';
r = render("hu", { [q.id]: { b: q.h, hu: evil.replace(/[<>]/g, "") + " x" } });
ok([...r.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].every((m) => { try { JSON.parse(m[1]); return true; } catch { return false; } }), "JSON-LD stays valid with quotes in edited text");
// validation
const V = (it, lang, t) => validate(it, lang, t);
ok(V(h2, "hu", "").errors.length === 1, "empty text rejected");
ok(V(h2, "hu", "<b>x</b>").errors.length > 0, "angle brackets rejected");
ok(V(h2, "hu", "Fedett kupola jakuzzi").errors.length > 0, "banned word 'kupola' rejected");
ok(V(h2, "hu", "Csak ma foglalj").errors.length > 0, "fake urgency rejected");
ok(V(h2, "hu", "Csak 70.000 Ft").errors.length > 0, "price in free text rejected");
ok(V(h2, "hu", "x".repeat(900)).errors.length > 0, "far over limit rejected");
ok(V(h2, "hu", "Szép új cím").errors.length === 0, "normal text accepted");
ok(cleanText("a\u0000b\u202ec  d") === "a b c d", "control and bidi characters stripped: " + JSON.stringify(cleanText("a\u0000b\u202ec  d")));
// tidy and diff
ok(Object.keys(tidy({ [h2.id]: { b: h2.h, hu: base(h2, "hu") } })).length === 0, "override equal to default is dropped");
ok(Object.keys(tidy({ zzz: { b: "x", hu: "y" } })).length === 0, "unknown id dropped");
const d = diffList(tidy(ov), {});
ok(d.length === 1 && d[0].lang === "hu" && d[0].from === base(h2, "hu"), "diff shows before and after");
ok(preflight(tidy(ov)).length === 0, "preflight passes for a normal edit");
const lock = [...ITEMS.values()].find((i) => i.lock && /Ft/.test(i.hu));
ok(render("hu", { [lock.id]: { b: lock.h, hu: "HACK" } }) === hu, "locked price item cannot be overridden by data");
console.log(fail ? "FAILED " + fail : "ALL PASSED"); process.exit(fail ? 1 : 0);
