# VAYA Marketing Site — Cinematic Storyboard

Status: **Phase 1 design document. Not implemented. No code in this repo changes as a result of this file.**

## 0. Before reading the shot list — what already exists

This is not a greenfield design. `apps/website` already ships a scroll-driven cinematic
sequence, and this storyboard is an evolution of that system, not a replacement for it.
Concretely, today's site (`apps/website/src/components/Journey.tsx` +
`src/components/three/*` + `src/lib/curve.ts`) already has:

- **One continuous scroll-locked camera path.** A single `CatmullRomCurve3` (`roadCurve`)
  that the camera, the car, and every pin all read from — not independent sections. The
  camera interpolates between 8 named `CameraShot`s (height/back-distance/FOV/lateral
  offset) anchored to chapter boundaries, smoothly blended, never hard-cut.
- **A 7-chapter narrative already grounded in real product copy** (`src/i18n/en.json`
  `journey.steps`): *Where to? → Pick your stop → See the price → Request → Accepted →
  Empty seat, filled* — i.e. search → bounded stop selection → bounded price → request →
  accept → value message. This storyboard's chapters 4–8 are a dramatization of exactly
  this sequence with two named characters instead of an abstract car.
- **A real accessibility/perf fallback discipline**: `prefers-reduced-motion`, viewport
  width, and WebGL feature-detection gate whether `JourneyScene` (3D) or
  `JourneyFallback2D` (a plain SVG path + `requestAnimationFrame`, no GSAP, no WebGL)
  renders — both driven by the same `progressRef`. Any new shot type this storyboard
  introduces must extend this pattern, not bypass it.
- **A real HTML/CSS phone-UI-overlay precedent**: `AppUIMoments.tsx` already renders a
  `DeviceFrame`-wrapped, fr/en-localized, realistic (if illustrative) in-app UI moment
  as actual DOM, not baked into a render. `RoutePulseBadge` is the site's redrawn SVG
  version of the real in-app driver-flow motif.
- **Zero binary image/video assets today.** No `public/` directory exists. Everything is
  procedural geometry, SVG, or CSS. This matters enormously for Phase 2.5 — see
  `docs/marketing/technical-feasibility.md`.

**What this storyboard changes:** the current 3D scene is deliberately abstract — a
low-poly car built from rounded primitives, explicitly "not a literal vehicle render"
per its own code comments, with no human figures at all. The brief asks for named,
recurring human characters (Aysha, Ahmed, an existing passenger) and automotive-commercial
framing. That is a real escalation in asset fidelity, addressed head-on in the Visual
Bible and the Feasibility Audit — this storyboard is written so its early and late shots
(highway, final pull-back) can still be served by the *existing* abstract 3D system
essentially unchanged, while the new, harder, human-centric middle act is isolated into
its own clearly-scoped shots. See §3 "Relationship to the current implementation."

No product claim in any shot below goes beyond what `CLAUDE.md`, `docs/domain/`, and
`src/i18n/en.json` already state is real and shipped.

---

## 1. Narrative spine

One continuous scroll-locked camera move, in nine acts. Scroll position is expressed as
a percentage of total page scroll for this section (`0%` = top of page, `100%` = handoff
into the existing static `FinalCTA` section). Acts are not independent "sections" — no
shot begins with a hard cut from the previous one; every transition is specified below.

| Act | Scroll range | Beat |
|---|---|---|
| 1 | 0–10% | Hero / Highway |
| 2 | 10–17% | Enter the car |
| 3 | 17–25% | Aysha / driver |
| 4 | 25–33% | Request |
| 5 | 33–41% | Transition to city |
| 6 | 41–51% | Ahmed / pickup point |
| 7 | 51–59% | Accepted |
| 8 | 59–71% | Pickup |
| 9 | 71–100% | Final / VAYA network → CTA handoff |

---

## 2. Shot list

