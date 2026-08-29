VAYA — Unified Passenger & Driver Journey Specification

Status: Product truth / implementation reconciliation specification
Purpose: Establish one authoritative behavioral contract for VAYA. The existing implementation must be audited against this document before changes are made.

1. Core Product Model

VAYA is not an exact origin-to-destination ride marketplace.

It is a dynamic corridor-matching system.

A driver publishes an intended journey:

Madrid → Barcelona

VAYA transforms that journey into a potentially serviceable corridor.

A passenger can subsequently request:

Madrid → Zaragoza
Zaragoza → Barcelona
Zaragoza → Lleida
or another feasible segment

even when the passenger's exact origin/destination was never configured by the driver.

The system's job is to determine:

Can this passenger realistically be transported by this driver while keeping the journey acceptable for both parties?

This requires combining:

road-network routing
corridor overlap
timing
current driver position
pickup/drop-off feasibility
detour impact
existing passenger commitments
seat availability by segment
pricing
reliability/trust
operational constraints

The UX should expose the insights resulting from this complexity, not the underlying technical complexity.

2. Fundamental Product Principles
P1 — Passenger intent is the primary search objective

VAYA searches for the best solution to the passenger's requested journey.

The search is not a simple database filter.

If an exact match doesn't exist, VAYA should intelligently find useful alternatives rather than immediately returning an empty state.

P2 — Drivers publish corridors, not every possible passenger journey

A driver publishing:

Madrid → Barcelona

does not need to manually publish:

Madrid → Zaragoza
Zaragoza → Barcelona
Madrid → Lleida
Zaragoza → Lleida
etc.

VAYA derives feasible passenger segments automatically.

P3 — Passenger matching does not require an exact route overlap

A passenger's requested route can be partially overlapping with the driver's route.

The system must calculate whether the passenger can realistically be accommodated.

P4 — Pickup and drop-off are optimization problems

The passenger's requested coordinates are not automatically the physical meeting points.

VAYA should determine practical pickup/drop-off locations considering both sides.

P5 — Driver and passenger receive different views of the same underlying truth

Passenger needs to understand:

“Can this trip get me where I need to go, when I need to go, and what will I have to do?”

Driver needs to understand:

“What exactly will accepting this passenger do to my journey?”

Both should receive enough information to make an informed decision.

P6 — User actions are confirmations, not the source of truth

Buttons such as:

Start trip
Passenger onboard
Finish trip
Report no-show

should accelerate or confirm system state.

VAYA must not remain permanently incorrect because a user ignored a CTA.

Where reliable system signals exist, VAYA should infer the state automatically.

P7 — Never expose false certainty

ETAs are estimates.

VAYA should distinguish:

estimated
confirmed
inferred
unavailable

The system should not claim that a passenger is onboard merely because two GPS points briefly become close.

P8 — Maps should explain the journey

Maps are not decorative backgrounds behind cards.

They should visually communicate:

planned driver route
relevant passenger route
overlap
pickup
drop-off
detour
current progress where appropriate

The route must be visually prominent and the viewport intelligently fitted.

3. Driver Publishing Flow
3.1 Origin and destination

Driver selects:

origin
destination

The driver can search naturally.

Examples:

Tunis
Madrid
a specific street
Tortosa
a landmark/place

The same applies to destination.

The location search should be intuitive and not unnecessarily constrain users to cities.

4. Driver Pickup and Drop-off Configuration

After origin/destination selection, VAYA calculates the driver's route options.

The map must:

clearly highlight the selected route
make alternative routes distinguishable
fit/zoom the viewport around the route
avoid zooming so far out that the route becomes difficult to understand

The driver chooses the intended route.

4.1 Pickup points

VAYA recommends practical pickup points near the driver's origin.

Recommendations must consider real-world accessibility.

A recommended point should not be:

on a highway where stopping is impractical/illegal
inside pedestrian-only areas
somewhere a vehicle cannot reasonably stop
otherwise operationally unsuitable

Recommendations should consider:

road accessibility
stopping/parking feasibility
safety/practicality
proximity
route continuity

Driver can:

select a recommended pickup point
manually place/select another point
4.2 Drop-off

Exactly the same principle applies.

