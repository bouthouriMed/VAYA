# World-Class Carpooling Benchmark

**Method:** web research into BlaBlaCar (the category leader) plus adjacent short-distance/commute carpooling products (Klaxit, Karos), and a search for Tunisia-specific context. Every claim below is labeled **FACT** (sourced), **ESTIMATE** (inferred from sourced material), **ASSUMPTION** (unverified premise treated as true for planning), or **HYPOTHESIS** (untested idea worth validating). Do not treat ESTIMATE/ASSUMPTION/HYPOTHESIS items as confirmed when they inform roadmap decisions — flag them for validation instead.

## 1. Driver journey (BlaBlaCar)

- **FACT** — Drivers can publish multiple ride instances (several dates) in one flow, and can add multiple stop points along a route with the app suggesting optimized routes. [blablacar.co.uk/apps-mobile]
- **FACT** — Suggested price is fuel/toll-cost-based, capped around **€0.06/km**, explicitly to preserve "cost-sharing, not commercial transport" legal status; drivers commonly price slightly below the suggestion. [ridester.com/blablacar]
- **FACT** — Preferences (chattiness: Bla/BlaBla/BlaBlaBla, smoking, pets) are set at profile level and shown as icons on listings. [blog.blablacar.com]
- **FACT** — Both instant booking and request-to-book exist; drivers can review a passenger's profile/rating before accepting a request. [blablacar.co.uk/apps-mobile]
- **FACT** — If a driver can't reach a passenger before departure, they can cancel that specific booking and mark the passenger unreachable, freeing the seat; confirmed no-shows can trigger an automatic 1/5 rating. [blablacar.co.uk/faq]
- **FACT** — Mutual rating happens in a 24-hour post-trip window, building cumulative reputation visible before future bookings. [blog.blablacar.in]

## 2. Passenger journey (BlaBlaCar)

- **FACT** — Search results are sortable by price/departure/arrival/duration and filterable by price range, vehicle type, departure window, chattiness. [whistleout.com]
- **FACT** — Public trust tiers are surfaced directly in search/profile: "Expert" (6mo tenure, ≥80% positive) and "Ambassador" (12mo, ≥90% positive). [whistleout.com]
- **FACT** — Instant booking and pending request-to-book both exist; a pending request can be cancelled fee-free before the driver confirms. [m.blablacar.co.uk/faq]
- **FACT — cancellation policy (confirmed booking):** >24h before departure → refund minus service fee. Booked >24h out but cancelled inside the last 24h → 50% refund to passenger, 50% compensation to driver. Booked within 24h and cancelled within 30 min of booking → full refund minus service fee. Cash bookings get no refund/compensation. [support.blablacar.com — Carpool Cancellation Policy]
- **FACT — driver cancels:** passenger refunded in full including fees; driver gets no compensation, especially inside 24h; narrow manual exceptions (weather, emergencies). [legal.blablacar.com T&Cs]
- **ASSUMPTION** — The exact passenger pickup-point selection UI (map pin vs. driver-proposed list vs. free text) could not be independently confirmed; BlaBlaCar's own help article failed to render during research. Secondary evidence (§3) suggests points are algorithmically proposed and user-editable, but this is not confirmed at the UI level. Treat VAYA's own pickup-selection UX as an original design informed by, not copied from, BlaBlaCar.

## 3. Route matching & meeting-point system — directly informs `docs/domain/ride-engine.md`

