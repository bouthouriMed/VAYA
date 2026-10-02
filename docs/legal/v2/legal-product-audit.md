# VAYA — Legal/Product Audit, Data Inventory and Launch Checklist

**Status:** working document for founders and external counsel. Not for publication.
**Prepared:** 2 October 2026, against the `main` branch codebase at that date.
**Companion drafts:** [`terms-and-conditions.en.md`](./terms-and-conditions.en.md),
[`privacy-policy.en.md`](./privacy-policy.en.md).

This audit was prepared by an AI coding assistant working from VAYA's source code, schema,
configuration and internal documentation. It is product-counsel groundwork, not legal
advice. Every conclusion marked as a legal judgment must be validated by qualified counsel
in the jurisdiction(s) where VAYA's operating entity is established and where it operates
(at minimum Tunisia; and Spain/EU if an EU entity is used).

Method: the source of truth is the code. Where internal documentation (including
`CLAUDE.md` and the v1 legal texts) disagrees with the code, the code wins and the
discrepancy is listed in §3.

---

## Contents

1. What VAYA actually is (product facts)
2. Applicable legal frameworks
3. Defects in the current (v1) Terms and Privacy Policy
4. Legal/product gap analysis (36 topics)
5. Data processing inventory
6. Third-party / sub-processor inventory
7. Admin application — privacy, security and access-control audit
8. Legal/Product decisions required before launch
9. Launch checklist (must / should / later)
10. Quality-control log for the v2 drafts

---

## 1. What VAYA actually is

### 1.1 Surfaces

| Surface | What it is | Evidence |
|---|---|---|
| Mobile app (iOS/Android, `com.vaya.app`) | The only consumer-facing product. Expo/React Native. | `apps/mobile`, `app.config.js` |
| Marketing website | Static Next.js site; hosts public legal pages (fr/en). No cookies, no analytics, fonts self-hosted at build time. | `apps/website` |
| Admin dashboard | Internal web app for VAYA staff. Email + password login. | `apps/admin`, `apps/api/src/modules/admin` |
| API + worker | Fastify API and a BullMQ worker on one host (planned: a single Oracle Cloud VM behind Caddy). PostgreSQL + Redis on the same host. | `apps/api`, `docker/docker-compose.oracle.yml` |

### 1.2 Users

- **Members** — one account type. Every Member can search and book as a **Passenger**.
- **Drivers** — Members who complete driver onboarding (vehicle + live-camera capture of
  driving licence, insurance certificate and a selfie) and are **manually approved by a
  VAYA administrator**. Server-side gate: a ride cannot be created unless
  `verificationStatus = 'approved'` and driver privileges are not restricted
  (`rides.service.ts`).
- **Administrators** — VAYA staff, separate `admin_users` table, roles `admin` and
  `superadmin`.
- **Unauthenticated visitors** — can call some public endpoints (public profiles, ride
  stops, fellow-passenger lists). See §7 and SEC-019.

### 1.3 Core flows (as implemented)

- **Sign-in**: phone number + SMS one-time code (Twilio; code stored only as an HMAC,
  5-minute TTL, attempt lockout), or Google Sign-In (`openid email profile` scopes: name,
  email, Google ID, Google profile-photo URL used as the avatar). Access token 15 min;
  refresh token 30 days (no rotation). A Google account can later attach a verified phone.
