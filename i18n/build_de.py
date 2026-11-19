"""Build the German page: dist-opus/de/index.html from opus/index.html + i18n/de_map.json (keyed by the Hungarian text)."""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from build import fix_tags, plain, tr_ld, SITE

ROOT = lib.ROOT

LD = {
 "Két apartman pároknak Szadán, Budapesttől kb. 30 percre: fedett jakuzzi, finn- és infraszauna, 2400 m²-es kert. Már egy éjszakára is foglalható.":
 "Zwei Apartments für Paare in Szada, etwa 30 Minuten von Budapest: überdachter Whirlpool, finnische Sauna und Infrarotsauna, 2400 m² Garten. Schon ab einer Nacht buchbar.",
 "Smaragd (emelet)": "Smaragd (Obergeschoss)", "Zafír (földszint)": "Zafír (Erdgeschoss)",
 "Fedett kültéri jakuzzi (közös)": "Überdachter Außen-Whirlpool (gemeinsam)", "Finn szauna": "Finnische Sauna", "Infraszauna": "Infrarotsauna",
 "Klíma (fűtés és hűtés)": "Klimaanlage (Heizen und Kühlen)", "Padlófűtés": "Fußbodenheizung", "Konyha": "Küche",
 "2400 m² kert grillezővel": "2400 m² Garten mit Grill", "Ingyenes elektromos roller": "Kostenlose E-Roller",
 "NTAK regisztrációs szám": "NTAK-Registrierungsnummer",
 "Látnivalók és programok Szada környékén": "Sehenswürdigkeiten und Ausflugsziele rund um Szada",
 "Vácrátóti Arborétum": "Arboretum Vácrátót", "Gödöllői Királyi Kastély": "Königliches Schloss Gödöllő",
 "Gödöllői Arborétum (Arbo-Park)": "Arboretum Gödöllő (Arbo-Park)", "Medveotthon": "Medveotthon",
 "Lázár Lovaspark": "Lázár Lovaspark", "Máriabesnyői Nagyboldogasszony-bazilika": "Basilika Mariä Himmelfahrt in Máriabesnyő",
 "MTK": "MTK", "Aranyhegy u. 110.": "Aranyhegy u. 110.", "60000-90000 HUF": "60000-90000 HUF",
 "Vácrátót": "Vácrátót", "Gödöllő": "Gödöllő", "Veresegyház": "Veresegyház", "Domonyvölgy": "Domonyvölgy", "Máriabesnyő": "Máriabesnyő",
}

