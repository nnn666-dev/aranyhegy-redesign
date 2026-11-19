"""Build public voucher assets for EN and DE (sample versions with SAMPLE / MUSTER badge)."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.expanduser("~/aranyhegy-redesign-2027"))
R = os.path.expanduser("~/aranyhegy-redesign-2027")
import vch_preview as vp

n = 0
for lang, word in (("en", "SAMPLE"), ("de", "MUSTER")):
    for pkg in (1, 2, 3, 4):
        im = Image.open(f"{R}/netlify/assets/voucher-base-{lang}-{pkg}.jpg").convert("RGB")
        vp.badge(im, word)
        for root in ("opus", "dist-opus"):
            d = f"{R}/{root}/img"
            os.makedirs(d + "/w900", exist_ok=True)
            im.save(f"{d}/voucher-{lang}-{pkg}.jpg", quality=92, subsampling=0)
            im.save(f"{d}/voucher-{lang}-{pkg}.webp", quality=88, method=6)
            im.resize((1200, 851), Image.LANCZOS).save(f"{d}/w900/voucher-{lang}-{pkg}.webp", quality=86, method=6)
            im.save(f"{d}/voucher-{lang}-{pkg}.pdf", "PDF", resolution=150.0, quality=92)
        n += 1
print("built", n, "variants x 2 roots")
for lang in ("en", "de"):
    for pkg in (1, 2, 3, 4):
        f = f"{R}/opus/img/voucher-{lang}-{pkg}"
        print(lang, pkg, [os.path.getsize(f + e) // 1024 for e in (".jpg", ".webp", ".pdf")], "KB jpg/webp/pdf", os.path.getsize(f"{R}/opus/img/w900/voucher-{lang}-{pkg}.webp") // 1024, "KB w900")
