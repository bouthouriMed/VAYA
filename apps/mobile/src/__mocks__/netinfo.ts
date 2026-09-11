// Real NetInfo reads native connectivity state — not resolvable under
// Vitest. addEventListener defaults to reporting "online" and returns a
// real unsubscribe no-op, matching react-native-safe-area-context.ts's
// mock precedent in this same directory. Tests that need to simulate a
// state change import `__setMockIsConnected` directly.
type Listener = (state: { isConnected: boolean | null }) => void;

const listeners = new Set<Listener>();

function addEventListener(listener: Listener): () => void {
  listeners.add(listener);
  // Deliberately no synchronous initial callback — real NetInfo's first
  // event arrives asynchronously (a native bridge round-trip), and firing
  // one synchronously here just re-confirms useIsOffline's own initial
  // `useState` default for no reason, which trips React's act() warning
  // for an update that lands before the surrounding act() callback returns.
  return () => listeners.delete(listener);
}

/** Test-only: simulates a connectivity change and notifies subscribers. */
export function __setMockIsConnected(value: boolean | null): void {
  for (const listener of listeners) listener({ isConnected: value });
}

export default { addEventListener };
