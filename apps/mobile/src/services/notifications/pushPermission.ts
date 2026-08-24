/**
 * Whether this is a moment we should ask the OS for push permission.
 * Pure so the "ask at most once per install" rule is a real,
 * independently-testable decision rather than logic inlined at each
 * call site (PushPermissionBridge.tsx, driver/publish.tsx,
 * search/ride-details.tsx).
 */
export function shouldPromptForPushPermission(alreadyPrompted: boolean): boolean {
  return !alreadyPrompted;
}
