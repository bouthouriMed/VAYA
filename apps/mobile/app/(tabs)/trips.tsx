import { View, StyleSheet } from 'react-native';
import { Text, Avatar, Badge, colors, spacing, radii } from '@vaya/design-system';
import { DRIVERS, HOME_TO_DIGITAL_CENTER } from '../../src/mocks/seed-data';

const MOCK_TRIPS = [
  {
    id: '1',
    driver: DRIVERS.sarra!,
    status: 'En cours',
    badge: 'info' as const,
    when: "Aujourd'hui, 08:15",
  },
  {
    id: '2',
    driver: DRIVERS.amine!,
    status: 'Terminé',
    badge: 'success' as const,
    when: 'Hier, 08:20',
  },
  {
    id: '3',
    driver: DRIVERS.mehdi!,
    status: 'Annulé',
    badge: 'error' as const,
    when: 'Lun 12 · 07:45',
  },
];

export default function TripsScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text variant="h2" style={styles.title}>
        Mes trajets
      </Text>
      {MOCK_TRIPS.map((trip) => (
        <View key={trip.id} style={styles.row}>
          <Avatar name={trip.driver.fullName} size="md" />
          <View style={styles.rowText}>
            <Text variant="label">{trip.driver.fullName}</Text>
            <Text variant="bodySmall" color={colors.gray600}>
              {HOME_TO_DIGITAL_CENTER.originLabel} → {HOME_TO_DIGITAL_CENTER.destinationLabel}
            </Text>
            <Text variant="bodySmall" color={colors.gray500}>
              {trip.when}
            </Text>
          </View>
          <Badge label={trip.status} variant={trip.badge} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});
