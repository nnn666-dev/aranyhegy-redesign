// CMS admin API  ->  /api/admin/*   (login, content, draft, preview, publish, history)
import { ITEMS, SECTIONS, base, dec, render, live } from "./_render.mjs";
import { cms, json, err, ip, allow, session, csrfOk, newSession, setCookie, cookieSid, audit, rnd, checkPassword, methods, adminEmails, hashCode, CODE_MS } from "./_cms.mjs";
import { sendMail } from "./_mail.mjs";
import T from "../cms/template.json" with { type: "json" };

const LIMITS = { h1: 90, h2: 80, h3: 90, h4: 90, p: 900, li: 160, summary: 140, dd: 420, dt: 80, figcaption: 160, button: 40, a: 60, span: 300, b: 60, title: 70, label: 80, strong: 80, small: 200, div: 300 };
export const limitFor = (it) => {
  const b = base(it, "hu").length;
  const l = it.kind === "attr" ? (it.label.startsWith("Google") ? 170 : 125) : (LIMITS[it.tag] || 300);
  return Math.max(l, Math.ceil(b * 1.3));
};
const BANNED = [[/kupol/i, "„kupola”"], [/\bdome\b/i, "„dome”"], [/4[\s-]*(csillag|star)/i, "„4 csillag”"], [/négycsillag/i, "„négycsillagos”"], [/csak ma\b/i, "„csak ma” (hamis sürgetés)"], [/utolsó szabad/i, "„utolsó szabad” (hamis sürgetés)"], [/only \d+ left/i, "„only N left” (hamis sürgetés)"]];

export function cleanText(s) {
  return String(s).normalize("NFC").replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
}
export function validate(it, lang, raw) {
  const errors = [], warns = []; const text = cleanText(raw);
  if (!text) errors.push("Üres szöveg nem menthető. Ha az eredetit szeretnéd, használd a „Visszaállítás az eredetire” gombot.");
  if (/[<>]/.test(text)) errors.push("A < és > jel nem használható.");
  const max = limitFor(it);
  if (text.length > max * 2) errors.push(`Túl hosszú (${text.length} karakter, legfeljebb ${max * 2}).`);
  else if (text.length > max) warns.push(`Kicsit hosszú (${text.length} / ${max}). Az oldalon levágva vagy szétcsúszva jelenhet meg.`);
  for (const [re, name] of BANNED) if (re.test(text)) errors.push(`Ez a kifejezés nem használható: ${name}.`);
  if (/\d[\d.\s]*\s?(Ft|HUF)\b/i.test(text)) errors.push("Árat itt nem lehet megadni. Az árak a foglalási rendszerrel együtt módosulnak, kérjetek segítséget.");
  if (/!{3,}/.test(text)) warns.push("Három vagy több felkiáltójel: elég egy is.");
  if (/\b[A-ZÁÉÍÓÖŐÚÜŰ]{6,}\b/.test(text) && !/\b[A-ZÁÉÍÓÖŐÚÜŰ]{6,}\b/.test(base(it, lang))) warns.push("Csupa nagybetűs szó: a kiemelést a stílus már megoldja.");
  if (/\S{26,}/.test(text)) warns.push("Nagyon hosszú, szóköz nélküli szakasz: mobilon szétcsúszhat.");
  if (lang === "en" && (text.match(/[áéíóöőúüű]/gi) || []).length > text.length * 0.03) warns.push("Magyar betűk vannak az angol szövegben. Biztos, hogy ide az angol kell?");
  if (lang === "de" && (text.match(/[áéíóőúű]/gi) || []).length > text.length * 0.03) warns.push("Magyar betűk vannak a német szövegben. Biztos, hogy ide a német kell?");
  if (it.kind === "attr" && text.length < 8 && it.label.startsWith("Kép")) warns.push("A kép leírása legyen legalább egy rövid mondat.");
  return { text, errors, warns, max };
}

const getDraft = async () => (await cms().get("draft", { type: "json" })) || { rev: 0, overrides: {}, updated: 0 };
const getPub = async () => (await cms().get("published", { type: "json" })) || { n: 0, overrides: {}, ts: 0 };
const pad = (n) => String(n).padStart(5, "0");