Each shot: ID · purpose · scroll range · camera · movement · subject/action ·
environment · lighting · transition out · continuity requirements · assets · medium.

### Act 1 — Hero / Highway

**S1.1 — Establishing highway**
- **Purpose:** Cold open. Premium automotive-commercial first impression; sets scale,
  landscape, and the car as protagonist before any UI or characters appear.
- **Scroll range:** 0–5%
- **Camera:** Low, wide, slightly behind and to the side of the car (mirrors the
  existing chapter-0 `cameraShots[0]`: height 0.95, back 1.7, FOV 36 — tight and low).
- **Movement:** Slow dolly-in, following the car at a fixed relative offset; very slight
  parallax from the existing pointer-driven steadicam wobble (already implemented in
  `CameraRig.tsx`) so it never feels locked-off.
- **Subject/action:** The VAYA car (see Visual Bible for exact identity) cruising at a
  steady, unhurried highway speed. No characters visible yet — windows may be tinted /
  reflective.
- **Environment:** Open Tunisian highway/coastal road, golden-hour light, sparse traffic,
  visible road markings and a distant tree line or coastal silhouette (see Visual Bible
  §3 for the specific reference environment — avoid a "no man's land" generic highway).
- **Lighting:** Warm low-angle sun, long soft shadows, gentle haze for depth. Matches the
  existing scene's directional-light warm key (`#F6F1E7`) + cool ambient fill
  (`#9FC2CC`/`#3FBE85`) — same palette family, cinematic exposure instead of the current
  flat-lit look.
- **Transition into S1.2:** Camera continues its dolly-in without a cut; framing tightens
  as speed/distance close.
- **Continuity requirements:** Car model, color, plate treatment (or deliberate absence
  of one — see Visual Bible), and time-of-day light direction established here must hold
  for every subsequent exterior shot in Acts 1–2 and Act 8 (same trip, same afternoon).
- **Assets required:** VAYA car 3D model or render; highway/coastal environment (3D
  scene extension or rendered background plate); road/lane-marking texture.
- **Medium:** 3D (extends the existing `Road`/`Environment`/`Car` system) **or**
  rendered image sequence if the existing procedural scene cannot reach commercial
  fidelity — this is the central question Phase 2.5 exists to answer, not a decision
  made here.

**S1.2 — Hero headline beat**
- **Purpose:** Deliver the existing hero copy (`dict.hero.headline`/`subhead`) over the
  establishing shot — this is a straight continuation of the current site's chapter-0
  panel, not a new copy requirement.
- **Scroll range:** 5–10%
- **Camera:** Continues S1.1's dolly-in; comes to a near-hold as the DOM headline panel
  fades in (mirrors current `panelRefs.current[0]` fade-in behavior).
- **Movement:** Deceleration — motion slows but never fully stops (a "breathing" idle
  drift, matching the current implementation's continuous camera even at chapter
  boundaries).
- **Subject/action:** Car continues driving; no new action.
- **Environment/Lighting:** Continuous from S1.1.
- **Transition into S2.1:** Camera acceleration resumes and framing begins closing
  toward the car's side window — the literal start of "enter the car."
- **Continuity requirements:** Headline/subhead/CTA copy is the existing
  `dict.hero.*` — do not alter wording here (redesign is visual only).
- **Assets required:** None beyond S1.1's.
- **Medium:** Hybrid — 3D/rendered scene + existing HTML hero panel (`RoutePulseBadge`,
  eyebrow, headline, CTA, store badges) as real DOM, unchanged in content.

### Act 2 — Enter the car

**S2.1 — Approach and close-in**
- **Purpose:** Bridge exterior → interior without a jarring cut; this is the single
  hardest continuity shot in the whole sequence (see risk analysis in
  `technical-feasibility.md`).
- **Scroll range:** 10–14%
- **Camera:** Rapid but smooth close-in toward the driver-side window, height dropping
  to roughly window level, FOV narrowing (long-lens compression, automotive-commercial
  convention) — "avoid obvious cuts," per brief, via motion blur and a shallow-focus
  pull rather than a literal pass-through-glass render.
