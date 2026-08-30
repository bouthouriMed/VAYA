import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { BottomSheet, Badge, Button, Chip, Text, useAppTheme, spacing, haptics } from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import {
  useCancelBookingMutation,
  useGetCancellationPreviewQuery,
  CANCELLATION_REASONS,
  type CancellationReason,
} from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';
import { cancellationTierBadge, buildCancellationAnalyticsPayload } from './cancellationHelpers';

interface CancellationSheetProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  /** Who is cancelling, for the `booking_cancelled` analytics event only —
   *  server-side authorization is independent of this and derives the real
   *  party from the authenticated user. 'rider' at the rider-side call sites
   *  (trips.tsx's passenger list, bookings/pending|pickup|live.tsx); 'driver'
   *  from DriverBookingDetailSheet (trips.tsx's driver dashboard) — no
   *  second component needed for the driver side, this one was already
   *  role-agnostic. */
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
  const { t } = useTranslation();
  const theme = useAppTheme().colors;
  const {
    data: preview,
    isFetching,
    isError,
  } = useGetCancellationPreviewQuery(bookingId, { skip: !visible || !bookingId });
  const [cancelBooking, { isLoading: cancelling }] = useCancelBookingMutation();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [reason, setReason] = useState<CancellationReason | undefined>();

  useEffect(() => {
    if (!visible) {
      setSubmitError(undefined);
      setReason(undefined);
    }
  }, [visible]);

  async function handleConfirm(): Promise<void> {
    if (!reason) return;
    setSubmitError(undefined);
    try {
      const result = await cancelBooking({ bookingId, reason }).unwrap();
      haptics.success();
      trackEvent(
        'booking_cancelled',
        buildCancellationAnalyticsPayload(role, result.cancellationPolicy.tier),
      );
      onCancelled?.();
      onClose();
    } catch {
      haptics.error();
      setSubmitError(t('booking:cancellation.error'));
    }
  }

  const badge = preview ? cancellationTierBadge(preview.tier) : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('booking:cancellation.title')}
      heightRatio={0.48}
      theme={theme}
    >
      <View style={styles.content}>
        {isFetching ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
        ) : isError || !preview ? (
          <Text variant="bodySmall" color={theme.error}>
            {t('booking:cancellation.warning')}
          </Text>
        ) : (
          <>
            <Badge label={badge!.label} variant={badge!.variant} theme={theme} />
            <Text variant="body" color={theme.ink}>
              {preview.consequence}
            </Text>

            <Text variant="bodySmall" color={theme.ink}>
              {t('booking:cancellation.reasonPrompt')}
            </Text>
            <View style={styles.reasonRow}>
              {CANCELLATION_REASONS.map((option) => (
                <Chip
                  key={option}
                  label={t(`booking:cancellation.reasons.${option}`)}
                  selected={reason === option}
                  onPress={() => setReason(option)}
                  theme={theme}
                />
              ))}
            </View>
          </>
        )}

        {submitError ? (
          <Text variant="bodySmall" color={theme.error}>
            {submitError}
          </Text>
        ) : null}

        <Button
          label={t('booking:cancellation.confirmCta')}
          size="lg"
          variant="outline"
          loading={cancelling}
          disabled={isFetching || !preview || !reason}
          onPress={() => void handleConfirm()}
          style={styles.cta}
          theme={theme}
        />
        <Button
          label={t('common:actions.back')}
          variant="ghost"
          onPress={onClose}
          style={styles.cta}
          theme={theme}
        />
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
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
  },
});
