import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  BottomSheet,
  Badge,
  Button,
  Avatar,
  Icon,
  Text,
  useAppTheme,
  spacing,
  radii,
  haptics,
} from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import type { Booking, DetourPreviewPoint } from '../../state/api';
import {
  useGetBookingDetourPreviewQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
} from '../../state/api';
import { formatDistance } from '../../utils/localeFormat';
import { openInMaps } from '../../utils/openInMaps';
import { trackEvent } from '../../services/analytics/analytics';

interface RequestDetailSheetProps {
  visible: boolean;
  booking: Booking | null;
  onClose: () => void;
  /** Fired after a real accept/decline succeeds — RideRequestsSheet's list
   *  refetches itself via RTK Query's own tag invalidation, this is purely
   *  so the caller can close the sheet / show its own feedback. */
  onResolved?: (action: 'accepted' | 'declined') => void;
}

function durationLabel(
  seconds: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return t('common:terms.minute', { count: Math.max(1, Math.round(seconds / 60)) });
}

/** One pickup/dropoff row: the point's label, and either an "already on
 *  your route" badge + stop position, or the real live-computed detour this
 *  point would add (only possible for a free-form point on a legacy,
 *  zero-route_stops ride — see bookings.service.ts's previewBookingDetour
 *  doc comment for why the two cases are genuinely different, not just
 *  differently worded). */
