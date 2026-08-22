import { useCallback, useRef, useState } from 'react';
import { useAppSelector } from '../../state/store';

export type ContextualAuthTrigger = 'booking' | 'publishing';

/**
 * Lets any screen gate a single action behind sign-in without a hard
 * navigation redirect: if already signed in, the action just runs; if not,
 * ContextualAuthSheet opens over the current screen and the action is
 * replayed the instant sign-in succeeds — the guest never loses their place
 * (selected ride, filled-in publish form) or gets bounced to a separate
 * auth screen. `trigger` only picks the sheet's copy (see
 * contextualAuthCopy.ts), never changes the actual auth mechanism.
 */
export function useContextualAuth(): {
  requireAuth: (action: () => void, trigger?: ContextualAuthTrigger) => void;
  isAuthSheetVisible: boolean;
  authTrigger: ContextualAuthTrigger;
  handleAuthenticated: () => void;
  cancelAuth: () => void;
} {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [visible, setVisible] = useState(false);
  const [trigger, setTrigger] = useState<ContextualAuthTrigger>('booking');
  const pendingAction = useRef<(() => void) | null>(null);

  const requireAuth = useCallback(
    (action: () => void, actionTrigger: ContextualAuthTrigger = 'booking') => {
      if (accessToken) {
        action();
        return;
      }
      pendingAction.current = action;
      setTrigger(actionTrigger);
      setVisible(true);
    },
    [accessToken],
  );

  function handleAuthenticated(): void {
    setVisible(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    // Deferred a tick: the sign-in call just dispatched a fresh accessToken
    // into the store: RTK Query's base query reads it on the *next* request,
    // so the resumed action (which likely fires an authenticated mutation)
    // needs to run after this render commits, not synchronously inside it.
    if (action) setTimeout(action, 0);
  }

  function cancelAuth(): void {
    pendingAction.current = null;
    setVisible(false);
  }

  return { requireAuth, isAuthSheetVisible: visible, authTrigger: trigger, handleAuthenticated, cancelAuth };
}
