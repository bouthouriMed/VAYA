import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { BottomSheet, Badge, Button, Text, colors, spacing, haptics } from '@vaya/design-system';
import { useCancelBookingMutation, useGetCancellationPreviewQuery } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';
import { cancellationTierBadge, buildCancellationAnalyticsPayload } from './cancellationHelpers';

interface CancellationSheetProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  /** Who is cancelling, for the `booking_cancelled` analytics event only —
   *  server-side authorization is independent of this and derives the real
   *  party from the authenticated user. Always 'rider' at every current
   *  call site (trips.tsx, bookings/pending|pickup|live.tsx): this app has
   *  no driver-side per-booking screen yet (the same gap Phase 7/8/9's
   *  notes already documented) — a future driver trip screen would pass
   *  'driver' here instead of needing a second component. */
  role: 'rider' | 'driver';
  /** Called once the booking is actually cancelled — the sheet itself never
   *  navigates, so the caller decides what "cancelled" means for its screen
   *  (trips.tsx just closes the sheet; a trip-day screen might navigate away). */
  onCancelled?: () => void;
}

/**
 * Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): the
 * cancellation confirmation flow, reachable from any active booking/trip
 * screen. Reuses BottomSheet (Phase 2) — no new design-system primitive,
 * per the phase doc's explicit scope. Fetches the read-only policy preview
 * (`GET /bookings/:id/cancellation-preview`) the moment it opens, so the
 * consequence is visible *before* the user can tap confirm — the phase
 * doc's explicit "no surprise outcomes" UX requirement — and only then
 * fires the actual destructive `POST /bookings/:id/cancel`, whose response
 * carries the authoritative (possibly slightly different, if time passed
 * while the sheet was open) final tier used for the analytics event.
 */
export function CancellationSheet({
  visible,
  onClose,
  bookingId,
  role,
  onCancelled,
}: CancellationSheetProps): React.JSX.Element {
  const {
    data: preview,
    isFetching,
    isError,
  } = useGetCancellationPreviewQuery(bookingId, { skip: !visible || !bookingId });
  const [cancelBooking, { isLoading: cancelling }] = useCancelBookingMutation();
  const [submitError, setSubmitError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) setSubmitError(undefined);
  }, [visible]);

  async function handleConfirm(): Promise<void> {
    setSubmitError(undefined);
    try {
      const result = await cancelBooking(bookingId).unwrap();
      haptics.success();
      trackEvent(
        'booking_cancelled',
        buildCancellationAnalyticsPayload(role, result.cancellationPolicy.tier),
      );
      onCancelled?.();
      onClose();
    } catch {
      haptics.error();
      setSubmitError('Impossible d’annuler cette réservation pour le moment. Réessayez.');
    }
  }

  const badge = preview ? cancellationTierBadge(preview.tier) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Annuler ce trajet ?" heightRatio={0.48}>
      <View style={styles.content}>
        {isFetching ? (
          <ActivityIndicator size="small" color={colors.secondary} style={styles.loading} />
        ) : isError || !preview ? (
          <Text variant="bodySmall" color={colors.error}>
            Impossible de vérifier la politique d’annulation pour le moment.
          </Text>
        ) : (
          <>
            <Badge label={badge!.label} variant={badge!.variant} />
            <Text variant="body" color={colors.gray900}>
              {preview.consequence}
            </Text>
          </>
        )}

        {submitError ? (
          <Text variant="bodySmall" color={colors.error}>
            {submitError}
          </Text>
        ) : null}

        <Button
          label="Confirmer l’annulation"
          size="lg"
          variant="outline"
          loading={cancelling}
          disabled={isFetching || !preview}
          onPress={() => void handleConfirm()}
          style={styles.cta}
        />
        <Button label="Retour" variant="ghost" onPress={onClose} style={styles.cta} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  loading: {
    marginVertical: spacing.lg,
  },
  cta: {
    width: '100%',
  },
});