JS = [
 ('href="img/voucher-1.pdf"', 'href="img/voucher-de-1.pdf"', 2),
 ('src="img/w900/voucher-1.webp"', 'src="img/w900/voucher-de-1.webp"', 1),
 ("img.src='img/w900/voucher-'+k+'.webp'", "img.src='img/w900/voucher-de-'+k+'.webp'", 1),
 ("lnk.href=pdf.href='img/voucher-'+k+'.pdf'", "lnk.href=pdf.href='img/voucher-de-'+k+'.pdf'", 1),
 ("Az Aranyhegy ajándékutalvány nyomtatható mintája, ", "Druckbares Muster des Aranyhegy-Geschenkgutscheins, ", 1),
 ('n.toLocaleString("hu-HU").replace(/\\s/g, ".") + " Ft"', 'n.toLocaleString("de-DE") + " Ft"', 2),
 ('mbook.textContent = "Egész ház foglalása"', 'mbook.textContent = "Ganzes Haus buchen"', 1),
 ('mbook.textContent = "Foglalás"', 'mbook.textContent = "Buchen"', 1),
 ('open ? "Menü bezárása" : "Menü"', 'open ? "Menü schließen" : "Menü"', 1),
 ('"Foglalás indítása"', '"Buchung starten"', 1),
 ("<strong>Két pár, 4 vendég: 2 × 60.000 = 120.000 Ft / éj</strong>", "<strong>Zwei Paare, 4 Gäste: 2 × 60.000 = 120.000 Ft / Nacht</strong>", 1),
 ("' éj: <strong>'", "(n > 1 ? ' Nächte: <strong>' : ' Nacht: <strong>')", 3),
 ("<span>Mindkét apartmant foglaljátok. Idegenforgalmi adó: 0 Ft</span>", "<span>Ihr bucht beide Apartments. Kurtaxe: 0 Ft</span>", 1),
 ("<strong>Teljesen privát foglalás 2 fő részére: 90.000 Ft / éj</strong>", "<strong>Komplett privat für 2 Gäste: 90.000 Ft / Nacht</strong>", 1),
 ("Az ajánlat a két apartman egyidejű szabad kapacitásának függvényében vehető igénybe, és kizárólag telefonos elérhetőségünkön tudjátok lefoglalni: ", "Das Angebot gilt nur, wenn beide Apartments gleichzeitig frei sind, und ist ausschließlich telefonisch buchbar: ", 1),
 ("<strong>60.000 Ft / éj</strong> apartmanonként</span>", "<strong>60.000 Ft / Nacht</strong> pro Apartment</span>", 1),
 ("</strong>, idegenforgalmi adó 0 Ft</span>", "</strong>, Kurtaxe 0 Ft</span>", 1),
 ("<strong>Már 1 éjszakára is foglalható!</strong></span><span>Idegenforgalmi adó: 0 Ft</span>", "<strong>Schon ab 1 Nacht buchbar!</strong></span><span>Kurtaxe: 0 Ft</span>", 1),
 ('new Intl.DateTimeFormat("hu-HU"', 'new Intl.DateTimeFormat("de-DE"', 1),
 ('"Válasszatok napot"', '"Datum wählen"', 1),
 ('showErr("Válasszátok ki az érkezés napját.", fin)', 'showErr("Bitte wählt den Anreisetag.", fin)', 1),
 ('"Válasszátok ki a távozás napját (legalább 1 éjszaka)."', '"Bitte wählt den Abreisetag (mindestens 1 Nacht)."', 1),
 ('"Két pár, mindkét apartman: "', '"Zwei Paare, beide Apartments: "', 1),
 ('"Teljesen privát foglalás 2 fő részére: "', '"Komplett privat für 2 Gäste: "', 1),
 ("kizárólag telefonos elérhetőségünkön tudjátok lefoglalni. ", "ist ausschließlich telefonisch buchbar. ", 1),
 (">Hívás: +36 70 245 8403</a>", ">Anrufen: +36 70 245 8403</a>", 1),
 ('<a class="btn btn-gold" href="https://aranyhegyapartmanhaz.hu/#book">Online foglalás</a>', '<a class="btn btn-gold" href="https://aranyhegyapartmanhaz.hu/de/#book">Online buchen</a>', 1),
 # language state of the booking / voucher scripts
 ('L = d.documentElement.lang === "en" ? "en" : "hu";', 'L = "de";', 1),
 ('var ROOT = L === "en" ? "/en/" : "/";', 'var ROOT = "/de/";', 1),
 ('new Intl.DateTimeFormat(L === "en" ? "en-GB" : "hu-HU"', 'new Intl.DateTimeFormat("de-DE"', 1),
]