/** drop entries equal to the template default or stale (template changed) */
export function tidy(ov) {
  const out = {};
  for (const [id, o] of Object.entries(ov || {})) {
    const it = ITEMS.get(id); if (!it || it.lock || o.b !== it.h) continue;
    const e = { b: it.h };
    for (const l of ["hu", "en", "de"]) if (typeof o[l] === "string" && o[l] !== base(it, l)) e[l] = o[l];
    if (e.hu !== undefined || e.en !== undefined || e.de !== undefined) out[id] = e;
  }
  return out;
}
const secName = Object.fromEntries(SECTIONS.map((s) => [s.id, s.name]));
export function diffList(ovNew, ovOld) {
  const rows = [];
  for (const id of new Set([...Object.keys(ovNew), ...Object.keys(ovOld)])) {
    const it = ITEMS.get(id); if (!it) continue;
    for (const l of ["hu", "en", "de"]) {
      const a = (ovOld[id] && ovOld[id][l] !== undefined) ? ovOld[id][l] : base(it, l);
      const b = (ovNew[id] && ovNew[id][l] !== undefined) ? ovNew[id][l] : base(it, l);
      if (a !== b) rows.push({ id, section: secName[it.section] || it.section, label: it.label, lang: l, from: a, to: b });
    }
  }
  return rows;
}

