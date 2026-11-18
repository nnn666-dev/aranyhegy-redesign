# Aranyhegy Apartmanház: átadási útmutató (fejlesztőnek)

Ez a repó az Aranyhegy Apartmanház (Szada, Aranyhegy u. 110.) weboldalának jelenlegi, működő állapota. A Netlify-on élő bemutató: https://aranyhegy-opus-preview.netlify.app (`noindex`). A feladat: éles üzembe helyezés, valódi fizetés, számlázás, e-mail és a végleges domain.

## 1. Mi ez

- Magyar oldal (`/`), angol (`/en/`) és német (`/de/`) változat, egyetlen forrásból generálva.
- Foglalási motor (jelenleg DEMÓ fizetési móddal) és ajándékutalvány-rendelés.
- Saját szerkesztőfelület (CMS) a `/admin/` címen, három nyelven.
- Egyedi naptár a foglalási szakaszban (csak asztali gépen, érintőképernyőn a böngésző saját választója marad).
- Google Térkép (műhold + térkép) a „Ahova jó megérkezni.” szakaszban.

## 2. Felépítés

| Hely | Szerep |
|---|---|
| `opus/index.html` | **A magyar oldal forrása.** Minden szerkesztés ide megy (CSS és JS inline). Képek: `opus/img`, videó: `opus/vid`, betűk: `opus/fonts`. |
| `sync.py` | `opus/` tartalmát átmásolja a `dist-opus/` mappába (a `dist-opus/index.html` a magyar kimenet). |
| `i18n/` | Angol és német fordítás: `en_map.json`, `en_new.json`, `de_map.json` (kulcs = a magyar szöveg), `build.py` (EN), `build_de.py` (DE), `lib.py`. |
| `cms/build_template.py` | A HU, EN és DE kimenetből szerkeszthető sablont épít: `netlify/cms/template.json`. |
| `dist-opus/` | **A publikált, legenerált oldal** (`netlify.toml`: `publish = "dist-opus"`). Tartalmazza az admin felületet (`dist-opus/admin/`). |
| `netlify/functions/` | Szerveroldali végpontok (lásd lent). |
| `test/` | Automata tesztek (`*.test.mjs`). |
| `ADMIN-DESIGN.md`, `admin-wireframe.html` | A foglalás-kezelő admin **terve** (még nincs megépítve). |

### Buildelés (ebben a sorrendben)

```
python3 sync.py
python3 i18n/build.py        # EN
python3 i18n/build_de.py     # DE
python3 cms/build_template.py
node test/cms.test.mjs
```

A `cms/build_template.py` csak akkor fut le, ha a HU, EN és DE kimenet mind elkészült és a szegmensek száma egyezik. Ha magyar szöveget módosítasz, az `en_map.json` és a `de_map.json` megfelelő kulcsát is frissíteni kell (a build jelzi a hiányzó fordítást: `UNTRANSLATED`).

Telepítés: `npm install`, majd `netlify deploy --prod --dir=dist-opus`.

### Szerveroldali részek (`netlify/functions/`)

- `reserve.mjs`: foglalás létrehozása, 30 perces tartás, az **ár szerveroldali és kizárólagos forrása**.
- `quote.mjs`, `calendar.mjs`: árajánlat, ill. a foglalt éjszakák (csak dátumok, vendégadat nélkül).
- `voucher-order.mjs`: ajándékutalvány megrendelés (utalvány kód: `AHU-XXXX-XXXX`).
- `_mail.mjs`: foglalási és utalvány e-mailek (HU, EN, DE).
- `admin.mjs`, `_cms.mjs`, `_render.mjs`, `page.mjs`: a CMS és a kérés-időben történő oldalgenerálás (`/`, `/en/`, `/de/` a CMS felülírásaival).
- Adattárolás: Netlify Blobs.

## 3. Környezeti változók (értékek NINCSENEK a repóban)

Beállítás: Netlify → Site configuration → Environment variables. **Az értékeket a tulajdonostól kapod, soha ne kerüljenek a repóba.**

| Név | Mire kell |
|---|---|
| `STRIPE_SECRET_KEY` | Valódi kártyás fizetés (Stripe Checkout). Amint be van állítva, a DEMÓ végpontok kikapcsolnak. |
| `STRIPE_WEBHOOK_SECRET` | A Stripe webhook aláírás-ellenőrzése. |
| `SZAMLAZZ_AGENT_KEY`, `SZAMLAZZ_VAT`, `SZAMLAZZ_PREFIX` | Számlázz.hu számlázás. |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `OWNER_EMAIL` | E-mail küldés (foglalási visszaigazolás, utalvány, admin belépőkód). |
| `ADMIN_EMAIL` | A CMS e-mail-kódos belépéséhez. |
| `ADMIN_PASSWORD` | A CMS jelszavas belépése. **A jelenlegi egy gyenge TESZT jelszó, éles előtt erős jelszóra kell cserélni (vagy elhagyni, és az e-mail-kódos belépést használni).** |
| `CMS_NO_RATELIMIT` | Csak helyi teszthez (`1`). **Élesben ne legyen beállítva.** |

