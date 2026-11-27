# Aranyhegy Apartmanház: átadási dokumentáció fejlesztőknek

Utolsó frissítés: 2026. november vége. A dokumentum a repó tényleges kódjából készült, minden állítás ellenőrzött. Ahol valami **nincs kipróbálva**, ott ez külön szerepel.

- Bemutató (Netlify, `noindex`): https://aranyhegy-opus-preview.netlify.app
- Netlify site azonosító: `d2224fad-9c06-4d1e-bc8a-22eb00621570` (az **egyetlen** hivatalos előnézet; egy régebbi, használaton kívüli site is létezik `aranyhegy-opus-v2` néven, arra **ne** deployolj)
- Repó: https://github.com/nnn666-dev/aranyhegy-redesign (`main`)
- Éles domain (cél): `aranyhegyapartmanhaz.hu`. Ma ezen a címen a régi oldal és a GoDirect foglalási motor fut, az új oldal még nincs rákötve.

---

## 1. Mi ez, és mi a feladat

Az Aranyhegy Apartmanház (Szada, Aranyhegy u. 110., két apartman: Smaragd és Zafír) új weboldala. A cél: több közvetlen foglalás, prémium megjelenés, három nyelv.

**Kész és működik (a bemutatón):**

- Magyar (`/`), angol (`/en/`), német (`/de/`) oldal egyetlen forrásból.
- Foglalási keresősáv, egyedi naptár (asztalon és telefonon is), foglalási ablak az eredeti oldal adatbeviteli mezőivel (számlázási cím, cégként foglalás, telefon előhívóval, kedvezménykód, három fizetési mód).
- Szerveroldali foglalási motor: éjszaka-zárak, 30 perces tartás, ár csak szerveren számolódik.
- Ajándékutalvány: rendelés, PDF (HU/EN/DE), beváltás foglaláskor.
- Egész ház és „két pár” ajánlatkérés (nincs fizetés), WhatsApp gomb.
- Saját szerkesztőfelület (CMS) a `/admin/` címen, három nyelven, publikálással és verziózással.
- Google Térkép, GYIK (28 kérdés, JSON-LD-vel), Látnivalók, Vélemények, Wellness és Kert szakaszok.

**Nincs kész / a te dolgod az éles indulásig** (részletesen a 10. fejezetben):

- Valódi kulcsok és bekötések: Stripe, Számlázz.hu, Resend (e-mail). A bemutató ezek nélkül DEMÓ módban fut.
- iCal-szinkron más csatornákkal (Booking.com, Airbnb): **nincs megvalósítva**.
- Foglalás-kezelő admin: csak terv van (`ADMIN-DESIGN.md`), nincs megépítve.
- CMS képcsere és blog: a felületen „Hamarosan”.
- Jogi oldalak német nyelven, ÁFA-döntés az utalványokra, valódi Trajan Pro betűkészlet.
- `noindex` eltávolítása (négy helyen).

---

## 2. Gyors indulás

Előfeltételek (ezekkel készült és tesztelődött): Node.js 22, Python 3.9+ (a build csak a standard könyvtárat használja), Netlify CLI (`npm i -g netlify-cli`, a fejlesztés 27.5.0-val ment). Pillow csak a `vch_*.py` utalvány-képgeneráló eszközökhöz kell.

```bash
git clone git@github.com:nnn666-dev/aranyhegy-redesign.git
cd aranyhegy-redesign
npm install

# 1) build (sorrend kötött)
python3 sync.py
python3 i18n/build.py          # angol
python3 i18n/build_de.py       # német
python3 cms/build_template.py  # CMS-sablon
node test/cms.test.mjs         # build ellenőrzése

# 2) helyi futtatás a függvényekkel együtt
ADMIN_PASSWORD='valami-helyi-jelszo' CMS_NO_RATELIMIT=1 \
  netlify dev --port 8888 --dir dist-opus --offline

# 3) élesítés (előnézeti site)
netlify deploy --prod --dir=dist-opus --site=d2224fad-9c06-4d1e-bc8a-22eb00621570
```

A build-szkriptek a **saját helyükhöz képest** keresik a projektet, ezért a repó bárhová klónozható. Ellenőrzés: egy másik útvonalra klónozott másolatban a build bájtra azonos kimenetet ad (`dist-opus/*.html` és `netlify/cms/template.json`).

A `CMS_NO_RATELIMIT=1` csak akkor hat, ha a `NETLIFY_DEV` is be van állítva (azaz csak helyben). Élesben ne állítsd be.

---

## 3. Repó-szerkezet