- **FACT** — BlaBlaCar evolved from a limited set of curated central meeting points toward an algorithm matching passenger requests to **sub-segments of a driver's already-published route**, without drivers manually pre-defining every pickup point — described as unlocking "millions of possible local meeting points." [ideausher.com, frugaltesting.com]
- **FACT** — For the commute product (BlaBlaCar Daily, formerly BlaBlaLines), meeting points are **fixed automatically by the app** on the driver's route, closest to the passenger's location, and remain user-editable. [Google Play listing, BlaBlaCar Newsroom]
- **FACT** — Users can attach landmark descriptions to pickup/drop-off points for real-world findability.
- **GAP (explicitly unconfirmed)** — Whether specific landmark categories (petrol stations, train stations) are algorithmically privileged in point selection could not be confirmed; BlaBlaCar's own engineering posts on matching ("Improving the Matching Performance for Carpooling") returned HTTP 403 during research and could not be read.
- **HYPOTHESIS** — The underlying approach generalizes as: *propose a small set of route-adjacent points, ranked by (proximity to passenger) × (stop-suitability), rather than letting either side pick arbitrary coordinates.* This is the model VAYA's ride engine should implement — see `docs/domain/ride-engine.md`. It is a hypothesis about mechanism, not a confirmed BlaBlaCar implementation detail.

## 4. Pricing model

- **FACT** — Suggested price is fuel/toll-cost-based, capped around €0.06/km, to preserve cost-sharing (non-commercial) legal status. [ridester.com]
- **FACT** — A service/booking fee is charged to the **passenger** on top of the driver's listed price; the driver receives the full listed amount. The exact commission rate is not publicly fixed by BlaBlaCar; secondary estimates cluster around 10–20%. [support.blablacar.com]
- **ESTIMATE** — No evidence of demand-based/surge pricing on BlaBlaCar carpool — pricing is fundamentally supply-set within a capped band, unlike Uber/Bolt-style ride-hailing.

This maps directly onto the pricing architecture in `docs/domain/pricing.md`: a computed suggested price with a bounded range, driver-adjustable within bounds, fee charged to the passenger side, no surge/dynamic pricing in the near term.

## 5. Trust & safety

