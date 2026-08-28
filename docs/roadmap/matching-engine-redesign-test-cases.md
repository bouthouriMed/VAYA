# Matching-engine redesign — manual UI test cases

Seeded by `apps/api/src/db/seed-matching-scenarios.ts` against the shared dev
Postgres instance (docker-compose, port 5433) — **read the "Important caveat"
section below before testing**, then run the app against that same database.

Login is OTP-based. To fetch a code for any phone number below:

```sql
SELECT code FROM otp_codes WHERE phone = '<phone>' ORDER BY created_at DESC LIMIT 1;
```

(`docker exec vaya-postgres psql -U vaya -d vaya -c "..."`, or via `pnpm db:studio`.)

---

## Important caveat — shared database

This dev Postgres instance is shared with your main checkout's own running
dev servers (`apps/api`'s `tsx watch`, `apps/admin`'s vite dev server) and
possibly other concurrent sessions — it is **not** an isolated sandbox
scoped to this worktree. Two things worth knowing before you test:

1. The database was wiped (`TRUNCATE`) and reseeded during this session.
   If you had unsaved manual test data in it, it's gone.
2. At the moment this was written, your main checkout's own `pnpm db:seed`
   process was independently running against the same database (I didn't
   start it, and didn't kill it — killing another active process felt like
   the wrong call to make on my own). The database now contains a mix of
   the original canonical demo dataset (drivers/rides named things like
   "El Menzah 5 → Tunis Digital Center", "Ben Arous → Tunis") **and** the
   scenario data below. This means a search in scenarios 2 and 3 may show
   *additional* rides beyond the ones described here — that's expected;
   just confirm the **specific labeled rides/drivers below** behave as
   described, not that they're the only results.

If you'd rather test against a clean, fully isolated database going
forward, say so and I'll set one up rather than reusing the shared one.

---

## Scenario 1 — Segment-aware multi-passenger capacity

**What this proves:** a ride's seats are no longer tracked as one
ride-global counter. Two passengers on genuinely non-overlapping legs of
the same route can both be accepted even on a ride with very few seats —
and a request that actually overlaps an already-accepted booking's segment
is correctly rejected.

**Setup already seeded:** Ride R1, driver **Sami Trabelsi**
(`+216736866301`), Tunis → Hammamet → Sousse → Monastir, **2 seats**. Three
*pending* requests already exist on it:

| Booking | Rider | Phone | Segment | Seats |
|---|---|---|---|---|
| A | Ines Zouari | `+216736866302` | Hammamet → Sousse | 1 |
| B | Karim Fassi | `+216736866303` | Sousse → Monastir | 1 |
| C | Nour Khedher | `+216736866304` | Hammamet → Sousse | 2 |

**Steps:**

1. Log in as the driver (`+216736866301`).
2. Open **Trips → your published ride (Tunis → Monastir)**. You should see
   3 pending requests: Ines, Karim, Nour.
3. Tap **Accept** on Ines's request (Hammamet → Sousse, 1 seat).
   - Expect: succeeds. Ride still shows as published, not full.
4. Tap **Accept** on Karim's request (Sousse → Monastir, 1 seat).
   - Expect: **also succeeds** — even though the ride only has 2 seats and
     Ines already has one, Karim's segment doesn't overlap hers. This is
     the core thing to verify: the old ride-global model would have shown
     this ride as "full" the moment Ines was accepted, blocking Karim
     entirely.
5. Tap **Accept** on Nour's request (Hammamet → Sousse, 2 seats — the same
   segment Ines is already on).
   - Expect: **rejected** with an error (not enough seats for this segment
     of the route) — Ines (1 seat) + Nour (2 seats) = 3 on a segment that
     only has 2 seats total, even though Karm's non-overlapping booking
     didn't touch this segment at all.