| Hely | Szerep |
|---|---|
| `opus/index.html` | **A magyar oldal egyetlen forrása.** CSS és JS inline. Minden tartalmi és kinézeti módosítás ide megy. |
| `opus/img`, `opus/vid`, `opus/fonts` | Képek, videók, saját tárolású betűk (Jost, Libre Caslon Text, Cinzel, woff2). |
| `sync.py` | `opus/index.html` → `dist-opus/index.html`. **Itt kerül be a `noindex` meta sor** (az `opus/index.html` nem tartalmazza). A képeket/betűket/videót **nem** másolja. |
| `i18n/` | Fordítás. `en_map.json`, `en_new.json`, `de_map.json`: kulcs = a magyar szöveg betűre pontosan. `build.py` (EN), `build_de.py` (DE, benne a foglalási ablak német nyelvi táblája), `lib.py` (tokenizáló és szegmens-kinyerő). `segments.json` és `en_a/b/c.txt`: az eredeti angol fordítás nyers forrása (a `build.py` `load_en()` függvénye olvassa); a mai build a `en_map.json` + `en_new.json` térképből dolgozik. `de_need.json`: a német fordítás munkafájlja, a build nem használja. |
| `cms/build_template.py` | A HU/EN/DE kimenetből szerkeszthető sablont épít: `netlify/cms/template.json`. |
| `dist-opus/` | **A publikált mappa** (`netlify.toml`: `publish = "dist-opus"`). Legenerált HTML-ek, képek, `_headers`, `robots.txt`, `admin/` (a CMS felülete). |
| `netlify/functions/` | Szerveroldali végpontok (Netlify Functions v2, esbuild). Lásd 6. fejezet. |
| `netlify/cms/template.json` | A CMS és a kérés-időben történő oldalgenerálás sablonja (a függvényekbe be van csomagolva). |
| `netlify/assets/` | Utalvány-PDF alapképek (`voucher-base-*.jpg`, HU/EN/DE), betűk (`fonts/*.ttf`), `stamp.json` (a „MINTA” felirat helye). |
| `test/` | Automata tesztek. Lásd 9. fejezet. |
| `vch_gen.py`, `vch_preview.py`, `vch_public.py`, `vch_params.json` | Utalvány-alapképek és nyilvános minták generálása angolul/németül (Pillow). Egyszeri eszközök, **abszolút útvonalat használnak** (`~/aranyhegy-redesign-2027`), használat előtt igazítsd. |
| `ADMIN-DESIGN.md`, `admin-wireframe.html` | A foglalás-kezelő admin **terve** (nincs megépítve). |
| `BRIEF.md` | **Történeti.** A kezdeti (design-fázisú) feladatleírás. A benne lévő szabályok egy része elavult vagy ellentmond a mostaninak (pl. „4-star”, „dome”). A mérvadó szabályok a 8. fejezetben vannak. |
| `HANDOVER.md` | Ez a dokumentum. |
| `dist-opus/fonts.html`, `dist-opus/trajan-test.html` | Betűtípus-próbaoldalak. **Élesítés előtt töröld őket** (a `opus/trajan-test.html` is). |

**Fontos:** a képek, videók és betűk két helyen vannak (`opus/…` és `dist-opus/…`), és kézzel kell szinkronban tartani őket. A `sync.py` csak a HTML-t másolja. Új kép: tedd mindkét helyre.

---

## 4. Munkafolyamat és konvenciók

### 4.1 Szerkesztés

1. Szerkeszd az `opus/index.html`-t (magyar szöveg, CSS, JS).
2. Futtasd a build-láncot (2. fejezet, 1. pont). A `cms/build_template.py` csak akkor ad `ZERO-DIFF HU+EN+DE OK`-t, ha a sablon renderelése bájtra azonos a legenerált oldalakkal.
3. `node test/cms.test.mjs` legyen zöld.
4. Deploy.

### 4.2 Fordítás (i18n)

- A fordítási kulcs maga a magyar szöveg, karakterre pontosan. Ha egy magyar szöveget átírsz, a megfelelő kulcsot **mindkét** térképben (`en_map.json`, `de_map.json`, szükség esetén `en_new.json`) át kell írni, különben a build `UNTRANSLATED`-ként jelzi, vagy a szöveg magyarul marad az EN/DE oldalon.
- Új magyar szöveg: vegyél fel hozzá EN és DE fordítást a térképekbe.
- A build kimenete: `PROBLEMS 0` kötelező. Két ismert, ártalmatlan jelzés van, ezeket ne „javítsd”:
  - `UNTRANSLATED 1 / DE`: a „DE” nyelvváltó-felirat, amit nem kell fordítani.
  - EN buildnél `JS_FAIL 1 ('DOC:aria-label="Nyelv"', 0, 1)`: a szabály ellenőrzése, a csere ténylegesen megtörténik (az EN oldalon `aria-label="Language"`, a DE oldalon `Sprache`).
- A felugró ablakok és a naptár szövegei **JavaScript-táblákban** vannak az `opus/index.html`-ben, magyarul és angolul: `T` (foglalási ablak), `V` (ajándékutalvány rendelése és beváltása), `I` (ajánlatkérés), `TX` (naptár). A **német** táblákat az `i18n/build_de.py` szúrja be a build során (`T_DE`, `V_DE` és társai a fájl tetején; a beszúrás az angol tábla végét záró szövegre illeszkedik, ezért az angol tábla utolsó kulcsának átírása a build horgonyát is érinti, lásd a szkript `anchor` sorait). Új kulcsot mindhárom nyelvbe fel kell venni, különben a DE oldalon `undefined` jelenik meg. A build ilyenkor `JS_FAIL`-t vagy `PROBLEMS`-t jelez.

### 4.3 CSS és a „STAGE” jelölések

- A stíluslap egyetlen nagy `<style>` blokk (kb. 2500 sor). A módosítások **rétegesen** épültek: minden új blokk `/* STAGEnnn: leírás */` megjegyzést kapott (a legmagasabb most a `STAGE202`). A keresés `STAGE`-re megtalálja, mi mikor változott.
- Új szabály beszúrási pontja: a `/* iq-fields-equal:` megjegyzés elé (egyetlen előfordulás). A szelektorok `html body …` előtagot kapnak, így erősebbek a korábbi rétegeknél. **Az azonos erősségű szabályok közül a későbbi nyer.**
- Ez a réteges felépítés működik, de hosszú. **Javasolt a konszolidálás** (a felülírt szabályok összevonása) az éles indulás előtt, ha hosszú távú karbantartás a cél. A konszolidálás után a vizuális regressziót minden szélességen ellenőrizni kell.
- Töréspontok, amiket a CSS használ: 480, 600/601, 640, 859/860, 900/901, 1000/1001, 1020, 1100, 1120/1121, 1220/1221, 1240 px.
- Mobil menü: 1220 px alatt a fő menü eltűnik, helyette hamburger. Telefonon egy teljes szélességű „Foglalás” sáv ragad alul (`#mbar`).

### 4.4 Ellenőrzési szokások

