"""Build the CMS template: dist-opus/index.html + dist-opus/en/index.html -> netlify/cms/template.json
Editable spans (plain text segments, image alts, meta content, <title>) are replaced with markers.
Rendering the template with default content MUST be byte-identical to the dist files (verified here)."""
import os, re, sys, json, html, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "i18n"))
import lib
R = lib.ROOT
M0, M1 = "\u0001", "\u0002"

SECTIONS = [("hdr", "Fejléc és menü"), ("main", "Oldal"), ("top", "Nyitóoldal"), ("apartmanok", "Apartmanok"), ("foglalas", "Foglalás"),
            ("velemenyek", "Vélemények"), ("arak", "Árak"), ("wellness", "Wellness"), ("kert", "Kert"), ("latnivalok", "Látnivalók"),
            ("gyik", "Gyakori kérdések"), ("ajandek", "Ajándékutalvány"), ("helyszin", "Helyszín"), ("footer", "Lábléc")]
TAGLBL = {"h1": "Főcím", "h2": "Szakasz címe", "h3": "Alcím", "h4": "Alcím", "p": "Bekezdés", "li": "Lista elem", "summary": "GYIK kérdés",
          "dd": "Válasz / érték", "dt": "Cím", "figcaption": "Képfelirat", "button": "Gomb", "a": "Link", "span": "Szöveg", "b": "Kiemelés",
          "title": "Oldal címe (Google)", "label": "Mező felirata", "strong": "Kiemelés", "small": "Kisbetűs szöveg", "div": "Szöveg"}
PRICE = re.compile(r"\d[\d.\s]*\s?(Ft|HUF)\b|\bFt\b|\bHUF\b")
CONTACT = re.compile(r"\+36|@|NTAK|MA2\d|Aranyhegy u\.|\b2111\b")


def spans(src):
    root, segs = lib.segments(src)
    attrs = lib.attr_targets(src, root)
    out = []
    for s in segs: out.append({"a": s["a"], "b": s["b"], "kind": s["kind"], "tag": s["tag"], "key": s["key"], "phs": s["phs"], "attr": None})
    for vs, ve, val in attrs:
        m = re.search(r"([a-zA-Z-]+)\s*=\s*\"$", src[max(0, vs - 40):vs]); name = m.group(1) if m else "?"
        out.append({"a": vs, "b": ve, "kind": "attr", "tag": name, "key": val, "phs": [], "attr": name})
    out.sort(key=lambda x: (x["a"], x["b"]))
    return out


def sect(pos, ids):
    cur = "main"
    for p, i in ids:
        if p <= pos: cur = i
    return cur