## 4. Élesítési ellenőrzőlista

1. **Kulcsok és erős admin jelszó** beállítása (fent). A Stripe tesztmódos kulcsokkal kezdd.
2. **Stripe webhook** bekötése, majd teszt-foglalás végigvitele. Ellenőrizd, hogy a Számlázz.hu számla és az e-mail kimegy.
3. **E-mail:** a Resend-ben igazold a küldő domaint (SPF/DKIM), különben spamba kerülnek a levelek.
4. **Domain:** előbb aldomainen próbáld (a domain jelenleg másutt van hostolva, Google Workspace e-mailekkel; a MX rekordokhoz ne nyúlj).
5. **iCal-szinkron** (Booking.com, Airbnb, egyéb csatornák) **élesítés előtt kötelező**, különben dupla foglalás lehet. A rendszer jelenleg csak a saját foglalásait ismeri.
6. **`noindex` eltávolítása, négy helyen** (mind a négyet, különben az oldal nem kerül be a keresőkbe):
   - `dist-opus/robots.txt` (`Disallow: /`),
   - `dist-opus/_headers` (`X-Robots-Tag: noindex, nofollow`),
   - a `<meta name="robots" content="noindex,nofollow">` sor az `opus/index.html`-ben (a HU, EN és DE kimenet ebből készül),
   - a `x-robots-tag` fejléc a `netlify/functions/_render.mjs` 54. sorában (a kérés-időben generált oldalak ezt küldik).

   Az `hreflang` és a `canonical` már az éles domainre (`aranyhegyapartmanhaz.hu`) mutat. Az `/admin/` maradjon `noindex`.
7. **Jogi oldalak:** az ÁSZF és az Adatkezelési nyilatkozat jelenleg magyar (a német és az angol oldalról is oda mutat). A **Google Térkép** használata (görgetéskor betölt) és a Google betűtípusok/hívások miatt az adatkezelési nyilatkozatot frissíteni kell. A német és az angol jogi szövegeket jogásszal kell átnézetni (pl. „Stornogebühr").
8. **ÁFA:** az utalványok ÁFA-kezeléséről a könyvelő döntése kell (a Számlázz.hu XML ettől függ).
9. **Netlify használat:** a bemutató kétszer elérte a Netlify ingyenes keretét (503 `usage_exceeded`). Az oldal kérés-időben generálódik, ezért élesben fizetős csomag vagy külön tárhely javasolt, és figyelni kell a function-hívások számát.
10. **Nem kész funkciók:** a CMS-ben a képcsere és a blog „Hamarosan”; a foglalás-kezelő admin (`ADMIN-DESIGN.md`) még nincs megépítve.

## 5. Tartalmi szabályok (a tulajdonos döntései)

- Ár: 1 pár, 1 apartman = **60.000 Ft/éj**. Az egész ház 2 főre 90.000 Ft/éj (csak telefonon; online csak utalványon át). Két apartman 3–4 főre 120.000 Ft. 1 éjszaka is foglalható. Idegenforgalmi adó 0 Ft. Hétvégi felár és takarítási díj nincs.
- Fizetés: online, 100% előre. Az utalvány-szakasz sosem mutat árat.
- Szóhasználat: **nincs** „kupola” (ez: „fedett jacuzzi”, DE: „überdachter Whirlpool”), nincs „4 csillag”, nincs hamis sürgetés, nincs ellenőrizetlen állítás. A GYIK módosításakor a JSON-LD (24 kérdés) is frissítendő.
- Betűk: Jost (törzs), Libre Caslon Text (hosszú címek), Cinzel (főcím, logó, gombok, menü). Soha Inter vagy Space Grotesk.
- Elsődleges gomb: pill alakú, pezsgőarany színátmenet (`#f3dfaa → #dfba70 → #c79a4a`). Mobilon egy teljes szélességű „Foglalás” sáv alul.
- A fejléc „Foglalás” gombja nem animálódik (nincs mágneses mozgás).

## 6. Tesztek

`node test/cms.test.mjs` (CMS sablon, HU/EN/DE bájtazonos renderelés), `cms-api`, `booking`, `api`, `voucher`, `voucher-api`. A `cms-live.test.mjs` az éles bemutatót hívja, és az admin jelszót az `ADMIN_TEST_PW` környezeti változóból olvassa.

## 7. Elérhetőségek az oldalon

Telefon +36 70 245 8403, hello@aranyhegyapartmanhaz.hu, Aranyhegy u. 110., 2111 Szada, NTAK: MA25120826. Bejelentkezés 15:00, kijelentkezés 11:00.