A fejlesztés közben minden módosítás ezekkel lett ellenőrizve (érdemes megtartani): headless Chrome Playwrighttal, szélességek 320/360/390/430/768 és 1030/1280/1440, mérés: `scrollWidth` (nincs vízszintes túlcsordulás), `pageerror`, elemek mérete (érintési felület ≥ 44 px), valamint a három nyelv. A `dist-opus`-t helyi HTTP szerverről kell kiszolgálni (a `file://` nem tölti be az abszolút `/img/…` útvonalakat). A scroll-animált elemek (`.rv`) mérés előtt kapcsold ki.

---

## 5. Frontend felépítése

### 5.1 Szakaszok (horgonyok)

`#top` (hero), `#apartmanok`, `#foglalas` (keresősáv és „Szabad időpontok”), `#velemenyek`, `#arak`, `#wellness` (benne `#privat-sav`), `#kert`, `#latnivalok`, `#gyik` (a „Házirend” csoport `#hazirend`), `#ajandek` (utalvány), `#helyszin` (térkép), lábléc. Minden „Foglalás” gomb a `#foglalas`-ra mutat; az apartmankártyák gombjai (`data-book`) előre kiválasztják az apartmant.

### 5.2 Fő JavaScript blokkok (az `opus/index.html` aljától, megjegyzés alapján keresd)

| Megjegyzés / tartalom | Mit csinál |
|---|---|
| Fő blokk (`root.classList.add("js")`) | Menü, fejléc, galériák, hangulatválasztó (Smaragd/Zafír/Egész ház fülek), ajándék-menüpont szezonja, a keresősáv logikája (`#in`, `#out`, `#guests`, `#apt`), a **„Egész ház” sáv** (`#bookNote`, `.hn-ask`) |
| `STAGE153` | GYIK harmonika animáció |
| `STAGE162` | Látnivalók lenyílók |
| `STAGE178` + 196 | **Foglalási folyamat**: ellenőrzés (`/api/quote`), foglalási ablak (`.ahb`), fizetési módok, kedvezménykód, utalványos foglalás, visszatérés a Stripe-ból, ajánlatkérő ablak (`/api/inquiry`), utalványrendelés |
| `STAGE185` + 198 | **Egyedi naptár** (`.ahcal`): 860 px-től két hónap, alatta egy hónap és folyékony szélesség. Minden eszközön ez nyílik. A natív dátummezők (`<input type="date">`) maradnak az adathordozó és a JavaScript nélküli tartalék. |
| `STAGE188` | Google Térkép a tulajdonos koordinátáival (47.6271829, 19.3126992), műhold az alap, **görgetéskor tölt be** |

### 5.3 Szezonális elem

Az „Ajándékutalvány” menüpont **október 15. és február 15. között** látszik (`?ajandek=1` a paraméterrel erőltetve megjeleníti). A többi menüpont egész évben azonos. A menü a szezonon kívül szélesebb helyet hagy, szezonban (6 menüpont) a legszűkebb asztali szélességen (1221 px) is elfér, ez mérve van.

### 5.4 Betűk, színek, gombok

- Törzsszöveg: Jost. Hosszú címek: Libre Caslon Text. Főcím (hero), logó, címkék, gombok, menü: Cinzel (`--display`). **Soha nem Inter vagy Space Grotesk.** Mind saját tárolású (`opus/fonts`).
- A foglalási ablak címe Trajan Pro-t kér (`"Trajan Pro 3","Trajan Pro"`), de a valódi betűkészlet **nincs betöltve** (Adobe Fonts kell hozzá). Addig a Cinzel látszik helyette. A kapcsoló egyetlen helyen van (`--display` a `:root`-ban és a `.ahb-h h2` szabály).
- Márkaszínek: arany `rgb(184,145,90)`, papír `rgb(243,239,230)`, tinta `rgb(20,18,14)`, krém `#fbf8f2`, mély arany `#7A5A2C`, homok `#ebe4d7`.
- Elsődleges gomb: pill alak (`border-radius:999px`), pezsgőarany színátmenet `#f3dfaa → #dfba70 → #c79a4a`. Kártyák és mezők sarka 4 px. Minden érintési felület ≥ 44 px. A fejléc „Foglalás” gombja nem animál.

### 5.5 SEO és strukturált adat

- `canonical` és `hreflang` (hu, en, de, x-default) az éles domainre mutat.
- JSON-LD: `FAQPage` (28 kérdés), `LodgingBusiness`, `ItemList` (látnivalók). A GYIK szövege és a JSON-LD szinkronban kell maradjon: a CMS ezt automatikusan intézi, kézi szerkesztésnél mindkettőt át kell írni.
- A GYIK kérdéseinek számát az `netlify/functions/admin.mjs` ellenőrzi (`mainEntity.length !== 28`, ~74. sor). Új kérdésnél a számot is frissítsd.
- **Nincs `sitemap.xml`.** Éles indulás előtt kell egy.

---

## 6. Backend (`netlify/functions/`)

### 6.1 Végpontok