def main():
    hu_src = open(R + "/dist-opus/index.html", encoding="utf-8").read()
    en_src = open(R + "/dist-opus/en/index.html", encoding="utf-8").read()
    de_src = open(R + "/dist-opus/de/index.html", encoding="utf-8").read()
    assert M0 not in hu_src and M1 not in hu_src and M0 not in en_src and M0 not in de_src
    H, E, D = spans(hu_src), spans(en_src), spans(de_src)
    assert len(H) == len(E) == len(D), (len(H), len(E), len(D))
    ids = [(m.start(), m.group(1)) for m in re.finditer(r'<(?:section|header|footer|main)[^>]*\bid="([^"]+)"', hu_src)]
    items = []; hu_cuts = []; en_cuts = []; de_cuts = []
    for n, (h, e, g) in enumerate(zip(H, E, D)):
        ok = h["kind"] == e["kind"] == g["kind"] and h["tag"] == e["tag"] == g["tag"]
        assert ok, ("pair mismatch", n, h["tag"], e["tag"], h["key"][:40], e["key"][:40])
        lock = None
        if h["key"] in ("HU", "EN", "DE"): lock = "Technikai szöveg"
        elif h["attr"] and h["attr"] not in ("alt", "content"): lock = "Technikai szöveg"
        elif "<" in h["key"] or "<" in e["key"] or "<" in g["key"] or h["phs"] or e["phs"] or g["phs"]: lock = "Formázott szöveg (félkövér, ikon vagy sortörés van benne)"
        elif h["tag"] in ("option",): lock = "Űrlap-választó (a foglalás működése függ tőle)"
        elif PRICE.search(h["key"]) or PRICE.search(e["key"]) or PRICE.search(g["key"]): lock = "Ár: a foglalási rendszer árával együtt módosítandó, kérjetek segítséget"
        elif CONTACT.search(h["key"]): lock = "Elérhetőség / hivatalos adat"
        # raw spans
        hr, er, gr = hu_src[h["a"]:h["b"]], en_src[e["a"]:e["b"]], de_src[g["a"]:g["b"]]
        def split(raw):
            lead = raw[:len(raw) - len(raw.lstrip())]; trail = raw[len(raw.rstrip()):]
            return lead, raw.strip(), trail
        hl, hc, ht = split(hr); el, ec, et = split(er); gl, gc, gt = split(gr)
        if not lock and re.search(r"&(?!amp;|nbsp;|quot;)[#\w]+;", hc + ec + gc): lock = "Különleges karakter"
        if not lock and (M0 in hc or M1 in hc or "\n" in hc.strip() and False): lock = "Technikai"
        if not hc or not ec or not gc: lock = lock or "Üres"
        if not lock and (M0 in hc or "&" in hc and False): lock = "Technikai"
        sec = sect(h["a"], ids)
        if h["tag"] == "title": sec = "seo"
        if h["attr"] == "content": sec = "seo"
        it = {"id": "s%03d" % n, "section": sec, "kind": h["kind"], "tag": h["tag"], "label": TAGLBL.get(h["tag"], "Szöveg"),
              "hu": hc, "en": ec, "de": gc, "lock": lock}
        if h["attr"] == "alt": it["label"] = "Kép leírása (alt)"
        if h["attr"] == "content": it["label"] = "Google / megosztási leírás"
        it["h"] = hashlib.sha1((hc + "\x00" + ec + "\x00" + gc).encode()).hexdigest()[:8]
        items.append(it)
        if lock is None:
            hu_cuts.append((h["a"] + len(hl), h["a"] + len(hl) + len(hc), it["id"]))
            en_cuts.append((e["a"] + len(el), e["a"] + len(el) + len(ec), it["id"]))
            de_cuts.append((g["a"] + len(gl), g["a"] + len(gl) + len(gc), it["id"]))
    def cut(src, cuts):
        cuts.sort()
        for (a1, b1, _), (a2, b2, _) in zip(cuts, cuts[1:]): assert b1 <= a2, ("overlap", a1, b1, a2, b2)
        out, pos = [], 0
        for a, b, i in cuts: out.append(src[pos:a]); out.append(M0 + i + M1); pos = b
        out.append(src[pos:]); return "".join(out)
    tpl = {"hu": cut(hu_src, hu_cuts), "en": cut(en_src, en_cuts), "de": cut(de_src, de_cuts)}
    # editable items only keep text in items; locked keep text for display
    sec_names = dict(SECTIONS); sec_names["seo"] = "Google és megosztás (SEO)"
    order = ["seo"] + [s for s, _ in SECTIONS]
    data = {"built": "now", "sections": [{"id": s, "name": sec_names[s]} for s in order if any(i["section"] == s for i in items)], "items": items, "tpl": tpl}
    # prove zero diff
    def render(lang):
        t = tpl[lang]; m = {i["id"]: i[lang] for i in items}
        return re.sub(M0 + r"(s\d+)" + M1, lambda x: m[x.group(1)], t)
    assert render("hu") == hu_src, "HU render differs"
    assert render("en") == en_src, "EN render differs"
    assert render("de") == de_src, "DE render differs"
    os.makedirs(R + "/netlify/cms", exist_ok=True)
    json.dump(data, open(R + "/netlify/cms/template.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    ed = [i for i in items if not i["lock"]]
    print("items", len(items), "editable", len(ed), "locked", len(items) - len(ed))
    import collections
    print("locked reasons", collections.Counter(i["lock"] for i in items if i["lock"]))
    print("per section", collections.Counter(i["section"] for i in ed))
    print("ZERO-DIFF HU+EN+DE OK; template bytes", os.path.getsize(R + "/netlify/cms/template.json"))


main()
