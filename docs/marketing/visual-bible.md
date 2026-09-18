# VAYA Marketing Site — Visual Bible

Status: **Phase 2 design document. Not implemented. No code in this repo changes as a
result of this file. Companion to `docs/marketing/cinematic-storyboard.md`, which
defines the shots this bible must stay consistent across.**

This is the source of truth every future rendered/generated asset must be checked
against. Where a value already exists in the codebase (a hex token, a real component,
a real copy string), it is cited by path, not reinvented — per this project's own
"don't dilute the 3-tone brand palette" rule (`CLAUDE.md`, "Things that must NOT be
changed casually").

---

## 1. VAYA vehicle

**Core decision, stated explicitly rather than assumed:** VAYA is peer-to-peer
carpooling — drivers use their own personal cars; there is no VAYA fleet, and the
product has no physical driver-branding mechanism (sticker, livery, badge) anywhere in
the current spec. Painting the hero car in VAYA livery would misrepresent the product
the way a fabricated statistic would. **The car in this film carries zero exterior VAYA
branding.** All VAYA identity in the film lives in the phone UI (real, existing pattern)
and the closing graphic (Act 9). This is flagged as an explicit creative decision in the
storyboard's summary — if the team wants an idealized "hero car" purely for commercial
polish (common in category advertising even without a literal fleet claim), that is a
legitimate alternate call, but it should be made knowingly, not by default.

- **Body style:** A contemporary compact-to-mid-size sedan or hatchback — the class of
  car actually common as a personal/family vehicle in urban and intercity Tunisia
  (think: Peugeot 208/308, Renault Clio/Mégane, Volkswagen Golf/Polo class — described
  generically here, not as a licensed brand reference, since no real manufacturer
  partnership exists). Avoid SUV/luxury-executive framing — it reads as aspirational-fleet,
  not "a real person's car," undermining the peer-to-peer authenticity the story depends
  on.
- **Color/material:** A single, muted, warm-neutral exterior — off-white/cream, warm
  graphite, or deep navy (drawing from the same family as `packages/design-system`'s
  `primaryDark`/cream neutrals, not the emerald accent — the car should read as *a real
  car*, not a brand-colored object). Satin-to-semi-gloss paint finish, not showroom-glossy
  (avoids the "rendered car" tell).
  - Do not use the emerald accent (`#3FBE85`/`#2E9E6C`) as the car's paint color. It is
    reserved for UI/light accents (taillights, the phone UI, the route line) precisely
    so it reads as "the VAYA layer" over an otherwise ordinary car — losing that contrast
    would blur the film's own visual grammar.
- **Wheels:** Understated factory-style alloys, no aftermarket/tuner styling — reinforces
  "ordinary, real, well-kept" over "customized."
- **Windows:** Lightly tinted rear/side glass (common, realistic, and useful for S1–S2's
  reflection-based transition), clear windshield.
- **Interior:** Cloth or simple leatherette seats in a warm neutral tone (cream/charcoal),
  clean and lived-in (not showroom-sterile) — a coffee cup holder, a phone mount, nothing
  cluttered or messy. Dashboard trim in dark neutral plastic/soft-touch material.
- **Dashboard:** A factory-standard dashboard (not a fictional futuristic HUD) with one
  deliberate addition: a **phone mount** (windshield or dash-top, suction/clip-style,
  the kind actually sold in Tunisia) holding the driver's own phone — this is the single
  physical prop the whole Act 3–4 sequence depends on, and it must look like an
  aftermarket accessory a real driver bought, not integrated OEM tech.
- **Phone mount:** Simple black/dark-gray clip mount, unbranded, angled toward the
  driver's natural sightline (safety-plausible, not distractingly close).
- **VAYA branding placement:** Exclusively digital — the mounted phone's screen (app UI,
  rendered as a real HTML/CSS overlay per the storyboard) and the Act 9 closing graphic.
  **Nowhere on the car itself.**

---

## 2. Characters

General continuity rule for all three: **no character is a generic stock-photo type.**
Each needs one specific, memorable, consistently-reproducible visual signature (a
hairstyle, a garment color, a posture habit) that a viewer — or an asset pipeline —
can use to instantly confirm "yes, that's still Aysha" across ten different renders.

**Open decision, flagged rather than silently resolved (see also
`technical-feasibility.md` risk list):** specific wardrobe choices below (hijab or not,
exact garment types) are *defaults for planning purposes*, not a final casting
decision. Tunisia's contemporary urban population is visually diverse on exactly this
axis, and getting it wrong reads as either erasure or stereotype. This should get real
local/cultural review before any final asset is produced — the same review discipline
`docs/legal/README.md` already applies to the Arabic legal translation.

