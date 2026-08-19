import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';

export default function PickupScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    pickupLabel?: string;
    pickupLat?: string;
    pickupLng?: string;
  }>();
  const driverName = params.driverName ?? 'votre conducteur';
  const pickupCoord =
    params.pickupLat && params.pickupLng
      ? { latitude: Number(params.pickupLat), longitude: Number(params.pickupLng) }
      : undefined;
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
  const [cancelling, setCancelling] = useState(false);

  return (
    <View style={styles.container}>
      {/* No distance/ETA badge: nothing computes a real one yet (live
          position tracking is a later roadmap phase) — showing a
          fabricated "120 m · 2 min" was the exact anti-pattern Phase 1
          removed; Phase 3 makes the map itself real but doesn't add a fake
          distance estimate back. */}
      <MapPreview height={220} origin={pickupCoord} />

      <View style={styles.card}>
        <Text variant="label" color={colors.gray600}>
          Rendez-vous
        </Text>
        <Text variant="h3">{params.pickupLabel ?? 'En attente de confirmation'}</Text>
      </View>

      <View style={styles.driverRow}>
        <Avatar name={driverName} size="md" />
        <View style={styles.driverText}>
          <Text variant="label">
            {params.vehicleLabel ? `${params.vehicleLabel} · ` : ''}
            {driverName.split(' ')[0]}
          </Text>
          <Text variant="bodySmall" color={colors.gray600}>
            En approche
          </Text>
        </View>
        {params.bookingId ? (
          <Button
            label="Message"
            variant="ghost"
            size="sm"
            accessibilityLabel={`Envoyer un message à ${driverName.split(' ')[0]}`}
            onPress={() =>
              router.push({
                pathname: '/conversations/[bookingId]',
                params: {
                  bookingId: params.bookingId!,
                  role: 'rider',
                  otherPartyName: driverName,
                },
              })
            }
          />
        ) : null}
      </View>

      <Button
        label="Je suis arrivé"
        size="lg"
        onPress={() => router.push({ pathname: '/bookings/live', params })}
        style={styles.cta}
      />

      {params.bookingId ? (
        <Button
          label="Annuler la réservation"
          variant="ghost"
          onPress={() => setCancelling(true)}
        />
      ) : null}

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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: 2,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverText: {
    flex: 1,
  },
  cta: {
    width: '100%',
    marginTop: 'auto',
  },
});