| Útvonal | Fájl | Feladat |
|---|---|---|
| `GET /api/quote` | `quote.mjs` | Szabad-e a kért időszak. Paraméterek: `in`, `out`, `guests`, `apt`. Válasz: éjszakák, ár (`60000 × éj`), szabad apartmanok. 3+ vendég vagy egész ház: `phone_only`. |
| `GET /api/calendar` | `calendar.mjs` | Foglalt éjszakák apartmanonként (csak dátumok, vendégadat nélkül). `from`, `days` (max. 600, alap 560). 15 mp-es gyorsítótár. |
| `POST /api/reserve` | `reserve.mjs` | Foglalás létrehozása. Négy kimenet (lásd 6.3). |
| `GET /api/booking` | `booking.mjs` | Foglalás állapota (`id` és `t` token kell). |
| `POST /api/demo-pay` | `demo-pay.mjs` | **Csak DEMÓ:** fizetés szimulálása. `STRIPE_SECRET_KEY` mellett 403, soha nem erősíthet meg ingyen valódi foglalást. |
| `POST /api/stripe-webhook` | `stripe-webhook.mjs` | Aláírás-ellenőrzés után megerősít vagy felold. |
| `POST /api/voucher-order` | `voucher-order.mjs` | Utalvány rendelése (csomag 1–4). |
| `GET/POST /api/voucher` | `voucher.mjs` | `a=check` (nyilvános, csak állapot), `a=pdf` (kód + token), `a=status`; POST: `demo-pay`, `resend`. |
| `POST /api/inquiry` | `inquiry.mjs` | Egész ház / két pár ajánlatkérés (nincs fizetés). |
| `* /api/admin/*` | `admin.mjs` | CMS API (7. fejezet). |
| `/`, `/en/`, `/de/` | `page.mjs` | A nyilvános oldalak **kérés-időben** renderelődnek a sablonból és a CMS-felülírásokból, CDN-en gyorsítótárazva (`cache-tag: page`, publikáláskor törlődik). |

Segédmodulok (nem végpontok): `_lib.mjs` (zárak, ár, validáció), `_cms.mjs` (CMS tár, munkamenet, sebességkorlát), `_render.mjs` (sablon-renderelés), `_voucher.mjs` (utalvány, PDF), `_mail.mjs` (e-mail), `_invoice.mjs` (Számlázz.hu).

> A statikus `dist-opus/index.html` létezik, de a `/`, `/en/`, `/de/` útvonalakat a `page.mjs` függvény szolgálja ki. **A HTML módosítása után ezért a `netlify/cms/template.json`-t is újra kell építeni és deployolni**, különben a régi oldal jön ki.

### 6.2 Árak és szabályok (egyetlen forrás: `_lib.mjs`, `_voucher.mjs`)

- Egy apartman: **60.000 Ft/éj** (`PRICE`). Egész ház 2 fő: 90.000 Ft/éj. Két apartman 3–4 főre: 120.000 Ft. 1 éjszaka is foglalható. Idegenforgalmi adó 0 Ft. Nincs hétvégi felár, nincs takarítási díj.
- Online legfeljebb 2 fő, egy apartman (`MAX_GUESTS_ONLINE = 2`). Egész ház, 3–4 fő: telefonon vagy ajánlatkéréssel. **Az egész ház online csak utalvánnyal foglalható.**
- Legfeljebb 30 éjszaka (`MAX_NIGHTS`). Időzóna: `Europe/Budapest`.
- A kliens által küldött ár **nem számít**: a szerver mindig újraszámolja.
- Utalvány-csomagok (`PKG`): 1 = 1 éj/apartman 60.000; 2 = 2 éj/apartman 120.000; 3 = egész ház 1 éj 90.000; 4 = egész ház 2 éj 180.000. Az utalvány-szakasz a weboldalon **soha nem mutat árat**. Érvényesség 12 hónap.
- Azonosítók: foglalás `AH-XXXXXXXX`, ajánlatkérés/foglalási kérelem `AJ-XXXXXXXX`, utalvány `AHU-XXXX-XXXX` (a betűkészlet nem tartalmaz `0/O/1/I`-t).

### 6.3 `POST /api/reserve` részletesen

**Kérés (JSON):** `in`, `out` (ÉÉÉÉ-HH-NN), `guests`, `apt` (`smaragd` / `zafir` / `haz-any`; utalvánnyal `haz`), `firstName`, `lastName` (magyar nyelvnél „Vezetéknév Keresztnév” sorrend a tárolt névben), `email`, `phone`, `terms: true` (kötelező), `terms2`, `note`, `lang` (`hu`/`en`/`de`), `payMethod` (`card` / `transfer` / `szep`), `szepType` (`otp` / `mbh` / `kh`, SZÉP-nél kötelező), `voucher` (kód), `billing` {`country` (ISO2), `zip`, `city`, `street`, `company`, `companyName`, `vat`}, `website` (honeypot, üresnek kell lennie). A régi, egymezős `name` mező is működik (visszafelé kompatibilis), a `billing` elhagyható.

**Validáció:** magyar irányítószám pontosan 4 számjegy, külföldi legalább 3 karakter; cégnél cégnév és adószám (min. 8 karakter) kötelező; telefon min. 7 számjegy. Hibakódok (`error`): `dates`, `past`, `order`, `toolong`, `guests`, `phone_only`, `apt`, `first_name`, `last_name`, `name`, `email`, `phone`, `terms`, `country`, `zip`, `city`, `street`, `company`, `vat`, `szep`, `voucher*`, `unavailable` (409), `rate` (429), `payment_unavailable` (502).

**Négy kimenet (`mode`):**

1. **`stripe`**: `STRIPE_SECRET_KEY` mellett, bankkártya. A szerver lezárja az éjszakákat 30 percre, létrehoz egy Stripe Checkout sessiont (`expires_at` = tartás + 30 mp), és visszaadja az URL-t. A fizetés után a **webhook** erősíti meg a foglalást (nem a böngésző visszatérése).
2. **`demo`**: kulcs nélkül. Tartás van, `/api/demo-pay` erősíti meg. Csak a bemutatóhoz.
3. **`voucher`**: érvényes utalványkóddal. Az utalványt pontosan egyszer lehet beváltani (versenyhelyzet-védelemmel), a foglalás azonnal megerősített, fizetés nincs, összeg 0.
4. **`request`**: `payMethod` = `transfer` vagy `szep` (és nincs utalvány). **Nem zárol napokat.** A kérés az `inq/` kulcs alatt tárolódik (`kind: "booking"`), megjelenik a CMS „Ajánlatkérések” listájában, a tulajdonos e-mailt kap (`OWNER_EMAIL`, ha van `RESEND_API_KEY`). A fizetési tudnivalókat a tulajdonos küldi **kézzel**. A vendég erre a kérésre **nem kap automatikus levelet**. Ha az apartman közben foglalt lett: 409 `unavailable`.

