import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BottomSheet, Button, Text, useAppTheme, spacing, haptics } from '@vaya/design-system';
import { useReportNoShowMutation } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';

interface NoShowReportSheetProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  /** See CancellationSheet's identical prop doc comment — analytics-only.
   *  'rider' from bookings/live.tsx, 'driver' from DriverBookingDetailSheet. */
  role: 'rider' | 'driver';
  counterpartName?: string | null;
  onReported?: () => void;
}

/**
 * Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): the no-show
 * reporting affordance for the trip-day screen. Distinct from
 * CancellationSheet — this reports that the *other* party never showed,
 * not that the caller is withdrawing. The guidance text nudges a contact
 * attempt first, per the phase doc's explicit "guidance text, not a hard
 * technical gate" instruction; the real, server-enforced gate is the
 * minimum-time-past-departure rule (packages/domain's `canReportNoShow`,
 * bookings.service.ts's reportNoShow) — a report attempted too early comes
 * back as a 409, surfaced here as an honest inline error, never silently
 * retried or hidden.
 */
export function NoShowReportSheet({
  visible,
  onClose,
  bookingId,
  role,
  counterpartName,
  onReported,
}: NoShowReportSheetProps): React.JSX.Element {
  const theme = useAppTheme().colors;
  const [reportNoShow, { isLoading }] = useReportNoShowMutation();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) setError(undefined);
  }, [visible]);

  const firstName =
    counterpartName?.split(' ')[0] ?? (role === 'rider' ? 'le conducteur' : 'le passager');

  async function handleConfirm(): Promise<void> {
    setError(undefined);
    try {
      await reportNoShow(bookingId).unwrap();
      haptics.warning();
      trackEvent('no_show_reported', { role });
      onReported?.();
      onClose();
    } catch {
      haptics.error();
      setError(
        'Impossible de signaler cette absence maintenant — l’heure de départ n’est peut-être pas encore passée, ou une erreur est survenue.',
      );
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`${firstName} ne s’est pas présenté ?`}
      heightRatio={0.42}
      theme={theme}
    >
      <View style={styles.content}>
        <Text variant="body" color={theme.ink}>
          Avant de signaler une absence, essayez de contacter {firstName} (message ou appel) — il
          ou elle a peut-être simplement un léger retard.
        </Text>
        <Text variant="bodySmall" color={theme.inkMuted}>
          Si vous ne parvenez pas à le/la joindre après l’heure de départ prévue, vous pouvez
          signaler l’absence ci-dessous.
        </Text>

        {error ? (
          <Text variant="bodySmall" color={theme.error}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Signaler l’absence"
          size="lg"
          variant="outline"
          loading={isLoading}
          onPress={() => void handleConfirm()}
          style={styles.cta}
          theme={theme}
        />
        <Button
          label="Retour"
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
  cta: {
    width: '100%',
  },
});