- **Movement:** Fast forward dolly + slight yaw to align with the window plane, then a
  deliberate motion-blur/light-flash whip as the "transition" device (see below) rather
  than a literal glass-penetration render, which is a well-known VFX trap even in
  big-budget productions — flagged explicitly as a creative decision, not an oversight.
- **Subject/action:** Reflections/silhouette of Aysha become visible in the window
  glass just before the whip.
- **Environment:** Still the highway; window glass shows a compressed reflection of the
  road/landscape.
- **Lighting:** Sun catches the glass at a raking angle — practical justification for a
  bright flare that motivates the whip-transition's brightness spike.
- **Transition into S2.2 (interior):** A motion-blurred light-flare whip-pan, timed to
  the beat, standing in for "through the glass" — the disguised cut technique automotive
  commercials actually use for this exact move.
- **Continuity requirements:** Whatever the car's exact silhouette/color is by this
  point must exactly match the interior dashboard/door-trim materials revealed in S3.1.
- **Assets required:** Same car asset (exterior), a light-flare/motion-blur transition
  asset (post-process, not a separate render).
- **Medium:** 3D/rendered exterior → disguised transition. If the hybrid architecture
  (see feasibility doc) is adopted, this is the seam where the site would hand off from
  the existing abstract-3D system to a rendered/photoreal asset track — the single most
  important shot to prototype first for exactly that reason.

### Act 3 — Aysha / driver

**S3.1 — Interior establish**
- **Purpose:** Introduce Aysha and the existing passenger; establish the car interior
  and the dashboard phone mount that S4 depends on.
- **Scroll range:** 14–20%
- **Camera:** Interior, roughly rear-passenger-seat POV or a dashboard-adjacent
  three-quarter angle — never a to-camera / breaking-the-fourth-wall angle (this is a
  commercial, not a testimonial).
- **Movement:** Slow lateral drift/rack focus from Aysha (foreground, driving) to the
  passenger (background, seated, looking out the window) and back.
- **Subject/action:** Aysha driving, relaxed and attentive, hands on the wheel. The
  existing female passenger is already seated in the back or front passenger seat,
  looking out the window or occupied with her phone — established as *already mid-trip*,
  not boarding (continuity with product reality: a ride can carry a passenger the
  driver picked up earlier in the same trip).
- **Environment:** Car interior — dashboard, phone mount (empty or showing a generic
  map/route screen, not yet the notification), door trim, seatbelt, a glimpse of the
  highway through the windshield continuing the established environment.
- **Lighting:** Interior practical warm tones + moving highway light flicker through
  the windshield (classic driving-shot cue), consistent direction with S1's established
  sun position.
- **Transition into S4.1:** Camera settles into a fixed dashboard-adjacent framing that
  holds through the request beat — deliberately less camera movement here so the phone
  notification (a fast, readable UI beat) doesn't compete with camera motion.
- **Continuity requirements:** Aysha's exact wardrobe/hairstyle, the passenger's
  wardrobe/hairstyle, the phone model/mount hardware, and the dashboard trim must all be
  loaded once here and reused verbatim in every later interior shot (S4, S8).
- **Assets required:** Aysha character asset, existing-passenger character asset, car
  interior/dashboard asset, phone mount prop, phone device asset (see Visual Bible).
- **Medium:** Photoreal-leaning render or image sequence (character close-ups). Not a
  candidate for the existing abstract-3D system — this is exactly the "harder, isolated"
  material flagged in §0.

### Act 4 — Request

**S4.1 — Notification arrives**
- **Purpose:** The single most product-accurate beat in the film — dramatizes a real
  booking-request push notification, not an invented feature.
- **Scroll range:** 20–27%
- **Camera:** Holds from S3.1's settled framing; a slow push-in toward the dashboard
  phone as the notification appears.