VAYA recommends practical drop-off points.

Driver can:

select recommendation
manually choose another feasible point
5. Driver Stops / Corridor Intent

After route selection, VAYA recommends meaningful stops along the route.

Example:

Madrid → Barcelona

should recognize major/intermediate cities such as:

Zaragoza
Lleida

rather than simply showing every small settlement intersecting the polyline.

Critical distinction

A selected stop is not a fixed pickup coordinate.

When a driver selects:

Zaragoza

they are communicating:

“I am willing to accommodate a reasonable detour around Zaragoza.”

VAYA later determines the actual passenger pickup/drop-off location.

The driver should not be forced to manually configure every possible pickup location.

6. Driver Publishes

Once configuration is complete, the driver publishes the ride.

The published journey contains at minimum:

origin
destination
intended route
departure time
route ETA
available seats
price/reference price
optional corridor/stops
pickup/drop-off information
operational constraints
7. Passenger Search

Passenger enters:

Origin
Destination
Date/time

Example:

Zaragoza → Barcelona
Tomorrow · 16:00

VAYA searches for:

exact matches
strong corridor matches
feasible partial-overlap matches
intelligently expanded alternatives

The system should not require exact origin/destination equality.

8. Search Time Semantics

The passenger's displayed time must refer to their journey, not the driver's complete journey.

Driver:

Madrid → Barcelona
departure 14:00

Passenger:

Zaragoza → Barcelona
requested departure 16:00

If the driver is expected to reach the passenger pickup at:

16:18

the passenger sees:

Pickup around 16:18

not:

Driver departs Madrid at 14:00

The passenger's:

pickup ETA
journey duration
destination ETA

must be calculated specifically for their segment.

9. Past Trips Must Never Be Searchable

This is a hard requirement.

A search must never return a trip or passenger segment that is already impossible because it has happened.

For active trips:

IN_PROGRESS

VAYA must consider only the remaining feasible corridor.

Example:

Driver:

Madrid → Barcelona

has already passed Zaragoza.

Passenger:

Zaragoza → Barcelona

must not receive that trip.

Passenger:

Lleida → Barcelona

may receive it if Lleida remains feasible.

Trip status alone is insufficient.

Matching must consider:

current driver location
route progress
current time
remaining route
estimated future arrival
passenger requested time
feasibility
10. Search Should Prefer Solutions, Not Empty Results

If an exact search cannot be fulfilled, VAYA should expand intelligently.

It can consider alternatives such as:

slightly different pickup time
slightly different pickup location
slightly different drop-off location
longer walking distance
public transport connection
nearby feasible corridor
other driver route

But:

VAYA must never silently relax constraints.

The passenger should understand why an alternative differs.

11. Search Result Information

Every meaningful result should communicate:

passenger origin
passenger destination
passenger-specific pickup time
passenger-specific ETA
pickup walking time
drop-off walking time
pickup location
drop-off location
price
relevant route relationship
whether it is a particularly strong match

Do not overload this with technical routing information.

12. Best Fit

VAYA may identify one result as:

Best Fit

This should mean that the result provides the strongest overall solution to the passenger's actual journey.

Relevant dimensions include:

departure-time compatibility
arrival-time compatibility
pickup convenience
drop-off convenience
public transport requirements
driver feasibility
detour impact
reliability
price

The ranking should not blindly prioritize geographic overlap.

13. Passenger Pickup/Drop-off Optimization

VAYA calculates the recommended pickup/drop-off points.

Optimization considers both:

Passenger
walking time
distance
public transport
accessibility
convenience
Driver
detour distance
detour time
road feasibility
stopping/parking feasibility
route continuity

The recommended point should be the best practical compromise.

14. Passenger Can Override Recommended Points

Passenger may choose another VAYA-feasible pickup/drop-off point.

When doing so, VAYA recalculates:

passenger walking distance
public transport requirements
driver detour
additional time
updated ETA
feasibility

If the alternative is technically feasible but worse for the driver, VAYA should communicate that subtly.

Example concept:

This pickup is less convenient for the driver and may reduce the chance of acceptance.

The passenger can still submit the request.

VAYA should inform rather than paternalistically block.

15. Passenger Search Result → Details

