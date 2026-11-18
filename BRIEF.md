# Brief: Aranyhegy Apartmanház, best-in-Hungary boutique accommodation website

Goal: more occupancy (direct bookings + calls). Build a stunning, 10/10, award-level single-page website prototype (Hungarian). Taste: luxury boutique hotel, editorial, cinematic, restrained. Not a template look. Anti-slop: no generic gradients-on-white, no stock-feel, no emoji icons.

## Deliverable
ONE self-contained `index.html` (inline CSS+JS, Google Fonts allowed) written to your OUTPUT DIR, using images from `~/aranyhegy-redesign-2027/img/` (copy that folder into your output dir as `img/`). Then render it with headless Chrome (write a .sh file; --headless=new --hide-scrollbars --virtual-time-budget=8000; widths 1440 and 500), look at the screenshots with vision_analyze, and fix defects. Iterate at least 2 rounds. Also node --check the inline JS.

## Hard facts (owner-confirmed, use exactly)
- Aranyhegy Apartmanház, Szada, Aranyhegy u. 110., ~30 min from Budapest. Tel +36 70 245 8403, hello@aranyhegyapartmanhaz.hu, license MA25120826. 4-star.
- 2 apartments, 30 m2, couples, max 4 guests in the house: Smaragd (upstairs, emerald green + gold, panoramic terrace), Zafir (ground floor, sapphire blue, own terrace). 160x200 bed, AC heating/cooling, underfloor heating, kitchen, capsule coffee, smart TV, Wi-Fi, board games.
- Price: Apartmanonként 60.000 Ft/éj ALWAYS, no minimum stay, no "tól". Whole house 90.000 Ft/éj (phone booking, mark [VERIFY] it must be bookable online). Tourist tax 0 Ft. 100% deposit at booking, no-show 100%. Check-in 15:00, check-out 11:00. No pets, smoking, parties.
- Wellness: outdoor jacuzzi under a transparent dome, Finnish + infrared sauna, year-round; SHARED with the other apartment's guests unless whole house booked. Never say "saját jakuzzi" or "kettesben" over the jacuzzi. Outdoor pool SEASONAL, CLOSED in autumn (do not show as available now). 2400 m2 garden, grill, loungers, free e-scooters, egg chairs.
- Rating: Google 5.0 (6 reviews); Google 5.0 = 10 reviews (2026-11-12); Booking.com 9.8 = 5 reviews. Name the source. Do NOT invent review quotes. SZÉP card NOT confirmed: keep out.
- Booking links go to https://aranyhegyapartmanhaz.hu/#book (GoDirect engine). Story from owners: "We are not professional designers; we shaped every detail ourselves."

## Rules
- Never invent features, distances, hours, awards, packages. Anything unknown gets a visible-in-comment `[VERIFY]`. No AI-generated people/places. No em-dashes anywhere in copy. Hungarian copy, warm, concise, no clichés.
- Photos: real only, from img/ (file names describe content: hero-autumn, aerial-*, smaragd-*, zafir-*, sauna, jacuzzi, dome*, garden-*, eggchair, scooters, bbq). No photos with people. Look at the images before choosing which goes where.
- Technical: zoom enabled, 44px targets, prefers-reduced-motion, semantic HTML, alt text, lazy-load below fold, sticky mobile call+book bar, booking bar must be visible above the fold at 1440x900 and reachable on mobile, hero text contrast AA, JSON-LD LodgingBusiness schema (only verified facts).
- Conversion: hero promise, instant booking bar, trust, scarcity (only 2 apartments, 4 guests), apartment cards with gallery, wellness, seasonal reasons to come, location, FAQ, final CTA.
- Make it memorable: one signature interaction or layout idea that no local competitor has (scroll storytelling, apartment color theming, day-to-night shift, etc.). Keep it performant.
- Reference of the weak previous version: ~/aranyhegy-redesign-2027/index.html (Sonnet baseline). Beat it clearly. Do not copy it.

Finish by printing: output path, what the signature idea is, list of [VERIFY] items.