const count = (s, ch) => { let n = 0; for (let i = s.indexOf(ch); i >= 0; i = s.indexOf(ch, i + 1)) n++; return n; };
export function preflight(ov) {
  const problems = [];
  for (const l of ["hu", "en", "de"]) {
    const def = render(l, null), html = render(l, ov);
    if (count(html, "<") !== count(def, "<")) problems.push(`${l.toUpperCase()}: a szerkezet (HTML elemek száma) megváltozott. Ez nem történhetne meg, a közzététel leállt.`);
    if (count(html, "<h1") !== 1) problems.push(`${l.toUpperCase()}: pontosan egy főcímnek (H1) kell lennie.`);
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (lds.length !== 3) problems.push(`${l.toUpperCase()}: hiányzik egy strukturált adat blokk.`);
    for (const m of lds) { try { const d = JSON.parse(m[1]); if (d["@type"] === "FAQPage" && d.mainEntity.length !== 28) problems.push(`${l.toUpperCase()}: a GYIK-ban nem 28 kérdés van.`); } catch { problems.push(`${l.toUpperCase()}: a strukturált adat hibás.`); } }
    for (const w of ["kupola", "dome "]) if (html.toLowerCase().replace(/img\/[^"' )]*/g, "").includes(w) && !def.toLowerCase().replace(/img\/[^"' )]*/g, "").includes(w)) problems.push(`${l.toUpperCase()}: tiltott kifejezés került az oldalra („${w.trim()}”).`);
  }
  return problems;
}

async function purge() {
  try { const { purgeCache } = await import("@netlify/functions"); await purgeCache({ tags: ["page"] }); return "ok"; } catch (e) { return "skipped"; }
}

async function doPublish(who, ovIn, note) {
  const pub = await getPub(), ov = tidy(ovIn);
  const rows = diffList(ov, pub.overrides || {});
  const problems = preflight(ov);
  if (problems.length) return { ok: false, problems };
  const n = (pub.n || 0) + 1, ts = Date.now();
  await cms().setJSON("ver/" + pad(n), { n, ts, who, note: note || "", overrides: ov, changes: rows.slice(0, 200), count: rows.length });
  await cms().setJSON("published", { n, ts, overrides: ov });
  const cache = await purge();
  await audit(who, "publish", { n, changes: rows.length, cache });
  return { ok: true, n, ts, changes: rows.length, cache };
}

export default async (req, ctx) => {
  const u = new URL(req.url), route = u.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const m = methods();
  if (route === "me") {
    const s = await session(req);
    return json({ ok: true, authed: !!s, who: s ? s.sess.who : null, csrf: s ? s.sess.csrf : null, methods: m, configured: m.password || m.email });
  }
  if (route === "login" && req.method === "POST") {
    if (!(m.password || m.email)) return err("A belépés még nincs beállítva.", 503, "not_configured");
    let b; try { b = await req.json(); } catch { return err("Hibás kérés."); }
    const o = req.headers.get("origin"); if (o && new URL(o).host !== u.host) return err("Tiltott kérés.", 403);
    const who = ip(req);
    if (!(await allow("login:" + who, 8, 15 * 60e3))) return err("Túl sok próbálkozás. Várjatok 15 percet.", 429, "rate");
    const fin = async (name) => { const { sid, csrf } = await newSession(req, name); await audit(name, "login", {}); return json({ ok: true, csrf, who: name }, 200, { "set-cookie": setCookie(sid, 7 * 86400) }); };
    if (b.action === "password" && m.password) {
      await new Promise((r) => setTimeout(r, 400));
      if (!checkPassword(b.password)) { await audit("?", "login-fail", { ip: who.slice(0, 20) }); return err("Hibás jelszó.", 401, "bad_login"); }
      return fin("Tulajdonos");
    }
    if (b.action === "code-request" && m.email) {
      const email = String(b.email || "").trim().toLowerCase();
      if (adminEmails().includes(email) && (await allow("code:" + email, 3, 3600e3))) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await cms().setJSON("code/" + email.replace(/[^a-z0-9]/g, "_"), { h: hashCode(email, code), exp: Date.now() + CODE_MS, tries: 0 });
        await sendMail({ to: email, subject: "Belépési kód: " + code, text: `A belépési kódod: ${code}\nEz 10 percig érvényes. Ha nem te kérted, hagyd figyelmen kívül.`, html: `<p>A belépési kódod:</p><p style="font-size:28px;letter-spacing:.2em"><b>${code}</b></p><p>Ez 10 percig érvényes. Ha nem te kérted, hagyd figyelmen kívül.</p>` });
      }
      return json({ ok: true, message: "Ha az e-mail-cím engedélyezett, a kódot elküldtük." });
    }
    if (b.action === "code-verify" && m.email) {
      const email = String(b.email || "").trim().toLowerCase(), key = "code/" + email.replace(/[^a-z0-9]/g, "_");
      const c = await cms().get(key, { type: "json" });
      if (!c || Date.now() > c.exp || c.tries >= 5) return err("A kód érvénytelen vagy lejárt. Kérjetek újat.", 401, "bad_code");
      c.tries++; await cms().setJSON(key, c);
      if (c.h !== hashCode(email, String(b.code || "").trim())) return err("Hibás kód.", 401, "bad_code");
      await cms().delete(key); return fin(email);
    }
    return err("Ismeretlen belépési mód.");
  }

  // ---------- everything below needs a session ----------
  const s = await session(req);
  if (!s) return err("Nem vagy bejelentkezve.", 401, "auth");
  if (!csrfOk(req, s.sess)) return err("Biztonsági ellenőrzés sikertelen. Frissítsd az oldalt.", 403, "csrf");
  const who = s.sess.who;
  const body = async () => { try { return await req.json(); } catch { return {}; } };

  if (route === "logout" && req.method === "POST") { await cms().delete(s.key); await audit(who, "logout"); return json({ ok: true }, 200, { "set-cookie": setCookie("0".repeat(64), 0) }); }

  if (route === "content") {
    const [dr, pub] = await Promise.all([getDraft(), getPub()]);
    const items = [];
    for (const it of T.items) {
      if (it.lock) continue;
      items.push({ id: it.id, s: it.section, t: it.tag, l: it.label, k: it.kind, hu: base(it, "hu"), en: base(it, "en"), de: base(it, "de"), max: limitFor(it) });
    }
    return json({ ok: true, sections: SECTIONS, items, locked: T.items.filter((i) => i.lock).length, draft: tidy(dr.overrides), published: tidy(pub.overrides), rev: dr.rev, pubN: pub.n, pubTs: pub.ts, draftTs: dr.updated });
  }

  if (route === "save" && req.method === "POST") {
    const b = await body(); const ids = Array.isArray(b.ids) ? b.ids.slice(0, 40) : [b.id];
    if (!(await allow("save:" + who, 120, 60e3))) return err("Túl gyors mentés.", 429, "rate");
    const dr = await getDraft(); const results = [];
    const pend = {};
    for (const id of ids) {
      const it = ITEMS.get(id); if (!it || it.lock) return err("Ez a szöveg zárolt vagy nem létezik.", 400, "locked");
      const e = { ...(dr.overrides[id] || { b: it.h }), b: it.h };
      for (const l of ["hu", "en", "de"]) {
        if (typeof b[l] !== "string") continue;
        const v = validate(it, l, b[l]);
        if (v.errors.length) return json({ ok: false, error: "invalid", errors: v.errors, warns: v.warns }, 422);
        e[l] = v.text; results.push({ id, lang: l, warns: v.warns });
      }
      pend[id] = e;
    }
    dr.overrides = tidy({ ...dr.overrides, ...pend });
    dr.rev = (dr.rev || 0) + 1; dr.updated = Date.now();
    await cms().setJSON("draft", dr);
    await audit(who, "save", { ids: ids.length, first: ids[0] });
    return json({ ok: true, rev: dr.rev, warns: results.flatMap((r) => r.warns), draft: dr.overrides, updated: dr.updated });
  }

  if (route === "revert" && req.method === "POST") {
    const b = await body(); const dr = await getDraft();
    if (b.all === true) dr.overrides = tidy((await getPub()).overrides);
    else for (const id of (Array.isArray(b.ids) ? b.ids : [b.id])) { const pub = (await getPub()).overrides || {}; if (pub[id]) dr.overrides[id] = pub[id]; else delete dr.overrides[id]; if (b.toDefault) delete dr.overrides[id]; }
    dr.overrides = tidy(dr.overrides); dr.rev++; dr.updated = Date.now(); await cms().setJSON("draft", dr);
    await audit(who, "revert", { all: !!b.all });
    return json({ ok: true, draft: dr.overrides, rev: dr.rev });
  }

  if (route === "changes") {
    const [dr, pub] = await Promise.all([getDraft(), getPub()]);
    const rows = diffList(tidy(dr.overrides), tidy(pub.overrides));
    return json({ ok: true, rows, problems: rows.length ? preflight(tidy(dr.overrides)) : [], pubN: pub.n });
  }

  if (route === "preview") {
    const lang = ["en", "de"].includes(u.searchParams.get("lang")) ? u.searchParams.get("lang") : "hu";
    const dr = await getDraft();
    let html = render(lang, tidy(dr.overrides), { preview: true });
    html = html.replace(/(?<=[\s,"'(=])(img\/|fonts\/|vid\/)/g, "/$1").replace(/(href|src)="(favicon[^"]*|apple-touch-icon[^"]*|site\.webmanifest)"/g, '$1="/$2"');
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "content-security-policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" } });
  }

  if (route === "publish" && req.method === "POST") {
    const b = await body();
    if (!(await allow("publish:" + who, 20, 3600e3))) return err("Túl sok közzététel egy órán belül.", 429, "rate");
    const dr = await getDraft();
    if (typeof b.rev === "number" && b.rev !== dr.rev) return err("A piszkozat közben megváltozott. Nézd át újra a módosításokat.", 409, "stale");
    const r = await doPublish(who, dr.overrides, "");
    return json(r, r.ok ? 200 : 422);
  }

  if (route === "history") {
    const l = await cms().list({ prefix: "ver/" }); const out = [];
    for (const k of l.blobs.slice(-40).reverse()) { const v = await cms().get(k.key, { type: "json" }); if (v) out.push({ n: v.n, ts: v.ts, who: v.who, count: v.count, note: v.note, changes: (v.changes || []).slice(0, 12) }); }
    return json({ ok: true, versions: out });
  }

  if (route === "restore" && req.method === "POST") {
    const b = await body(); const n = Number(b.n);
    const v = await cms().get("ver/" + pad(n), { type: "json" });
    if (!v) return err("Nincs ilyen verzió.", 404);
    if (b.publish === true) {
      const r = await doPublish(who, v.overrides, `Visszaállítás a(z) ${n}. verzióra`);
      const dr = await getDraft(); dr.overrides = tidy(v.overrides); dr.rev++; dr.updated = Date.now(); await cms().setJSON("draft", dr);
      return json(r, r.ok ? 200 : 422);
    }
    const dr = await getDraft(); dr.overrides = tidy(v.overrides); dr.rev++; dr.updated = Date.now(); await cms().setJSON("draft", dr);
    await audit(who, "restore-draft", { n });
    return json({ ok: true, draft: dr.overrides, rev: dr.rev });
  }

  if (route === "audit") {
    const l = await cms().list({ prefix: "audit/" }); const out = [];
    for (const k of l.blobs.slice(-60).reverse()) { const v = await cms().get(k.key, { type: "json" }); if (v) out.push(v); }
    return json({ ok: true, log: out });
  }

  if (route === "inquiries") {
    const l = await cms().list({ prefix: "inq/" }); const out = [];
    for (const k of l.blobs.slice(-100).reverse()) { const v = await cms().get(k.key, { type: "json" }); if (v) out.push(v); }
    return json({ ok: true, list: out, news: out.filter((x) => x.status === "new").length });
  }
  if (route === "inquiry-status" && req.method === "POST") {
    const b = await body(); const id = String(b.id || ""), st = b.status === "done" ? "done" : "new";
    if (!/^AJ-[0-9A-F]{8}$/.test(id)) return err("Ismeretlen azonosító.", 400, "bad_id");
    const l = await cms().list({ prefix: "inq/" }); const k = l.blobs.find((x) => x.key.endsWith("-" + id));
    if (!k) return err("Nem található.", 404, "not_found");
    const v = await cms().get(k.key, { type: "json" }); v.status = st; await cms().setJSON(k.key, v);
    await audit(who, "inquiry-" + st, { id });
    return json({ ok: true });
  }

  return err("Nincs ilyen művelet.", 404, "not_found");
};
export const config = { path: "/api/admin/*" };
