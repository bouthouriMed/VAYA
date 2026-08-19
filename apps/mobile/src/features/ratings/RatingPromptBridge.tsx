import { useEffect, useRef, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useAppSelector } from '../../state/store';
import { useCreateTripRatingMutation, useGetPendingRatingQuery } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';
import { submitRating } from './ratingHelpers';
import { RatingPromptSheet } from './RatingPromptSheet';

/**
 * Global "re-surface once on next app open if unsubmitted" mechanism
 * (docs/roadmap/phase-09-ratings-trust.md's UX behavior section). Mounted
 * once at the app root (app/_layout.tsx), same placement as Phase 7/8's
 * NotificationBridge — polls `GET /trips/pending-rating` a single time per
 * cold start (not on an interval: this app has no local-notification-
 * scheduling infrastructure to hang a true "remind me later" off of, so a
 * fresh app launch is the honest, minimal interpretation of "next app
 * open").
 *
 * `rating_window_expired` is necessarily a best-effort signal here (session-
 * scoped only, not persisted): if a trip that was pending on this bridge's
 * check is later found missing from a subsequent check without this
 * session having submitted it, that's reported as expired. A trip that
 * expires between app sessions with this bridge never having seen it isn't
 * counted — an acceptable gap for a dev-only analytics stub
 * (services/analytics/analytics.ts's own doc comment already flags there's
 * no real event pipeline yet).
 */
export function RatingPromptBridge(): React.JSX.Element | null {
  const isAuthenticated = useAppSelector((s) => Boolean(s.auth.accessToken));
  const { data: pending } = useGetPendingRatingQuery(isAuthenticated ? undefined : skipToken);
  const [createRating] = useCreateTripRatingMutation();
  const [dismissed, setDismissed] = useState(false);
  const lastSeenTripId = useRef<string | null>(null);
  const submittedTripIds = useRef<Set<string>>(new Set());
  const promptedTripIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentTripId = pending?.tripId ?? null;
    const previousTripId = lastSeenTripId.current;

    if (
      previousTripId &&
      previousTripId !== currentTripId &&
      !submittedTripIds.current.has(previousTripId)
    ) {
      trackEvent('rating_window_expired', { tripId: previousTripId });
    }

    if (pending && !promptedTripIds.current.has(pending.tripId)) {
      promptedTripIds.current.add(pending.tripId);
      trackEvent('rating_prompted', { tripId: pending.tripId, role: pending.role });
      setDismissed(false);
    }

    lastSeenTripId.current = currentTripId;
  }, [pending]);

  if (!pending || dismissed) return null;

  return (
    <RatingPromptSheet
      visible
      onClose={() => setDismissed(true)}
      role={pending.role}
      counterpartName={pending.counterpartName}
      onSubmit={async ({ stars, punctualityFlag, comment }) => {
        const tripId = pending.tripId;
        await submitRating(
          { stars, punctualityFlag, comment },
          {
            createRating: (input) => createRating({ tripId, input }).unwrap(),
            trackEvent,
            role: pending.role,
          },
        );
        submittedTripIds.current.add(tripId);
        setDismissed(true);
      }}
    />
  );
}
