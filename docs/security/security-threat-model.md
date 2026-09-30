# VAYA Threat Model

Companion to `security-audit.md` (finding IDs `VAYA-SEC-nnn` refer to it). STRIDE-based, organised by asset and trust boundary, then the highest-impact attack chains.

## 1. Assets (what an attacker wants)

| Asset | Where it lives | Why it matters |
|---|---|---|
| User identity / session | `users`, `refresh_tokens`, JWTs, SecureStore | Account takeover = access to bookings, messages, contact phone, live location |
| **Location data** | `rides` (origin/destination/polyline), `bookings` pickup/dropoff, `trips` live GPS, `analytics_events` (searched origin/destination), Redis/WS fan-out | Reveals homes, workplaces, routines; a safety risk for riders and drivers |
| KYC documents (ID/licence/insurance/**selfie — biometric**) | `secure-uploads/` or S3 `secure/`, `verification_documents` | Identity fraud; regulated under Tunisian Loi 2004-63 / INPDP |
| Contact phone numbers | `users.phone`, `GET /bookings/:id/contact-phone` | Revealed only for an accepted booking |
| Messages | `messages` | Private rider↔driver conversation |
| Marketplace integrity | seats, price bounds, booking/trip state machines, ratings/trust tiers | Fraud, reputation farming |
| Admin capability | `admin_users`, admin JWT | Suspend accounts, approve drivers, change matching/cancellation policy |
| Platform spend | Twilio SMS, Google Places/Routes, S3 egress | Direct financial cost of abuse |
| Secrets | `JWT_SECRET`, Twilio/S3/Google/Resend/Sentry keys | Full compromise |

## 2. Trust boundaries & actors

```
Internet ─▶ Caddy (TLS, headers, /metrics blocked, 1 proxy hop)
         ─▶ API (Fastify)  ─▶ Postgres/PostGIS   ─▶ Redis (cache, BullMQ, pub/sub)
                           ─▶ Twilio, Google Places/Routes, Expo push, Resend, S3, Sentry
Mobile app (untrusted client; holds tokens in SecureStore)      Admin SPA (token in localStorage)
Worker process (BullMQ) — shares DB/Redis/secrets with API
```

Actors: anonymous internet user; authenticated rider; authenticated driver (incl. malicious); colluding rider+driver pair; stolen-token holder; compromised/rogue admin; supply-chain attacker (npm); insider with DB read.

**Zero-trust rules applied:** the client is never trusted for role, user id, price, distance, seat capacity, pickup/dropoff validity, stop membership, file identity or trip state; the API re-derives each server-side. Client-side gating (hidden screens, route guards, TypeScript types) is treated as UX only.

## 3. STRIDE by component

| Component | S — Spoofing | T — Tampering | R — Repudiation | I — Info disclosure | D — DoS | E — Elevation |
|---|---|---|---|---|---|---|
| **Phone/OTP auth** | OTP leak/brute force (SEC-001/002/007) — mitigated | Concurrent replay (SEC-002) — mitigated | — | Plaintext codes at rest — mitigated | Targeted lockout of a number (accepted); SMS pumping (SEC-007) — mitigated | — |
| **Google OAuth** | Unverified email / re-link (SEC-003) — mitigated; login-CSRF (SEC-024) open | — | — | `code`/`ticket` in logs — mitigated | — | `state` JWT used as bearer — mitigated |
| **Sessions/JWT** | Stolen refresh token valid 30 d, no rotation (SEC-020) open | fast-jwt advisories (SEC-014) patched | — | Token in WS query string logged — mitigated | — | Admin token role stale after demotion — mitigated |
| **Ride/booking engine** | — | Duplicate/concurrent requests (SEC-006), seat overflow (SEC-013), premature completion (SEC-004) — mitigated; price is server-computed and bounded (verified) | Audit log for admin actions (SEC-018) | Public plate/name/passenger list/exact coords (SEC-019) open | Expensive matching/routing anonymously (SEC-011) — mitigated | Driver/rider role checks server-side (verified) |
| **Live tracking (WS/GPS)** | Any JWT accepted (SEC-012) — mitigated | GPS spoofing (SEC-021) open | — | Pre-boarding rider must not see raw driver GPS — enforced server-side incl. WS push (verified) | Socket count per trip unbounded (low; global IP limit) | — |
| **Messaging** | — | No edit/delete API exists (verified) | — | Only conversation parties (verified, per request) | Unbounded history read/spam (SEC-015/011) — mitigated | — |
| **Uploads/KYC** | Foreign-file reference (SEC-009) — mitigated | Non-image content (SEC-010) — mitigated for relay; presigned open | KYC views logged (SEC-018) | Secure area never statically served (verified); public bucket area is by design | Presigned PUT size (SEC-010) open | — |
| **Admin** | Case-variant limit bypass (SEC-005) — mitigated; no MFA (SEC-022) open | localStorage token XSS (SEC-020) open | Audit log on all mutating actions | PII in list/detail (by role) | — | Role re-read from DB (SEC-005) |
| **Infra** | — | — | — | Metrics/docs/health disclosure (SEC-008/017), DB/Redis exposure (SEC-016) — mitigated | Rate-limit counters per-process (SEC-023) open | Container runs as non-root `node` (verified) |
| **Supply chain** | — | Dependabot + CI audit exist; CI audit is non-blocking (see hardening §5) | — | — | — | Install scripts not audited in depth (hardening §5) |

## 4. Highest-impact attack chains

**Chain A — mass account takeover (was live in default deployment) → closed**
`anonymous → POST /auth/otp/request (devCode in response) → POST /auth/otp/verify → session as any user → read bookings/contact phone/messages/live location → act as driver`. Broken at: devCode fail-closed (SEC-001), plus forced `NODE_ENV=production`.

**Chain B — targeted takeover by guessing → closed**
`attacker knows victim's phone → rotates X-Forwarded-For (trustProxy:true) → unlimited /auth/otp/verify → guesses among N simultaneously-valid plaintext codes`. Broken at: real per-phone limiter (SEC-007), one live code, per-code + per-window attempt caps, atomic consume (SEC-002), hop-count proxy trust.

**Chain C — Google identity confusion → closed**
`attacker registers a Google identity asserting victim@ (unverified) → sign in → linked to / replaces victim's Google binding → owns victim's VAYA account`. Broken at: `email_verified` requirement + no re-binding (SEC-003).

**Chain D — reputation farming (partially closed)**
`two accounts → publish ride → book → accept → complete instantly → rate 5★ ×N → "Top VAYA" tier → trust used to win real bookings`. Closed: unilateral/early completion (SEC-004). **Open:** a colluding pair can still drive the real start→board→complete endpoints (SEC-021). Mitigation path: pair-velocity limits using `relationship_signals`, minimum duration/distance for reputation credit, GPS plausibility.

**Chain E — cost exhaustion (closed)**
`anonymous loop over /geocoding/*, /matching/search, OTP request to many numbers → Google/Twilio bill`. Closed by per-route + per-IP limits (SEC-007/011). Residual: limits are per-process (SEC-023).

**Chain F — admin compromise → open (needs product/infra)**
`XSS in admin SPA (or malware) reads localStorage token → 4 h of admin API → view KYC selfies, suspend users, change policy`. Reduced: 4 h TTL, DB re-verification, role re-read, KYC views audited. **Open:** move to `httpOnly` cookie + CSP + MFA (SEC-020/022).

**Chain G — location surveillance (open by design)**
`anonymous → /matching/search or GET /rides/:id → exact origin/destination of drivers/riders`. Ride endpoints are intentionally public so guests can browse; precise start points may be a home address. See SEC-019.

## 5. Location & privacy specifics

- Live driver GPS is redacted for riders until boarding, in both the REST snapshot and the WebSocket push (`lib/realtime.ts` `redactForRider`, unit-tested).
- GPS pings are rate-limited (20/10 s) and only the trip's driver may submit them.
- Logs: request logging is limited to method/URL/host/IP with secret query parameters masked; the `req` body is never logged. Do not add `request.body` to log statements (it contains coordinates and phone numbers).
- Analytics events store searched origin/destination with the user id. **No retention limit exists** — define one (recommended ≤ 90 days, or coarsen coordinates to ~1 km) before launch; this is a privacy-policy commitment as much as a security control.
- Admin access to location: admins can read rides/bookings/trips through admin detail endpoints; access is role-gated and the writes are audited, **reads are not** (except KYC documents). Consider read-audit for user/trip detail.
- Account deletion anonymises PII and erases KYC files; ratings/messages remain attached to the anonymised row by design (see `docs/legal/`).

## 6. Assumptions (verify in your environment)

1. TLS terminates at Caddy and the API port is not reachable from the internet except through it (`expose`, not `ports`, in `docker-compose.oracle.yml`).
2. Only one reverse-proxy hop sits in front of the API (`TRUST_PROXY=1`).
3. Postgres/Redis are private-network or managed services with TLS and credentials (the repo's compose files are dev/dry-run only).
4. S3/R2 bucket: the `secure/` prefix is private, the `public/` prefix is read-only-public, and no object is writable without a presigned URL.
