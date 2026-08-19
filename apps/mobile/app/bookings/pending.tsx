import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';

export default function PendingScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    pickupLabel?: string;
  }>();
  const driverName = params.driverName ?? 'votre conducteur';
  const firstName = driverName.split(' ')[0]!;
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): cancellation
  // is reachable from every active booking screen, not just (tabs)/trips.tsx.
  const [cancelling, setCancelling] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Avatar name={driverName} size="lg" />
        <Text variant="h2" style={styles.joinLabel}>
          Rejoindre {firstName}
        </Text>
      </View>

      <Button
        label={`Rejoindre ${firstName}`}
        size="lg"
        onPress={() => router.push({ pathname: '/bookings/pickup', params })}
        style={styles.cta}
      />

      {params.bookingId ? (
        <Button
          label={`Message à ${firstName}`}
          variant="outline"
          onPress={() =>
            router.push({
              pathname: '/conversations/[bookingId]',
              params: { bookingId: params.bookingId!, role: 'rider', otherPartyName: driverName },
            })
          }
          style={styles.cta}
        />
      ) : null}

      {params.bookingId ? (
        <Button
          label="Annuler la réservation"
          variant="ghost"
          onPress={() => setCancelling(true)}
          style={styles.cta}
        />
      ) : null}

      <View style={styles.card}>
        <Text variant="label">Résumé</Text>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Point de rendez-vous
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            {params.pickupLabel ?? 'En attente de confirmation'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Contribution
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            {params.price ?? '—'} DT
          </Text>
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
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  joinLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cta: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
