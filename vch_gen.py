"""Generate localized (EN, DE) voucher base images from the Hungarian bases.
The photo stays; the Hungarian text on the cream panel is cleared and re-set in the same typefaces
(Libre Caslon Text + Jost, calibrated against the original in vch_params.json)."""
import os, json, sys
from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageChops
R = os.path.expanduser("~/aranyhegy-redesign-2027")
F = R + "/netlify/assets/fonts/"
P = json.load(open(R + "/vch_params.json"))
BG = (243, 239, 230)

FOOT1 = {"en": "Valid for 12 months. Book at aranyhegyapartmanhaz.hu · +36 70 245 8403",
         "de": "12 Monate gültig. Buchung: aranyhegyapartmanhaz.hu · +36 70 245 8403"}
FOOT2 = {"en": "Please give the voucher code when booking.",
         "de": "Bitte den Gutscheincode bei der Buchung angeben."}
BODY = {"en": ("Covered jacuzzi, Finnish and infrared sauna, panoramic terrace,", "2,400 m² garden, 30 minutes from Budapest."),
        "de": ("Überdachter Whirlpool, finnische Sauna, Infrarotsauna,", "Panoramaterrasse, 2400 m² Garten, 30 Minuten von Budapest.")}
HEAD = {"en": "Gift voucher", "de": "Geschenkgutschein"}
LABELS = {"en": ("CODE", "NAME"), "de": ("CODE", "NAME")}
CSOMAG = {"en": "PACKAGE", "de": "PAKET"}
# per package: tagline, package name, subline
PKGS = {
 "en": {1: ("One night, just the two of you.", "1 night", "for two · the recipient chooses the date"),
        2: ("Two nights, just the two of you.", "2 nights", "for two · the recipient chooses the date"),
        3: ("One night, just you two.", "Whole house", "one couple · the house is only yours, if both apartments are free"),
        4: ("Two nights, just you two.", "Whole house", "one couple · the house is only yours, if both apartments are free")},
 "de": {1: ("Eine Nacht zu zweit.", "1 Nacht", "für zwei Personen · das Datum wählen die Beschenkten"),
        2: ("Zwei Nächte zu zweit.", "2 Nächte", "für zwei Personen · das Datum wählen die Beschenkten"),
        3: ("Eine Nacht, nur ihr zwei.", "Ganzes Haus", "für ein Paar · das Haus gehört nur euch, wenn beide frei sind"),
        4: ("Zwei Nächte, nur ihr zwei.", "Ganzes Haus", "für ein Paar · das Haus gehört nur euch, wenn beide frei sind")},
}
HEADER = "ARANYHEGY APARTMANHÁZ · SZADA"   # proper name, same in all languages

def fnt(name, size): return ImageFont.truetype(F + name, size=size, layout_engine=ImageFont.Layout.BASIC)
def width(txt, f, tr): return sum(f.getlength(c) for c in txt) + tr * (len(txt) - 1)
def put(d, x, base, txt, f, col, tr):
    for c in txt:
        d.text((x, base), c, font=f, fill=col, anchor="ls"); x += f.getlength(c) + tr

def shrink(txt, name, size, maxw, tr=0.0, minsize=14):
    s = size
    while s > minsize and width(txt, fnt(name, s), tr) > maxw: s -= 0.25
    return s

def build(lang, pkg, out):
    im = Image.open(f"{R}/netlify/assets/voucher-base-{pkg}.jpg").convert("RGB")
    d = ImageDraw.Draw(im)
    # clear every text region of the panel (keeps frame, gold rule, NEVE/KÓD lines and the photo)
    for k, p in P.items():
        if k == "title": x0, y0, x1, y1 = 780, 175, 1688, 300
        else: x0, y0, x1, y1 = p["region"]
        if k in ("neve", "kod"): y1 = min(y1, 912)       # never touch the signature line at y=945
        d.rectangle((x0, y0, x1, y1), fill=BG)
    # header line stays untouched (proper noun). Draw the translated parts.
    maxw = 1640 - 810
    def draw_el(key, txt, maxw_=maxw):
        p = P[key]; col = tuple(p["color"]); tr = p["tracking"]
        s = shrink(txt, p["font"], p["size"], maxw_, tr)
        put(d, p["x"], p["base"], txt, fnt(p["font"], s), col, tr)
        return s
    tag, name, sub = PKGS[lang][pkg]
    s_title = draw_el("title", HEAD[lang], 1640 - 810)
    draw_el("tag", tag); sb = min(shrink(BODY[lang][0], P["body1"]["font"], P["body1"]["size"], maxw), shrink(BODY[lang][1], P["body2"]["font"], P["body2"]["size"], maxw))
    for key, txt in (("body1", BODY[lang][0]), ("body2", BODY[lang][1])):
        q = P[key]; put(d, q["x"], q["base"], txt, fnt(q["font"], sb), tuple(q["color"]), 0.0)
    draw_el("csomag", CSOMAG[lang]); draw_el("pkg", name); draw_el("sub", sub)
    draw_el("foot1", FOOT1[lang]); draw_el("foot2", FOOT2[lang])
    draw_el("neve", LABELS[lang][1]); draw_el("kod", LABELS[lang][0])
    im.save(out, quality=94, subsampling=0)
    return s_title

if __name__ == "__main__":
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for lang in ("en", "de"):
        for pkg in (1, 2, 3, 4):
            s = build(lang, pkg, f"{outdir}/voucher-base-{lang}-{pkg}.jpg")
            print(lang, pkg, "title size", round(s, 1))
