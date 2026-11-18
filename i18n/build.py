"""Build the English page: dist-opus/en/index.html from opus/index.html + i18n/en_*.txt"""
import os, re, sys, json, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

ROOT = lib.ROOT
SITE = "https://aranyhegyapartmanhaz.hu"
TAG = re.compile(r"<(?!/)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>")


def load_en():
    rows = json.load(open(ROOT + "/i18n/segments.json", encoding="utf-8"))
    en = {}
    for fn in sorted(os.listdir(ROOT + "/i18n")):
        if re.fullmatch(r"en_[a-z]\.txt", fn):
            for line in open(ROOT + "/i18n/" + fn, encoding="utf-8").read().split("\n"):
                if " ::: " in line:
                    i, t = line.split(" ::: ", 1); en[i.strip()] = t.rstrip("\n")
    return rows, en


def fix_tags(hu, e):
    """copy exact opening tags (attributes) from the Hungarian key into the translation, in order"""
    ht = [m for m in TAG.finditer(hu)]; et = [m for m in TAG.finditer(e)]
    if len(ht) != len(et) or any(a.group(1) != b.group(1) for a, b in zip(ht, et)): return None
    out, pos = [], 0
    for a, b in zip(ht, et):
        out.append(e[pos:b.start()]); out.append(a.group(0)); pos = b.end()
    out.append(e[pos:]); return "".join(out)


def mapping():  # FROZEN-MAP: translations keyed by the Hungarian text, not by position
    mp = {}; problems = []
    base = json.load(open(ROOT + "/i18n/en_map.json", encoding="utf-8"))
    extra = ROOT + "/i18n/en_new.json"
    if os.path.exists(extra): base.update(json.load(open(extra, encoding="utf-8")))
    for hu, e in base.items():
        t2 = fix_tags(hu, e)
        if t2 is None: problems.append(("TAGS", hu[:60], e[:60])); continue
        for ph in re.findall("\u27e6\\d+\u27e7", hu):
            if ph not in t2: problems.append(("PLACEHOLDER", hu[:40], ph))
        mp[hu] = t2
    return mp, problems