- **Account acceptance**: browsewrap text on the sign-in screen ("By continuing, you
  accept…") with links to Terms and Privacy. No checkbox, no version recorded.
- **Profile**: full name, optional avatar (picked from the photo library), language.
- **Search**: origin, destination, date/time, seats. Place search is proxied through the
  API to Google Places (or Nominatim/OpenStreetMap if no Google key). Matching runs
  server-side across tiers (exact, wide corridor, route pass-through, detour, closest
  departure, in-progress rides). Results ranked algorithmically.
- **"Notify me" demand signal**: a Passenger can register origin/destination/time window
  to be told when a matching ride appears.
- **Ride publication** (approved drivers): origin/destination, departure time, seats,
  route choice among alternatives (fastest / no tolls / no highways), driver-selected stops
  from a server-generated candidate set (never free-form), and a **per-seat contribution
  constrained server-side to a computed range** (`recommended = 0.20 DT/km + 0.06 DT/min`,
  min ×0.7, max ×1.3, floor 4 DT; parameters in `pricing_configs`).
- **Recurring patterns**: a background job analyses a Member's ride/booking history,
  detects repeated corridors, and may suggest enabling a pattern. An enabled driver
  pattern can pre-fill a draft ride (never auto-published); an enabled rider pattern can
  trigger proactive match notifications.
- **Booking request**: Passenger requests seats with a pickup (and optionally drop-off)
  chosen from the ride's stops, or a passenger-placed point with a server-computed
  detour preview. Each request has a server-set response deadline; unanswered requests
  expire. Multiple simultaneous requests for "the same journey" are capped; when one is
  accepted, the others are automatically closed ("superseded").
- **After acceptance**: a one-to-one **text conversation** opens (per booking; read-only
  after the trip ends), and each party can **reveal the other's phone number**
  (`GET /bookings/:id/contact-phone`, accepted bookings only).
- **Trip execution**: the driver starts the trip; while the driver's app is open in the
  foreground, it sends GPS fixes roughly every 7 seconds. **Only the latest fix is stored**
  (overwritten in place on the `trips` row) plus a one-time "driver was near the origin"
  flag. Passengers see the driver's raw position **only after boarding**; before
  boarding they see ETA/route. Lifecycle stages (approaching, pickup, onboard, arriving,
  completed) are inferred from GPS proximity; route deviations are classified; stale trips
  are auto-completed by a sweep job.
- **Payment**: **none on the platform.** The contribution is settled directly between
  Members (cash or as agreed). `platformFeeRate` exists in the schema but is 0 and not
  read anywhere. Trips record optional "settlement confirmed" timestamps.
- **Cancellation**: either party; a reason from a fixed list is required. Tiers:
  ≥24 h before departure — no consequence; <24 h and ≥30 min — +1 reliability-penalty
  point; <30 min or after departure — +3 points. Thresholds are admin-configurable.
- **No-show**: reportable ≥15 min after departure (reporter within 200 m when a GPS fix is
  supplied); consequence +5 points and an automatic 1-star rating against the absent
  party. **The system can also classify a no-show automatically** from GPS evidence
  (`evaluateAutoNoShowClassification`), with the same consequences.
- **Ratings**: within 24 h after completion, one per party per trip: 1–5 stars, optional
  punctuality flag, optional comment. Aggregates (average, trip count, punctuality,
  reliability score, trust tier "Nouveau/Confiance/Top VAYA") are public. Comments are
  not public; the rated Member receives the comment by notification (and by email if the
  account has an email address).
- **Penalty points**: stored per profile; visible to administrators; **not shown to
  Members and not currently used by any automated decision** (trust tier ignores them).
- **Notifications**: in-app inbox; push via Expo Push Service → FCM/APNs; transactional
  emails via Resend (only to Members who have an email address, i.e. Google sign-in) for
  booking requested/accepted/declined/cancelled and rating received.
- **Reports (safety)**: `POST /reports` exists (categories: unsafe driving, harassment,
  no-show, payment dispute, vehicle condition, other) and admins can triage them —
  **but no screen in the mobile app calls it.** Members currently have no in-app way to
  report a user. No blocking feature exists.
- **Account deletion**: in-app (Profile → Terms & privacy → Delete account). Refused while
  an active booking or open ride exists. Anonymises name/phone/email/Google ID/avatar,
  deletes KYC files and the avatar file from storage, revokes sessions. See §4.12 for
  what it leaves behind.
- **Data export**: none.
- **Analytics**: first-party only — events stored in VAYA's own database
  (`analytics_events`), including search origin/destination coordinates and the user ID.
  No third-party analytics or advertising SDK in any app.
- **Crash reporting**: Sentry SDKs in API and mobile, **active only when a DSN is
  configured**; default PII collection not enabled.

### 1.4 What VAYA does not do (and the documents must not claim)

No payments, wallet, refunds, commissions, subscriptions or platform fees. No insurance
product. No automated face matching, OCR or document-authenticity scanning — KYC review is
manual. No background location (foreground only). No advertising, no data sale, no
third-party analytics. No in-app reporting UI and no blocking. No admin access to message
content (no admin endpoint exposes conversations). No data-export tool.

---

## 2. Applicable legal frameworks

The analysis depends on a fact VAYA has not yet fixed: **which legal entity operates VAYA
and where it is established.** The codebase targets Tunisia (place search restricted to
Tunisia by default, TND pricing, Tunisian phone onboarding, French/Arabic UI). Treat the
following as a decision tree for counsel.

| Framework | Applies if… | Assessment |
|---|---|---|
| **Tunisia — Loi organique n° 2004-63** (personal data) + INPDP | VAYA processes personal data in Tunisia / of people in Tunisia. | **Applies in every scenario.** Consent-centric regime (express, written, purpose-specific consent is the default condition; exceptions must be confirmed article by article by counsel); prior declaration to the INPDP; **prior authorisation** for certain sensitive categories and for transfers abroad. Counsel must confirm whether the driver selfie is "biometric" in the INPDP's practice when no automated facial recognition is performed. Track the reported replacement bill (2025) — confirm status at drafting time. |
| **Tunisia — Loi n° 2004-33** (land transport) | Always, for the activity of Drivers in Tunisia. | No carpooling statute; paid passenger transport without licence risks "transport clandestin". VAYA's defence is strict cost-sharing. **Critical design gap:** the per-seat price range is occupancy-blind, so a full car can collect several times the trip cost (see §4.22). |
| **Tunisia — Loi n° 2000-83** (electronic exchanges/commerce) | Online contracting with Tunisian users. | Pre-contractual information, identification of the service provider, electronic acceptance. Requires a real legal entity and contact details. |
| **Tunisia — Loi n° 92-117** (consumer protection) | Members acting as consumers in Tunisia. | Limits on unfair exclusions of liability; drafting avoids blanket exclusions. |
| **GDPR (EU 2016/679)** | (a) VAYA's operating entity — or any establishment whose activities the processing is carried out in the context of — is in the EU (e.g. a Spanish company), **Art. 3(1), regardless of where users are**; or (b) VAYA offers services to, or monitors, people in the EU (Art. 3(2)). | If the company is Spanish: **GDPR applies to all processing**, the AEPD is the lead supervisory authority, and transfers of data to Tunisia (no adequacy decision) and to US processors need Chapter V safeguards. If the entity is Tunisian-only and the app is not offered in the EU: GDPR likely does not apply by mere fact that an EU resident might download the app — counsel to confirm. **The v2 Privacy Policy is drafted to GDPR standard and remains compatible with Tunisian law, so it works in both scenarios once the entity is fixed.** |
| **Spain — LOPDGDD (LO 3/2018)** | Spanish entity. | Adds national specifics (e.g. age of digital consent 14, DPO triggers, deceased persons' data). Note: VAYA requires 18+ anyway. |
| **Spain — LSSI-CE (Ley 34/2002)** | Spanish entity providing information-society services. | Mandatory provider identification (name, NIF, registry data, email) on the website/app; cookie rules for the website (currently no cookies). |
| **EU Digital Services Act (Reg. 2022/2065)** | Intermediary services offered to recipients **established or located in the EU**. | Not triggered by a Tunisia-only service provided by an EU company to non-EU recipients (DSA scope is based on recipients in the Union). If VAYA ever opens EU routes or EU users, VAYA becomes an online platform: notice-and-action, statement of reasons, internal complaint handling, trader traceability and transparency rules apply. The v2 Terms already adopt statement-of-reasons and appeal mechanics as good practice. |
| **EU consumer law (UCTD 93/13, CRD 2011/83, Omnibus 2019/2161, P2B)** | EU consumers / Rome I Art. 6 when VAYA directs activity to an EU country. | For Tunisian residents, Rome I Art. 6 would point to Tunisian consumer law if VAYA directs its activity to Tunisia. Governing-law clause must not deprive consumers of mandatory protections of their residence. |
| **ePrivacy / cookies** | Website or app storing/reading information on a device in the EU. | Website sets no cookies. App uses device secure storage strictly necessary for login. No consent banner needed now; revisit if analytics/ads are added. |
| **App store rules** (Apple 5.1.1(v), Google User Data policy) | Always. | In-app account deletion: implemented. Public privacy-policy URL: pending website deployment. Data-safety / privacy-label declarations must match §5. |

---

## 3. Defects in the current (v1) documents

The v1 texts (`docs/legal/terms-and-conditions.md`, `privacy-policy.md`, rendered in-app
from `packages/legal`) are substantive but contain statements the product contradicts.
**These are live in the app today.**

| # | v1 statement | Reality in code | Severity |
|---|---|---|---|
| D1 | Privacy §5: a Member's phone number is "**never**" shared with another Member. | `GET /bookings/:id/contact-phone` reveals the counterpart's phone after acceptance; UI uses it. | **High** — false statement about disclosure. |
| D2 | Privacy §4.1 / CGU 10.2: explicit, informed consent to biometric processing is "**collected before capture**". | No consent screen or consent record exists anywhere in onboarding. | **High** — false compliance claim; also a real legal gap. |
| D3 | CGU 8.2: penalty points are "visible within the Member's profile". | Visible only to admins; not displayed to Members; not used in any decision. | Medium |
| D4 | CGU 4.2: contribution "can never exceed costs actually incurred". CGU 4.2: driver time is never remunerated. | Price range is per seat and occupancy-blind; formula includes a per-minute component. VAYA cannot guarantee the cap; it constrains per-seat price only. | **High** — legally central claim not backed by mechanism. |
| D5 | CGU 4.3: method "documented publicly in `docs/domain/pricing.md`". | That is an internal repository path, not a public URL. | Medium |
| D6 | CGU 5.6 / 6.4 / 8.1 reference `docs/domain/cancellation-policy.md`. | Internal file; the rules must be stated in the Terms themselves. | Medium |
| D7 | CGU 16.1: VAYA may suspend "without notice" based on a "serious report from another Member". | No in-app reporting exists; suspension reasons are stored but no notification to the Member is implemented. No appeal path. | Medium |
| D8 | CGU 2: "courts have confirmed… information society service provider". | Refers to a Spanish appellate decision on BlaBlaCar; irrelevant as authority in Tunisia and overstated. | Low |
| D9 | Privacy §2.1: KYC includes vehicle info only; omits automated no-show, auto-completion, recurring-pattern detection, search analytics with coordinates, demand signals, cancellation reasons, report data, admin notes, Google profile photo. | All implemented. | **High** — incomplete transparency. |
| D10 | Privacy §2.2: GPS "during an active trip". | Also collected **before** the trip starts (from `start` onward, `driver_approaching`), and a one-off device location is used for "near me"/pickup and optionally attached to no-show reports. | Medium |
| D11 | Privacy §7: GPS not kept after trip end. | The last fix stays on the `trips` row indefinitely. | Medium |
| D12 | Privacy §10: "No directly identifying data is retained after deletion". | Vehicle plate number/make/model/colour and vehicle photo, driver bio, message contents, rating comments, analytics events with exact coordinates, demand signals, recurring patterns, notifications payloads (which contain names), reports, device tokens, OTP rows (phone numbers) remain. | **High** |
| D13 | Privacy §8: "journalisation des accès aux données sensibles". | Admin **reads** (incl. viewing KYC images) are not logged; only mutations are. | Medium |
| D14 | Privacy §3: legitimate interest used broadly. | Tunisian law has no general legitimate-interest basis comparable to GDPR (counsel to confirm). | Medium |
| D15 | Contact emails `privacy@vaya.tn`, `contact@vaya.tn`. | Not verified as existing; transactional email uses `no-reply@vaya-app.com`. Domain ownership unconfirmed. | Medium |
| D16 | No mention of admins, sub-processor names, or transfer destinations. | Twilio, Google, Expo, Resend, Sentry, Oracle, OpenStreetMap services identified in code. | Medium |
| D17 | CGU 19: exclusive jurisdiction of the court of VAYA's seat. | Potentially unfair against consumers. | Medium |
| D18 | CGU 16.2 / 3.3: one account per phone or Google identity. | A Google account and a phone account can be two accounts for one person; no technical enforcement. | Low |

**Interim recommendation:** until v2 is validated, correct D1, D2, D4 and D12 in the live
v1 text, or ship v2 — publishing known-false statements is worse than publishing a
narrower document.

---

## 4. Gap analysis

Format: **Reality** → **Legal implication** → **Action**.

1. **What VAYA does** — Technology platform for cost-shared carpooling; no transport, no
   payment. → Intermediary characterisation is credible because VAYA does not set the
   final price (driver chooses within a range), does not employ drivers, does not handle
   money. Risk factors pointing the other way: VAYA computes the price range, ranks
   matches, manages the booking lifecycle, applies sanctions. → Keep intermediary framing;
   avoid statements implying VAYA controls the ride.
2. **User categories** — Members (Passenger/Driver roles), administrators, unauthenticated
   visitors. → Terms must address public data exposure to visitors.
3. **VAYA's role** — Contract for the ride is between Members. → v2 Art. 3.
4. **Personal data processed** — see §5 inventory (~30 categories).
5. **Purposes** — see §5.
6. **Sources** — Member, device (GPS, push token), Google (Sign-In), other Members
   (ratings, reports, no-show reports), VAYA systems (inference, scores), admins.
7. **Recipients** — other Members (scoped), processors (§6), authorities.
8. **Processors** — §6. No DPAs evidenced in the repo. → Must sign before launch.
9. **International transfers** — Twilio (US), Google (US/global), Expo (US), Resend (US),
   Sentry (US or EU region), FCM/APNs (US), Oracle region **unknown**. → INPDP transfer
   authorisation (Tunisia); SCCs/DPF (GDPR scenario).
10. **Retention** — **No retention schedule is implemented anywhere.** No purge jobs exist
    for analytics, OTP rows, notifications, messages, last GPS fix, expired refresh tokens,
    demand signals, logs. → Decide and implement (§8 D-11).
11. **User rights** — Rectification in-app for name/avatar/language only; phone change
    flow exists for adding a phone; no email change; no export; no objection/restriction
    mechanism other than email. → Manual process via privacy contact; build export.
12. **Account deletion** — Implemented but incomplete (D12). Specific residue:
    `vehicles` (plate), `vehicles.photoUrl` file, `driver_profiles.bio/languages`,
    `verification_documents` rows (file URLs, files deleted), `messages.body`,
    `ratings.comment`, `analytics_events` (coordinates + userId),
    `demand_signals`, `recurring_patterns`, `device_tokens`, `notifications.payload`,
    `reports.description`, `otp_codes.phone`, `bookings.pickupLabel/lat/lng`.
    Also: the public profile endpoint still returns the vehicle (incl. plate) for a deleted
    driver. → Extend deletion; v2 Privacy Policy describes the target state and flags it.
13. **Security** — Good baseline from the September 2026 security sprint. Open items
    SEC-019…024 (public PII, 30-day refresh without rotation, admin JWT in localStorage, no
    admin MFA, GPS spoofing). No backups. → §7, §9.
14. **Location** — Foreground only; continuous ~7 s while a trip is underway and the app is
    open; latest fix only stored; pre-boarding redaction implemented. Search coordinates
    stored in analytics indefinitely. Ride origins are exact and public (may be a home).
    → Disclose precisely; coarsen public origins; set analytics retention.
15. **Messaging** — Text, 1,000 chars, booking-scoped, read-only after trip. No moderation,
    no reporting from chat, no admin access. Retained indefinitely. → Disclose; define
    retention; define how VAYA accesses messages in a dispute (currently it cannot without
    direct DB access — must be governed).
16. **User-generated content** — Name, avatar, bio, vehicle photo, ratings comments,
    messages, report descriptions. → Licence clause limited to operating the service.
17. **Ratings** — Public aggregates; private comments; automatic 1-star on no-show
    (including auto-classified no-shows). → Disclose; give contest route.
18. **Fraud/abuse prevention** — OTP limits, rate limits, one-shot route tokens, manual
    KYC, admin suspension. No duplicate-account detection. → Do not overclaim.
19. **Moderation** — Admin suspension/restriction/ride cancellation with internal reason;
    no Member notification of suspension reason implemented; no appeal. → Implement notice
    and appeal; Terms describe it.
20. **Driver/passenger responsibilities** — v2 Arts. 7–8.
21. **Cancellation/disputes** — Reputation-only. Disputes over cash payments are outside
    the platform (report category "payment_dispute" exists but unreachable).
22. **Payments/fees** — None. **Cost-sharing cap is per seat only.** Example: a 140 km/100
    min trip → recommended ≈ 34 DT per seat; max ≈ 44 DT; × 4 passengers ≈ 176 DT against a
    real fuel cost far below that. In Tunisia this is the core regulatory risk. → Decide
    (§8 D-6): occupancy-aware cap, total-ride cap, or remove the time component.
23. **Liability** — v2 Art. 15: no blanket exclusion; carve-outs for gross negligence,
    death/personal injury caused by VAYA, and mandatory consumer law.
24. **Insurance** — Driver provides own insurance; KYC captures the certificate but VAYA
    does not verify passenger coverage. Tunisian motor policies' treatment of
    cost-sharing passengers must be confirmed. → No VAYA insurance claim anywhere.
25. **Safety** — No SOS/emergency button, no trip-sharing with contacts, no reporting UI.
    → Terms must not imply these; add reporting before launch.
26. **Prohibited conduct** — v2 Art. 12.
27. **IP** — Brand "VAYA" trademark status unknown. → Confirm registration (INNORPI /
    EUIPO/OEPM).
28. **Availability** — Single VM, no backups, no SLA. → No availability promise.
29. **Suspension/termination** — Implemented (account-level and driver-level). → v2 Art. 17.
30. **Complaints** — No ticketing, no support channel in-app beyond legal links. → Define a
    support address and response target.
31. **Governing law/jurisdiction** — Unknown entity. → Placeholder; consumer carve-out.
32. **Minors** — 18+ stated; **no age check or age declaration at sign-up**. Driver licence
    review indirectly confirms adulthood for drivers only. → Add an age declaration.
33. **GDPR compliance** — Conditional on entity (§2). Missing: RoPA, DPIA (location +
    KYC + automated decisions), DPAs, transfer mechanism, DPO assessment.
34. **EU digital/consumer** — Conditional (§2).
35. **Tunisia-specific** — INPDP declaration, authorisations (sensitive data, transfers),
    transport-law framing, consumer law, e-commerce identification.
36. **Spain/EU-specific** — If Spanish entity: LSSI identification, LOPDGDD, AEPD,
    Spanish courts for consumers resident in Spain only, Tunisia transfers under SCCs.

---

## 5. Data processing inventory

Legal bases are given in GDPR terms (Art. 6(1)(b) contract, (c) legal obligation,
(f) legitimate interests, (a) consent; Art. 9(2)(a) explicit consent). Under Tunisian
Loi 2004-63, counsel must map each line to consent or a statutory exception; lines marked
†  are those most likely to need **express consent** in Tunisia.

| Data | Source | Purpose | Legal basis | Shared with | Retention (current → proposed) | User-visible? |
|---|---|---|---|---|---|---|
| Phone number | Member | Login (OTP), account identity, contact reveal after acceptance | Contract | SMS provider; counterpart after acceptance; admins | Account life → anonymised at deletion; OTP table keeps it indefinitely → **purge OTP rows after 30 days** | Own: yes; counterpart: after acceptance |
| One-time codes (hashed), attempts | System | Authentication security | Contract; LI (security) | — | Indefinite → **30 days** | No |
| Google ID, email, name, profile-photo URL | Google | Google Sign-In | Contract | Google (auth); email provider | Account life → anonymised at deletion | Email: admin only; photo: public |
| Full name | Member/Google | Identity shown to others | Contract | **Public (unauthenticated profile endpoint)**; counterparts; admins | Account life | Public |
| Avatar photo | Member (gallery) / Google | Trust | Contract (optional feature) | Public | Until replaced/deletion | Public |
| Language preference | Member/device | Localisation | Contract | — | Account life | Own |
| Auth tokens (hashed refresh tokens) | System | Session | Contract | — | 30 days; **expired rows never purged** → purge | No |
| IP address, request logs | Device | Security, rate limiting, debugging | LI | Hosting; Sentry (if enabled) | Unknown → **define (e.g. 30–90 days)** | No |
| Device push token, platform | Device | Push notifications | Contract | Expo → FCM/APNs | Until device re-registered; **not deleted at account deletion** | No |
| Driver selfie (live capture) † | Member | Manual identity check against licence | Art. 9(2)(a) explicit consent **if** treated as biometric; otherwise contract/LI. Tunisia: express consent + INPDP authorisation (to confirm) | Admins; storage provider | Until deletion (file deleted) → **propose deletion N days after decision** | Admin only |
| Driving licence image † | Member | Verify right to drive | Contract; LI (passenger safety) | Admins; storage | Same | Admin only |
| Insurance certificate image † | Member | Verify vehicle insurance | Contract; LI | Admins; storage | Same | Admin only |
| Verification status, decline reason/message, admin internal notes, attempt count | Admin | Verification workflow | Contract; LI | Admins | Indefinite → define | Status + message: yes; notes: **no (internal)** |
| Vehicle make/model/colour/plate/seats/photo | Member | Ride identification; pickup safety | Contract | **Public incl. plate (unauthenticated)** | Not deleted at deletion → **delete/anonymise** | Public |
| Driver bio, languages | Member | Profile | Contract (optional) | Public | Not cleared at deletion → clear | Public |
| Ride: origin/destination labels and exact coordinates, time, seats, price, route, stops, route type | Driver | Publication, matching | Contract | Public (search) | Indefinite; kept anonymised after deletion | Public |
| Search queries (place text) | Member | Place autocomplete | Contract | Google Places / Nominatim | Not stored by VAYA beyond analytics | No |
| Search analytics events with origin/destination coordinates, time, seats, results, selected ride, user ID | Member/app | Product analytics, demand insight | LI (Tunisia: †) | Admins (aggregated) | **Indefinite, kept after deletion** → 12 months then aggregate/anonymise; delete userId at deletion | No |
| Other in-app usage events (bookings, ratings prompts, push permission, etc.) | App | Product analytics | LI | Admins (aggregated) | Same | No |
| Demand signals ("notify me") | Member | Alert when ride appears | Contract | — | Indefinite → expire after window + 30 days | Own |
| Recurring-pattern detection (corridors, days, times, confidence) | Derived from history | Suggestions; proactive matches | LI with opt-out (dismiss) — Tunisia †; profiling disclosure | — | Indefinite → define | Own (suggestions) |
| Booking: seats, pickup/drop-off labels and coordinates, walk distance, status, timestamps, deadline, cancellation reason | Member/system | Booking performance | Contract | Counterpart; admins | Indefinite; retained anonymised | Parties |
| Fellow-passenger first name, avatar, rating, user ID | System | Show who's on board | LI | **Public (unauthenticated)** | — | Public |
| Messages | Members | Coordination between parties | Contract | Counterpart only; storage on VAYA DB | **Indefinite, not deleted at deletion** → define (e.g. 12 months after trip) | Parties |
| Live driver GPS (latest fix: lat/lng/heading/speed/accuracy/time) | Driver device | Tracking, ETA, lifecycle inference, auto no-show | Contract (Driver and Passengers); LI (safety) | Passenger after boarding; driver | Last fix kept indefinitely → **clear at trip end** | Passenger (post-boarding) |
| "Driver was near origin" flag, route-deviation state, live corridor | Derived | Lifecycle and no-show inference | Contract; LI | — | Indefinite | No |
| One-off device location | Device | "Near me", pickup placement, optional no-show evidence | Contract | — | Not persisted (used in request) | No |
| Ratings: stars, punctuality flag, comment | Members | Trust system | Contract; LI | Aggregates public; comment to rated Member (+ email) | Indefinite; comment kept at deletion → delete comment text | Aggregates public |
| Automatic 1-star rating and penalty points from no-show | System | Enforce reliability | LI; **Art. 22 safeguards** | — | Indefinite | Rating effect visible; points admin-only |
| Penalty points | System | Reliability tracking | LI | Admins | Indefinite | **Admin only** |
| Trust tier, reliability/punctuality scores | Derived | Trust before commitment | LI (profiling) | Public | Recomputed | Public |
| Co-travel history (relationship signals) | Derived from ratings | Not currently used for any decision | LI — or **stop collecting** | — | Indefinite | No |
| Notifications (type + payload incl. names, comments) | System | Inbox, push, email | Contract | Expo/FCM/APNs; Resend | Indefinite → 12 months | Own |
| Reports (category, description, linked booking/trip, resolution notes) | Member/admin | Safety, enforcement | LI; legal claims | Admins; authorities if required | Indefinite → define (e.g. 3 years after closure) | Reporter (no UI yet) |
| Suspension/restriction reason | Admin | Enforcement | LI | Admins | Indefinite | **Not notified to Member** |
| Admin audit log (admin, action, target, reason, before/after state) | System | Accountability | LI; legal obligation (security) | Admins | Indefinite; **cascade-deleted with the admin account** | No |
| Admin accounts (email, name, password hash, role, last login) | Staff | Admin access | Employment/contract | — | Account life | Staff |
| Crash reports (stack traces, device/OS, release) | App/API | Diagnostics | LI | Sentry (if enabled) | Provider default (e.g. 90 days) → confirm | No |
| Emails sent | System | Transactional notices | Contract | Resend | Provider logs | Own |

---

## 6. Third-party / sub-processor inventory

Locations are the provider's general processing locations; **each must be confirmed
against the account/region actually provisioned.** No DPAs are evidenced in the repository.

| Provider | Service | Data processed | Location | Transfer mechanism | Required action |
|---|---|---|---|---|---|
| Oracle (Oracle Cloud Infrastructure) | VM hosting API, worker, PostgreSQL, Redis, Caddy | Everything | **Region not recorded** | Depends on region: Tunisia→abroad needs INPDP authorisation; EU entity→EU region avoids GDPR transfer | Record region; sign OCI DPA; choose EU region if EU entity |
| S3-compatible object storage (AWS S3 / Cloudflare R2 / other — **not chosen**) | Avatars, vehicle photos, KYC documents (private bucket) | Images incl. ID documents | Unknown | Same | Choose provider + region; DPA; private-bucket policy; encryption at rest |
| Twilio Inc. | SMS OTP delivery | Phone number, message text (code) | US (global) | INPDP authorisation; SCCs/DPF | DPA; disclose; consider local SMS provider |
| Google LLC — Sign-In | Authentication | Google ID, name, email, photo URL | US/global | INPDP; SCCs/DPF | Google API terms; OAuth consent-screen verification |
| Google LLC — Maps Platform (Places, Geocoding, Routes) | Place search, routing, route alternatives, nearby places | Search text, coordinates of origins/destinations/stops (not user identity) | US/global | INPDP; Google Maps Platform data processing terms | Accept GMP DPA; disclose |
| Google LLC — Maps SDK (in app) | Map display | Device IP, map viewport, device identifiers per Google terms | US/global | Google is likely an independent controller for SDK telemetry | Disclose; Google attribution |
| Google (Firebase Cloud Messaging) / Apple (APNs) | Push delivery | Push token, notification content | US | Platform terms | Disclose; avoid sensitive content in push text |
| Expo (650 Industries, Inc.) | Push relay; EAS build | Push token, notification title/body | US | INPDP; SCCs/DPF | DPA; disclose |
| Resend, Inc. | Transactional email | Email address, name, booking/rating content | US | INPDP; SCCs/DPF | DPA; verify sending domain |
| Functional Software, Inc. (Sentry) — **only if DSN set** | Error tracking (API and app) | Stack traces, device/OS, possibly IP and request context | US or EU (choose) | SCCs/DPF | Choose EU region; scrub PII; DPA |
| OpenStreetMap Foundation / Nominatim (public instance) | Fallback geocoding | Search text | UK/EU | Usage policy; no DPA available | Avoid in production or self-host; disclose if used |
| Overpass API public instances (overpass-api.de, kumi.systems) | Pedestrian-zone / road checks | Coordinates near stops | Germany | Generally no personal data (coordinates only) | Self-host or accept; no identity sent |
| Self-hosted OSRM | Routing fallback | Coordinates | VAYA host | — | None |
| Apple App Store / Google Play | Distribution | Per store policies | Global | Independent controllers | Privacy labels / data-safety forms |

---

## 7. Admin application — privacy, security and access-control audit

### 7.1 What administrators can see and do

| Capability | Role | Data exposed | Audit-logged? |
|---|---|---|---|
| Search users by name / phone / email; list users | admin | Full user rows incl. phone, email, Google ID, suspension and deletion fields | No (read) |
| User detail | admin | Profile, driver profile, vehicles incl. plate, document list, penalty points, last 20 rides and bookings | No (read) |
| Suspend / reactivate account | superadmin | — | Yes |
| Restrict / unrestrict driver privileges | superadmin | — | Yes |
| Ride list / detail | admin | Driver and all riders' full user rows, stops, trips (incl. last GPS fix) | No (read) |
| Cancel a ride (cascades to bookings, notifies riders) | **admin** (not superadmin) | — | Yes |
| Verification queue / detail / **view KYC images** | admin | Selfie, licence, insurance images streamed via API | **No — document views are not logged** |
| Approve / decline verification (user-facing message + internal notes) | admin | — | Yes |
| Reports list / update | admin | Reporter and reported full user rows, description | Mutations only |
| Analytics (overview, corridor demand, search funnel) | admin | Aggregates | No |
| Audit-log viewer | admin | Admin actions | No |
| Operational policy configuration | superadmin | — | Yes |
| Failed background jobs: list/retry | admin (confirm) | Job payloads (may include notification content / user IDs) | Confirm |
| Read messages | **none** | — | n/a |
| Delete accounts / export data / edit content | **none** | — | n/a |
| Create/manage admin accounts | **none (DB/seed only)** | — | n/a |

### 7.2 Findings

| # | Finding | Risk | Recommendation | Priority |
|---|---|---|---|---|
| A1 | Seed script creates `admin@vaya.tn` / `VayaAdmin2026!` superadmin; password is in the repo and docs. | Full compromise if seed ever runs against production or the account is not rotated. | Never run seed in production; delete/rotate account; startup check refusing the known hash. | **Must** |
| A2 | No MFA for admin accounts (SEC-022); scrypt below OWASP parameters. | Credential stuffing → access to all KYC images. | TOTP/WebAuthn for all admins; raise scrypt cost. | **Must** |
| A3 | Admin JWT stored in `localStorage`, 4 h, weak CSP (SEC-020). | XSS → token theft. | httpOnly SameSite=Strict cookie; strict CSP; IP allow-listing or VPN for admin. | Should |
| A4 | Reads of sensitive data (KYC images, user detail, search by phone) are not logged. | Cannot detect or prove misuse; v1 policy claims logging. | Log every KYC document view and user-detail view (who/when/why). | **Must** |
| A5 | Two roles only; every `admin` can view all KYC documents and all users. | No least privilege. | Add a "support/analyst" role without KYC access; KYC access only for verification reviewers. | Should |
| A6 | Admin endpoints return full DB rows (`anyResponse`), incl. Google ID and fields the UI never shows. | Over-exposure, larger blast radius. | Explicit response schemas / field allow-lists. | Should |
| A7 | `audit_logs.adminUserId` is `ON DELETE CASCADE`. | Deleting an admin erases their audit trail. | Change to `RESTRICT`/`SET NULL` + keep admin email snapshot; make audit log append-only. | **Must** |
| A8 | Any `admin` (not only superadmin) can cancel any ride. | Disproportionate power, Members affected. | Keep but require reason (already) and consider superadmin; notify driver. | Later |
| A9 | Suspension/restriction is not notified to the Member, no statement of reasons, no appeal. | Fairness/consumer-law issue; DSA Art. 17/20 if EU recipients. | Notify with reason; appeal via support; human review. | **Must** |
| A10 | Verification decisions are manual but there is no written review procedure (what counts as a match, expiry checks). | Inconsistent decisions; discrimination risk. | Written KYC review SOP; reviewer training; four-eyes for declines. | Should |
| A11 | No admin tooling for data-subject requests (export, rectification, erasure of residue). | Rights requests require direct DB access by engineers, unlogged. | Admin DSR tool with logging, or documented engineer procedure with ticket and log. | Should |
| A12 | No admin access to messages or ratings comments. | Good for privacy; but harassment reports cannot be investigated. | Decide policy: access a specific conversation only when a report references it, logged, by authorised staff; disclose in Privacy Policy. | Should |
| A13 | Admin dashboard has no session/access review, no off-boarding procedure. | Ex-staff access. | Quarterly access review; immediate revocation SOP. | Should |
| A14 | Last GPS fix of every trip visible in ride detail data. | Location exposure. | Clear at trip end. | Should |

---

## 8. Legal/Product decisions required before launch

| # | Decision | Owner | Blocks |
|---|---|---|---|
| D-1 | **Operating entity**: legal name, form, registration number (RNE/NIF), tax ID, registered address, country of establishment. | Founders + counsel | Both documents (controller identity), governing law, GDPR applicability |
| D-2 | **Contact channels** that actually exist: support email, privacy email, postal address; decide domain (`vaya.tn` vs `vaya-app.com`). | Founders | Both documents |
| D-3 | **DPO / representative**: appoint or document decision not to; if Spanish entity processing large-scale location data, assess Art. 37 GDPR; INPDP formalities. | Counsel | Privacy Policy |
| D-4 | **Governing law and courts**, with consumer carve-out. | Counsel | Terms |
| D-5 | **Hosting and storage regions**; list of processors with signed DPAs. | Engineering + counsel | Privacy Policy, INPDP filing |
| D-6 | **Cost-sharing cap**: make the cap hold for the whole ride (occupancy-aware or total-ride cap) or accept documented legal risk; decide whether to keep the per-minute component. | Founders + Tunisian counsel | Terms Art. 6; regulatory exposure |
| D-7 | **KYC legal basis**: obtain explicit consent (screen + stored record with version/timestamp) and/or confirm INPDP authorisation; decide selfie/document retention after decision. | Counsel + engineering | Driver onboarding launch |
| D-8 | **Reporting and blocking**: ship in-app report UI (API exists) and decide on blocking. | Product | Terms Art. 13, safety claims |
| D-9 | **Moderation process**: notification of suspension with reasons, appeal route, response targets. | Product + ops | Terms Art. 17 |
| D-10 | **Automated decisions**: keep automatic no-show classification (with 1-star + penalty) or require human/counterparty confirmation; provide contest route. | Product + counsel | Privacy §11; Terms Art. 10 |
| D-11 | **Retention schedule** (proposals in §5) and purge jobs. | Product + engineering | Privacy §10 |
| D-12 | **Public exposure** (SEC-019): plate, full name, fellow passengers, exact ride origins visible without login. | Product | Privacy §6 |
| D-13 | **Phone reveal**: keep (then disclose and let Members know), or replace with masked calling. | Product | Privacy §6 |
| D-14 | **Message access policy** for investigations. | Product + counsel | Privacy §6, §12 |
| D-15 | **Age assurance**: add an 18+ declaration at sign-up. | Product | Terms Art. 4 |
| D-16 | **Acceptance mechanism**: clickwrap with stored acceptance (version, timestamp) instead of browsewrap; re-acceptance on material change. | Product + engineering | Enforceability |
| D-17 | **Platform fees**: confirm none at launch (documents say none). | Founders | Terms Art. 9 |
| D-18 | **Insurance position**: obtain Tunisian insurer/FTUSA confirmation on passenger coverage in cost-sharing. | Founders | Terms Art. 16 |
| D-19 | **Trademark** "VAYA" clearance and registration. | Founders | Terms Art. 18 |
| D-20 | **Language**: French master (Tunisia) vs. Spanish/English (if EU entity); professional legal translation (fr/ar/en). | Counsel | Publication |
| D-21 | **Data export** tool or manual SOP with deadline. | Product | Privacy §12 |
| D-22 | **Emergency/safety features** (none today): decide whether to add an emergency-call shortcut; Terms must not imply one exists. | Product | Terms Art. 13 |

---

## 9. Launch checklist

### Must fix before launch

- [ ] D-1, D-2, D-4, D-5: fill every `[ACTION REQUIRED — CONFIRM]` in both v2 drafts.
- [ ] External review by a licensed Tunisian lawyer (transport-law framing, consumer law,
      Loi 2004-63) and, if an EU entity is used, by EU/Spanish privacy counsel.
- [ ] INPDP: declaration of processing; authorisation(s) for KYC images (if required) and
      for transfers abroad.
- [ ] Remove or correct the false statements in the live v1 texts (D1, D2, D4, D12) or ship
      the validated v2.
- [ ] KYC explicit-consent screen + stored consent record (D-7).
- [ ] Clickwrap acceptance with version logging (D-16) and 18+ declaration (D-15).
- [ ] Ship in-app **report a user/trip** UI (D-8).
- [ ] Notify suspended/restricted Members with reasons + appeal route (A9).
- [ ] Complete account deletion: vehicle (plate, photo), bio, device tokens, notifications,
      demand signals, recurring patterns, analytics `userId`, rating comments, message
      bodies (or a disclosed retention), OTP rows; hide deleted drivers' vehicles from the
      public profile (D12).
- [ ] Retention schedule + purge jobs for OTP rows, refresh tokens, last GPS fix,
      analytics coordinates (D-11).
- [ ] Admin: rotate/remove seeded superadmin (A1), MFA (A2), log KYC/user-detail reads (A4),
      fix audit-log cascade (A7).
- [ ] Sign DPAs with every provider in §6; record regions; fill the provider list.
- [ ] Database backups with tested restore (also a security-of-processing requirement).
- [ ] Decide D-6 (cost-sharing cap) with Tunisian counsel — the regulatory core.
- [ ] Deploy the website so the Privacy Policy URL is public; store privacy labels match §5.

### Should fix before launch

- [ ] Require authentication for plate number and fellow-passenger lists; coarsen public
      ride origin coordinates until acceptance (D-12 / SEC-019).
- [ ] Refresh-token rotation; admin session in httpOnly cookie + strict CSP (SEC-020).
- [ ] Least-privilege admin roles; field allow-lists on admin responses (A5, A6).
- [ ] Contest route for automatic no-show classification and automatic 1-star (D-10).
- [ ] Written KYC review SOP (A10); message-access policy (D-14).
- [ ] DPIA covering location tracking, KYC and automated decisions (mandatory under GDPR
      in the EU-entity scenario; best practice otherwise).
- [ ] Record of processing activities based on §5.
- [ ] Choose Sentry EU region with PII scrubbing; avoid public Nominatim in production.
- [ ] Support channel inside the app.
- [ ] Stop storing `relationship_signals` or document its purpose.

### Can address after launch

- [ ] Self-service data export.
- [ ] Blocking between Members.
- [ ] Masked calling instead of phone reveal.
- [ ] Emergency/SOS and trip sharing.
- [ ] DSA-grade transparency tooling (only needed if EU recipients are served).
- [ ] Notification preference centre (email opt-out for non-essential messages, if any are
      added).

---

## 10. Quality-control log for the v2 drafts

A second pass was run against the drafts for the issues the brief lists. Changes made:

- **Impossible promises removed**: v1's "the contribution can never exceed costs" became
  an obligation on the Driver plus a description of what VAYA's mechanism actually does
  (per-seat range), with the gap flagged (D-6).
- **Features that don't exist removed**: no claim of in-app reporting being available
  until D-8 ships — the Terms describe reporting "in the app where available, or by
  email"; no SOS, no blocking, no automated KYC, no payments.
- **Contradictions resolved**: phone disclosure now stated consistently in Terms Art. 11
  and Privacy §6; cancellation thresholds identical in Terms Art. 10 and the code
  defaults, with a note that VAYA can adjust them only prospectively and with notice.
- **Overbroad disclaimers removed**: liability clause keeps mandatory-law carve-outs;
  no "as is, with all faults" absolutes; no unilateral termination "for any reason".
- **Legal bases corrected**: consent used only where it is the right basis (KYC under
  Art. 9 if applicable, push notifications OS permission, location OS permission as a
  technical not legal basis); contract and legitimate interests used elsewhere;
  Tunisian consent-centric regime flagged for counsel.
- **Retention**: the Privacy Policy states current behaviour and marks proposed periods
  `[ACTION REQUIRED — CONFIRM]` rather than inventing figures; no conflicting periods
  between documents.
- **Undefined terms**: all capitalised terms defined in Terms Art. 1 and reused in the
  Privacy Policy.
- **Admin processing**: disclosed in Privacy §8 (who can access, what is logged).
- **Unfair-term risk**: jurisdiction clause carries a consumer carve-out; unilateral
  modification requires notice and a right to close the account; suspension requires
  reasons and an appeal route.
- **Remaining open points** are all tagged `[ACTION REQUIRED — CONFIRM]` (searchable).