When passenger opens a result, the detail page must make the relationship between the two journeys visually obvious.

The map should clearly show:

driver's original/planned route
passenger requested route
overlap
passenger pickup
passenger drop-off
relevant detour if applicable

The passenger should understand the route relationship without studying technical diagrams.

16. Passenger Itinerary

Below the map:

Requested journey

Zaragoza → Barcelona

Then:

Pickup

VAYA-selected pickup point
6 min walk

If public transport is required, communicate that clearly.

A map/navigation icon should allow the passenger to open the pickup point in:

Google Maps
Apple Maps

using that exact location as the destination.

Drop-off

Same concept.

17. Passenger ETA

Passenger sees:

Your estimated arrival: 18:35

Not:

Driver's final ETA

If the driver continues beyond the passenger's destination, the passenger must see their own ETA.

18. Driver Planned Stops in Passenger Experience

If the passenger's requested route aligns with one or more driver-selected corridor stops, VAYA may communicate that relationship.

But stops should remain contextual corridor intent, not fixed physical pickup locations.

19. Passenger Request

Passenger submits request.

The request contains:

passenger
requested route
requested time
passenger-selected or VAYA-selected pickup
passenger-selected or VAYA-selected drop-off
calculated passenger price
driver impact
expiry/deadline
relevant route/detour data
20. Three Active Passenger Requests

A passenger may have up to three active requests for the same journey.

Every request has a response deadline.

The deadline must appear:

Passenger

Immediately after requesting, inside the request/booking status.

Driver

Inside the incoming request itself.

It should not be hidden.

First Acceptance Wins

If Driver A accepts:

Driver A becomes confirmed.
Other pending requests are automatically cancelled/closed.
Passenger cannot accidentally have multiple confirmed rides for the same journey.

If a driver rejects:

request closes
remaining requests continue

If a request expires:

request closes automatically
remaining requests continue
21. Driver Incoming Request

The notification must work for both exact and overlapping routes.

For an overlapping request:

Zaragoza → Barcelona
1 passenger · €10

Pickup: Zaragoza
Driver impact: +4 km / +10 min
New ETA: 18:35
Response by: 15:40

The driver must immediately understand:

What does accepting this passenger do to my trip?

The driver can tap:

passenger photo → profile
request arrow/details → complete request details
22. Driver Request Details

The request details screen should not unnecessarily send the driver to My Trip first.

It should directly show:

passenger
passenger profile/reputation
requested route
driver's route
overlap
pickup
drop-off
passenger price
seats
request time
response deadline
detour distance
detour time
updated ETA
map/navigation options

The map should clearly visualize:

original route → requested deviation → resulting route

The driver must be able to make an accept/refuse decision rapidly.

23. Driver Navigation to Pickup

Pickup/drop-off map icons should allow the driver to open the exact location in:

Google Maps
Apple Maps

The driver should not need to manually search for the pickup location.

24. Dynamic Pricing

Driver publishes:

Madrid → Barcelona = €20

Passenger requests:

Zaragoza → Barcelona

VAYA calculates a segment price, e.g.:

€10

The driver's full-trip price is an input/reference, not a rigid proportional formula.

Pricing should consider:

actual passenger segment
distance/time
driver's published price
detour
occupancy
route economics
marketplace conditions
passenger attractiveness
driver attractiveness

The exact formula remains an engine concern and should be audited against the existing implementation rather than blindly rewritten.

25. Segment-Based Capacity

Seat availability is segment-based.

Example:

Driver has 3 seats.

Passenger A:

Madrid → Zaragoza

Passenger B:

Zaragoza → Barcelona

Passenger C:

Zaragoza → Barcelona

A's seat becomes available after Zaragoza.

VAYA must calculate capacity independently across route segments.

The system must never allow:

physical seats exceeded on any segment.

This impacts:

search
candidate pooling
request validation
acceptance
pricing
driver itinerary
live matching
26. Continuous Passenger Turnover

A driver may:

pick up passenger A in Madrid
drop passenger A in Zaragoza
pick up passenger B in Zaragoza
continue
drop passenger B later
pick up another passenger
continue

The system should continuously search for new feasible requests while seats are available.

27. Existing Passengers Have Soft Protection

