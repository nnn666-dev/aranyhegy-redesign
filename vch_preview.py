"""Public preview assets for the voucher section: JPG/WEBP (1748 and 1200 px) + one-page sample PDF, for EN and DE.
Starts from the generated localized base, adds the 'SAMPLE' / 'MUSTER' badge at the exact place of the Hungarian 'MINTA' badge."""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.expanduser("~/aranyhegy-redesign-2027"))
R = os.path.expanduser("~/aranyhegy-redesign-2027")
F = R + "/netlify/assets/fonts/"
import vch_gen
BG = (243, 239, 230)

# measure the Hungarian MINTA badge (box, border colour) from the Hungarian preview
hu = Image.open(R + "/opus/img/voucher-1.jpg").convert("RGB"); px = hu.load()
pts = [(x, y) for y in range(1080, 1165) for x in range(1405, 1685) if max(abs(px[x, y][i] - BG[i]) for i in range(3)) > 30]
bx0, by0, bx1, by1 = min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)
# border colour = darkest-gold core pixel
core = sorted((px[x, y] for x, y in pts), key=lambda c: sum(c))[:40]
gold = tuple(sum(c[i] for c in core) // len(core) for i in range(3))
# find text bbox inside the badge (ignore the 6 px border)
inner = [(x, y) for x, y in pts if bx0 + 8 < x < bx1 - 8 and by0 + 8 < y < by1 - 8]
tx0, ty0, tx1, ty1 = min(p[0] for p in inner), min(p[1] for p in inner), max(p[0] for p in inner), max(p[1] for p in inner)
print("badge", (bx0, by0, bx1, by1), "gold", gold, "text", (tx0, ty0, tx1, ty1))
cap_h = ty1 - ty0 + 1
radius = max(6, round((by1 - by0) * 0.12))
# border thickness
th = 1
while px[bx0 + th, (by0 + by1) // 2][0] < 225: th += 1
print("border thickness ~", th, "radius", radius)

def jostf(size): return ImageFont.truetype(F + "Jost-500.ttf", size=size, layout_engine=ImageFont.Layout.BASIC)
def tracked_width(txt, f, tr): return sum(f.getlength(c) for c in txt) + tr * (len(txt) - 1)

def badge(im, word):
    d = ImageDraw.Draw(im)
    d.rectangle((bx0 - 6, by0 - 6, bx1 + 6, by1 + 6), fill=BG)           # clear the old badge (and its Hungarian word)
    # size that gives the same cap height as MINTA
    s = 20.0
    while True:
        bb = jostf(s).getbbox("H", anchor="ls")
        if bb[3] - bb[1] >= cap_h: break
        s += 0.25
    f = jostf(s); tr = s * 0.04
    w = tracked_width(word, f, tr)
    pad = (tx0 - bx0)
    x1 = bx1                                  # keep the original badge width and position
    if w + 2 * 28 > (x1 - bx0): x1 = int(bx0 + w + 2 * 28)
    d.rounded_rectangle((bx0, by0, x1, by1), radius=radius, outline=gold, width=th)
    cx = bx0 + ((x1 - bx0) - w) / 2; base = ty1      # centred in the badge
    for c in word:
        d.text((cx, base), c, font=f, fill=gold, anchor="ls"); cx += f.getlength(c) + tr
    return x1

if __name__ == "__main__":
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for lang, word in (("en", "SAMPLE"), ("de", "MUSTER")):
        for pkg in (1, 2, 3, 4):
            im = Image.open(f"{R}/netlify/assets/voucher-base-{lang}-{pkg}.jpg").convert("RGB")
            right = badge(im, word)
            im.save(f"{out}/voucher-{lang}-{pkg}.jpg", quality=92, subsampling=0)
            print(lang, pkg, "badge right edge", right)
