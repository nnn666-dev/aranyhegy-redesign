# Aranyhegy Admin: tervdokumentum (v1, még nem épül)

Forrás: 6 párhuzamos szakértői szempont (üzemeltetés, UX/UI, biztonság és GDPR, pénzügy, architektúra, tulajdonos-szerepjáték). A szakértők nem futtattak semmit és nem nyitottak meg weboldalt: minden Netlify-limit, magyar jogi és NTAK-állítás ELLENŐRZENDŐ.

## 1. Alapelv
Telefon-első, magyar nyelvű, 5 menüpont. Az első képernyő 5 másodperc alatt megmondja: ki érkezik, ki távozik, mi a baj. Csak az épül meg, ami egy 2 apartmanos háznál naponta kell. Az adat ugyanazt az éjszaka-zárat használja, mint a weboldal, ezért az admin sem tud duplafoglalást csinálni.

## 2. Navigáció (telefonon alsó sáv, asztalon bal oldalsáv)
1. Ma
2. Naptár
3. Foglalások (+ Új telefonos foglalás)
4. Utalványok
5. Több: Vendégek, Kimutatások, Árak és szabályok, Értesítések, Beállítások, Napló

Lebegő "+" gomb: Új telefonos foglalás, Napok zárolása, Utalvány keresése. Globális kereső (név, e-mail, telefon, AH-kód, AHU-kód).

## 3. Ma képernyő (fontossági sorrend)
1. Teendők (piros/borostyán, csak ha van): fizetésre vár, lejáró tartás, sikertelen fizetés, hiányzó vendégadat, számlahiba, "fizetett, de a nap elkelt".
2. Smaragd és Zafir kártya: állapot (foglalt/érkezik 15:00/szabad/zárolt) és a következő esemény; "Ház" jelzés, ha az egész ház foglalt.
3. Érkezők ma: név, hívás gomb, létszám, fizetve?, vendégadat/NTAK állapot, kulcsdoboz-kód elküldve?
4. Távozók ma: apartman, takarítás állapot (Takarítandó, Kész).
5. Következő 14 nap: 2 soros csík, koppintásra Naptár.
6. Lebegő: "Szabad-e?", "Telefonos foglalás", "Utalvány keresés".
Nincs grafikon az első képernyőn.

## 4. Naptár
Havi nézet, soronként Smaragd | Zafir, Ház-foglalás mindkét sort átfogja. Színek: fizetett (zöld), tartás/fizetetlen (borostyán), zárolt (csíkozott szürke), utalványos (lila), külső iCal (kék). Két napot megérintve: "Szabad: Smaragd ✔ Zafir ✔ Ház ✔" kész árral, majd Új foglalás vagy Zárolás. "Szabad hétvégék" lista (következő 8).

## 5. Telefonos foglalás (cél: 60 mp, egy oldal)
Dátum érintés → szabad/ár egyből → apartman → név, telefon, e-mail (nem kötelező), létszám, nyelv, megjegyzés → fizetés: Stripe-link SMS/e-mailben (tartás 24 óra, állítható) VAGY "Már fizetve" (átutalás, SZÉP, készpénz, kötelező hivatkozás). A forrás "Telefon" címkét kap. Ha a napot webes tartás fogja, az ablak megmondja, meddig.

## 6. Foglalás részletei
Fejléc: AH-azonosító, állapot, apartman, dátumok. Kártyák: Vendég (tap-to-call), Fizetés (összeg, Stripe-azonosító, utalvány), Állapot (e-mail, számla, NTAK), Előzmények (napló, mondatokban). Műveletek: Módosítás, Lemondás, Fizetve jelölés, Visszaigazolás újraküldése, Kulcsdoboz-kód küldése, belső megjegyzés.

## 7. Szabályok a műveletekre
- Lemondás/visszatérítés: összefoglaló lap, a gomb a következményt nevezi meg ("Lemondás és 60 000 Ft visszatérítés"), szabály szerinti alapérték (felhasználatlan összeg elvész), felülírás indoklással. Elsőként felkínált alternatíva: utalványra váltás.
- Módosítás: a "10:00-ig egyszer ingyen" szabály jelezve (Használva: 0/1), új éjszakák előbb zárolva, utána a régiek felszabadítva.
- Zárolás: azonnal él, 8 másodperces Visszavonás. Megerősített foglalással ütköző zárolást elutasít és megmutatja az ütközőt.
- Alacsony kockázat: azonnali + Visszavonás. Közepes: áttekintő lap. Magas (lemondás, visszatérítés, törlés): megnevezett következmény, piros gomb, 50 000 Ft felett a foglalás utolsó 4 karakterének beírása.
- Soha nem törlünk fizetett foglalást, utalványt, könyvelési tételt, naplót. Csak lemondás, érvénytelenítés, archiválás.