def plain(x):
    x = html.unescape(re.sub(r"<[^>]+>", "", x)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", x).strip()


LD = {
 "Két apartman pároknak Szadán, Budapesttől kb. 30 percre: fedett jakuzzi, finn- és infraszauna, 2400 m²-es kert. Már egy éjszakára is foglalható.":
 "Two apartments for couples in Szada, about 30 minutes from Budapest: covered jacuzzi, Finnish and infrared sauna, a 2,400 m² garden. Bookable even for one night.",
 "Smaragd (emelet)": "Smaragd (upper floor)", "Zafír (földszint)": "Zafír (ground floor)",
 "Fedett kültéri jakuzzi (közös)": "Covered outdoor jacuzzi (shared)", "Finn szauna": "Finnish sauna", "Infraszauna": "Infrared sauna",
 "Klíma (fűtés és hűtés)": "Air conditioning (heating and cooling)", "Padlófűtés": "Underfloor heating", "Konyha": "Kitchen",
 "2400 m² kert grillezővel": "2,400 m² garden with a grill", "Ingyenes elektromos roller": "Free electric scooters",
 "NTAK regisztrációs szám": "NTAK registration number",
 "Látnivalók és programok Szada környékén": "Sights and activities around Szada",
 "Vácrátóti Arborétum": "Vácrátót Arboretum", "Gödöllői Királyi Kastély": "Gödöllő Royal Palace",
 "Gödöllői Arborétum (Arbo-Park)": "Gödöllő Arboretum (Arbo-Park)", "Medveotthon": "Medveotthon Bear Sanctuary",
 "Lázár Lovaspark": "Lázár Equestrian Park", "Máriabesnyői Nagyboldogasszony-bazilika": "Máriabesnyő Basilica of the Assumption",
 "MTK": "MTK", "Aranyhegy u. 110.": "Aranyhegy u. 110.", "60000-90000 HUF": "60000-90000 HUF",
 "Vácrátót": "Vácrátót", "Gödöllő": "Gödöllő", "Veresegyház": "Veresegyház", "Domonyvölgy": "Domonyvölgy", "Máriabesnyő": "Máriabesnyő",  # LD-PLACE
}


def tr_ld(node, plain_map, miss, ld=None, prefix="/en/"):
    ld = LD if ld is None else ld
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k == "url" and v == SITE + "/": out[k] = SITE + prefix
            else: out[k] = tr_ld(v, plain_map, miss, ld, prefix)
        return out
    if isinstance(node, list): return [tr_ld(x, plain_map, miss, ld, prefix) for x in node]
    if isinstance(node, str):
        if node in ld: return ld[node]
        if not re.search(r"[A-Za-z\u00C0-\u024F]{3}", node) or node.startswith(("http", "+", "hello@", "MA2")) or re.fullmatch(r"[A-Za-z0-9 \-.,:/@+()]+", node) and not re.search(r"[áéíóöőúüű]", node) and node in ("LodgingBusiness", "Question", "Answer", "FAQPage", "ListItem", "ItemList", "TouristAttraction", "PostalAddress", "Accommodation", "QuantitativeValue", "LocationFeatureSpecification", "PropertyValue", "Szada", "HU", "HUF", "Wi-Fi", "Aranyhegy Apartmanház"): return node
        if node in plain_map: return plain_map[node]
        # multi-paragraph answers: greedy longest-prefix over known plain keys
        pos, parts = 0, []
        keys = sorted(plain_map, key=len, reverse=True)
        while pos < len(node):
            hit = next((k for k in keys if k and node.startswith(k, pos)), None)
            if not hit: parts = None; break
            parts.append(plain_map[hit]); pos += len(hit)
            while pos < len(node) and node[pos] == " ": pos += 1
        if parts: return " ".join(parts)
        miss.append(node[:80]); return node
    return node


JS = [  # (old, new, expected count) applied AFTER segment translation
 ("Az Aranyhegy ajándékutalvány nyomtatható mintája, ", "Printable sample of the Aranyhegy gift voucher, ", 1),
 ('n.toLocaleString("hu-HU").replace(/\\s/g, ".") + " Ft"', 'n.toLocaleString("en-US") + " HUF"', 2),
 ('mbook.textContent = "Egész ház foglalása"', 'mbook.textContent = "Book whole house"', 1),
 ('mbook.textContent = "Foglalás"', 'mbook.textContent = "Book now"', 1),
 ('open ? "Menü bezárása" : "Menü"', 'open ? "Close menu" : "Menu"', 1),
 ('"Foglalás indítása"', '"Start booking"', 1),
 ("<strong>Két pár, 4 vendég: 2 × 60.000 = 120.000 Ft / éj</strong>", "<strong>Two couples, 4 guests: 2 × 60,000 = 120,000 HUF / night</strong>", 1),
 ("' éj: <strong>'", "(n > 1 ? ' nights: <strong>' : ' night: <strong>')", 3),
 ("<span>Mindkét apartmant foglaljátok. Idegenforgalmi adó: 0 Ft</span>", "<span>Book both apartments. Tourist tax: 0 HUF</span>", 1),
 ("<strong>Teljesen privát foglalás 2 fő részére: 90.000 Ft / éj</strong>", "<strong>Fully private booking for 2 guests: 90,000 HUF / night</strong>", 1),
 ("Az ajánlat a két apartman egyidejű szabad kapacitásának függvényében vehető igénybe, és kizárólag telefonos elérhetőségünkön tudjátok lefoglalni: ", "The offer depends on both apartments being free at the same time, and can only be booked by phone: ", 1),
 ("<strong>60.000 Ft / éj</strong> apartmanonként</span>", "<strong>60,000 HUF / night</strong> per apartment</span>", 1),
 ("</strong>, idegenforgalmi adó 0 Ft</span>", "</strong>, tourist tax 0 HUF</span>", 1),
 ("<strong>Már 1 éjszakára is foglalható!</strong></span><span>Idegenforgalmi adó: 0 Ft</span>", "<strong>Bookable even for just 1 night!</strong></span><span>Tourist tax: 0 HUF</span>", 1),
 ('new Intl.DateTimeFormat("hu-HU"', 'new Intl.DateTimeFormat("en-GB"', 1),
 ('"Válasszatok napot"', '"Choose a date"', 1),
 ('showErr("Válasszátok ki az érkezés napját.", fin)', 'showErr("Please choose your arrival date.", fin)', 1),  # STAGE181-JS
 ('"Válasszátok ki a távozás napját (legalább 1 éjszaka)."', '"Please choose your departure date (at least 1 night)."', 1),
 ('"Két pár, mindkét apartman: "', '"Two couples, both apartments: "', 1),
 ('"Teljesen privát foglalás 2 fő részére: "', '"Fully private booking for 2 guests: "', 1),
 ("kizárólag telefonos elérhetőségünkön tudjátok lefoglalni. ", "can only be booked by phone. ", 1),
 (">Hívás: +36 70 245 8403</a>", ">Call: +36 70 245 8403</a>", 1),
 ('<a class="btn btn-gold" href="https://aranyhegyapartmanhaz.hu/#book">Online foglalás</a>', '<a class="btn btn-gold" href="https://aranyhegyapartmanhaz.hu/en/#book">Book online</a>', 1),
]


def build(write=True):
    src = open(ROOT + "/opus/index.html", encoding="utf-8").read()
    mp, problems = mapping()
    out, miss, n = lib.apply_translation(src, mp)
    notes = {"splices": n, "untranslated": miss, "problems": problems, "js_fail": []}
    for old, new, cnt in JS:
        c = out.count(old)
        if c != cnt: notes["js_fail"].append((old[:60], c, cnt)); continue
        out = out.replace(old, new)
    # document language + URLs
    reps = [('<html lang="hu">', '<html lang="en">'),
            ('<link rel="canonical" href="https://aranyhegyapartmanhaz.hu/">', '<link rel="canonical" href="%s/en/">' % SITE),
            ('<meta property="og:url" content="https://aranyhegyapartmanhaz.hu/">', '<meta property="og:url" content="%s/en/">' % SITE),
            ('<meta property="og:locale" content="hu_HU">', '<meta property="og:locale" content="en_US">'),
            ('<a href="/" lang="hu" hreflang="hu" aria-current="true" data-lang="hu">', '<a href="/" lang="hu" hreflang="hu" data-lang="hu">'),
            ('<a href="/en/" lang="en" hreflang="en" data-lang="en">', '<a href="/en/" lang="en" hreflang="en" aria-current="true" data-lang="en">'),
            ('aria-label="Nyelv"', 'aria-label="Language"')]
    for o, nw in reps:
        c = out.count(o)
        if c < 1: notes["js_fail"].append(("DOC:" + o[:50], c, 1)); continue
        out = out.replace(o, nw)
    # booking / legal links to the owner's English pages
    out = out.replace("https://aranyhegyapartmanhaz.hu/#book", SITE + "/en/#book")
    out = out.replace(SITE + "/aranyhegy-apartmanhaz/terms", SITE + "/en/aranyhegy-apartmanhaz/terms")
    out = out.replace(SITE + "/aranyhegy-apartmanhaz/tos", SITE + "/en/aranyhegy-apartmanhaz/tos")
    # root-absolute asset paths (page now lives in /en/)
    out = re.sub(r"(?<=[\s,\"'(=])(img/|fonts/|vid/)", r"/\1", out)
    out = re.sub(r'(href|src)="(favicon[^"]*|apple-touch-icon[^"]*|site\.webmanifest)"', r'\1="/\2"', out)
    # DECIMAL-FIX: Hungarian decimal comma -> point in visible text nodes (outside script/style)
    def _dec(chunk):
        return re.sub(r"(>[^<>]*?)(\b\d),(\d\b)", lambda m: m.group(1) + m.group(2) + "." + m.group(3), chunk)
    parts = re.split(r"(<script.*?</script>|<style.*?</style>)", out, flags=re.S)
    parts = [x if x.startswith(("<script", "<style")) else _dec(_dec(x)) for x in parts]
    out = "".join(parts)
    # JSON-LD
    plain_map = {}
    for hu, e in mp.items():
        if "\u27e6" in hu: continue
        plain_map[plain(hu)] = plain(e)
    miss_ld = []
    def sub_ld(m):
        d = json.loads(m.group(1)); d2 = tr_ld(d, plain_map, miss_ld)
        return '<script type="application/ld+json">' + json.dumps(d2, ensure_ascii=False) + "</script>"
    out = re.sub(r'<script type="application/ld\+json">(.*?)</script>', sub_ld, out, flags=re.S)
    notes["ld_untranslated"] = miss_ld
    meta = '<meta name="robots" content="noindex,nofollow">\n'
    if meta not in out: out = out.replace("<title>", meta + "<title>", 1)
    if write:
        os.makedirs(ROOT + "/dist-opus/en", exist_ok=True)
        open(ROOT + "/dist-opus/en/index.html", "w", encoding="utf-8").write(out)
    return out, notes


if __name__ == "__main__":
    out, notes = build()
    print("built", len(out), "bytes | splices", notes["splices"])
    for k in ("problems", "untranslated", "js_fail", "ld_untranslated"):
        print(k.upper(), len(notes[k]))
        for x in notes[k][:25]: print("   ", x)
