// Renders the public pages from the locked template + owner text overrides.
// With no overrides the output is byte-identical to dist-opus/index.html (and /en/index.html): verified at build time.
import T from "../cms/template.json" with { type: "json" };

export const ITEMS = new Map(T.items.map((i) => [i.id, i]));
export const SECTIONS = T.sections;

export const dec = (s) => s.replace(/&nbsp;/g, "\u00a0").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, "&");
export const enc = (s, attr) => {
  const o = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;");
  return attr ? o.replace(/"/g, "&quot;") : o;
};

/** override entry: {hu?:string, en?:string, b:string(base hash)}; ignored when the template changed under it */
export const live = (it, ov) => { const o = ov && ov[it.id]; return o && o.b === it.h ? o : null; };

export const norm = (s) => s.replace(/[ \t\r\n]+/g, " ").trim();
/** the default text of an item as the owner sees it in the editor */
export const base = (it, lang) => norm(dec(it[lang]));

export function effective(it, lang, ov) {
  if (it.lock) return it[lang];
  const o = live(it, ov);
  if (o && typeof o[lang] === "string" && o[lang] !== base(it, lang)) return enc(o[lang], it.kind === "attr");
  return it[lang];
}

const ldEsc = (s) => JSON.stringify(s).slice(1, -1).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

export function render(lang, ov, opts = {}) {
  let html = T.tpl[lang].replace(/\u0001(s\d+)\u0002/g, (_, id) => effective(ITEMS.get(id), lang, ov));
  // keep structured data in sync with visible text (FAQ answers, descriptions)
  const pairs = [];
  if (ov) for (const it of T.items) {
    if (it.lock) continue;
    const o = live(it, ov); if (!o || typeof o[lang] !== "string") continue;
    const oldT = base(it, lang); if (o[lang] === oldT || oldT.length < 12) continue;
    pairs.push([JSON.stringify(oldT).slice(1, -1), ldEsc(o[lang])]);
  }
  if (pairs.length) html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, body, c) => {
    for (const [o, n] of pairs) if (body.includes(o)) body = body.split(o).join(n);
    return a + body + c;
  });
  if (opts.preview) {
    const bar = '<div style="position:fixed;z-index:2147483647;left:0;right:0;bottom:0;background:#14120e;color:#f3dfaa;font:600 12px/1 system-ui,sans-serif;letter-spacing:.08em;text-align:center;padding:7px 8px;pointer-events:none">ELŐNÉZET · PISZKOZAT · a vendégek ezt még nem látják</div>';
    html = html.replace("</body>", bar + "</body>");
  }
  return html;
}

export const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), camera=(), microphone=()",
  "content-security-policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
};