**Direct DB check** (optional, confirms the recompute):
```sql
SELECT status, seats_available FROM rides WHERE id = '<R1 ride id from seed output>';
```
Should read `published` / `1` after steps 3-4 (bottleneck is the busiest
segment — Hammamet→Sousse, 1 seat in use — not simply "seatsTotal minus
count of accepted bookings").

---

## Scenario 2 — Banded ranking (no tier hides a better match)

**What this proves:** a real "exact"-tier match that scores poorly no
longer buries an excellent route-passthrough match found by a different
mechanism — both surface together, ranked by actual quality, and only a
genuinely standout candidate gets the "best match" badge.

**Setup already seeded:**
- Ride **E1** (driver **Youssef Trabelsi**, `+216736866305`) — a real
  endpoint ("exact"-tier) match for the search below, but a mediocre one:
  its own pickup/dropoff sit ~1.7km/2.5km from your search points and its
  departure is ~45 min off.
- Ride **P1** (driver **Mehdi Gharbi**, `+216736866306`) — a
  route-passthrough match: its real route runs from Tunis through Hammamet
  and Sousse to Monastir, with real driver-selected stops right at your
  search points, departing close to your search time.

**Steps:**

1. Log in as any rider (e.g. Ines, `+216736866302`, or create a new
   account).
2. Search: origin **"Hammamet Centre"** (or drop a pin at `36.400, 10.610`),
   destination **"Sousse Centre"** (`35.8256, 10.6369`), time: leave as
   "now"/default.
3. Expect **both** Youssef's and Mehdi's rides to appear in the results
   list, not just whichever the old tier cascade would have found first.
4. Expect **Mehdi's ride (P1)** to rank above Youssef's (E1) and to carry
   the route-passthrough badge ("Sur votre trajet" / on-route pill).
5. Expect **Mehdi's ride** to carry the "best match" badge, and **Youssef's
   ride to not carry it** — the server only crowns a standout when one
   candidate is genuinely, clearly ahead; here P1 clearly is.

**Contrast check:** open the ride details for Youssef's ride directly (E1)
— it should still show real, honest data (real driver, real price), it's
just correctly ranked lower, not hidden.

---

## Scenario 3a — Commute-profile radius narrowing

**What this proves:** search radii now scale down for a short trip instead
of using one flat radius for every distance.

**Setup already seeded:**
- Ride **F1** (driver **Rania Chaabane**, `+216736866307`, "Tunis, Le
  Bardo" → "El Menzah") — its pickup sits **~5.5km** from the search
  origin below. Under the old flat 8km radius it would have appeared;
  under the new commute-scaled ~4km radius it should not.
- Ride **F2** (driver **Hedi Sassi**, `+216736866308`, "Ariana, Route de
  Raoued" → "El Menzah") — **~2.8km** from the search origin, inside the
  new radius either way — the positive control proving the search itself
  still works.

**Steps:**

1. Search: origin **"Ariana"** (`36.8625, 10.1956`), destination **"El
   Menzah"** (`36.8895, 10.1956`) — a short, ~3km trip. Time: now.
2. Expect **Hedi Sassi's ride (F2)** to appear.
3. Expect **Rania Chaabane's ride (F1)** to **not** appear (it's real,
   published, and would have shown up before Phase A's change — check via
   the driver dashboard or `db:studio` if you want to confirm it exists
   but is absent from these results specifically).

---

## Scenario 3b — Intercity-profile radius widening

**What this proves:** the reverse — a long trip gets a *wider* radius than
the old flat default, so a real driver whose endpoints are meaningfully
off the direct line still surfaces.

**Setup already seeded:** Ride **I1** (driver **Amine Bel Haj**,
`+216736866309`, "Grombalia" → "Sfax, Route de Tunis") — its pickup sits
**~15km** from the search origin and its dropoff **~18km** from the search
destination. Under the old flat 8km/10km radius it would never have
appeared; under the new intercity-scaled ~20km/25km radius it should.

**Steps:**

1. Search: origin **"Tunis"** (`36.8065, 10.1815`), destination **"Sfax"**
   (`34.7406, 10.7603`) — a ~270km intercity trip. Time: now.
2. Expect **Amine Bel Haj's ride (I1)** to appear in the results.

---

## Reference — all seeded phone numbers

| Role | Name | Phone |
|---|---|---|
| Driver, R1 (segment capacity) | Sami Trabelsi | `+216736866301` |
| Rider A | Ines Zouari | `+216736866302` |
| Rider B | Karim Fassi | `+216736866303` |
| Rider C | Nour Khedher | `+216736866304` |
| Driver, E1 (mediocre exact) | Youssef Trabelsi | `+216736866305` |
| Driver, P1 (excellent passthrough) | Mehdi Gharbi | `+216736866306` |
| Driver, F1 (excluded, commute) | Rania Chaabane | `+216736866307` |
| Driver, F2 (included, commute) | Hedi Sassi | `+216736866308` |
| Driver, I1 (included, intercity) | Amine Bel Haj | `+216736866309` |

Re-running the seed script produces new, different phone number suffixes
(they're derived from the run's own timestamp) — re-check console output
or query `users` by `full_name` if you reseed.

To reseed from scratch:
```bash
# from apps/api, against the same DATABASE_URL your app uses
pnpm exec tsx src/db/seed-matching-scenarios.ts
```
(This script never touches `db/seed.ts` and is safe to re-run — it only
ever inserts new rows, never deletes.)
