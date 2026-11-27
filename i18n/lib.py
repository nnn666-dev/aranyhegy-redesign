"""i18n core: offset-aware HTML tokenizer + translatable-segment extraction + splice builder.
Source of truth = opus/index.html (Hungarian). Translations live in i18n/<lang>.json keyed by the HU text itself,
so a changed HU string is reported as untranslated instead of silently drifting."""
import os, re, json
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root, wherever the repo is cloned
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
INLINE = {"a", "b", "strong", "em", "i", "span", "small", "u", "sup", "sub", "br", "wbr", "abbr", "mark", "time", "s", "tspan"}
OPAQUE = {"svg", "img", "input", "picture", "video", "canvas", "iframe", "select"}
ATTRS = ("alt", "aria-label", "title", "placeholder", "data-alt", "data-d")
META_OK = {("name", "description"), ("property", "og:title"), ("property", "og:description"), ("property", "og:image:alt")}


class Tok(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.ls = [0] + [m.end() for m in re.finditer("\n", src)]
        self.toks = []

    def off(self):
        ln, col = self.getpos()
        return self.ls[ln - 1] + col

    def handle_starttag(self, tag, attrs):
        st = self.off(); raw = self.get_starttag_text(); self.toks.append(("start", st, st + len(raw), tag, attrs))

    def handle_startendtag(self, tag, attrs):
        st = self.off(); raw = self.get_starttag_text(); self.toks.append(("self", st, st + len(raw), tag, attrs))

    def handle_endtag(self, tag):
        st = self.off(); self.toks.append(("end", st, self.src.index(">", st) + 1, tag, None))

    def handle_comment(self, d):
        st = self.off(); self.toks.append(("comment", st, self.src.index("-->", st) + 3, None, None))

    def handle_decl(self, d):
        st = self.off(); self.toks.append(("decl", st, self.src.index(">", st) + 1, None, None))


class El:
    def __init__(self, name, attrs, s0, s1):
        self.name, self.attrs, self.s0, self.s1 = name, dict(attrs or []), s0, s1
        self.e0 = self.e1 = s1; self.kids = []


class Tx:
    def __init__(self, a, b): self.a, self.b = a, b


def parse(src):
    t = Tok(src); t.feed(src); t.close()
    root = El("#root", [], 0, 0); stack = [root]; pos = 0
    def add_text(a, b):
        if b > a: stack[-1].kids.append(Tx(a, b))
    for kind, st, en, name, attrs in t.toks:
        add_text(pos, st); pos = en
        if kind == "start":
            el = El(name, attrs, st, en); stack[-1].kids.append(el)
            if name not in VOID: stack.append(el)
        elif kind == "self":
            el = El(name, attrs, st, en); stack[-1].kids.append(el)
        elif kind == "end":
            for i in range(len(stack) - 1, 0, -1):
                if stack[i].name == name:
                    for e in stack[i + 1:]: e.e0 = e.e1 = st
                    stack[i].e0, stack[i].e1 = st, en; del stack[i:]; break
    add_text(pos, len(src))
    return root


CMT = re.compile(r"<!--.*?-->", re.S)
LETTERS = re.compile(r"[A-Za-z\u00C0-\u024F]{2}")
def norm(s): return re.sub(r"\s+", " ", CMT.sub("", s)).strip()


def inline_ok(el):
    for k in el.kids:
        if isinstance(k, El):
            if k.name in OPAQUE: continue
            if k.name not in INLINE or not inline_ok(k): return False
    return True


def walk(src, el, out):
    if el.name in ("script", "style", "noscript"): return
    if el.name == "head":
        for k in el.kids:
            if isinstance(k, El) and k.name == "title": out.append(("blk", k))
        return
    direct = [k for k in el.kids if isinstance(k, Tx) and LETTERS.search(CMT.sub("", src[k.a:k.b]))]
    if direct:
        if inline_ok(el): out.append(("blk", el)); return
        for k in direct: out.append(("txt", k))
    for k in el.kids:
        if isinstance(k, El): walk(src, k, out)


def opaque_spans(el, acc):
    for k in el.kids:
        if isinstance(k, El):
            if k.name in OPAQUE: acc.append((k.s0, k.e1 if k.e1 > k.s1 else k.s1))
            else: opaque_spans(k, acc)
    return acc


def seg_info(src, kind, node):
    """-> (key, a, b, placeholders) where src[a:b] is the replaceable span"""
    if kind == "txt":
        raw = src[node.a:node.b]; return norm(raw), node.a, node.b, []
    a, b = node.s1, node.e0
    spans = sorted(opaque_spans(node, []))
    pieces, phs, cur = [], [], a
    for (x, y) in spans:
        pieces.append(src[cur:x]); phs.append(src[x:y]); pieces.append("\u27e6%d\u27e7" % (len(phs) - 1)); cur = y
    pieces.append(src[cur:b])
    return norm("".join(pieces)), a, b, phs


def segments(src):
    root = parse(src); out = []; walk(src, root, out)
    segs = []
    for kind, node in out:
        key, a, b, phs = seg_info(src, kind, node)
        if key and LETTERS.search(re.sub(r"<[^>]+>", " ", key)): segs.append({"key": key, "a": a, "b": b, "phs": phs, "kind": kind, "tag": getattr(node, "name", "#text")})
    return root, segs


ATTR_RE = re.compile(r"""(\s)(alt|aria-label|title|placeholder|data-alt|data-d|content)\s*=\s*"([^"]*)\"""")


def attr_targets(src, root):
    """list of (value_start, value_end, value) for translatable attribute values"""
    res = []
    def rec(el):
        for k in el.kids:
            if isinstance(k, El):
                raw = src[k.s0:k.s1]
                for m in ATTR_RE.finditer(raw):
                    name, val = m.group(2), m.group(3)
                    if name == "content":
                        if k.name != "meta": continue
                        a = k.attrs
                        if not any(a.get(x) == y for x, y in META_OK): continue
                    if not LETTERS.search(val) or val.startswith(("http", "#", "tel:", "mailto:", "img/", "vid/")) or re.fullmatch(r"[#0-9a-fA-F;:\s.,-]+", val): continue
                    vs = k.s0 + m.start(3); res.append((vs, vs + len(val), val))
                rec(k)
    rec(root); return res


def untranslated(segs, attrs, en):
    miss = []
    for s in segs:
        if s["key"] not in en: miss.append(s["key"])
    for _, _, v in attrs:
        if v not in en: miss.append(v)
    return list(dict.fromkeys(miss))


def apply_translation(src, en):
    root, segs = segments(src); attrs = attr_targets(src, root)
    splices = []
    for s in segs:
        t = en.get(s["key"])
        if t is None or t == s["key"]: continue
        for i, p in enumerate(s["phs"]): t = t.replace("\u27e6%d\u27e7" % i, p)
        if s["kind"] == "txt":
            old = src[s["a"]:s["b"]]; lead = old[:len(old) - len(old.lstrip())]; trail = old[len(old.rstrip()):]; t = lead + t + trail
        splices.append((s["a"], s["b"], t))
    for a, b, v in attrs:
        t = en.get(v)
        if t is not None and t != v: splices.append((a, b, t))
    splices.sort(key=lambda x: x[0])
    for (a1, b1, _), (a2, b2, _) in zip(splices, splices[1:]): assert b1 <= a2, ("overlap", a1, b1, a2, b2)
    out = src
    for a, b, t in reversed(splices): out = out[:a] + t + out[b:]
    return out, untranslated(segs, attrs, en), len(splices)