- **FACT** — ID verification (passport/license) is optional generally, but can be made mandatory for specific trip types (e.g. cross-border); third-party checks confirm name match; ID is never shown to other members; BlaBlaCar states it performs no background checks. [support.blablacar.com]
- **FACT** — Phone/email verification is a standard trust signal alongside ID. [whistleout.com]
- **FACT** — Two-sided mutual rating is cumulative and visible pre-booking, with a 24h post-trip submission window.
- **FACT** — Tenure+quality badges (Expert/Ambassador) gate trust visibility in search results.
- **ASSUMPTION** — No confirmed evidence of platform-underwritten passenger insurance as a headline carpool feature (distinct from BlaBlaCar's separately-regulated bus product). Do not assume VAYA needs an insurance product at launch; flag as an open decision if raised later.

VAYA already has more raw material here than the audit initially suggested: `verification-documents`, `driver-profiles`, and a live-camera KYC onboarding flow already exist and are the most production-grade part of the app (`docs/product/audit.md` §4). The gap is the passenger-facing trust *signal* (ratings display, tenure badges), not the underlying identity verification pipeline.

## 6. Marketplace liquidity / cold start

- **FACT** — BlaBlaCar's growth was sequential and market-by-market: win critical mass in one country before expanding, rather than launching thin and broad. [sharetribe.com]
- **FACT** — Explicit two-sided flywheel: more drivers → better passenger choice → more demand → more drivers — a compounding advantage that's hard for challengers to match once established.
- **FACT** — BlaBlaCar built a distinct product (Daily/Klaxit-derived) specifically for the short-distance/commute segment, because that segment has different liquidity dynamics (daily repeat trips, tight geography) from long-distance one-off rides.
- **HYPOTHESIS** — For a smaller, new market like Tunisia, standard two-sided-marketplace cold-start levers likely apply: seed one dense corridor first (e.g. Tunis–Sousse or Tunis–Sfax) rather than national coverage from day one; recruit driver-side supply directly ahead of organic demand; keep search date/radius flexible early so passengers don't hit dead-end empty searches against thin inventory. This is a planning hypothesis, not a sourced fact about Tunisia — validate with real usage data as VAYA launches.

## 7. Adjacent products — short-distance/commute UX (more relevant to intra-Tunisia trips than BlaBlaCar's original long-distance product)

- **FACT** — **Klaxit**: French home-to-work carpooling leader, in-house AI matching, partners with large employers and transit authorities, acquired by BlaBlaCar in March 2023.
- **FACT** — **Karos**: positions as Europe's leading daily-commute carpool network, auto-adapts to a user's regular commute pattern ("2-click" match), uses GPS-based mutual presence confirmation once paired, running passively in the background thereafter.
- **ESTIMATE** — The transferable pattern for VAYA is **automatic, low-friction repeat-route matching**: a user sets their regular commute pattern once, and the app auto-lists/auto-matches it daily, rather than requiring a fresh "publish a ride" action every day. VAYA already has a `recurring-patterns` table in the schema (currently unused by any UI) — this is directly relevant to `docs/roadmap` Phase: Recurring Rides.

## 8. Tunisia-specific context

- **FACT** — BlaBlaCar's listed country coverage does not include Tunisia or any North African market — there is no incumbent international carpooling platform in this market. [en.wikipedia.org/wiki/BlaBlaCar]
- **FACT** — Tunisia's dominant intercity shared-transport mode is the **louage** — shared minibus/car taxis on fixed routes, color-coded by region (red=north, blue=coastal/Sahel, yellow=south, green=northwest/inland), operating from dedicated stations.
- **FACT** — Within Tunis, an informal "taxi jem3a"/"taxi collectif" shared-taxi system runs quasi-fixed routes with en-route pickup/drop-off.
- **WEAK SOURCE, flagged** — A vendor case-study page mentions a local app ("AmiGo") linking taxi/shared-taxi trips in Tunisia; this is a vendor marketing source, not independently verified, and should not be treated as evidence of a proven local digital-carpooling playbook.
- **EXPLICIT RESEARCH GAP — do not fill with invented data**: no independently-sourced data was found on (a) the scale or structure of informal Tunisian carpooling via Facebook/WhatsApp groups, or (b) comparative pricing/frequency of louage vs. taxi vs. any digital carpooling attempt in Tunisia. Treat as **ASSUMPTION**: louages dominate intercity travel, informal social-media carpooling likely exists but is fragmented/undocumented, and VAYA is effectively a first-mover in structured digital carpooling locally — with no local playbook for trust and payment norms in what is likely a cash-heavy, negotiation-driven transport culture. This gap should be closed with real local field research (interviews, competitive teardown of AmiGo if it's real, louage-station observation) before finalizing payment and trust-mechanic decisions, not assumed away.

## What this means for VAYA specifically

1. **Ride engine**: build a route-adjacent, ranked candidate-stop system (§3), not free-text/arbitrary coordinates — this is the single highest-leverage mechanism BlaBlaCar's success is built on.
2. **Pricing**: computed suggested price with a bounded, driver-adjustable range; platform fee (if any) charged passenger-side; no surge pricing — matches VAYA's cost-sharing positioning and Tunisian price sensitivity.
3. **Trust**: VAYA already has the hard part (identity verification pipeline); the missing piece is surfacing ratings/tenure as a visible trust signal pre-booking, the same way BlaBlaCar's Expert/Ambassador badges work.
4. **Cold start**: given Tunisia has no incumbent, launch strategy should favor a single dense corridor with both driver-side supply seeding and flexible search, rather than broad, thin national coverage from day one — this is a go-to-market decision, not an engineering one, but it should shape which corridors get seeded route data first.
5. **Commute pattern**: Karos/Klaxit's repeat-route auto-matching is likely more relevant to daily intra-city Tunisian trips than BlaBlaCar's original long-distance one-off model — the existing but unused `recurring-patterns` table suggests this was already anticipated in the schema design.

## Research limitations (be honest about these, don't backfill)

Two BlaBlaCar engineering posts on matching algorithms returned HTTP 403 and could not be read directly (summarized via secondary sources only). BlaBlaCar's own pickup/drop-off help article failed to render (JS-loading page), so the exact passenger-facing pickup-point UI is unconfirmed at the pixel level. No independently-verified data exists on Tunisia's informal carpooling scale. If pixel-level UX fidelity against BlaBlaCar is ever required, these should be revisited with a manual read rather than assumed from this pass.