## 8. Utalványok
Egy keresőmező (kód, vevő, megajándékozott, e-mail). Állapot, csomag, lejárat, kapcsolódó foglalás. Műveletek: PDF újraküldése (alapértelmezés: a vevő e-mailjére), érvényesség hosszabbítása (naplózva), telefonos beváltás, érvénytelenítés. Lista: lejáró 60 napon belül, ki nem váltott utalványok összértéke.

## 9. Bejelentkezés (döntési javaslat)
- Alap: Google-bejelentkezés (OIDC + PKCE), pontos e-mail-engedélylista, `email_verified` kötelező.
- "Megbízható eszköz": telefonon 14 nap üresjárati / 30 nap abszolút lejárat, ujjlenyomat/arcfeloldás a telefon zárolásán át. Idegen eszközön 30 perces üresjárat, 12 órás maximum.
- Tartalék: e-mailes belépőlink (Resend), 10 perc, egyszeri, megerősítő gombbal (a levélszűrők ne égessék el).
- Később: passkey.
- Munkamenet: szerveroldali, átlátszatlan azonosító, `__Host-sid` süti (Secure, HttpOnly, SameSite=Strict), CSRF-fejléc, Origin-ellenőrzés, forgatás, "Kijelentkezés mindenhol", új eszköz értesítés.
- Szerepek: Tulajdonos (mindent) és Segítő (nincs pénz, nincs vendég e-mail/telefon alapból, csak takarítás és érkezések, megjelenítés naplózva).
- Kiszolgálás nélküli kizárás ellen: második tulajdonos-fiók (házastárs/fiú) + papíros tartalék kód.

## 10. Adatmodell (Blobs marad, nem váltunk adatbázisra)
Igazságforrás: `booking/{id}`, `night/{apt}/{nap}`, `voucher/{kód}`. Új, újraépíthető indexek: `idx/arr/{nap}/{id}`, `idx/dep/{nap}/{id}`, `idx/status/{állapot}/{id}`, `idx/created/{hó}/{id}`, `guest/{hash}`. Új rekordok: `block/…`, `ical/feed|ev/…`, `refund/{id}/{n}` (előbb "szándék", aztán Stripe), `audit/{nap}/{ts}`, `idem/…`, `settings/main`, `job/…`. A `night/` kapja a `blocked` és `external` állapotot is; a felszabadító kód csak a saját `bid`-jű zárat törölheti.
Váltás Postgresre csak akkor, ha ad-hoc riport, többrekordos tranzakció vagy gyakori indexcsúszás kell. Az összes tárolóhívás az `_lib.mjs` mögött marad.

## 11. API (mind /api/admin/*, mind közös őrön megy át: munkamenet, CSRF, szerep, tiltás alapértelmezetten)
login/logout · dashboard · bookings (lista, részlet, létrehozás, szerkesztés, move, cancel, confirm, refund, resend, invoice) · blocks · calendar · guests · settings · ical/feeds · vouchers · audit · maintenance/reindex · export. Minden módosítás Idempotency-Key-jel; a szerkesztések `If-Match` etaggel.

## 12. Pénz és számlázás
- Soronkénti, csak hozzáfűzhető főkönyv foglalásonként: terhelés, visszatérítés, vita, díj, kifizetés, Stripe-azonosítókkal.
- Visszatérítés + sztornó számla együtt követett művelet. Stripe HUF-összeg egész forint, ×100.
- Átutalás/SZÉP kézi "fizetve" jelölés dátummal és hivatkozással.
- Kimutatás (csak 6): havi bevétel, foglaltság, átlagár, utalvány-kötelezettség, visszatérítés/elveszett összeg, fizetés és díj. CSV-export a könyvelőnek (UTF-8 BOM).
- **Könyvelői döntés előtt nem automatizálunk**: előlegszámla vs végszámla időzítése, ÁFA-kulcs, utalvány egy- vagy többcélú, elveszett összeg kezelése, SZÉP-folyamat.

## 13. Visszaélés elleni védelem (a nyilvános oldalon, az admin előtt kell)
1. `/api/demo-pay` zárva az éles környezetben (jelenleg az előnézeten nyitva van).
2. Tartásplafon: 1 aktív tartás e-mailenként, 2 IP-nként, a foglalható éjszakák legfeljebb 30%-a tartható egyszerre; tartás 10-15 perc.
3. Turnstile a foglalón és az utalványrendelésen, mézesbödön mező, sebességkorlát.
4. Utalványkód: nincs 12 karakternél rövidebb; az ellenőrző végpont egyforma választ ad érvénytelenre és ismeretlenre, korlátozva.
5. Webhook: nyers törzs aláírás, 5 perc tolerancia, eseményazonosító-tárolás.