A new request must be evaluated against all existing confirmed/onboard passengers.

Existing passenger journeys have priority.

However, their ETA is an estimate, not an immutable contractual timestamp.

Small delays are acceptable.

Example:

+15 minutes on a 3-hour trip

may be acceptable.

A substantial delay is not.

VAYA therefore uses internal configurable thresholds.

Passengers and normal drivers should not need to configure these thresholds.

28. Admin Configuration

Internal constraints should be configurable through the admin system.

Examples include:

maximum driver detour
acceptable passenger ETA impact
pickup walking thresholds
drop-off walking thresholds
route deviation thresholds
timing tolerance
other matching constraints

The existing admin configuration system should be extended rather than duplicated.

Future possibility:

driver-specific configuration
premium driver controls

These should not be exposed as ordinary user configuration in v1.

29. Route Changes During a Trip

VAYA maintains two concepts.

Planned route

The route originally published by the driver.

Live feasible corridor

The route VAYA currently believes the driver can realistically serve based on:

actual location
route progress
actual route
timing
existing passenger commitments
road conditions/route changes
remaining journey

The planned route remains the intended/historical journey.

The live corridor controls real-time matching.

30. In-Progress Matching

A driver can receive new requests after starting.

Example:

Driver:

Madrid → Barcelona

has already left Madrid.

While approaching Zaragoza:

Passenger searches:

Zaragoza → Barcelona

VAYA should evaluate the request against the driver's current position and remaining journey.

It should calculate:

current position
expected pickup time
pickup feasibility
remaining route
detour
new ETA
available segment capacity
existing passenger impact

If feasible, the passenger can receive the trip.

31. Driver Operational Tracking

Once the driver's trip begins, VAYA may track the driver's location under the hood for operational purposes, subject to required platform permissions/privacy handling.

This private telemetry supports:

trip state inference
route progress
ETA
remaining corridor
live candidate matching
detour calculations
past-segment exclusion
automatic lifecycle management

This is distinct from passenger-facing tracking.

32. Tracking vs Sharing

These are separate concepts.

Before passenger boards

VAYA may know the driver's location.

Passenger sees:

relevant ETA
pickup information
route information

Passenger does not automatically receive the driver's live GPS position.

After passenger boards

Passenger-facing live tracking becomes available.

33. Boarding Detection

The passenger-facing live journey should begin when VAYA determines that the passenger has actually boarded.

Signals can include:

driver location
passenger location
proximity
sustained proximity
movement
route context
pickup timing
both users' confirmation actions

User buttons are useful confirmation but must not be mandatory.

The system should be conservative when evidence is ambiguous.

34. Trip Lifecycle

The lifecycle must be authoritative and robust.

Conceptually:

SCHEDULED
    ↓
IN_PROGRESS
    ↓
PASSENGER_ONBOARD
    ↓
COMPLETED

Additional terminal/exception states include:

CANCELLED
NO_SHOW

Exact database state names should be reconciled with the existing architecture.

35. Starting a Trip

A driver can explicitly press:

Start trip

But VAYA must not depend exclusively on this.

If the driver ignores the CTA and system evidence strongly indicates the trip has started, VAYA should be able to transition automatically.

Evidence can include:

time
origin proximity
sustained movement
route progress
expected journey timing
36. No Cancellation After Trip Start

Once the journey has genuinely started:

Cancellation is no longer permitted.

This should be enforced by backend state, not merely by hiding a UI button.

37. No-Show

No-show should be contextual.

A passenger sitting at home should not simply be able to report:

Driver is a no-show.

The action becomes relevant around:

scheduled pickup time
pickup location
driver/passenger physical proximity
expected arrival window

Either party can report a no-show.

VAYA may also automatically classify one when evidence is sufficiently strong.

38. Cancellation

Before trip start:

driver can cancel
passenger can cancel

Both use the same v1 mechanics.

A lightweight reason is required.

Possible reasons:

plans changed
timing changed
vehicle/problem
route changed
other

No differentiated penalty model is required in v1.

Cancellation must propagate to all downstream systems:

booking
matching
candidate pools
seats
notifications
lifecycle
search eligibility
related requests

Historical records should not simply disappear.

39. Notifications

