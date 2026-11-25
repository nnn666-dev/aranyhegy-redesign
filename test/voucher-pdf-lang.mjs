// Render real voucher PDFs through the production code path in all three languages and save them.
import fs from "node:fs";
import { renderVoucherPdf, voucherFileName, dateUntil } from "../netlify/functions/_voucher.mjs";
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const lang of ["hu", "en", "de"]) {
  for (const pkg of [1, 2, 3, 4]) {
    const v = { code: "AHU-TEST-ABCD".replace("TEST", "K7M2").replace("ABCD", "Q9XZ"), pkg, lang, recipient: lang === "de" ? "Anna Müller-Ősz" : "Kovács Anna", validUntil: "2027-11-18" };
    const pdf = await renderVoucherPdf(v);
    const name = `${lang}-${pkg}-${voucherFileName(v)}`;
    fs.writeFileSync(`${OUT}/${name}`, pdf);
    n++;
    if (pkg === 1) console.log(lang, "file:", voucherFileName(v), "| validity:", dateUntil(v.validUntil, lang), "| bytes:", pdf.length);
  }
}
console.log("rendered", n, "pdfs");
// unknown / missing lang falls back to Hungarian
const v0 = { code: "AHU-K7M2-Q9XZ", pkg: 1, validUntil: "2027-11-18", recipient: "" };
console.log("fallback file:", voucherFileName(v0), "| bytes:", (await renderVoucherPdf(v0)).length);