### Aysha — driver

- **Age range:** Early-to-mid 30s. Old enough to read as an established, trusted
  driver (matches the trust/rating-tenure story the app already tells); young enough to
  feel contemporary, not a "taxi uncle" archetype.
- **Clothing:** Smart-casual, practical driving attire — a solid-color blouse or
  lightweight jacket in a warm neutral or muted sage tone (ties her, subtly, to the
  brand's route/accent color family without being a costume), simple jewelry at most.
  Default (pending local review, per above): no headscarf, hair worn down or in a low
  bun/ponytail practical for driving — but a hijab'd version is an equally valid,
  equally common real default and should be produced as an option, not excluded.
- **Hairstyle:** Dark hair, shoulder-length or longer, worn practically (low bun,
  ponytail, or simply down but not obscuring her face/eyeline from camera) — must be
  reproducible frame-to-frame without "hair simulation drift," a known AI-generation
  failure mode (see risk list).
- **General appearance:** Warm, competent, at-ease — not a glamour-model driver, not a
  stern taxi archetype. Confident hands-on-wheel posture.
- **Accessories:** A simple watch or bracelet, nothing that competes visually with the
  phone-mount beat.
- **Expressions:** Calm focus while driving; a small, genuine smile/nod on accepting
  Ahmed's request (S4.1); warm, brief greeting expression at pickup (S8.1).
  Never exaggerated/cartoonish reactions.
- **Posture:** Relaxed, upright, both hands on or near the wheel — reads as a careful,
  experienced driver (product-relevant: trust/safety is a stated brand pillar).
- **Continuity rules:** Exact hair color/length, blouse/jacket color, and any jewelry
  established in S3.1 must be pixel-identical (not just "similar") in S4.1 and S8.1.

### Ahmed — passenger (requesting)

- **Age range:** Mid-to-late 20s. Reads as a young professional or student — VAYA's
  real target passenger demographic per the product's own framing (verified profiles,
  price-conscious, tech-comfortable).
- **Clothing:** Smart-casual urban wear — a solid or subtly patterned short-sleeve shirt
  or polo, simple trousers or chinos; carries a light bag/backpack (commute-plausible,
  gives him something to manage at the door-boarding beat in S8.1).
- **Hairstyle:** Short, neat, contemporary cut — again chosen for reproducibility over
  any elaborate style.
- **General appearance:** Approachable, unremarkable-in-a-good-way — the "could be
  anyone you know" quality that sells peer-to-peer trust better than a stylized model
  look would.
- **Accessories:** His phone (hero prop for S6.1/S7.1 — should visually match/pair with
  the phone model used for Aysha's dashboard phone for consistency), simple watch.
- **Expressions:** Mild real-world impatience/checking-the-time at S6.1 (grounds the
  "waiting" beat in something true-to-life), genuine relief/pleasure at S7.1's
  acceptance, easy warmth at boarding (S8.1).
- **Posture:** Casual standing, weight shifted, phone-checking posture at the pickup
  point — not a static mannequin pose.
- **Continuity rules:** Shirt color, bag, and hairstyle established in S6.1 must match
  exactly through S7.1 and S8.1.

### Existing female passenger

- **Purpose in the story:** Establishes, wordlessly, that this is a real multi-passenger
  trip already in progress — not a two-hander. Deliberately kept visually distinct from
  Aysha so the two are never confused in a quick glance/thumbnail.
- **Age range:** Late 20s to late 30s — a different, non-adjacent point in the range
  from Aysha's to keep silhouettes distinguishable even in long/wide shots.
- **Clothing:** A different color family from Aysha's (e.g., a warm terracotta or
  cream tone rather than sage) — same "no headscarf" default with an equally valid
  alternative pending local review, independently chosen from Aysha's (i.e., the two
  women's wardrobe choices should not be forced to match each other).
- **Hairstyle:** Visually distinct silhouette from Aysha's (e.g., curlier or shorter, or
  tied up differently) — the point is instant distinguishability, not a specific style
  mandate.
- **General appearance:** Relaxed, at-ease — she's mid-trip already, comfortable.
- **Accessories:** Minimal — she's a supporting presence, not a second focal character.
- **Expressions:** Quiet, content — looking out the window (S3.1), a brief warm glance
  at Ahmed boarding (S8.1). No dialogue-scene-level performance required.
- **Posture:** Seated, relaxed, one arm resting on the door/window sill.
- **Continuity rules:** Once established in S3.1, her exact appearance must recur
  identically in S8.1 — she is the same person, same trip, roughly 15–20 minutes later
  in-story.

