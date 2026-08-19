# VAYA UX Principles

These principles govern every future screen. They exist because the audit (`docs/product/audit.md`) found the app is currently *good* at avoiding generic CRUD — 22/27 screens correctly use the design system, and domain-specific primitives (FieldRow, Meter, DriverMapPin) show real product thinking. The goal is to protect that quality bar as the product grows, not to introduce it for the first time.

## The standing question

Before proposing any new screen, ask: **can this interaction be simplified, combined, progressively disclosed, or made more contextual?** A new screen is the last resort, not the default. Prefer a bottom sheet over a new route; prefer a step within an existing flow over a new top-level entry point; prefer inferring context (last search, current location, driver's usual route) over asking the user to re-enter it.

## Principles

**1. Spatial, not administrative.** VAYA is a marketplace built on physical space — routes, pickup points, distances. Interactions should feel like navigating a map, not filling out a form. The existing `search/cluster.tsx` (real map, real clustering) is closer to right than `driver/publish.tsx` (text field → text field → number stepper → number stepper). Every future ride-creation or ride-selection screen should default to a map-first interaction, with text/numeric input as the fallback, not the primary mode.

**2. Never show a fabricated success state.** The audit found booking-confirmation screens that call a real API, then immediately render hardcoded mock data as if it were the real response (`docs/product/audit.md` §4). This is worse than showing nothing — a real user will act on false information (a fake pickup window, a fake confidence label). Every screen that follows a mutation must render only what the mutation actually returned, or an explicit loading/error state. No "looks done" placeholders left wired to mock data past the point a real API exists.

**3. Constrain, don't trust free input, where the marketplace depends on it.** Price and pickup location are not preferences — they're the two things that make the marketplace function safely and fairly (see `docs/domain/ride-engine.md`, `docs/domain/pricing.md`). Free-text/arbitrary-coordinate entry for either is a product bug, not a flexibility feature. Offer a small, ranked, validated set of choices instead of an open field.

**4. Progressive disclosure over dense forms.** Driver ride creation should read as a short sequence of spatial/contextual decisions (route → stops → seats → suggested price → preferences → publish), each with a sensible default, not one screen with eight simultaneous fields. Passenger booking should surface only what's decision-relevant at each step (route match quality, then price, then driver trust signal, then pickup point) rather than all of it at once.

**5. Every state is designed, not default.** Loading, empty, and error states are product surfaces, not afterthoughts. `results.tsx`'s empty state (fallback corridor search + "notify me") is the bar — a dead end is turned into a next action. Generalize this pattern (`EmptyState` primitive, `docs/design-system/README.md`) rather than leaving each screen to improvise its own empty/error handling, which today ranges from genuinely good (`results.tsx`) to a plain text string (`cluster.tsx`).

**6. Feedback should be felt, not just read.** Haptics are entirely absent today. Key moments — booking confirmed, OTP verified, publish succeeded, a validation error — should have a tactile response, not just a visual one. This is a cheap, high-leverage addition once the `haptics.ts` utility exists.

**7. Trust is visible before commitment, not after.** A passenger should see a driver's rating/tenure signal before booking, not discover it after. A driver should see a passenger's profile before accepting a request. This is a direct lesson from the benchmark research (`docs/product/benchmark.md` §2, §5) — BlaBlaCar surfaces Expert/Ambassador tenure badges directly in search results. VAYA has the underlying identity-verification pipeline already (driver onboarding is the app's most production-grade flow); the gap is only in surfacing it as a trust *signal* at the moment of decision.

**8. Accessibility and RTL are not optional layers.** VAYA ships in French and Arabic (RTL). The `Text` primitive is already RTL-aware — every new primitive must be too. Accessibility labels/roles should be added at primitive-creation time, not retrofitted (`docs/design-system/README.md`).

## Anti-patterns (explicitly reject these)

- A screen with more than ~4 simultaneous input fields with no default/suggestion.
- Any screen that lets a user type a price or a pickup coordinate with no bound, suggestion, or validation against the route.
- A raw `ActivityIndicator` where a skeleton would preserve layout and reduce perceived wait.
- Inline red text as the only error affordance with no retry path.
- A new top-level tab/route for something that could be a bottom sheet or a step in an existing flow.
- Copy-pasting a screen's local `StyleSheet` instead of extending a design-system primitive.