function RouteFitRow({
  icon,
  roleLabel,
  point,
  locale,
  t,
  theme,
}: {
  icon: 'navigate-outline' | 'flag-outline';
  roleLabel: string;
  point: DetourPreviewPoint;
  locale: SupportedLocale;
  t: (key: string, params?: Record<string, unknown>) => string;
  theme: ReturnType<typeof useAppTheme>['colors'];
}): React.JSX.Element {
  return (
    <View style={[styles.fitRow, { backgroundColor: theme.surfaceMuted }]}>
      <Icon name={icon} size="sm" color={theme.inkMuted} />
      <View style={styles.fitTextCol}>
        <Text variant="caption" color={theme.inkFaint}>
          {roleLabel}
        </Text>
        <Text variant="bodySmall" color={theme.ink} numberOfLines={2}>
          {point.label}
        </Text>
        {point.isPlannedStop ? (
          <View style={styles.fitBadgeRow}>
            <Badge label={t('driver:rides.requestDetail.onRoute')} variant="success" theme={theme} />
            {point.stopIndex && point.totalStops ? (
              <Text variant="caption" color={theme.inkFaint}>
                {t('driver:rides.requestDetail.stopPosition', {
                  index: point.stopIndex,
                  total: point.totalStops,
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text variant="caption" color={theme.warning}>
            {t('driver:rides.requestDetail.addsDetour', {
              distance: formatDistance(point.deviationMeters ?? 0, locale),
              duration: durationLabel(point.deviationSeconds ?? 0, t),
            })}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => openInMaps(point.lat, point.lng, point.label)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('driver:rides.requestDetail.openInMaps', { label: point.label })}
      >
        <Icon name="map-outline" size="sm" color={theme.inkMuted} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * "Does this request fit my route?" — opened from the small info icon on a
 * pending request row (RideRequestsSheet) or from a driver's booking_
 * requested notification. World-class-carpooling-app table stakes
 * (BlaBlaCar/Uber-style "this adds X min to your trip"): a concise summary
 * of the requested route, how it sits against the driver's own planned
 * stops, the real distance/duration this passenger actually rides with the
 * driver, and — right here, not buried elsewhere — the same Accepter/
 * Refuser actions RideRequestsSheet's row already offers, so a driver who
 * opens this to decide doesn't have to close it and go find the buttons
 * again. Backed by GET /bookings/:id/detour-preview (bookings.service.ts's
 * previewBookingDetour) — a pure, side-effect-free read.
 */
export function RequestDetailSheet({
  visible,
  booking,
  onClose,
  onResolved,
}: RequestDetailSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as SupportedLocale;
  const theme = useAppTheme().colors;
  const {
    data: preview,
    isFetching,
    isError,
  } = useGetBookingDetourPreviewQuery(booking?.id ?? '', { skip: !visible || !booking?.id });
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setActionError(null);
  }, [visible]);

  if (!booking) {
    return (
      <BottomSheet visible={false} onClose={onClose} theme={theme}>
        {null}
      </BottomSheet>
    );
  }

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    setActionError(null);
    try {
      if (action === 'accept') {
        await acceptBooking(booking!.id).unwrap();
      } else {
        await declineBooking(booking!.id).unwrap();
      }
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'request_detail_sheet' });
      onResolved?.(action === 'accept' ? 'accepted' : 'declined');
      onClose();
    } catch {
      haptics.error();
      setActionError(
        action === 'accept'
          ? t('driver:rides.requestsSheet.acceptError')
          : t('driver:rides.requestsSheet.declineError'),
      );
    }
  }

  function viewProfile(): void {
    if (!booking!.rider) return;
    haptics.selection();
    onClose();
    router.push({ pathname: '/search/trust', params: { driverUserId: booking!.riderId } });
  }

  const isBusy = acceptState.isLoading || declineState.isLoading;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('driver:rides.requestDetail.title')}
      heightRatio={0.72}
      theme={theme}
    >
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.identityRow}
          onPress={viewProfile}
          disabled={!booking.rider}
          accessibilityRole={booking.rider ? 'button' : undefined}
          accessibilityLabel={
            booking.rider
              ? t('driver:rides.requestDetail.viewProfile', { name: booking.rider.fullName })
              : undefined
          }
        >
          <Avatar
            uri={booking.rider?.avatarUrl}
            name={booking.rider?.fullName ?? '?'}
            sizePx={48}
          />
          <View style={styles.identityText}>
            <Text variant="body" color={theme.ink} style={styles.riderName} numberOfLines={1}>
              {booking.rider?.fullName ?? t('booking:passenger')}
            </Text>
            <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
              {t('driver:rides.bookingDetail.seatsAndPrice', {
                seatLabel: t('common:terms.seat', { count: booking.seatsRequested }),
                price: booking.contributionTotal,
              })}
            </Text>
          </View>
          {booking.rider ? <Icon name="chevron-forward" size="sm" color={theme.inkFaint} /> : null}
        </TouchableOpacity>

        {isFetching ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
        ) : isError || !preview ? (
          <Text variant="bodySmall" color={theme.error}>
            {t('driver:rides.requestDetail.loadError')}
          </Text>
        ) : (
          <>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionLabel}>
              {t('driver:rides.requestDetail.routeFit')}
            </Text>
            <RouteFitRow
              icon="navigate-outline"
              roleLabel={t('common:terms.pickup')}
              point={preview.pickup}
              locale={locale}
              t={t}
              theme={theme}
            />
            <RouteFitRow
              icon="flag-outline"
              roleLabel={t('common:terms.dropoff')}
              point={preview.dropoff}
              locale={locale}
              t={t}
              theme={theme}
            />
            {preview.pickup.isPlannedStop === false || preview.dropoff.isPlannedStop === false ? (
              preview.segment.isEstimate ? (
                <Text variant="caption" color={theme.inkFaint}>
                  {t('driver:rides.requestDetail.estimateNote')}
                </Text>
              ) : null
            ) : null}

            <View style={[styles.segmentRow, { borderColor: theme.outlineVariant }]}>
              <Icon name="car-sport-outline" size="sm" color={theme.inkMuted} />
              <Text variant="bodySmall" color={theme.ink}>
                {t('driver:rides.requestDetail.ridesWithYou')}
                {': '}
                {t('driver:rides.requestDetail.segmentDistance', {
                  distance: formatDistance(preview.segment.distanceM, locale),
                  duration: durationLabel(preview.segment.durationSec, t),
                })}
              </Text>
            </View>
          </>
        )}

        {actionError ? (
          <Text variant="bodySmall" color={theme.error} style={styles.actionErrorText}>
            {actionError}
          </Text>
        ) : null}

        <View style={styles.actionBar}>
          <Button
            label={t('common:actions.decline')}
            variant="outline"
            theme={theme}
            disabled={isBusy}
            onPress={() => void respond('decline')}
            style={styles.actionButton}
          />
          <Button
            label={t('common:actions.accept')}
            theme={theme}
            disabled={isBusy}
            loading={acceptState.isLoading}
            onPress={() => void respond('accept')}
            style={styles.actionButton}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  identityText: {
    flex: 1,
    gap: 1,
  },
  riderName: {
    fontWeight: '600',
  },
  loading: {
    marginVertical: spacing.lg,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.xs,
  },
  fitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  fitTextCol: {
    flex: 1,
    gap: 2,
  },
  fitBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  actionErrorText: {
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
});
