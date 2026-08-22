import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, MapPreview, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';

export default function PendingScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    vehiclePlate?: string;
    driverRatingAvg?: string;
    pickupLabel?: string;
    destinationLabel?: string;
    pickupLat?: string;
    pickupLng?: string;
    destinationLat?: string;
    destinationLng?: string;
  }>();
  const { colors: theme } = useAppTheme();
  const driverName = params.driverName ?? 'votre conducteur';
  const firstName = driverName.split(' ')[0]!;
  const [cancelling, setCancelling] = useState(false);

  const hasMapPoints = params.pickupLat && params.pickupLng && params.destinationLat && params.destinationLng;

  async function handleShare(): Promise<void> {
    // A real native share sheet, not fabricated content — every field it
    // shares is one already threaded through real params (trust.tsx's
    // requestSeat() → confirmed.tsx → here).
    try {
      await Share.share({
        message: `Mon trajet Vaya avec ${driverName} · ${params.pickupLabel ?? ''} → ${params.destinationLabel ?? ''} · ${params.price ?? ''} DT`,
      });
    } catch {
      // User dismissed the share sheet — not an error worth surfacing.
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          Vaya
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {hasMapPoints ? (
          <MapPreview
            height={200}
            origin={{ latitude: Number(params.pickupLat), longitude: Number(params.pickupLng) }}
            destination={{ latitude: Number(params.destinationLat), longitude: Number(params.destinationLng) }}
          />
        ) : (
          <View style={[styles.mapFallback, { backgroundColor: theme.surfaceMuted }]} />
        )}

        <View style={styles.content}>
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={[styles.confirmedPill, { backgroundColor: theme.accentGlow + '40' }]}>
              <Icon name="checkmark-circle" size="xs" color={theme.accentStrong} />
              <Text variant="caption" color={theme.accentStrong}>
                Confirmé
              </Text>
            </View>
            <Text variant="h1" color={theme.ink}>
              Votre trajet Vaya est confirmé
            </Text>
            <Text variant="body" color={theme.inkMuted}>
              {firstName} a accepté votre demande
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.driverHeaderRow}>
              <View style={styles.driverIdentity}>
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.surfaceMuted }]}>
                  <Icon name="person" size="lg" color={theme.inkFaint} />
                </View>
                <View>
                  <Text variant="h3" color={theme.ink}>
                    {firstName}
                  </Text>
                  {params.driverRatingAvg ? (
                    <View style={styles.ratingRow}>
                      <Icon name="star" size="xs" color={theme.accent} />
                      <Text variant="bodySmall" color={theme.inkMuted}>
                        {Number(params.driverRatingAvg).toFixed(1)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.driverActions}>
                {params.bookingId ? (
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: theme.surfaceMuted }]}
                    onPress={() =>
                      router.push({
                        pathname: '/conversations/[bookingId]',
                        params: { bookingId: params.bookingId!, role: 'rider', otherPartyName: driverName },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Message à ${firstName}`}
                  >
                    <Icon name="chatbubble" size="sm" color={theme.ink} />
                  </TouchableOpacity>
                ) : null}
                {/* No phone number is ever exposed via the public API
                 *  (users.service.ts's getPublicProfile explicitly never
                 *  returns phone/contacts) — a real "Call" action has
                 *  nothing to call, so it's disabled rather than wired to
                 *  nothing. */}
                <View style={[styles.iconBtn, styles.iconBtnDisabled, { backgroundColor: theme.surfaceMuted }]}>
                  <Icon name="call" size="sm" color={theme.inkFaint} />
                </View>
              </View>
            </View>

            {params.vehicleLabel ? (
              <View style={styles.vehicleRow}>
                <View style={[styles.vehicleIconWrap, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]}>
                  <Icon name="car-sport-outline" size="md" color={theme.inkFaint} />
                </View>
                <View>
                  <Text variant="body" color={theme.ink}>
                    {params.vehicleLabel}
                  </Text>
                  {params.vehiclePlate ? (
                    <View style={[styles.platePill, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]}>
                      <Text variant="caption" color={theme.inkMuted} style={styles.plateText}>
                        {params.vehiclePlate}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
              TRAJET
            </Text>
            <View style={styles.journeyRow}>
              <View style={styles.journeyDotsCol}>
                <View style={[styles.journeyDot, { backgroundColor: theme.ink }]} />
                <View style={[styles.journeyLine, { backgroundColor: theme.outlineVariant }]} />
                <View style={[styles.journeyDot, styles.journeyDotSquare, { backgroundColor: theme.accent }]} />
              </View>
              <View style={styles.journeyTextCol}>
                <View>
                  <Text variant="caption" color={theme.inkFaint}>
                    Point de rendez-vous
                  </Text>
                  <Text variant="body" color={theme.ink}>
                    {params.pickupLabel ?? '—'}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" color={theme.inkFaint}>
                    Destination
                  </Text>
                  <Text variant="body" color={theme.ink}>
                    {params.destinationLabel ?? '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {params.price ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <View style={styles.paymentHeaderRow}>
                <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
                  PAIEMENT
                </Text>
                <Text variant="h3" color={theme.accent}>
                  {params.price} DT
                </Text>
              </View>
              <View style={[styles.paymentNote, { backgroundColor: theme.background }]}>
                <Icon name="cash-outline" size="sm" color={theme.ink} />
                <Text variant="bodySmall" color={theme.ink}>
                  Réglez votre conducteur en espèces pendant le trajet.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant }]}>
        {/* Not in the Stitch reference (its footer is just Cancel/Share) —
         *  kept as the primary action because it's the only entry point
         *  into the app's real pickup → live → settlement trip-progress
         *  flow (bookings/pickup.tsx onward); dropping it would silently
         *  orphan working functionality, not just diverge visually. */}
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnPrimary, { backgroundColor: theme.ink }]}
          onPress={() => router.push({ pathname: '/bookings/pickup', params })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Rejoindre ${firstName}`}
        >
          <Text variant="label" color={theme.onInk}>
            Rejoindre {firstName}
          </Text>
        </TouchableOpacity>
        <View style={styles.footerRow}>
          {params.bookingId ? (
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnOutline, { borderColor: theme.outline }]}
              onPress={() => setCancelling(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Annuler la réservation"
            >
              <Text variant="label" color={theme.ink}>
                Annuler
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnOutline, { borderColor: theme.outline }]}
            onPress={() => void handleShare()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Partager les détails"
          >
            <Text variant="label" color={theme.ink}>
              Partager
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {params.bookingId ? (
        <CancellationSheet
          visible={cancelling}
          bookingId={params.bookingId}
          role="rider"
          onClose={() => setCancelling(false)}
          onCancelled={() => router.replace('/(tabs)/trips')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 44,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  mapFallback: {
    height: 200,
    width: '100%',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: -spacing['2xl'],
  },
  statusCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  driverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  driverIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  driverActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  vehicleIconWrap: {
    width: 56,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platePill: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  plateText: {
    letterSpacing: 1.5,
  },
  sectionLabel: {
    letterSpacing: 0.8,
  },
  journeyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  journeyDotsCol: {
    width: 12,
    alignItems: 'center',
    paddingTop: 4,
  },
  journeyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  journeyDotSquare: {
    borderRadius: 2,
  },
  journeyLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  journeyTextCol: {
    flex: 1,
    gap: spacing.lg,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerBtn: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnPrimary: {
    height: 52,
  },
  footerBtnOutline: {
    borderWidth: 1,
  },
});