---

## 3. Tunisia / environment

Explicit anti-goal: **not** a generic "futuristic Dubai" skyline, and **not** a
poverty-tourism or clichéd-market aesthetic either. The target is contemporary,
lived-in, specific Tunisian urban and highway geography — closer to how a real Tunis or
Sousse street actually looks than to either extreme.

- **Highway characteristics:** A real Tunisian intercity road typology — two-to-three
  lane carriageway, visible but not overly worn asphalt, French-derived road signage
  typography/iconography, sparse midday-to-golden-hour traffic (a mix of ordinary
  sedans, the occasional truck/louage — background detail only, never in focus),
  olive groves, low scrub, or a coastal treeline as roadside landscape depending on the
  specific route chosen for reference.
- **Urban roads:** Mixed-width streets, on-street parking, visible overhead
  utility/telecom lines (a real, distinctive visual texture of North African cities —
  don't scrub it out in pursuit of a "clean" look), a blend of asphalt and older
  cobble/paved sections near historic cores.
- **Architecture:** A blend of French-colonial-era low-rise buildings (shuttered
  windows, wrought-iron balconies, cream/ochre facades) and contemporary mixed-use
  mid-rise — the actual texture of central Tunis, Sousse, or Sfax streetscapes, not a
  single monolithic style. Avoid glass-tower/megacity skylines entirely — Tunisia's real
  urban skyline is low-to-mid-rise almost everywhere relevant to this story.
- **Vegetation:** Palm trees and olive/citrus trees as accents (real, common,
  photogenic without being cliché-postcard), street trees in urban cores, scrub/olive
  groves along highways.
- **Road markings:** Standard European/French-convention white lane lines, occasional
  wear — not pristine, not derelict.
- **Traffic:** Present but not congested-to-the-point-of-visual-noise; enough to feel
  real (a few other cars, a moped or two) without competing with the hero car for
  attention.
- **Pickup location (S6–S8):** A specific, well-composed urban corner — outside a café
  or small shopfront row, near a recognizable intersection, good foot traffic implied
  but not crowded, warm practical shop lighting as afternoon progresses. This should be
  scouted/designed as "a real corner someone would actually arrange to meet at," which
  also happens to satisfy the product-accuracy note in the storyboard (a road-checked,
  nameable stop, not an empty field).
- **Environmental details:** Real, specific texture over generic polish — laundry lines,
  balcony plants, parked scooters, weathered shutters, a corner café's awning. These
  details are what separate "authentic Tunisia" from "stock Mediterranean city" in the
  brief's own words.

---

## 4. Cinematography

**Target feeling:** premium automotive commercial + sophisticated technology product +
authentic Tunisia — in that order of visual weight; the automotive-commercial language
carries the film, the tech-product polish shows up specifically in the UI-overlay
moments, and the Tunisia authenticity is carried by environment/character specificity,
not by visual style tricks.

- **Camera/lens philosophy:** Long-lens compression for exterior driving shots (classic
  automotive-commercial "car feels planted and substantial" look) vs. slightly wider,
  more intimate lensing for interior/character close-ups (S3, S4, S6, S7) — the lens
  language itself signals "now we're with a person" vs. "now we're watching the car."
- **Framing:** Rule-of-thirds throughout; characters' eyelines given room in the frame
  (never centered-and-cramped); the phone-mount UI beats framed with deliberate
  negative space for the HTML overlay to sit in without crowding the character's face.
- **Depth of field:** Shallow for character close-ups (S3.1, S6.1, S7.1) to isolate
  faces from background detail; deeper/pan-focus for establishing and pull-back shots
  (S1.1, S9.1) where the environment itself is the subject.
- **Motion blur:** Used deliberately and sparingly — most notably as the actual
  transition mechanism for S2.1's exterior→interior cut (see storyboard), and as a
  subtle cue on the speed-streak/wheel motion already present in the existing 3D car
  asset. Never blanket-applied as a style filter.
- **Camera movement:** Continuous, motivated movement throughout — no static locked-off
  shots except the deliberate hold at S9.2's CTA handoff. Every camera move should be
  justifiable as "what a real cinematographer would do to follow this action," not an
  arbitrary sweep.
- **Lighting:** Warm, naturalistic, single-sun-direction-consistent across the entire
  sequence (see storyboard's continuity requirements) — golden-hour-leaning without
  tipping into an orange/teal cliché grade. Interior lighting is practical-motivated
  (window light + ambient cabin light), not artificially over-lit.
- **Reflections:** Used purposefully — window reflections carry the S2.1 transition,
  glass/paint reflections on the car in S1/S8 sell material realism. Avoid gratuitous
  reflective/glossy surfaces elsewhere (a known "AI-generated" tell per the brief's own
  anti-goals).
- **Atmospheric effects:** Light haze/dust on the highway for depth (S1), nothing
  beyond that — no fog machines, no god-rays-as-decoration, no particle effects.
- **Color treatment:** A warm, slightly desaturated-toward-natural grade — consistent
  with the brand's own stated character ("warm/muted/soft-edged," never saturated
  "alert" colors, per `CLAUDE.md`'s design-system rules). The emerald accent
  (`#3FBE85`/`#2E9E6C`) should read as a deliberate, occasional color pop (taillights,
  UI, route line) against an otherwise naturalistic palette — not as a color-grade wash
  over the whole film.
- **Realism level:** Leans photoreal for characters/interior/urban environment;
  deliberately allowed to lean stylized/abstract for the highway-hero and
  final-pull-back bookends, where the existing abstract-3D system already lives (see
  storyboard §3). This is not an inconsistency — it mirrors how real automotive
  commercials often blend a photoreal hero product shot with a more graphic/abstract
  data/brand close.
- **References, by characteristic not by brand:** premium automotive commercials'
  "car as protagonist" long-lens language; contemporary tech-product launch films' clean
  UI-overlay compositing (the specific technique, not any one company's specific film);
  observational/documentary-lit North African urban cinematography for the environment
  beats (natural light, real texture, not a tourism-ad gloss).

**Explicit avoid list** (verbatim from the brief, treated as hard constraints): generic
AI aesthetic, excessive neon, cyberpunk, cheesy gradients, exaggerated sci-fi, cartoonish
characters, excessive bloom, random floating UI, "AI SaaS landing page" aesthetics.
Two notes specific to this codebase: the **existing** 3D scene already uses a bloom
post-process (`Bloom` in `JourneyScene.tsx`, intensity 0.85) — any extension of that
system for the new bookend shots should keep bloom as a *subtle* highlight-glow, not
increase it, to stay on the right side of this anti-goal. And "random floating UI" is
exactly what the HTML-overlay notification cards must *not* become — every overlay must
be spatially anchored to a real diegetic object (the phone screen) via the storyboard's
own instruction, never a UI card floating free in 3D space.

---

## 5. Continuity rules — what must remain identical between shots

Explicit checklist, cross-referenced to the storyboard's own per-shot continuity notes:

| Element | Must stay identical across | Notes |
|---|---|---|
| Car model, paint color, wheels | S1.1 → S1.2 → S2.1 → S8.1 → S8.2 → S9.1 | Same asset at different LOD/distance is fine; different color/model is not. |
| Aysha (hair, wardrobe, jewelry) | S3.1 → S4.1 → S8.1 | Exact color values, not "similar." |
| Existing female passenger | S3.1 → S8.1 | Distinct from Aysha's silhouette (§2). |
| Ahmed (hair, wardrobe, bag) | S6.1 → S7.1 → S8.1 | |
| Phone model/hardware | S3.1/S4.1 (dashboard) and S6.1/S7.1 (Ahmed's) | Should visually pair — same phone family — even though they're two different physical phones in-story. |
| Dashboard/phone mount | S3.1 → S4.1 → S8.1 | |
| Pickup-point location | S6.1 → S7.1 → S8.1 | Same corner, same signage, same lighting stage. |
| Lighting direction/time-of-day | S1.1 through S9.1 | One continuous afternoon → golden hour; no unexplained day/night jump. |
| Route-line / pin color language | S5.1 → S9.1 (and everywhere already in the live site) | Must equal existing tokens: `accent` `#3FBE85`, `accent-strong` `#2E9E6C`, `route.line` `#7FA491` — no new greens invented. |
| VAYA visual identity | Phone UI (all overlay shots) + Act 9 close | Never on the car exterior (§1). Typography/color must match the live site's own tokens (§6). |

---

## 6. Reused brand tokens (not reinvented)

Pulled directly from `apps/website/src/lib/tokens.ts` and
`apps/website/tailwind.config.ts` — the film's UI-overlay layer and any color grading
of rendered/generated assets should target these exact values, not approximations:

- `background` `#0D1512`, `surface` `#16211C`, `surface-muted` `#20302A`
- `ink` `#F6F1E7`, `ink-muted` `#B4AFA0`, `ink-faint` `#7C7A6E`
- `accent` `#3FBE85`, `accent-strong` `#2E9E6C`, `accent-glow` `#1F6B49`
- `route.line` `#7FA491`, `route.pickup` `#2E3B42`
- Display type: Fraunces (serif, weights 400/500/600, incl. italic) — headline/UI-card
  titling.
- Body/UI type: Plus Jakarta Sans (weights 400–800) — all overlay UI text, notification
  copy.

These are already the exact values the live app's `darkPalette`
(`packages/design-system/src/theme/palette.ts`) and map tokens
(`packages/design-system/src/tokens/colors.ts`) use — the film's UI must look like *the
same app*, not a marketing-only reskin.

---

## 7. Asset inventory

Every asset this film eventually needs, for planning/estimation purposes. Priority:
**P0** = required for any version of Act 1–9 to exist at all; **P1** = required for the
full storyboard as specified; **P2** = enhancement/alternate-take, not blocking.

| Asset | Required shots | Priority | Recommended creation method | Dependencies | Continuity importance |
|---|---|---|---|---|---|
| VAYA car — exterior model/render | S1.1, S1.2, S2.1, S8.1, S8.2, S9.1 | P0 | 3D model (Blender) built/rigged once, rendered per shot; reuse the existing abstract car as a stand-in for early prototyping | Visual Bible §1 sign-off | Critical — appears in 6 of 9 acts |
| VAYA car — interior/dashboard model | S3.1, S4.1, S8.1 | P0 | Same Blender asset, interior-detailed variant | Exterior model | Critical |
| Phone mount + phone (dashboard) | S3.1, S4.1 | P0 | Prop model, simple geometry | Dashboard model | High |
| Ahmed's phone | S6.1, S7.1 | P0 | Same/paired phone asset, reused | Dashboard phone asset | High |
| Aysha — character asset | S3.1, S4.1, S8.1 | P0 | 3D character (rigged, Blender/MetaHuman-class pipeline) or a locked-reference generative-image pipeline — decision deferred to Phase 3/feasibility follow-up | Visual Bible §2 sign-off, cultural/wardrobe review | Critical — face/consistency risk is the single biggest creative risk (see feasibility doc) |
| Ahmed — character asset | S6.1, S7.1, S8.1 | P0 | Same pipeline as Aysha | Same as above | Critical |
| Existing female passenger — character asset | S3.1, S8.1 | P1 | Same pipeline as Aysha | Same as above | Medium — fewer shots, still needs to match twice |
| Highway environment (3D scene extension or plate) | S1.1, S1.2, S2.1 | P0 | Extend existing procedural `Road`/`Environment`, or a rendered plate if fidelity requires it | Visual Bible §3 | High |
| Urban streetscape environment | S5.1, S6.1, S7.1, S8.1 | P0 | Rendered plate/matte painting or extended 3D environment | Visual Bible §3 | High |
| Pickup-point location (specific corner) | S6.1, S7.1, S8.1 | P0 | One specifically-designed/rendered location, reused across 3 shots | Urban environment asset | Critical — must be pixel-consistent 3x |
| Map-altitude Tunisia geography (Act 9) | S9.1 | P1 | Extends existing procedural skyline system | Existing `Environment.tsx` | Medium |
| Route-line / pin effect | S5.1, S9.1 | P0 (already exists) | Reuse existing `Road`/`Pin` components' visual language | Existing tokens | Critical — brand-consistency payoff shot |
| Notification UI overlay — "ride requested" | S4.1 | P0 | HTML/CSS, extends existing `DeviceFrame`/`AppUIMoments` pattern | Real notification copy review | Medium — must localize fr/en |
| Notification UI overlay — "request accepted" | S7.1 | P0 | Same as above | Same as above | Medium |
| Light-flare/motion-blur transition asset | S2.1 | P1 | Post-process/compositing technique, not a standalone asset | Exterior car render | High — the hardest single continuity moment |
| Aysha/Ahmed wardrobe reference set | All character shots | P0 | Art direction deliverable (mood board / locked reference sheet) before any character asset production | Cultural review (§2) | Critical — upstream of all character work |
| Color/lighting reference LUT | All shots | P1 | Grading deliverable derived from Visual Bible §4 | None | High — enforces cross-shot consistency cheaply |
| Vehicle sound/ambient audio (if the site adds sound) | Not currently in scope — no shot above specifies audio | P2 | Out of scope unless the site's autoplay/audio posture changes | Product decision needed | N/A |

**Total distinct new asset classes: 15** (excluding the two already-existing reusable
systems — route/pin visual language and the notification-overlay component pattern,
which are P0 dependencies but not net-new work).
