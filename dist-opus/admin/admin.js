"use strict";
// Aranyhegy szerkesztő. Minden szöveg textContent-tel kerül a DOM-ba (nincs innerHTML).
(function () {
  var $app = document.getElementById("app");
  var S = { me: null, csrf: "", c: null, view: "home", sec: null, item: null, lang: "hu", q: "", dirty: null, undo: null, hist: null, chg: null };

  var ICON = {
    home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
    pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6",
    up: "M12 19V6M6 11l6-6 6 6M5 21h14",
    clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
    help: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17v.5",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
    img: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01"
  };
  function svg(name) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", ICON[name] || ICON.pen); s.appendChild(p); return s;
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function api(path, body) {
    var o = { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: {} };
    if (body !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(body); }
    if (S.csrf) o.headers["x-csrf"] = S.csrf;
    return fetch("/api/admin/" + path, o).then(function (r) { return r.json().catch(function () { return { ok: false, message: "Váratlan válasz." }; }).then(function (j) { j.status = r.status; if (r.status === 401 && path !== "login" && path !== "me") { S.me = null; render(); } return j; }); }).catch(function () { return { ok: false, message: "Nincs kapcsolat. Ellenőrizd az internetet, és próbáld újra.", status: 0 }; });
  }
  function fmtTs(ts) { if (!ts) return "még nem volt"; var d = new Date(ts), n = new Date(); var t = d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
    var same = d.toDateString() === n.toDateString(); var y = new Date(n - 864e5).toDateString() === d.toDateString();
    return same ? "ma " + t : y ? "tegnap " + t : d.toLocaleDateString("hu-HU", { month: "long", day: "numeric" }) + " " + t; }
  function toast(msg, action, cb, ms) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = el("div", { class: "toast", role: "status" }, [el("span", { text: msg })]);
    if (action) t.appendChild(el("button", { type: "button", text: action, onclick: function () { t.remove(); cb && cb(); } }));
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 9000);
  }
  function modal(title, bodyNodes, buttons) {
    var m = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
    var box = el("div", { class: "box" }, [el("h2", { text: title })].concat(bodyNodes || []));
    var bar = el("div", { class: "btns" }); buttons.forEach(function (b) { bar.appendChild(el("button", { type: "button", class: "btn " + (b.cls || ""), text: b.text, onclick: function () { m.remove(); b.fn && b.fn(); } })); });
    box.appendChild(bar); m.appendChild(box); m.addEventListener("click", function (e) { if (e.target === m) m.remove(); }); document.body.appendChild(m);
    var f = bar.querySelector("button"); f && f.focus(); return m;
  }

  // ---------- data helpers ----------
  function byId(id) { return S.c.items.find(function (x) { return x.id === id; }); }
  function cur(it, lang) { var d = S.c.draft[it.id]; return d && typeof d[lang] === "string" ? d[lang] : it[lang]; }
  function liveVal(it, lang) { var p = S.c.published[it.id]; return p && typeof p[lang] === "string" ? p[lang] : it[lang]; }
  function changedCount() { var n = 0; S.c.items.forEach(function (it) { ["hu", "en", "de"].forEach(function (l) { if (cur(it, l) !== liveVal(it, l)) n++; }); }); return n; }
  function itemDirty(it) { return cur(it, "hu") !== liveVal(it, "hu") || cur(it, "en") !== liveVal(it, "en") || cur(it, "de") !== liveVal(it, "de"); }
  function secItems(id) { return S.c.items.filter(function (x) { return x.s === id; }); }
  var SECNAME = {}; 
  var TIPS = { hdr: "A menü és a fejléc feliratai.", seo: "Ezt látják a Google találatban és megosztáskor.", gyik: "Gyakori kérdések és válaszok.", latnivalok: "Látnivalók leírásai." };

  // ---------- login ----------
  function viewLogin() {
    var m = S.methodsInfo || {}; var box = el("div", { class: "login" });
    box.appendChild(el("div", { class: "logo", text: "ARANYHEGY" }));
    box.appendChild(el("p", { class: "sub", text: "Weboldal-szerkesztő" }));
    if (!m.configured) { box.appendChild(el("div", { class: "note", text: "A belépés még nincs beállítva (jelszó vagy e-mail kód). Kérjétek meg a weboldal készítőjét, hogy kapcsolja be." })); return box; }
    var msg = el("p", { class: "note bad", hidden: true, role: "alert" });
    function show(t) { msg.textContent = t; msg.hidden = !t; }
    if (m.methods.password) {
      var pw = el("input", { type: "password", id: "pw", autocomplete: "current-password", "aria-label": "Jelszó" });
      var go = el("button", { type: "button", class: "btn p full", text: "Belépés", onclick: function () { go.disabled = true; api("login", { action: "password", password: pw.value }).then(function (r) { go.disabled = false; if (r.ok) { S.csrf = r.csrf; boot(); } else show(r.message || "Nem sikerült."); }); } });
      pw.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
      box.appendChild(el("label", { class: "f", for: "pw", text: "Jelszó" })); box.appendChild(pw); box.appendChild(el("div", { class: "btns" }, [go]));
    }
    if (m.methods.email) {
      var em = el("input", { type: "email", id: "em", autocomplete: "email", inputmode: "email" }); var cd = el("input", { type: "text", id: "cd", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", hidden: true });
      var b2 = el("button", { type: "button", class: "btn " + (m.methods.password ? "" : "p ") + "full", text: "Kód küldése e-mailben" });
      var step = 1;
      b2.addEventListener("click", function () {
        b2.disabled = true;
        if (step === 1) api("login", { action: "code-request", email: em.value }).then(function (r) { b2.disabled = false; if (r.ok) { step = 2; cd.hidden = false; cd.focus(); b2.textContent = "Belépés a kóddal"; show(""); toast(r.message, null, null, 6000); } else show(r.message); });
        else api("login", { action: "code-verify", email: em.value, code: cd.value }).then(function (r) { b2.disabled = false; if (r.ok) { S.csrf = r.csrf; boot(); } else show(r.message || "Nem sikerült."); });
      });
      if (m.methods.password) box.appendChild(el("p", { class: "muted", style: "text-align:center;margin:22px 0 4px", text: "vagy" }));
      box.appendChild(el("label", { class: "f", for: "em", text: "E-mail-cím" })); box.appendChild(em);
      box.appendChild(el("label", { class: "f", for: "cd", hidden: true, text: "Kód" })); box.appendChild(cd); box.appendChild(el("div", { class: "btns" }, [b2]));
    }
    box.appendChild(msg);
    box.appendChild(el("p", { class: "muted", style: "text-align:center;margin-top:28px", text: "Amíg nem nyomod meg a Közzététel gombot, a vendégek semmit sem látnak a módosításaidból." }));
    return box;
  }

  // ---------- shell ----------
  function topBar(title, back) {
    var n = changedCount();
    return el("header", { class: "top" }, [back ? el("button", { class: "back", type: "button", text: "‹ Vissza", onclick: back }) : null, el("b", { text: title }), n ? el("span", { class: "chip draft pill", text: n + " módosítás" }) : null]);
  }
  function tabs() {
    var n = changedCount();
    var defs = [["home", "Kezdőlap", "home"], ["edit", "Szövegek", "pen"], ["preview", "Előnézet", "eye"], ["publish", "Közzététel", "up"], ["more", "Több", "more"]];
    var nav = el("nav", { class: "tabs", "aria-label": "Fő menü" });
    defs.forEach(function (d) {
      var b = el("button", { type: "button", "aria-current": S.view === d[0] || (d[0] === "edit" && S.view === "item") ? "page" : null, onclick: function () { go(d[0]); } }, [svg(d[2]), el("span", { text: d[1] })]);
      if (d[0] === "publish" && n) b.appendChild(el("span", { class: "dot", text: String(n) })); nav.appendChild(b);
    }); return nav;
  }
  function go(v, extra) { if (S.view === "item" && S.dirty && !extra) { return leaveCheck(function () { go(v, true); }); } S.view = v; if (v === "edit") { S.sec = null; S.item = null; } if (v === "more") S.sub = null; render(); window.scrollTo(0, 0); }
  function leaveCheck(next) { modal("Nem mentett változtatás", [el("p", { text: "Ezt a szöveget még nem mentetted. Mentsem, mielőtt továbblépsz?" })], [{ text: "Mentés", cls: "p", fn: function () { saveItem(next); } }, { text: "Eldobom", fn: function () { S.dirty = null; next(); } }, { text: "Maradok" }]); }

  // ---------- views ----------
  function viewHome() {
    var n = changedCount(), w = el("div", { class: "wrap" });
    var hr = new Date().getHours(); var hi = hr < 10 ? "Jó reggelt!" : hr < 18 ? "Üdvözlünk!" : "Jó estét!";
    w.appendChild(el("h1", { class: "hello", text: hi }));
    w.appendChild(el("div", { class: "status " + (n ? "wait" : "ok") }, [el("div", {}, [el("b", { text: n ? n + " módosítás vár közzétételre" : "A weboldal naprakész" }), el("span", { text: n ? "A vendégek ezeket még nem látják." : "Utolsó közzététel: " + fmtTs(S.c.pubTs) + "." })])]));
    w.appendChild(el("p", { class: "lbl", text: "Mit szeretnél módosítani?" }));
    var g = el("div", { class: "grid" });
    var tiles = [["pen", "Egy mondatot", "Bármelyik szöveg az oldalon", function () { S.view = "edit"; S.sec = null; render(); }],
      ["help", "GYIK-választ", "Gyakori kérdések", function () { S.view = "edit"; S.sec = "gyik"; render(); }],
      ["list", "Látnivalót", "Leírások és szövegek", function () { S.view = "edit"; S.sec = "latnivalok"; render(); }],
      ["img", "Képet cserélni", "Hamarosan", function () { toast("A képcsere a következő lépésben érkezik. Addig kérjetek segítséget.", null, null, 6000); }]];
    tiles.forEach(function (t) { g.appendChild(el("button", { class: "tile", type: "button", onclick: t[3] }, [svg(t[0]), el("b", { text: t[1] }), el("small", { text: t[2] })])); });
    w.appendChild(g);
    if (n) { w.appendChild(el("div", { class: "card", style: "margin-top:14px" }, [el("h2", { text: "Folyamatban lévő munka" }), el("p", { class: "muted", text: n + " módosítás piszkozatban." }), el("div", { class: "btns" }, [el("button", { class: "btn", type: "button", text: "Előnézet", onclick: function () { go("preview"); } }), el("button", { class: "btn p", type: "button", text: "Közzététel…", onclick: function () { go("publish"); } })])])); }
    w.appendChild(el("p", { class: "muted", style: "margin-top:18px", text: S.c.items.length + " szöveg szerkeszthető. " + S.c.locked + " rész (árak, formázott szövegek, elérhetőségek) zárolt, hogy az oldal szép és a foglalás működő maradjon." }));
    return w;
  }

  function viewEdit() {
    var w = el("div", { class: "wrap" });
    if (S.q) return viewSearch(w);
    if (!S.sec) {
      w.appendChild(searchBox()); w.appendChild(el("p", { class: "lbl", text: "Az oldal részei" }));
      var l = el("div", { class: "list" });
      S.c.sections.forEach(function (s) { var its = secItems(s.id); if (!its.length) return; var d = its.filter(itemDirty).length;
        l.appendChild(el("button", { class: "row", type: "button", onclick: function () { S.sec = s.id; render(); window.scrollTo(0, 0); } }, [el("div", { class: "t" }, [el("b", { text: s.name }), el("small", { text: its.length + " szöveg" + (TIPS[s.id] ? " · " + TIPS[s.id] : "") })]), d ? el("span", { class: "chip draft", text: d + " módosítva" }) : null, el("span", { class: "chev", text: "›" })])); });
      w.appendChild(l); return w;
    }
    var sc = S.c.sections.find(function (s) { return s.id === S.sec; });
    w.appendChild(el("button", { class: "back", type: "button", style: "border:0;background:none;color:var(--deep);min-height:44px;padding:0", text: "‹ Az oldal részei", onclick: function () { S.sec = null; render(); } }));
    w.appendChild(el("h2", { class: "serif", style: "font-size:24px;margin:2px 0 10px", text: sc ? sc.name : "" }));
    w.appendChild(listFor(secItems(S.sec))); return w;
  }
  function searchBox() {
    var i = el("input", { type: "search", placeholder: "Keresés a szövegekben…", "aria-label": "Keresés", value: S.q || "", autocomplete: "off" });
    var t; i.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { S.q = i.value.trim(); var pos = i.selectionStart; render(); var n = document.querySelector("input[type=search]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); });
    return el("div", { class: "search" }, [i]);
  }
  function viewSearch(w) {
    w.appendChild(searchBox()); var q = S.q.toLowerCase();
    var hits = S.c.items.filter(function (it) { return cur(it, "hu").toLowerCase().indexOf(q) >= 0 || cur(it, "en").toLowerCase().indexOf(q) >= 0 || cur(it, "de").toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
    if (!hits.length) { w.appendChild(el("div", { class: "empty", text: "Nincs találat. Lehet, hogy az a szöveg zárolt (például árak)." })); return w; }
    w.appendChild(listFor(hits, true)); return w;
  }
  function listFor(items, showSec) {
    var l = el("div", { class: "list" });
    items.forEach(function (it) {
      var sn = ""; if (showSec) { var s = S.c.sections.find(function (x) { return x.id === it.s; }); sn = s ? s.name + " · " : ""; }
      l.appendChild(el("button", { class: "row", type: "button", onclick: function () { S.item = it.id; S.view = "item"; S.lang = "hu"; S.dirty = null; render(); window.scrollTo(0, 0); } }, [el("div", { class: "t" }, [el("b", { text: cur(it, "hu") }), el("small", { text: sn + it.l })]), itemDirty(it) ? el("span", { class: "chip draft", text: "Piszkozat" }) : null, el("span", { class: "chev", text: "›" })]));
    }); return l;
  }

  function viewItem() {
    var it = byId(S.item), w = el("div", { class: "wrap" });
    if (!it) { S.view = "edit"; return viewEdit(); }
    var sc = S.c.sections.find(function (s) { return s.id === it.s; });
    w.appendChild(el("p", { class: "lbl", text: (sc ? sc.name : "") + " · " + it.l }));
    var lg = el("div", { class: "lang", role: "group", "aria-label": "Nyelv" });
    [["hu", "Magyar"], ["en", "English"], ["de", "Deutsch"]].forEach(function (x) { lg.appendChild(el("button", { type: "button", "aria-pressed": S.lang === x[0] ? "true" : "false", text: x[1], onclick: function () { if (S.lang !== x[0]) { S.lang = x[0]; render(); } } })); });
    w.appendChild(lg);
    var val = (S.dirty && S.dirty.lang === S.lang) ? S.dirty.text : cur(it, S.lang);
    var multi = val.length > 70 || it.t === "p";
    var inp = multi ? el("textarea", { id: "ed", rows: "5", spellcheck: "true", lang: S.lang }) : el("input", { type: "text", id: "ed", spellcheck: "true", lang: S.lang, autocomplete: "off" });
    inp.value = val;
    var cnt = el("div", { class: "cnt" }), warn = el("div", { "aria-live": "polite" });
    function upd() {
      var v = inp.value, n = v.trim().length, max = it.max; S.dirty = (v !== cur(it, S.lang)) ? { id: it.id, lang: S.lang, text: v } : null;
      cnt.className = "cnt" + (n > max * 2 ? " err" : n > max ? " warn" : ""); cnt.textContent = ""; cnt.appendChild(el("span", { text: n > max ? "Kicsit hosszú, érdemes rövidíteni" : "Karakterszám" })); cnt.appendChild(el("span", { text: n + " / " + max }));
      saveBtn.disabled = !S.dirty;
    }
    var saveBtn = el("button", { type: "button", class: "btn p", text: "Mentés piszkozatként", onclick: function () { saveItem(); } });
    inp.addEventListener("input", upd);
    w.appendChild(el("label", { class: "f", for: "ed", text: S.lang === "hu" ? "Szöveg (magyarul)" : "Text (English)" })); w.appendChild(inp); w.appendChild(cnt); w.appendChild(warn);
    var lv = liveVal(it, S.lang);
    var side = el("div", { class: "card", style: "margin-top:14px" }, [el("p", { class: "lbl", text: "Most élő a weboldalon" }), el("p", { text: lv, lang: S.lang }), el("p", { class: "muted", text: it[S.lang] !== lv ? "Az eredeti szöveg: " + it[S.lang] : "" })]);
    if (S.lang === "hu") { var en = cur(it, "en"); side.appendChild(el("p", { class: "muted", style: "margin-top:8px", text: "Az angol változat: " + en })); side.appendChild(el("p", { class: "muted", text: itemEnOutdated(it) ? "Ha a magyart módosítod, váltsd át az angolra is, és frissítsd ott is." : "" })); }
    w.appendChild(side);
    var bar = el("div", { class: "btns" });
    bar.appendChild(el("button", { type: "button", class: "btn", text: "Visszaállítás az eredetire", onclick: function () { revertItem(it); } }));
    w.appendChild(bar);
    var st = el("div", { class: "sticky" }, [el("div", { class: "in" }, [saveBtn, el("button", { type: "button", class: "btn", text: "Előnézet", onclick: function () { if (S.dirty) saveItem(function () { go("preview", true); }); else go("preview", true); } })])]);
    w.appendChild(st); upd(); setTimeout(function () { inp.focus({ preventScroll: true }); }, 50); S._warnEl = warn; return w;
  }
  function itemEnOutdated() { return false; }
  function saveItem(after) {
    if (!S.dirty) { after && after(); return; }
    var d = S.dirty, it = byId(d.id), prev = S.c.draft[d.id] ? JSON.parse(JSON.stringify(S.c.draft[d.id])) : null; var body = { id: d.id }; body[d.lang] = d.text;
    api("save", body).then(function (r) {
      if (!r.ok) { var m = (r.errors && r.errors.join(" ")) || r.message || "Nem sikerült menteni."; if (S._warnEl) { S._warnEl.textContent = ""; S._warnEl.appendChild(el("div", { class: "note bad", role: "alert", text: m })); } else toast(m); return; }
      S.c.draft = r.draft; S.c.draftTs = r.updated; S.c.rev = r.rev; S.dirty = null; S.undo = { id: d.id, prev: prev };
      if (r.warns && r.warns.length) toast("Mentve. Figyelem: " + r.warns[0], "Visszavonás", undoSave, 12000); else toast("Mentve piszkozatként.", "Visszavonás", undoSave, 10000);
      render(); after && after();
    });
  }
  function undoSave() {
    var u = S.undo; if (!u) return;
    var p = u.prev; var pub = S.c.published[u.id];
    function done(r) { if (r.ok) { S.c.draft = r.draft; S.c.rev = r.rev; render(); toast("Visszavonva."); } else toast(r.message || "Nem sikerült."); }
    if (!p) api("revert", { id: u.id, toDefault: true }).then(done); else { var b = { id: u.id }; if (typeof p.hu === "string") b.hu = p.hu; if (typeof p.en === "string") b.en = p.en; api("revert", { id: u.id, toDefault: true }).then(function (r) { if (r.ok && (b.hu || b.en)) api("save", b).then(done); else done(r); }); }
  }
  function revertItem(it) {
    modal("Visszaállítás az eredetire", [el("p", { text: "A szöveg (magyar és angol) visszaáll arra, ami a weboldal készítésekor volt. Ez csak piszkozat marad, amíg közzé nem teszed." }), el("p", { class: "muted", text: it.hu })], [{ text: "Visszaállítom", cls: "p", fn: function () { api("revert", { id: it.id, toDefault: true }).then(function (r) { if (r.ok) { S.c.draft = r.draft; S.c.rev = r.rev; S.dirty = null; render(); toast("Visszaállítva."); } else toast(r.message); }); } }, { text: "Mégsem" }]);
  }

  function viewPreview() {
    var w = el("div", { class: "wrap" });
    var lang = S.plang || "hu", dev = S.pdev || "phone";
    var lg = el("div", { class: "lang" }); [["hu", "Magyar"], ["en", "English"], ["de", "Deutsch"]].forEach(function (x) { lg.appendChild(el("button", { type: "button", "aria-pressed": lang === x[0] ? "true" : "false", text: x[1], onclick: function () { S.plang = x[0]; render(); } })); });
    var dv = el("div", { class: "lang" }); [["phone", "Telefon"], ["desk", "Számítógép"]].forEach(function (x) { dv.appendChild(el("button", { type: "button", "aria-pressed": dev === x[0] ? "true" : "false", text: x[1], onclick: function () { S.pdev = x[0]; render(); } })); });
    w.appendChild(el("p", { class: "note", text: "Ez a piszkozat: így nézne ki az oldal, ha most közzétennéd. A vendégek ezt még nem látják." })); w.appendChild(lg); w.appendChild(dv);
    w.appendChild(el("div", { class: "frame" + (dev === "desk" ? " wide" : "") }, [el("iframe", { src: "/api/admin/preview?lang=" + lang + "&r=" + (S.c.rev || 0), title: "Előnézet", loading: "eager" })]));
    var n = changedCount();
    w.appendChild(el("div", { class: "sticky" }, [el("div", { class: "in" }, [el("button", { class: "btn", type: "button", text: "Vissza a szerkesztéshez", onclick: function () { go("edit"); } }), el("button", { class: "btn p", type: "button", text: n ? "Közzététel…" : "Nincs módosítás", disabled: !n, onclick: function () { go("publish"); } })])]));
    return w;
  }

  function viewPublish() {
    var w = el("div", { class: "wrap" }); var body = el("div", {}, [el("p", { class: "muted", text: "Módosítások betöltése…" })]); w.appendChild(body);
    api("changes").then(function (r) {
      body.textContent = "";
      if (!r.ok) { body.appendChild(el("div", { class: "note bad", text: r.message || "Nem sikerült betölteni." })); return; }
      S.chg = r;
      if (!r.rows.length) { body.appendChild(el("div", { class: "status ok" }, [el("div", {}, [el("b", { text: "Nincs közzétételre váró módosítás" }), el("span", { text: "A weboldal pontosan azt mutatja, amit az utolsó közzétételkor beállítottál." })])])); return; }
      var hu = r.rows.filter(function (x) { return x.lang === "hu"; }).length, en = r.rows.filter(function (x) { return x.lang === "en"; }).length, de = r.rows.length - hu - en;
      body.appendChild(el("h2", { class: "serif", style: "font-size:24px;margin:4px 0 6px", text: r.rows.length + " módosítás kerül ki a vendégek elé" }));
      body.appendChild(el("p", { class: "muted", text: hu + " magyar, " + en + " angol és " + de + " német szöveg. Az előző változat megmarad, bármikor visszaállíthatod." }));
      if (r.problems && r.problems.length) r.problems.forEach(function (p) { body.appendChild(el("div", { class: "note bad", text: p })); });
      var c = el("div", { class: "card" }); r.rows.slice(0, 80).forEach(function (x) { c.appendChild(el("div", { class: "diffitem" }, [el("p", { class: "lbl", text: x.section + " · " + x.label + " · " + (x.lang === "hu" ? "magyar" : x.lang === "en" ? "angol" : "német") }), el("div", { class: "diff" }, [el("div", { class: "from", text: x.from }), el("div", { class: "to", text: x.to })])])); });
      if (r.rows.length > 80) c.appendChild(el("p", { class: "muted", text: "… és még " + (r.rows.length - 80) + " módosítás." })); body.appendChild(c);
      body.appendChild(el("div", { class: "btns" }, [el("button", { class: "btn", type: "button", text: "Előnézet", onclick: function () { go("preview"); } }), el("button", { class: "btn p", type: "button", text: "Közzététel most", disabled: !!(r.problems && r.problems.length), onclick: confirmPublish })]));
    }); return w;
  }
  function confirmPublish() {
    var r = S.chg; modal("Közzététel", [el("p", { text: "Most teszed élővé az oldalt. " + r.rows.length + " módosítás kerül ki a vendégek elé. Az előző változat megmarad, bármikor visszaállíthatod." })], [{ text: "Közzététel most", cls: "p", fn: doPublish }, { text: "Még átnézem" }]);
  }
  function doPublish() {
    toast("Közzététel folyamatban…", null, null, 20000);
    api("publish", { rev: S.c.rev }).then(function (r) {
      var t = document.querySelector(".toast"); if (t) t.remove();
      if (!r.ok) { if (r.status === 409) { toast(r.message); return; } modal("Nem sikerült közzétenni", (r.problems || [r.message || "Ismeretlen hiba."]).map(function (p) { return el("div", { class: "note bad", text: p }); }), [{ text: "Rendben" }]); return; }
      S.c.published = JSON.parse(JSON.stringify(S.c.draft)); S.c.pubTs = r.ts; S.c.pubN = r.n; S.chg = null; render();
      modal("Kész! Az oldal frissült.", [el("p", { text: r.changes + " módosítás él a weboldalon. Pár másodperc, mire mindenkinek megjelenik." }), el("p", { class: "muted", text: "Ha valami nem tetszik: Több › Előzmények, és egy koppintással visszaállítható." })], [{ text: "Az oldal megnyitása", cls: "p", fn: function () { window.open("/", "_blank", "noopener"); } }, { text: "Rendben" }]);
    });
  }

  function viewMore() {
    var w = el("div", { class: "wrap" });
    if (S.sub === "history") return viewHistory(w);
    if (S.sub === "log") return viewLog(w);
    if (S.sub === "help") return viewHelp(w);
    var l = el("div", { class: "list" });
    [["Előzmények és visszaállítás", "Korábbi közzétételek", "history"], ["Napló", "Ki mit módosított", "log"], ["Segítség", "Hogyan működik?", "help"]].forEach(function (x) {
      l.appendChild(el("button", { class: "row", type: "button", onclick: function () { S.sub = x[2]; render(); } }, [el("div", { class: "t" }, [el("b", { text: x[0] }), el("small", { text: x[1] })]), el("span", { class: "chev", text: "›" })])); });
    w.appendChild(l);
    w.appendChild(el("div", { class: "btns" }, [el("button", { class: "btn", type: "button", text: "Kijelentkezés", onclick: function () { api("logout", {}).then(function () { S.me = null; S.csrf = ""; render(); }); } })]));
    w.appendChild(el("p", { class: "muted", style: "margin-top:16px", text: "Belépve mint: " + (S.me && S.me.who || "") }));
    return w;
  }
  function sub(w, title) { w.appendChild(el("button", { type: "button", style: "border:0;background:none;color:var(--deep);min-height:44px;padding:0", text: "‹ Több", onclick: function () { S.sub = null; render(); } })); w.appendChild(el("h2", { class: "serif", style: "font-size:24px;margin:2px 0 10px", text: title })); }
  function viewHistory(w) {
    sub(w, "Előzmények"); var box = el("div", {}, [el("p", { class: "muted", text: "Betöltés…" })]); w.appendChild(box);
    api("history").then(function (r) { box.textContent = ""; if (!r.ok || !r.versions.length) { box.appendChild(el("div", { class: "empty", text: "Még nem volt közzététel." })); return; }
      r.versions.forEach(function (v, i) {
        var c = el("div", { class: "card" }, [el("p", { class: "lbl", text: (i === 0 ? "Jelenlegi · " : "") + v.n + ". változat" }), el("b", { text: fmtTs(v.ts) + " · " + v.count + " módosítás" })]);
        if (v.note) c.appendChild(el("p", { class: "muted", text: v.note }));
        (v.changes || []).slice(0, 3).forEach(function (x) { c.appendChild(el("p", { class: "muted", text: "• " + x.label + ": " + x.to.slice(0, 70) })); });
        if (i > 0) c.appendChild(el("div", { class: "btns" }, [el("button", { class: "btn s", type: "button", text: "Megnézem piszkozatként", onclick: function () { api("restore", { n: v.n }).then(function (q) { if (q.ok) { S.c.draft = q.draft; S.c.rev = q.rev; go("preview", true); } else toast(q.message); }); } }), el("button", { class: "btn s", type: "button", text: "Visszaállítás és közzététel", onclick: function () { modal("Visszaállítás", [el("p", { text: "Az oldal visszaáll a(z) " + v.n + ". változatra (" + fmtTs(v.ts) + "), és azonnal élő lesz. A mostani változat megmarad az előzményekben." })], [{ text: "Visszaállítom", cls: "p", fn: function () { api("restore", { n: v.n, publish: true }).then(function (q) { if (q.ok) { load().then(function () { toast("Visszaállítva és közzétéve."); }); } else toast((q.problems || [q.message]).join(" ")); }); } }, { text: "Mégsem" }]); } })]));
        box.appendChild(c); }); });
    return w;
  }
  function viewLog(w) {
    sub(w, "Napló"); var box = el("div", { class: "list" }); w.appendChild(box);
    var N = { login: "Belépés", logout: "Kilépés", save: "Mentés", publish: "Közzététel", revert: "Visszaállítás", "restore-draft": "Korábbi változat betöltése", "login-fail": "Sikertelen belépés" };
    api("audit").then(function (r) { if (!r.ok || !r.log.length) { box.appendChild(el("div", { class: "empty", text: "Üres." })); return; }
      r.log.forEach(function (x) { box.appendChild(el("div", { class: "row" }, [el("div", { class: "t" }, [el("b", { text: N[x.action] || x.action }), el("small", { text: fmtTs(x.ts) + " · " + (x.who || "") })])])); }); });
    return w;
  }
  function viewHelp(w) {
    sub(w, "Segítség");
    [["Hogyan módosítok egy szöveget?", "Szövegek › válaszd ki a részt › koppints a szövegre › írd át › Mentés piszkozatként."],
      ["Mikor látják a vendégek?", "Csak a Közzététel gomb után. Addig minden piszkozat."],
      ["Hibáztam, mit tegyek?", "A mentés után 10 másodpercig ott a Visszavonás gomb. Közzététel után: Több › Előzmények › Visszaállítás."],
      ["Miért zárolt néhány szöveg?", "Az árak a foglalási rendszerrel együtt módosulnak, a formázott szövegek, elérhetőségek és űrlapok pedig elromolhatnak. Ezekhez kérjetek segítséget."],
      ["És az angol?", "Minden szövegnek két füle van: Magyar és English. A magyar módosítása után nézd meg az angolt is."]].forEach(function (x) { w.appendChild(el("div", { class: "card" }, [el("h2", { text: x[0] }), el("p", { text: x[1] })])); });
    return w;
  }

  // ---------- render ----------
  function render() {
    $app.textContent = "";
    if (!S.me) { $app.appendChild(viewLogin()); return; }
    if (!S.c) { $app.appendChild(el("p", { class: "boot", text: "Betöltés…" })); return; }
    var title = { home: "Aranyhegy", edit: "Szövegek", item: "Szöveg szerkesztése", preview: "Előnézet", publish: "Közzététel", more: "Több" }[S.view] || "Aranyhegy";
    var back = S.view === "item" ? function () { go("edit"); } : null;
    $app.appendChild(topBar(title, back)); var v = { home: viewHome, edit: viewEdit, item: viewItem, preview: viewPreview, publish: viewPublish, more: viewMore }[S.view]();
    $app.appendChild(v); $app.appendChild(tabs());
  }
  function load() { return api("content").then(function (c) { if (c.ok) { S.c = c; render(); } else if (c.status === 401) { S.me = null; render(); } else $app.appendChild(el("div", { class: "note bad", text: c.message })); }); }
  function boot() {
    api("me").then(function (m) {
      S.methodsInfo = { methods: m.methods, configured: m.configured };
      if (m.authed) { S.me = m; S.csrf = m.csrf; load(); } else { S.me = null; render(); }
    });
  }
  window.addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  boot();
})();