- **Movement:** Minimal — deliberate stillness so attention reads as "on the phone,"
  matching real driving-attention behavior (the app is glanced at, not stared at).
- **Subject/action:** Phone (dashboard-mounted, per brief) shows an incoming VAYA push
  notification: **"Ahmed requested a ride"** (illustrative copy — see note below).
  Aysha's eyes flick to it, she gives a small confirming nod/glance without unsafe
  distraction, then taps to accept.
- **Environment/Lighting:** Continuous from S3.1.
- **Transition into S5.1:** As soon as "accepted" registers, camera begins pulling
  *through*/past the phone screen toward the windshield and onward to the city — the
  literal camera-move version of "phone accepts → we go meet Ahmed."
- **Continuity requirements:** Phone hardware/mount and dashboard framing identical to
  S3.1. Notification card visual language must reuse the site's *existing* real UI
  pattern (`AppUIMoments.tsx`'s `DeviceFrame` + rounded card + accent pill), not a new
  invented notification style.
- **Assets required:** None new beyond S3.1's — this shot is carried almost entirely by
  the HTML/CSS overlay.
- **Medium:** **HTML/CSS overlay, explicitly** — per the brief's own instruction to
  layer real UI over the 3D/rendered scene rather than bake it into a render. This keeps
  the notification text real, legible, and localizable (fr/en) instead of a fixed pixel
  in a video frame. Positioned/perspective-matched over the phone-mount area of the
  underlying render via CSS transform, the same way `AppUIMoments.tsx` already composes
  a `DeviceFrame` over a section background.
  - **Copy note:** "Ahmed requested a ride" / "Aysha a accepté votre demande" (S7) are
    illustrative strings for storyboard purposes, matching how `AppUIMoments.tsx`
    already uses an illustrative example ("Karim est en route") rather than a literal
    logged product string. Final copy should be pulled from or reviewed against the
    real notification module's actual dispatched copy
    (`apps/api/src/modules/notifications`) before production, not invented fresh.

### Act 5 — Transition to city

**S5.1 — Phone → windshield → city**
- **Purpose:** The brief's explicit ask: move toward the pickup location cinematically,
  never cut flatly to a new scene.
- **Scroll range:** 27–35%
- **Camera:** Continues the push-in from S4.1, crossing through/past the phone's glow,
  refocusing through the windshield, then a hard forward acceleration that leaves the
  car behind — a "the map itself is now moving" sensation.
- **Movement:** Accelerating forward dolly that outpaces the car (conceptually: we are
  now the route, not the vehicle), rising in altitude as buildings resolve below —
  mirrors the current implementation's road-curve-to-skyline handoff
  (`Environment.tsx`'s procedural skyline already exists for exactly this kind of beat).
- **Subject/action:** No characters on screen — this is a pure environment/camera beat.
  A thin glowing route line (reusing the site's existing `route`/`mapRouteLine` sage
  motif) can trace the path being traveled, directly visualizing "VAYA is routing us
  there" without any invented UI chrome.
- **Environment:** Transitions from highway → suburban fringe → dense urban Tunisian
  streetscape (see Visual Bible §3 for the specific architectural reference — avoid
  generic "futuristic city").
- **Lighting:** Shifts from open-highway warm light to denser, slightly cooler urban
  ambient + practical shop/street lighting as buildings close in, still within the same
  afternoon continuity (not a time-of-day jump).
- **Transition into S6.1:** Altitude/speed bleeds off as the camera arrives at street
  level near Ahmed's pickup point — deceleration, not a cut.
- **Continuity requirements:** The route-line color/weight must match `route.line`
  (`#7FA491`) exactly as used elsewhere on the site (Road.tsx, Pin.tsx) — same visual
  language as the in-app map, per the existing code's own stated intent.
- **Assets required:** Urban environment asset (extends or replaces the existing
  procedural skyline), route-line effect (already exists as a reusable pattern).
- **Medium:** 3D (best candidate for the existing abstract-3D system to carry this
  shot largely as-is, since no human characters are on screen) or a rendered
  establishing plate if photoreal urban detail is required — recommend prototyping the
  cheaper 3D option first here specifically because it's character-free.

### Act 6 — Ahmed / pickup point

**S6.1 — Ahmed waiting**
- **Purpose:** Introduce Ahmed and the pickup location; dramatizes a *real, road-checked
  pickup stop*, not an arbitrary pin — the single point where this storyboard must stay
  most disciplined against inventing product behavior.
- **Scroll range:** 35–45%
- **Camera:** Street-level, medium shot, slow push-in toward Ahmed.
- **Movement:** Gentle dolly-in with a slight arc, keeping the urban meeting point
  legible in the background (not a shallow-DOF blur that erases the location's
  specificity).
- **Subject/action:** Ahmed stands at a well-defined, recognizable urban spot — a named
  intersection/corner, not an empty lot — checking his phone. **Product-accuracy note:**
  the real app never lets a passenger drop a free-form pin; it offers a small, ranked
  set of real, road-checked stops (`docs/domain/ride-engine.md`,
  `search/pickup-point.tsx`). This shot should read as Ahmed standing at exactly such a
  stop — an identifiable street corner or transit-adjacent spot — not a cinematic "empty
  field" pickup. This is a framing constraint on location scouting/design, not a new
  claim.
- **Environment:** Attractive, specific, real-feeling Tunisian urban intersection —
  see Visual Bible §3.
- **Lighting:** Warm late-afternoon urban light, continuous with S5's arrival.
- **Transition into S7.1:** Camera holds close on Ahmed as his phone lights up —
  matches S4.1's "hold and let the UI beat land" pattern for consistency.
- **Continuity requirements:** Ahmed's wardrobe/hairstyle locked here for S6–S8. The
  specific pickup-point location/architecture locked here must reappear identically in
  S8's arrival shot (same corner, same signage, same time of day).
- **Assets required:** Ahmed character asset, urban pickup-point environment asset,
  phone device asset (can reuse S4's phone asset/model).
- **Medium:** Photoreal-leaning render or image sequence (character close-up) — same
  category as Act 3.

### Act 7 — Accepted

**S7.1 — Ahmed receives acceptance**
- **Purpose:** Mirror S4.1 from the passenger's side — the accepted-request
  notification, then a look toward the approaching car.
- **Scroll range:** 45–53%
- **Camera:** Continues S6.1's close hold on Ahmed and his phone; a small push-in on
  the notification, then a whip/reframe as Ahmed looks up and off-camera toward where
  the car will enter frame.
- **Movement:** Minimal during the notification (same "let the UI read" discipline as
  S4.1), then a quick, motivated reframe/pan following Ahmed's eyeline.
- **Subject/action:** Phone shows **"Aysha accepted your request"** (illustrative copy,
  same caveat as S4.1) with driver identity/ETA context consistent with the real app
  (name, photo/avatar, arrival estimate — all real, shipped fields, not invented ones).
  Ahmed pockets/lowers the phone and looks down the street.
- **Environment/Lighting:** Continuous from S6.1.
- **Transition into S8.1:** The car enters frame in the direction Ahmed is now looking —
  a direct visual payoff of the reframe, not a cut to a new angle.
- **Continuity requirements:** Notification card visual language identical to S4.1's
  (same component, different copy/avatar) — one design, two moments, not two designs.
- **Assets required:** None beyond S6.1's + the notification overlay.
- **Medium:** HTML/CSS overlay (identical reasoning to S4.1) composited over the
  render/image-sequence track.

### Act 8 — Pickup

**S8.1 — Arrival and boarding**
- **Purpose:** Physical payoff of the whole request/accept exchange — the car and Ahmed
  finally share a frame.
- **Scroll range:** 53–66%
- **Camera:** Tracking shot following the car as it slows and stops at Ahmed's exact
  pickup spot from S6.1/S7.1, then a cut-free reframe to the rear door as Ahmed opens it
  and gets in.
- **Movement:** Lateral tracking matched to the car's deceleration, settling into a
  static-but-alive (idle engine vibration, minor handheld imperfection) hold once
  stopped.
- **Subject/action:** Car arrives; Ahmed opens the rear door and gets in next to (or
  across from, depending on interior layout — see Visual Bible) the existing passenger.
  A beat of brief, warm greeting between Ahmed, Aysha, and the existing passenger —
  small, not a dialogue scene.
- **Environment:** Identical pickup-point location established in S6.1.
- **Lighting:** Continuous with S6/S7; door-open interior light spill as a nice
  practical beat.
- **Transition into S8.2:** Door closes; camera holds on the car for a beat before
  pulling back and up — the literal start of Act 9's pull-back.
- **Continuity requirements:** This is the highest-continuity-load shot in the film —
  car, Aysha, existing passenger, Ahmed, and the pickup location must all match their
  established appearances from four separate earlier shots (S1/S3, S3, S6, S6)
  simultaneously and correctly (Ahmed now in the *rear* seat, per brief).
- **Assets required:** All character + car + location assets already introduced; no new
  assets, only new poses/animation (door open, seat, interaction).
- **Medium:** Photoreal-leaning render/image sequence, same track as Acts 3, 6, 7.

**S8.2 — Departure**
- **Purpose:** Bridge from the intimate pickup beat back out to the film's closing
  wide/abstract register.
- **Scroll range:** 66–71%
- **Camera:** Rises and pulls back as the car pulls away from the curb, beginning the
  handoff back toward the existing abstract 3D system (or a wide establishing render).
- **Movement:** Continuous ascending pull-back, accelerating.
- **Subject/action:** Car drives off down the street with all three passengers now
  aboard.
- **Environment/Lighting:** Urban → begins opening back toward wider cityscape,
  golden light shifting toward late-afternoon amber (continuity with the day's
  progression, not a jump to night).
- **Transition into S9.1:** Seamless continuation of the same pull-back — the
  boundary between S8.2 and S9.1 is the second (and easier) hand-off point between the
  photoreal character track and the existing abstract-3D/graphic system, since no faces
  are legible at this altitude.
- **Continuity requirements:** Car color/silhouette must still read correctly from
  altitude (same asset, different LOD/render distance is fine).
- **Assets required:** None new.
- **Medium:** Hybrid handoff shot — begins in the character track, ends in whichever
  system carries Act 9 (see below).

### Act 9 — Final / VAYA network → CTA

**S9.1 — Pull back to the network**
- **Purpose:** Resolve the single-trip story into VAYA's actual value proposition —
  many real trips, many real matches, on a real routing foundation — without claiming
  more than the product does (no literal "network operations center," no fabricated
  scale numbers).
- **Scroll range:** 71–86%
- **Camera:** Continues S8.2's ascent into a high, wide, map-like overview.
- **Movement:** Slow, majestic rise and settle — the "hero drone shot" register.
- **Subject/action:** The single glowing route line from S5.1 is joined by several more
  (reusing the exact same `route`/pin visual language already established across the
  site — candidate-stop pins, selected-stop rings, route lines), suggesting multiple
  concurrent real trips without depicting a specific, fabricated statistic. This is
  visually a scaled-up version of the site's *existing* pin/route motif, not a new
  invented visualization.
- **Environment:** Recognizable stylized Tunisia geography (coastline + a couple of
  named-feeling urban clusters) at map altitude — abstraction is appropriate and
  expected at this height, matching the existing procedural-skyline aesthetic rather
  than requiring photoreal detail this far out.
- **Lighting:** Late-afternoon/golden, consistent with the day established since S1.
- **Transition into S9.2:** Camera motion eases to a stop as the DOM `FinalCTA` section
  content fades in over/after it — this is the exact same fade-up mechanic the current
  `Journey.tsx` already uses for its chapter panels, applied once more at the very end.
- **Continuity requirements:** Route-line/pin colors must exactly match the tokens used
  everywhere else in the sequence (`accent` `#3FBE85`, `route.line` `#7FA491`) — the
  film's closing visual argument is literally "this is the same system you've been
  watching the whole time," so token drift here would undercut the point.
- **Assets required:** None new — a re-use/recomposition of existing pin/route/skyline
  assets at a new camera distance.
- **Medium:** 3D (the existing abstract system is the *correct* choice here, not a
  fallback — this shot is explicitly abstract/graphic by design, exactly what the
  current `Environment`/`Pin`/`Road` components already do well).

**S9.2 — CTA handoff**
- **Purpose:** Deliver the existing final call-to-action.
- **Scroll range:** 86–100%
- **Camera:** Settles to a still frame (or the existing `FinalCTA` section takes over
  entirely as a normal, non-scroll-locked DOM section below the pinned journey —
  matching the current architecture exactly, where `Journey` is pinned/scrubbed and
  `FinalCTA` is a normal section further down the page).
- **Movement:** None — deliberate rest after eight acts of continuous motion.
- **Subject/action:** N/A.
- **Environment/Lighting:** N/A — handoff to existing `FinalCTA` background treatment.
- **Transition:** N/A — end of the cinematic sequence.
- **Continuity requirements:** None beyond reusing the existing `FinalCTA` component
  content and copy verbatim (`dict.finalCta.*`) — this storyboard does not propose new
  CTA copy.
- **Assets required:** None — existing component.
- **Medium:** Existing HTML/CSS section, unchanged.

---

## 3. Relationship to the current implementation

A concrete mapping from this storyboard onto the existing code structure, for whoever
picks this up in a later implementation phase (not something to act on now):

- **`CHAPTER_COUNT`** would grow from 7 to roughly 9–10 to match Acts 1–9 above (exact
  count is an implementation detail, not fixed by this document).
- **`cameraShots`** already models exactly the "distinct shots per chapter, smoothly
  blended" idea this storyboard assumes — Acts 1, 2 (partial), 5, 8.2, and 9 could
  extend the existing array with new height/back/fov/lateral tuples with comparatively
  little new code.
- **`beats`** (origin/candidates/destination/car timing) is the existing mechanism for
  "when does X become visible" — Aysha, Ahmed, the phone-notification overlays, and the
  pickup moment all map naturally onto new named beats in this same object.
- **The two hardest new pieces are not camera-path problems** — they are (a) producing
  consistent human character assets at all (something the current system has zero
  precedent for — see Visual Bible + Feasibility Audit), and (b) the exterior→interior
  "enter the car" transition (S2.1), which is a disguised-cut problem, not a literal
  geometry problem.
- **The HTML/CSS overlay shots (S4.1, S7.1)** are the *lowest*-risk new work — they are
  a straightforward extension of the `AppUIMoments.tsx`/`DeviceFrame` pattern that
  already exists and already ships real, localized copy.

---

## 4. Explicit non-claims

Per the brief's own instruction, nothing above invents product functionality or
marketing claims beyond what ships today. Specifically avoided:
- No fleet/branded-vehicle claim (VAYA does not own or brand driver vehicles — see
  Visual Bible §1 for the reasoning behind the car's unbranded treatment).
- No specific trip-count/user-count/city-count statistic in S9.1 — the "network" is
  depicted, never quantified.
- No free-form pickup-pin depiction (S6.1's product-accuracy note above).
- No literal "AI matching visualized as a network graph" — the film shows real UI
  patterns (notifications, route lines, pins) already in the product and on this site,
  not an invented abstraction of the matching engine's internals.