A bankkártyás (`stripe`/`demo`) ágon a `billing` a foglalási rekordba kerül és a Számlázz.hu számlához felhasználódik. **A Stripe-nak csak az e-mail-cím megy tovább.**

### 6.4 Foglalási zárak és a tartás

- Tár: Netlify Blobs, store `bookings` (erős konzisztencia). Éjszakánként egy kulcs: `night/<apt>/<nap>` → `{bid, status: "held"|"confirmed", exp}`. Foglalás: `booking/<AH-id>`. Utalvány: `voucher/<kód>`.
- `lockNights`: feltételes írás (`onlyIfNew`), majd 25–50 ms után újraolvasás („mély védelem”: ha a feltételes írás nem lenne atomi, a vesztes visszalép). Az egész ház mindkét apartmant zárolja, vagy egyiket sem.
- A tartás 30 perc (`HOLD_MIN`; a Stripe Checkout minimum lejárata is 30 perc, ezért nem lehet kevesebb). A lejárt tartás **lustán** takarítódik (olvasáskor kezelt lejártnak, nincs időzített takarító). A Stripe `checkout.session.expired` webhook feloldja a tartást.
- A weboldal **szándékosan nem írja ki** a vendégnek a 30 perces tartást.

### 6.5 Stripe

- Kezelt események (`stripe-webhook.mjs`): `checkout.session.completed`, `async_payment_succeeded` (megerősít), `expired`, `async_payment_failed` (felold). A foglalást a `metadata.booking_id`, az utalványt a `metadata.voucher_code` köti a sessionhöz.
- Az aláírást a függvény maga ellenőrzi (HMAC, 5 perc tűréshatár), `STRIPE_WEBHOOK_SECRET` nélkül 503.
- **A HUF összeg `×100`-zal megy (`unit_amount = ft × 100`). Ezt egyszer tesztmódban ellenőrizni kell**, a kód megjegyzése is ezt kéri.
- A webhook végpont: `https://<domain>/api/stripe-webhook`.

### 6.6 Számlázz.hu (`_invoice.mjs`) – NINCS kipróbálva

Csak `SZAMLAZZ_AGENT_KEY` mellett fut, különben a foglalás érvényes marad, a számla `skipped`. A XML a Számla Agent nyilvános sémáját követi, de **élő ügynökkel sosem tesztelték**. Ismert egyszerűsítések: fix fizetési mód „Bankkártya”, üres `<elado>`, az ÁFA-kulcs a `SZAMLAZZ_VAT` változóból jön (alap: `AAM`), tétel nettó = bruttó. Az utalványos (0 Ft) foglalás nem számláz. A vevő neve cégnél a cégnév, az adószám csak cégnél kerül bele. Egyeztess a könyvelővel (ÁFA, előlegszámla vs. végszámla, utalvány-értékesítés ÁFA-ja).

### 6.7 E-mail (`_mail.mjs`)

Resend (`RESEND_API_KEY`). Kulcs nélkül semmi nem megy ki, és a válasz ezt jelzi (`skipped`), a folyamat nem hibázik. Levelek: foglalás-visszaigazolás (HU/EN/DE), utalvány (PDF melléklettel), ajánlatkérés (tulajdonosnak, és a vendégnek is visszaigazolás, ha adott e-mailt), admin belépési kód. A küldő domaint a Resend-ben igazolni kell (SPF/DKIM), különben spamba kerülnek.

### 6.8 Utalvány

`voucher-order` → (Stripe vagy DEMÓ) → `fulfilVoucher` (idempotens): `paid`, PDF készül, e-mail megy. PDF: `pdf-lib` + `fontkit`, alapképek `netlify/assets/voucher-base-*.jpg` (HU: `-1…-4`, EN/DE: `-en-…`, `-de-…`), a fájlnév és a PDF-metaadatok nyelvfüggők. A PDF-et a függvény futásidőben a `netlify/assets` mappából olvassa (`fs`). Ez **élesben is működik** (ellenőrizve), de a `netlify.toml`-ban nincs `included_files`; ha a csomagoló viselkedése változna, add hozzá: `included_files = ["netlify/assets/**"]`. Állapotok: `valid`, `expired`, `redeemed`, `unpaid`. Az `AHU-…` kódot a foglalási ablak „Kedvezménykód” mezője használja (más kuponrendszer nincs).

### 6.9 Ajánlatkérés (`inquiry.mjs`)

`kind`: `house` („Egész ház, 2 fő”) vagy `four` („Két apartman együtt, 3–4 fő”). Kötelező: név, e-mail **vagy** telefon, `terms`. Honeypot, a `<` és `>` jelek kiszedése, tárolás `inq/<idő>-<AJ-id>` alatt a `cms` tárban. A szerver megnézi, szabad-e mindkét apartman a kért napokra (ezt csak a tulajdonos látja). A WhatsApp gomb az előre kitöltött üzenettel a `wa.me/36702458403` címre mutat.

### 6.10 Sebességkorlátok (Blobs-alapú, fix ablakos)

| Mire | Korlát |
|---|---|
| Foglalási kérelem (átutalás/SZÉP) | 6 / óra / IP, 120 / nap összesen |
| Ajánlatkérés | 5 / óra / IP, 80 / nap összesen |
| Admin belépés | 8 / 15 perc / IP |
| Admin belépőkód kérése | 3 / óra / e-mail (5 próba / kód, 10 percig érvényes) |
| CMS mentés | 120 / perc |
| CMS publikálás | 20 / óra |

