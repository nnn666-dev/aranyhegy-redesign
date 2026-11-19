// Read the real PDF metadata with pdf-lib (not by grepping bytes) for each language.
import { PDFDocument } from "pdf-lib";
const B = process.env.BASE || "http://localhost:8888";
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => [r.status, await r.json().catch(() => ({}))]);
let fail = 0; const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) { fail++; process.exitCode = 1; } };
const want = {
  hu: { file: /^aranyhegy-ajandekutalvany-AHU-/, title: /^Aranyhegy ajándékutalvány AHU-/, subject: "Ajándékutalvány" },
  en: { file: /^aranyhegy-gift-voucher-AHU-/, title: /^Aranyhegy gift voucher AHU-/, subject: "Gift voucher" },
  de: { file: /^aranyhegy-geschenkgutschein-AHU-/, title: /^Aranyhegy Geschenkgutschein AHU-/, subject: "Geschenkgutschein" },
};
const bytes = {};
for (const lang of ["hu", "en", "de"]) {
  for (const pkg of [1, 2, 3, 4]) {
    const [s, r] = await post("/api/voucher-order", { name: "Vevő Vilmos", email: "vevo@example.com", terms: true, lang, pkg, recipient: lang === "de" ? "Anna Müller" : "Kovács Anna" });
    if (!(s === 200 && r.code)) { ok(false, `${lang} pkg${pkg}: order ${s}`); continue; }
    await post("/api/voucher", { action: "demo-pay", code: r.code, t: r.token });
    const res = await fetch(`${B}/api/voucher?a=pdf&code=${r.code}&t=${r.token}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const fname = ((res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/) || [])[1] || "";
    const doc = await PDFDocument.load(buf);
    const t = doc.getTitle() || "", sub = doc.getSubject() || "", kw = doc.getKeywords() || "";
    ok(res.status === 200 && want[lang].file.test(fname) && want[lang].title.test(t) && sub === want[lang].subject && kw.includes(lang) && doc.getPageCount() === 1,
      `${lang} pkg${pkg}: file "${fname.slice(0, 34)}…", title "${t.slice(0, 40)}", subject "${sub}", keywords "${kw}", ${doc.getPageCount()} page`);
    bytes[`${lang}${pkg}`] = buf.length;
  }
}
const sets = ["1", "2", "3", "4"].map((p) => new Set([bytes["hu" + p], bytes["en" + p], bytes["de" + p]]).size === 3);
ok(sets.every(Boolean), "each package renders different artwork per language");
console.log(fail ? "FAILED " + fail : "ALL PASSED");