Notifications must reflect the actual journey state.

Examples include:

request received
request deadline approaching
request accepted
other passenger requests cancelled
driver trip started
pickup approaching
passenger onboard
live journey started
route/ETA changed
cancellation
no-show
trip completed
review requested

Notifications should expose meaningful information rather than generic:

“Your trip has been updated.”

40. Passenger's Confirmed Booking

Once accepted, passenger should see:

driver
route
passenger-specific itinerary
pickup
walking/public transport instructions
pickup ETA
drop-off
passenger ETA
price
relevant driver/trip information
current state
next action where necessary

If there is a deadline or pending state, it must be visible.

41. Driver's My Trip

When a driver accepts passengers, the driver's itinerary must dynamically incorporate them.

Example:

Madrid
  ↓
Passenger A pickup
  ↓
Zaragoza
  ↓
Passenger A drop-off
Passenger B pickup
  ↓
Lleida
  ↓
Passenger B drop-off
  ↓
Barcelona

For each passenger, driver should understand:

pickup
drop-off
expected timing
passenger route
detour
resulting ETA
42. Passenger's My Trip

Passenger sees only the journey relevant to them.

They should not need to understand the entire driver's route unless useful.

The passenger should see:

requested journey
actual pickup
actual drop-off
estimated pickup time
destination ETA
walking/public transport
driver information
current status
43. Live Journey

Once passenger is onboard:

Passenger receives live tracking.

The experience should show:

current driver/vehicle position
route progress
destination
ETA
relevant journey information

The driver should also receive the operational information needed to continue the journey.

44. Completion

Trip completion must not depend on users pressing Finish.

VAYA should automatically determine completion using:

destination proximity
route progress
time
movement
passenger/driver locations
journey context

Users may confirm completion, but VAYA must eventually close the journey automatically.

A trip must not remain permanently IN_PROGRESS because someone forgot to tap a button.

45. Reviews

After completion, both passenger and driver can review the other.

The interaction should be:

fast
tactile
smooth
visually engaging
low typing
encouraging rather than bureaucratic

Potential interaction:

gesture-based star selection
contextual suggested feedback
optional written comment
quick attributes

The existing basic review UI should be treated as insufficient if it feels like a generic form.

46. Edge Case: Driver Cancels Before Trip

System must:

cancel driver trip
close/cancel associated passenger bookings appropriately
release relevant seats
stop matching
notify affected passengers
update search eligibility
preserve historical records
ensure stale requests cannot be accepted
47. Edge Case: Passenger Cancels

System must:

remove passenger from relevant segment capacity
update driver itinerary
recalculate capacity
update matching
notify driver
preserve trip integrity

Other passengers must not be incorrectly affected.

48. Edge Case: Driver Rejects One Request

Only that request closes.

Other passenger requests remain active until:

another driver accepts
they expire
passenger cancels
system invalidates them because the journey is no longer feasible
49. Edge Case: First Driver Accepts

Immediately:

confirm that booking
cancel other passenger requests
release candidate capacity
update matching
notify affected drivers
update passenger UI

Race conditions must be handled atomically.

50. Edge Case: Passenger Segment Already Passed

If driver's live position has passed the requested pickup corridor:

Do not return the trip.

This must happen at the matching layer.

51. Edge Case: Driver Deviates

If actual route differs from planned route:

retain original planned route
update live feasible corridor
recalculate ETA
recalculate future matching opportunities
preserve existing passengers
inform affected users when their journey meaningfully changes
52. Edge Case: New Request Conflicts With Existing Passenger

VAYA evaluates:

new passenger
driver
every existing passenger
capacity
detour
timing
route

If impact exceeds internal acceptable limits:

request is not offered/accepted.

If impact is acceptable:

request can proceed.

53. Edge Case: Passenger Chooses Worse Pickup

If passenger manually selects a technically feasible but driver-unfriendly point:

recalculate
show consequence
allow request
driver receives exact impact

No hidden penalty.

54. Edge Case: No Driver Stop Configured

Driver does not need to have selected the passenger's city as a stop.

If the route and current circumstances can accommodate the request, VAYA can offer it.

Stops are an additional driver preference signal, not a hard matching requirement.

55. Edge Case: Multiple Passengers