## 14. Értesítések és ütemezett munkák
Napi összefoglaló 07:30 (Budapest idő), azonnali értesítés új foglalásról, fizetésről, sikertelen fizetésről, lemondásról, ütközésről, iCal-hibáról. Csendes órák 22:00-07:00 egy reggeli levélbe. Csatorna: e-mail (Resend) + Telegram-bot (ingyenes); SMS/WhatsApp később. Munkák: tartás-takarító (10 perc), iCal-szinkron (30 perc), emlékeztetők, utalvány-lejárat, egyeztető (éjszaka), mentés (éjszaka, külön tárba). Mindegyik ismételhető, mutex kulccsal, az idő Europe/Budapest szerint számolva.

## 15. Frontend
Preact + htm, helyi `/admin/vendor/` fájlokból, build nélkül, hash-útválasztóval. Saját CSS-grid naptár. PWA: manifest és egy kis szolgáltatási munkás az alkalmazáshéjhoz; offline csak olvasás ("Utoljára frissítve 14:02"), írás nem. Magyar elsődleges, angol másodlagos. Formátumok: "60 000 Ft", "2026. nov. 17.", hét hétfővel kezdődik, mindig Europe/Budapest.

## 16. Vizuális rendszer
Papír #f4efe6, kártya #fbf8f2 (1px #e4dccb), oldalsáv #14120e, szöveg #14120e / #5c554a. Elsődleges gomb #b8915a (ink szöveggel), hover #7a5a2c; szöveg aranyra soha (kontraszt ~2,9:1), szöveg #7a5a2c. Lemondás-gomb #a8322a. Cinzel: címek és kis címkék. Jost 16px+: törzs. Libre Caslon: üres állapot, köszöntés. Sötét mód: nincs v1-ben. Gombok pill, kártyák 4px. Státuszcsipek ikonnal, sosem csak szín: Függőben #fbeacb/#7a4a00, Megerősítve #dcebd9/#1f5a2e, Lejárt #e8e4dc/#5c554a, Lemondva #efe0dc/#8a3a2c, Sikertelen #f6d8d4/#a8322a, Beváltott #e3dcee/#4a3a78. Érintési cél 44px, naptárcella 48px, sosem natív `confirm()`.

## 17. Mit NEM építünk
Dinamikus árazás, csatornakezelő (kétirányú), CRM/hűségprogram, üzenetközpont, kanban, egyéni számlaszerkesztő, hibakezelő szerepkonfigurátor, bevételi grafikon-vezérlőpult, téma-szerkesztő, több nyelvű admin a HU/EN felett.

## 18. Felépítési sorrend
**0. fázis (az admin előtt, kb. fél nap):** demo-pay lezárása élesben, tartásplafon és Turnstile, nyers törzs webhook-ellenőrzés, mentés a külön tárba, backfill-szkript szárazon.
**1. fázis (kb. 1-2 nap):** belépés (Google + tartalék link, munkamenet, CSRF, napló), Ma, Naptár, Foglalások lista/részlet, Új telefonos foglalás (közös zár), Zárolás, Lemondás visszatérítés nélkül, napi összefoglaló e-mail, mentés.
**2. fázis (3-5 nap):** indexek + backfill, tartás-takarító, egyeztető munka, visszatérítési főkönyv + Stripe-visszatérítés (Stripe-kulccsal), módosítás/áthelyezés, vendégek, iCal export és import, beállítások és árak, Telegram-értesítés, utalványkezelés.
**3. fázis:** PWA, kimutatások és CSV, számlázás a Számlázz.hu teszt után, takarítási lista, NTAK-állapot, adatbázis-értékelés.

## 19. Nyitott kockázatok
- Booking.com és Airbnb: a tulajdonos-szerep ezt "deal breaker"-nek nevezte. Az iCal-import/export ezért 2. fázisban kötelező, és a naptárnak mutatnia kell a "szinkron: 10 perce".
- A jelenlegi weboldal a régi Appartman rendszerrel nem szinkronizál. Éles váltás előtt a két rendszer között duplafoglalás lehet.
- NTAK/VIZA: a jogi kötelezettség és a mezők nincsenek ellenőrizve. Az admin csak állapotot mutat, feltöltést nem végez, amíg ez nincs tisztázva.
- A szakértők nem futtattak semmit; a Netlify-limitek (ütemezett függvény 30 mp, ingyenes csomag) és a Resend-limit ellenőrizendő.
- A tulajdonos-szerepjáték egy szimuláció, nem a valódi tulajdonos véleménye. A valódi tulajdonossal le kell tesztelni.
- Az oldal korábban kétszer kapott 503 "usage exceeded" hibát, az admin és az ütemezett munkák invokációt fogyasztanak: fizetős csomag szükséges lehet.