---

## 7. CMS (`/admin/`)

- Felület: `dist-opus/admin/{index.html,admin.css,admin.js}` (magyar nyelvű). API: `netlify/functions/admin.mjs`, útvonalak: `login`, `me`, `logout`, `content`, `save`, `revert`, `changes`, `preview`, `publish`, `history`, `restore`, `audit`, `inquiries`, `inquiry-status`.
- **Működés:** a `template.json` az oldal teljes HTML-jét tartalmazza három nyelven, a szerkeszthető szövegek helyén jelölőkkel. A tulajdonos felülírásai (`overrides`) a `cms` Blob tárban vannak (`draft`, `published`, verziók `ver/…`). A `page.mjs` kérés-időben a sablonból és a közzétett felülírásokból rendereli az oldalt. Felülírás nélkül a kimenet **bájtra azonos** a statikus oldallal (ezt a `cms.test.mjs` ellenőrzi).
- **Védelem:** zárolt elemek (árak, az árat tartalmazó szövegek, elérhetőségi adatok, a JS-ből felépülő szövegek) nem szerkeszthetők; hosszkorlát elemtípusonként; tiltott kifejezések (`BANNED` az `admin.mjs`-ben: „kupola/dome”, „4 csillag”, hamis sürgetés); az árat nem lehet beírni; a `<` `>` jel tiltott. Ha a sablon megváltozik egy elem alatt, a régi felülírás elavultnak számít és kimarad (`b` hash).
- **Három nyelv:** minden szerkeszthető elemnek van HU/EN/DE mezője. Nem szerkeszthető: az ár alatti felirat, az árat tartalmazó GYIK-válaszok (9 db), a „Szabad időpontok” sáv új szövege (JS-ből épül).
- **Közzététel:** a piszkozatból verzió készül, a `page` gyorsítótár-címke törlődik (`purgeCache`), a változás azonnal látszik. A korábbi verziókra vissza lehet állni (`restore`), a naplóban (`audit`) minden belépés és változtatás szerepel.
- **Belépés:** két mód. (1) jelszó: `ADMIN_PASSWORD` (egy tulajdonos); (2) e-mail kód: `ADMIN_EMAIL` (vesszővel több) + `RESEND_API_KEY`. Munkamenet: `__Host-sid` süti (Secure, HttpOnly, SameSite=Strict), 12 óra tétlenség vagy 7 nap után lejár. Minden módosító kérés CSRF-fejlécet (`x-csrf`) és azonos eredetet követel.
- **Ajánlatkérések:** a „Több” menüben „Ajánlatkérések” lista („Kezelve” gombbal), a kezdőlapon értesítősáv. Itt jelennek meg a foglalási kérelmek (átutalás/SZÉP) is.
- **Nem kész:** képcsere és blog („Hamarosan”). A foglalás-kezelő admin terve: `ADMIN-DESIGN.md`, `admin-wireframe.html`.

---

## 8. Tartalmi szabályok (tulajdonosi döntések, érvényesek)

- **Szóhasználat:** nincs „kupola”/„dome” (helyette „fedett jakuzzi/jacuzzi”, németül „überdachter Whirlpool”), nincs „domb” a címben, nincs „alusztok”, nincs gondolatjel a mottókban, nincs „4-star/4 csillag”, nincs hamis sürgetés („csak ma”, „utolsó szabad”), nincs ellenőrizetlen állítás. Az utalvány megajándékozottját **„megajándékozott”**-nak hívjuk (nem „meglepett”). Tegező, többes szám második személy („Válasszatok…”; németül „ihr”).
- **Hero cím:** „Végre csak *egymásra* figyeltek.” Nincs telefonszám a fejlécben.
- **Fizetés:** online, 100% előre; bankkártya (Stripe), átutalás, SZÉP kártya (OTP, MBH, K&H). A foglalási ablakban nincs „(100% előleg)” felirat.
- **Értékelések:** csak ellenőrzött forrásból (Google 5,0, 10 vélemény; Booking.com 9,8). Idézetet nem találunk ki.
- **Wellness:** a jakuzzi és a szauna a másik apartman vendégeivel **közös**, kivéve ha az egész házat foglalják. Kérésre 2 órás privát esti idősáv adható (a konkrét órák szándékosan nincsenek kiírva).
- **Állatot, dohányzást, bulit** nem engedélyezünk (a „nyugalom a vendégeinké”).
- **Elérhetőség:** +36 70 245 8403, hello@aranyhegyapartmanhaz.hu, Aranyhegy u. 110., 2111 Szada, NTAK: MA25120826. Bejelentkezés 15:00-tól, kijelentkezés 11:00-ig.
- **Dizájn:** nem sablonos kinézet. Ne cseréld általános (kész témás) megoldásra; a betűk, a színek és a gombstílus a 5.4 pontban rögzítettek.

---

## 9. Tesztek

| Fájl | Mit fed | Hogyan |
|---|---|---|
| `test/cms.test.mjs` | Sablon renderelése (HU/EN/DE zero-diff), felülírások, JSON-LD szinkron, validáció, preflight | `node test/cms.test.mjs`, nem kell szerver |
| `test/booking.test.mjs` | Foglalási logika, zárak (memóriabeli tárral) | `node`, nem kell szerver |
| `test/voucher.test.mjs` | Utalvány-logika, PDF | `node`, nem kell szerver |
| `test/api.test.mjs` | Foglalási API (`/api/quote`, `/api/reserve`, `/api/calendar`, versenyhelyzet) | `netlify dev` :8888 |
| `test/reserve-v2.test.mjs` | Új űrlapmezők, számlázási cím, cég, átutalás/SZÉP kérelmek, számla-XML | `netlify dev` :8888, `ADMIN_PASSWORD` |
| `test/inquiry-api.test.mjs` | Ajánlatkérés és admin lista | `netlify dev` :8888, `ADMIN_PASSWORD`, `CMS_NO_RATELIMIT=1` |
| `test/cms-api.test.mjs` | CMS API | `netlify dev` :8888, `ADMIN_PASSWORD` |
| `test/voucher-api.test.mjs`, `voucher-pdf-api.test.mjs`, `voucher-pdf-lang.mjs` | Utalvány API és PDF (nyelvenként) | `netlify dev` :8888 |
| `test/cms-live.test.mjs` | Az **élő** bemutatót hívja | `ADMIN_TEST_PW` környezeti változó kell |

