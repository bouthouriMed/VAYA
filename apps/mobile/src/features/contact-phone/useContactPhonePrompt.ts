import { useCallback, useRef, useState } from 'react';
import { useAppSelector } from '../../state/store';
import { useLazyGetMeQuery } from '../../state/api';
import { hasReachablePhone } from './contactPhoneStatus';

export type ContactPhoneContext = 'publishing' | 'booking' | 'profile';

/**
 * Asks for a contact number right before the two moments it matters —
 * publishing a ride and requesting a seat — without ever blocking them:
 * a user who already has a number (or isn't signed in, or whose profile
 * can't be loaded) goes straight through; otherwise a one-field sheet opens
 * and the original action resumes the instant they save *or* tap "Plus
 * tard". Skipping is remembered for the rest of this screen's life so the
 * same user is never asked twice in one flow.
 */
export function useContactPhonePrompt(): {
  ensureContactPhone: (action: () => void, context: ContactPhoneContext) => void;
  sheetProps: {
    visible: boolean;
    context: ContactPhoneContext;
    onDone: () => void;
  };
} {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [fetchMe] = useLazyGetMeQuery();
  const [visible, setVisible] = useState(false);
  const [context, setContext] = useState<ContactPhoneContext>('publishing');
  const pendingAction = useRef<(() => void) | null>(null);
  const skipped = useRef(false);

  const ensureContactPhone = useCallback(
    (action: () => void, actionContext: ContactPhoneContext) => {
      if (!accessToken || skipped.current) {
        action();
        return;
      }
      void (async () => {
        // Cached `Me` when there is one; a fresh fetch right after a
        // contextual sign-in. A failure never blocks the real action.
        const me = await fetchMe(undefined, true)
          .unwrap()
          .catch(() => null);
        if (!me || hasReachablePhone(me)) {
          action();
          return;
        }
        pendingAction.current = action;
        setContext(actionContext);
        setVisible(true);
      })();
    },
    [accessToken, fetchMe],
  );

  /** Called on save and on "Plus tard" alike — either way the flow continues. */
  const onDone = useCallback(() => {
    skipped.current = true;
    setVisible(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) setTimeout(action, 0);
  }, []);

  return { ensureContactPhone, sheetProps: { visible, context, onDone } };
}
