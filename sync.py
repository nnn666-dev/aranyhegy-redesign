import os
root = os.path.dirname(os.path.abspath(__file__)) + "/"
s = open(root + "opus/index.html", encoding="utf-8").read()
meta = '<meta name="robots" content="noindex,nofollow">\n'
if meta not in s:
    s = s.replace("<title>", meta + "<title>", 1)
os.makedirs(root + "dist-opus", exist_ok=True)
open(root + "dist-opus/index.html", "w", encoding="utf-8").write(s)
print("synced", len(s))