A helyi tesztek alapértelmezett admin jelszava a tesztfájlok elején látható; ez csak a helyi `netlify dev` jelszava lehet, **soha ne ez legyen az éles jelszó**.

Az API-tesztek **véletlen dátumablakot** használnak, hogy az ismételt futások ne ütközzenek a helyi tárral. Ritkán egy futás egy ütközés miatt hibázhat (pl. az egész ház utalványos teszt); újrafuttatva zöld. Ezt tudjuk, de nincs végleg kiküszöbölve.

A böngészős (Playwright) ellenőrző szkriptek nem részei a repónak. A módszerüket a 4.4 pont írja le.

---

## 10. Éles indulás: ellenőrzőlista

A sorrend szándékos.

1. **Új Netlify site vagy tiszta tár.** A bemutató Blobs tárában teszt-adatok vannak (demó foglalások, utalványok, ajánlatkérések, CMS-piszkozatok). Éles indulásnál kezdj tiszta tárral.
2. **Környezeti változók** (11. fejezet). Először Stripe **tesztmódos** kulcsokkal.
3. **Stripe:** webhook bekötése, tesztfoglalás végigvitele; **a HUF `×100` összeg ellenőrzése** (6.5); bankkártyás és `async` fizetés; lejárt tartás feloldása.
4. **Számlázz.hu:** egy tesztszámla élő ügynökkel; ÁFA-kulcs és számlatípus a könyvelővel.
5. **E-mail:** Resend domain-igazolás (SPF/DKIM), foglalási, utalvány- és ajánlatkérési levelek végigpróbálása mindhárom nyelven.
6. **iCal-szinkron** (Booking.com, Airbnb, egyéb csatornák) **kötelező élesítés előtt**, különben dupla foglalás lehet. A rendszer jelenleg csak a saját zárait ismeri. Az `ADMIN-DESIGN.md` naptár- és ütemezési terve számol külső iCal-forrással (import és export), ez kiindulás.
7. **Domain és DNS.** A domain jelenleg másutt van hostolva Google Workspace e-mailekkel. Előbb aldomainen próbálj. **Az MX rekordokhoz ne nyúlj.** A DNS-hozzáférést a tulajdonostól kapod.
8. **`noindex` eltávolítása, négy helyen** (mind a négyet, különben az oldal nem kerül a keresőkbe):
   - `sync.py`: a `meta = '<meta name="robots" content="noindex,nofollow">'` beszúrás (innen kerül az oldalakba, az EN/DE ebből származik);
   - `dist-opus/_headers`: `X-Robots-Tag: noindex, nofollow`;
   - `dist-opus/robots.txt`: `Disallow: /`;
   - `netlify/functions/_render.mjs`: a `PAGE_HEADERS` `x-robots-tag` fejléce (a kérés-időben generált oldalak ezt küldik).

   Az `/admin/` maradjon `noindex`. Utána írj `sitemap.xml`-t, és add meg a Search Console-ban.
9. **Törlendő próbaoldalak:** `dist-opus/fonts.html`, `dist-opus/trajan-test.html` (és az `opus/` mappa megfelelője).
10. **Betűkészlet:** a valódi Trajan Pro-hoz Adobe Fonts kit kell (a tulajdonos adja a linket). Utána az első betűcsaládot cseréld a `--display`-ben és a `.ahb-h h2` szabályban. Addig a Cinzel látszik.
11. **Jogi oldalak:** az ÁSZF és az Adatkezelési nyilatkozat jelenleg az **eredeti oldalról** jön (magyarul; az EN oldalról az angol változatra mutat, a DE oldalról a magyarra). A „Foglalási feltételek” és a „Házirend” nincs önálló oldalként: a lábléc „Házirend” linkje a saját GYIK „Az apartmanok és a házirend” csoportjára görget. Kell: német jogi szövegek, **ügyvédi átnézés** (a német Stornogebühr- és GYIK-megfogalmazások asszisztensi fordítások, jogilag nem ellenőrzöttek), önálló Házirend és Foglalási feltételek oldal, az utalvány feltételeinek (érvényesség, beváltás) jogi rögzítése.
12. **Adatkezelés (GDPR):** a Google Térkép (görgetéskor tölt), Google-források és a foglalási adatok miatt az adatkezelési tájékoztatót frissíteni kell. A foglalási rekordok (név, e-mail, telefon, cím) a Blobs tárban maradnak, **nincs törlési/megőrzési feladat**; döntsd el a megőrzési időt és építs hozzá törlést. Nincs süti-szalag: ha analitikát vagy marketing-sütit tesztek, kell.
13. **NTAK-adatszolgáltatás** nincs automatizálva; egyeztess a tulajdonossal.
14. **ÁFA az utalványokra:** könyvelői döntés (a Számlázz.hu XML ettől függ).
15. **Netlify használat:** a bemutató kétszer elérte az ingyenes keretet (503 `usage_exceeded`), mert az oldal kérés-időben generálódik. Éles forgalomra fizetős csomag kell, és figyeld a függvény-hívásokat. A `page.mjs` hosszú CDN-gyorsítótárat használ, ami sokat enyhít, de a mérést nem végeztük el.
16. **Elérhetőség/hírlevél/analitika:** nincs bekötve. Konverziómérés (foglalás elindítva, foglalás kész, ajánlatkérés) nincs; kell hozzá esemény-kód a foglalási ablakba.
17. **Rate limit, CSP:** a `_headers` és a `PAGE_HEADERS` szigorú alapbeállítás. Ha harmadik fél szkriptet (analitika, chat) adsz hozzá, a CSP-t bővíteni kell.
18. **Végső próba:** teljes foglalás valódi (kis összegű) kártyás fizetéssel, utalvány-vásárlás és beváltás, ajánlatkérés, CMS-szerkesztés és publikálás, mindhárom nyelven, telefonon és asztalon.

