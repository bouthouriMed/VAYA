/**
 * Whether this is a moment we should ask the OS for push permission.
 * Pure so the "ask at most once per install, only from a contextual
 * trigger" rule (docs/roadmap/phase-07-notifications.md's UX behavior
 * section — never on cold start) is a real, independently-testable
 * decision rather than logic inlined at each of the two call sites
 * (driver/publish.tsx, search/trust.tsx).
 */
export function shouldPromptForPushPermission(alreadyPrompted: boolean): boolean {
  return !alreadyPrompted;
}