T_DE = '''    de: { title: "Buchung", checking: "Freie Termine werden geprüft…", none: "Für diesen Zeitraum ist leider kein Apartment frei.", noneHelp: "Versucht es mit anderen Terminen oder ruft uns an: +36 70 245 8403.",
      apt: "Apartment", dates: "Zeitraum", guests: "Gäste", nights: "Nächte", persons: "Pers.", total: "Zu zahlen", any: "Beliebiges freies Apartment", free: "Frei: ",
      name: "Name", email: "E-Mail", phone: "Telefonnummer", note: "Anmerkung (optional)", terms1: "Ich akzeptiere die ", terms2: "AGB", terms3: " und die ", terms4: "Datenschutzerklärung", terms5: ".",
      hold: "Wir halten die gewählten Tage 30 Minuten lang für euch frei, bis ihr bezahlt habt. Zahlung: online, 100 % im Voraus.", pay: "Weiter zur Zahlung", back: "Abbrechen", close: "Schließen",
      e_name: "Bitte gebt den Namen an.", e_email: "Bitte gebt eine gültige E-Mail-Adresse an.", e_phone: "Bitte gebt eine Telefonnummer an.", e_terms: "Zum Fortfahren müssen die AGB und die Datenschutzerklärung akzeptiert werden.",
      e_gone: "Jemand hat diese Tage gerade gebucht. Bitte wählt andere Termine.", e_net: "Die Verbindung ist fehlgeschlagen. Versucht es erneut oder ruft uns an: +36 70 245 8403.", e_pay: "Die Zahlung ist gerade nicht verfügbar. Bitte ruft uns an: +36 70 245 8403.",
      demoTitle: "Zahlung", demoBanner: "DEMO-MODUS: keine echte Zahlung, keine Abbuchung. Sobald Stripe angebunden ist, erscheint hier die Kartenzahlung.", demoPay: "Zahlung simulieren", processing: "Wird verarbeitet…",
      okTitle: "Buchung bestätigt", okRef: "Buchungsnummer", okText: "Danke! Die Bestätigung senden wir per E-Mail. Anreise ab 15:00 Uhr, Abreise bis 11:00 Uhr.", okDemo: "Dies war eine DEMO-Buchung, es wurde keine echte Buchung angelegt.",
      waitTitle: "Zahlung wird verarbeitet", waitText: "Wir warten auf die Bestätigung der Bank, das dauert einige Sekunden.", cancelled: "Die Zahlung wurde abgebrochen. Wir halten die Tage noch kurz frei, ihr müsst die Buchung aber neu starten.", expired: "Die Reservierung ist abgelaufen. Bitte startet die Buchung neu." }
'''
V_DE = '''    de: {
      oTitle: "Geschenkgutschein bestellen", rTitle: "Gutschein einlösen", pack: "Paket", valid: "Gültigkeit", validNote: "12 Monate ab Zahlung",
      pkg: ["", "1 Nacht für zwei Personen, in einem Apartment", "2 Nächte für zwei Personen, in einem Apartment", "Ganzes Haus, 1 Nacht für ein Paar", "Ganzes Haus, 2 Nächte für ein Paar"],
      rec: "Für wen ist er? (optional, wird auf den Gutschein gedruckt)", yourName: "Euer Name", yourMail: "E-Mail (hierhin senden wir den Gutschein)",
      demoOk: "DEMO: Dieser Gutschein ist nicht echt und kann nicht eingelöst werden.", code: "Gutscheincode", sentTo: "Den druckbaren Gutschein haben wir per E-Mail gesendet an: ", noMail: "Der E-Mail-Versand ist gerade nicht verfügbar, bitte ladet den Gutschein hier herunter:",
      dl: "Gutschein herunterladen (PDF)", until: "Gültig bis", ret: "Zahlung wird verarbeitet", retText: "Wir warten auf die Bestätigung der Bank, das dauert einige Sekunden.", cancelled: "Die Zahlung wurde abgebrochen, es wurde kein Gutschein ausgestellt. Bitte startet die Bestellung neu.", failed: "Die Zahlung ist fehlgeschlagen, es wurde kein Gutschein ausgestellt.",
      cLabel: "Gutscheincode", check: "Prüfen", e_code: "Bitte gebt den Gutscheincode ein.", nf: "Diesen Code finden wir nicht. Bitte prüft jedes Zeichen.", unpaid: "Dieser Gutschein ist noch nicht bezahlt.", expired: "Dieser Gutschein ist abgelaufen.", redeemed: "Dieser Gutschein wurde bereits eingelöst.",
      arr: "Anreise", dep: "Abreise", aptL: "Apartment", anyApt: "Beliebiges freies Apartment", houseNote: "Ganzes Haus: beide Apartments gehören nur euch.", book: "Mit Gutschein buchen", e_date: "Bitte wählt den Anreisetag.", e_after: "Die Anreise muss innerhalb der Gültigkeit des Gutscheins liegen.",
      okTitle: "Buchung bestätigt", okRef: "Buchungsnummer", covered: "Mit Geschenkgutschein beglichen", okText: "Danke! Die Bestätigung senden wir per E-Mail. Anreise ab 15:00 Uhr, Abreise bis 11:00 Uhr.",
      eV: { voucher_not_found: "Diesen Code finden wir nicht.", voucher_expired: "Dieser Gutschein ist abgelaufen.", voucher_redeemed: "Dieser Gutschein wurde bereits eingelöst.", voucher_unpaid: "Dieser Gutschein ist noch nicht bezahlt.", voucher_nights: "Der Gutschein gilt für eine andere Anzahl von Nächten.", voucher_after: "Die Anreise muss innerhalb der Gültigkeit des Gutscheins liegen." } }
'''