---

## 11. Környezeti változók (értékek NINCSENEK a repóban)

Beállítás: Netlify → Site configuration → Environment variables. **Az értékeket a tulajdonostól kapod, soha ne kerüljenek a repóba, chatbe vagy naplóba.**

| Név | Mire kell |
|---|---|
| `STRIPE_SECRET_KEY` | Valódi kártyás fizetés. **Amint be van állítva, a DEMÓ módok (`/api/demo-pay`, `demo-pay` az utalványnál) kikapcsolnak.** |
| `STRIPE_WEBHOOK_SECRET` | Webhook aláírás-ellenőrzés. Nélküle a webhook 503. |
| `SZAMLAZZ_AGENT_KEY`, `SZAMLAZZ_VAT`, `SZAMLAZZ_PREFIX` | Számlázz.hu (kulcs, ÁFA-kulcs, alap `AAM`; számlaelőtag, alap `AH`). |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | E-mail küldés. |
| `OWNER_EMAIL` | A tulajdonos értesítései (ajánlatkérés, foglalási kérelem). Ha hiányzik, az `ADMIN_EMAIL` első címére megy. |
| `ADMIN_EMAIL` | A CMS e-mail-kódos belépésének engedélyezett címe(i) (vesszővel). |
| `ADMIN_PASSWORD` | A CMS jelszavas belépése. **A jelenlegi egy gyenge TESZT jelszó, amely nyilvánosságra került (egy üzenetben): éles előtt erős jelszóra kell cserélni, vagy el kell hagyni és az e-mail kódos belépést használni.** |
| `CMS_NO_RATELIMIT` | Csak helyi teszthez (`1`). **Élesben ne legyen beállítva.** |

A bemutatón tudomásunk szerint **csak** az `ADMIN_PASSWORD` van beállítva. A többi hiányzik, ezért fut DEMÓ módban, e-mail és számla nélkül. A Netlify felületén ellenőrizd a tényleges állapotot.

---

## 12. Ismert korlátok és nyitott pontok

- **Átutalás és SZÉP** kézi folyamat: nincs automatikus fizetési tájékoztató e-mail a vendégnek, nincs fizetés-megerősítő felület, a napokat sem zárolja. A foglalás-kezelő admin (terv) ezt oldaná meg. Addig a tulajdonos a CMS „Ajánlatkérések” listájából dolgozik.
- **Kedvezménykód** csak ajándékutalvány lehet; nincs kuponrendszer.
- **Település-mező:** szabad szöveg, nincs irányítószám-alapú kitöltés (irányítószám-adatbázis kellene).
- **Apple Pay / Google Pay:** a Stripe Checkout felajánlja, ha a fiókban be van kapcsolva; a bemutatón nem ellenőrizhető.
- **Utalvány érvényessége:** a rendszer 12 hónapig érvényes (`validUntil`), és az **érkezés napját** vizsgálja (`in > validUntil` esetén elutasít); a tartózkodás vége túlnyúlhat az érvényességen. Ha a szerződési feltételek mást írnak elő, igazítsd (`reserve.mjs`, `voucher_after` hiba).
- **Egyidejű foglalás:** az éjszaka-zárak feltételes írással (`onlyIfNew`) készülnek, plusz egy ellenőrző újraolvasás. Ezt versenyhelyzet-teszt fedi (`api.test.mjs`), de valódi éles terhelés alatt még nem próbálták; indulás előtt érdemes párhuzamos kérésekkel végigjátszani.
- **CSS konszolidálás** (4.3).
- **Képek kettős helye** (`opus/` és `dist-opus/`, 3. fejezet).
- **A hero videók** (`dist-opus/vid`, ~22 MB) és a képek (~56 MB) nagyok. A képeknek van `webp` változata és `srcset`-je. A hero-videó nem töltődik be adatspórolós (`saveData`), 2G vagy csökkentett mozgás (`prefers-reduced-motion`) beállításnál.
- **Mérés nélküli állítások:** az oldal teljesítménye (Core Web Vitals) éles forgalomon nincs mérve.

---

## 13. Hasznos tudnivalók

- Egy foglalási ablak tesztelése helyben: a keresősávban (`#book`) válassz dátumot és apartmant, majd a „Foglalás indítása” gomb nyitja az ablakot. DEMÓ módban bankkártyás fizetésnél a megerősítés a `/api/demo-pay`-en át történik, és megerősített képernyőt ad.
- Utalvány-kódformátum: `^AHU-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$`.
- Stripe-ból visszatérés: az oldal a `?booking=ok|cancel&id=…&t=…` és `?voucher=ok|cancel&c=…&t=…` paraméterekből dolgozik.
- A foglalási ablak nézeteinek azonosítói (teszteléshez): `ahbLN` (vezetéknév), `ahbFN`, `ahbE`, `ahbCt`, `ahbZ`, `ahbCi`, `ahbSt`, `ahbP`, `ahbDc`, `ahbPcard`, `ahbPtrf`, `ahbPszep`, `ahbC1`, `ahbC2`.
- Kérdés esetén a tulajdonos: Balázs Zoltán (CorvinAI Labs).