Every passenger must be represented independently.

VAYA must know:

where each passenger boards
where each passenger exits
which segments they occupy
impact on route
price
ETA

The system must never assume all passengers travel the full route.

56. Edge Case: No Available Exact Match

Never simply return:

No rides found

if meaningful alternatives exist.

Instead:

Best available option

followed by useful alternatives with transparent differences.

57. UX Quality Standard

The final product must avoid:

generic SaaS cards
excessive badges
unnecessary tags
repetitive boxes
technical data dumps
form-heavy interactions
modal overload
artificial “AI-generated” visual language

The interface should feel:

premium
mobility-native
intuitive
visual
human
spatial
information-rich without being cluttered

The map, itinerary and contextual information should do most of the explanatory work.

58. Information Principle

The system should not hide complexity.

Instead:

Technical complexity → useful user insight

Examples:

Instead of:

route deviation = 6.31%

show:

+4 km · +10 min

Instead of:

projection distance = 430m

show:

6 min walk to pickup

Instead of:

route overlap = 74%

show the routes visually and communicate the practical consequence.

59. Architectural Reconciliation Rules for Claude

Claude must first inspect the existing implementation.

It must identify existing systems including, but not limited to:

candidate pooling
route matching
route calculation
PostGIS
Redis
OSRM
Google Maps/Places/Routes
pickup/drop-off recommendation
stop recommendation
dynamic pricing
booking
notifications
trip lifecycle
tracking
review system
admin configuration

Claude must not assume existing functionality is wrong merely because the UX is wrong.

For every requirement, classify it:

Classification	Meaning
Correct	Existing implementation already satisfies the spec
Partial	Existing system has the foundation but behavior differs
Incorrect	Existing behavior conflicts with the spec
Missing	Required functionality doesn't exist
Architecture concern	Existing architecture cannot safely support the requirement
Unclear	Requires investigation before modification
60. Claude Must Trace End-to-End

For each important journey Claude must trace:

UI
↓
API
↓
service
↓
database
↓
matching
↓
routing
↓
pricing
↓
notifications
↓
state transitions
↓
UI refresh

It must not patch only the visible screen if the underlying state is wrong.

61. Claude Must Audit These Journeys
Driver
Publish
→ route selection
→ pickup/drop-off
→ corridor stops
→ publish
→ scheduled
→ trip starts
→ private tracking
→ receive request
→ inspect request
→ accept/reject
→ pickup
→ passenger onboard
→ live journey
→ passenger drop-off
→ future passenger matching
→ completion
→ review
Passenger
Search
→ candidate discovery
→ match ranking
→ result
→ details
→ pickup/drop-off choice
→ request
→ pending
→ deadline
→ acceptance/rejection/expiry
→ confirmed
→ driver approaching
→ pickup
→ onboard
→ live tracking
→ destination
→ completion
→ review
Dynamic multi-passenger
Driver route
→ passenger A boards
→ passenger B request
→ evaluate remaining capacity
→ evaluate passenger A impact
→ accept B
→ A exits
→ capacity released
→ passenger C becomes eligible
In-progress search
Driver starts
→ location telemetry
→ route progress
→ passenger searches
→ candidate pooling
→ remaining corridor
→ timing feasibility
→ detour
→ capacity
→ request
62. Critical Backend Invariants

These must be enforced server-side.

Search

Past passenger segments must never be returned.

Capacity

No route segment may exceed physical vehicle capacity.

Requests

First accepted request wins for a passenger journey.

Cancellation

No cancellation after trip start.

Lifecycle

Trips cannot remain indefinitely in an active state.

Tracking

Private driver telemetry and passenger-facing live location are separate permissions/data flows.

Matching

A driver-selected stop is not required for a feasible passenger match.

Route

Planned route and live feasible corridor are distinct concepts.

Passenger protection

New requests cannot create unreasonable impact on existing passengers.

63. Most Important Product Principle

The core VAYA experience can be reduced to one sentence:

VAYA continuously finds the best feasible way for passengers and drivers to share the same journey, and gives both sides the information they need to confidently decide.

The matching engine optimizes the solution.

The UX explains the solution.

The user does not need to understand the engine.

Claude Code Implementation Directive