def mapping():
    mp = {}; problems = []
    base = json.load(open(ROOT + "/i18n/de_map.json", encoding="utf-8"))
    for hu, e in base.items():
        t2 = fix_tags(hu, e)
        if t2 is None: problems.append(("TAGS", hu[:60], e[:60])); continue
        for ph in re.findall("\u27e6\\d+\u27e7", hu):
            if ph not in t2: problems.append(("PLACEHOLDER", hu[:40], ph))
        mp[hu] = t2
    return mp, problems


def build(write=True):
    src = open(ROOT + "/opus/index.html", encoding="utf-8").read()
    mp, problems = mapping()
    out, miss, n = lib.apply_translation(src, mp)
    notes = {"splices": n, "untranslated": miss, "problems": problems, "js_fail": []}
    for old, new, cnt in JS:
        c = out.count(old)
        if c != cnt: notes["js_fail"].append((old[:60], c, cnt)); continue
        out = out.replace(old, new)
    # German dialog tables (inserted after the English ones)
    for anchor, add in (
        ('expired: "The hold has expired. Please start the booking again." }\n  }[L];', T_DE),
        ('voucher_after: "Your arrival must fall within the voucher\'s validity." } }\n  }[L];', V_DE)):
        if out.count(anchor) != 1: notes["js_fail"].append(("TABLE:" + anchor[:40], out.count(anchor), 1)); continue
        head = anchor.rsplit("\n  }[L];", 1)[0]
        out = out.replace(anchor, head + ",\n" + add + "  }[L];")
    reps = [('<html lang="hu">', '<html lang="de">'),
            ('<link rel="canonical" href="https://aranyhegyapartmanhaz.hu/">', '<link rel="canonical" href="%s/de/">' % SITE),
            ('<meta property="og:url" content="https://aranyhegyapartmanhaz.hu/">', '<meta property="og:url" content="%s/de/">' % SITE),
            ('<meta property="og:locale" content="hu_HU">', '<meta property="og:locale" content="de_DE">'),
            ('<a href="/" lang="hu" hreflang="hu" aria-current="true" data-lang="hu">', '<a href="/" lang="hu" hreflang="hu" data-lang="hu">'),
            ('<a href="/de/" lang="de" hreflang="de" data-lang="de">', '<a href="/de/" lang="de" hreflang="de" aria-current="true" data-lang="de">')]
    for o, nw in reps:
        c = out.count(o)
        if c < 1: notes["js_fail"].append(("DOC:" + o[:50], c, 1)); continue
        out = out.replace(o, nw)
    out = out.replace("https://aranyhegyapartmanhaz.hu/#book", SITE + "/de/#book")
    out = re.sub(r"(?<=[\s,\"'(=])(img/|fonts/|vid/)", r"/\1", out)
    out = re.sub(r'(href|src)="(favicon[^"]*|apple-touch-icon[^"]*|site\.webmanifest)"', r'\1="/\2"', out)
    plain_map = {}
    for hu, e in mp.items():
        if "\u27e6" in hu: continue
        plain_map[plain(hu)] = plain(e)
    miss_ld = []
    def sub_ld(m):
        d = json.loads(m.group(1)); d2 = tr_ld(d, plain_map, miss_ld, LD, "/de/")
        return '<script type="application/ld+json">' + json.dumps(d2, ensure_ascii=False) + "</script>"
    out = re.sub(r'<script type="application/ld\+json">(.*?)</script>', sub_ld, out, flags=re.S)
    notes["ld_untranslated"] = miss_ld
    meta = '<meta name="robots" content="noindex,nofollow">\n'
    if meta not in out: out = out.replace("<title>", meta + "<title>", 1)
    if write:
        os.makedirs(ROOT + "/dist-opus/de", exist_ok=True)
        open(ROOT + "/dist-opus/de/index.html", "w", encoding="utf-8").write(out)
    return out, notes


if __name__ == "__main__":
    out, notes = build()
    print("built", len(out), "bytes | splices", notes["splices"])
    for k in ("problems", "untranslated", "js_fail", "ld_untranslated"):
        print(k.upper(), len(notes[k]))
        for x in notes[k][:25]: print("   ", x)
