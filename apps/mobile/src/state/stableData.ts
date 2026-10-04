/**
 * Defaults for near-static data — public profiles, trust summaries, a
 * ride's offered stops, towns along a route. The app-wide defaults in
 * api.ts (refetch on every mount after 30s, and on every return to the
 * foreground) suit live data like bookings and seats; for these they only
 * re-downloaded identical answers each time a ride or profile screen
 * opened. Reused for up to 5 minutes instead; any change made from this
 * app invalidates them at once through their cache tags.
 */
export const STABLE_DATA_DEFAULTS = { refetchOnMountOrArgChange: 300, refetchOnFocus: false } as const;

/** Wraps a generated RTK Query hook so it uses STABLE_DATA_DEFAULTS unless
 *  the caller passes its own options. */
export function withStableDataDefaults<Arg, Options extends object, Result>(
  hook: (arg: Arg, options?: Options) => Result,
): (arg: Arg, options?: Options) => Result {
  return (arg, options) => hook(arg, { ...STABLE_DATA_DEFAULTS, ...options } as Options);
}
