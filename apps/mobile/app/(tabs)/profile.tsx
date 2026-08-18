import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, Chip, Meter, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';
import { CURRENT_USER, DRIVERS } from '../../src/mocks/seed-data';

const SETTINGS_ROWS: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }[] = [
  { icon: 'language-outline', label: 'Langue', value: 'Français' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-checkmark-outline', label: 'Confidentialité et sécurité' },
  { icon: 'help-circle-outline', label: 'Aide' },
];

export default function ProfileScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const driverProfile = DRIVERS.youssef!;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
          <TouchableOpacity style={styles.settingsGear} hitSlop={12}>
            <Ionicons name="settings-outline" size={20} color={colors.navyText} />
          </TouchableOpacity>
        </View>

        <View style={styles.identity}>
          <Avatar name={CURRENT_USER.fullName} size="lg" style={styles.avatarRing} />
          <View style={styles.nameRow}>
            <Text variant="h3">{CURRENT_USER.fullName}</Text>
            {CURRENT_USER.phoneVerified ? (
              <Ionicons name="checkmark-circle" size={18} color={colors.secondary} />
            ) : null}
          </View>
          <Text variant="bodySmall" color={colors.gray600}>
            Membre depuis {CURRENT_USER.memberSince}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text variant="label" color={colors.gray600}>
              Passager
            </Text>
            <Text variant="h3">★ {CURRENT_USER.riderRatingAvg.toFixed(1)}</Text>
            <Text variant="bodySmall" color={colors.gray600}>
              {CURRENT_USER.riderTripCount} trajets
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text variant="label" color={colors.gray600}>
              Conducteur
            </Text>
            <Text variant="h3">★ {driverProfile.ratingAvg.toFixed(1)}</Text>
            <Text variant="bodySmall" color={colors.gray600}>
              {driverProfile.tripCount} trajets
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="label" style={styles.cardTitle}>
            Réputation conducteur
          </Text>
          <Meter label="Fiabilité" valueRatio={driverProfile.reliabilityScore} />
          <Meter label="Ponctualité" valueRatio={driverProfile.punctualityScore} />
        </View>

        <View style={styles.card}>
          <Text variant="label" style={styles.cardTitle}>
            Mon véhicule
          </Text>
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleIcon}>
              <Ionicons name="car-sport-outline" size={20} color={colors.gray900} />
            </View>
            <View>
              <Text variant="label">
                {driverProfile.vehicle.make} {driverProfile.vehicle.model} ·{' '}
                {driverProfile.vehicle.color}
              </Text>
              <Text variant="bodySmall" color={colors.gray600}>
                {driverProfile.vehicle.plate}
              </Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            <Chip label="Téléphone vérifié" />
            <Chip label="Permis vérifié" />
          </View>
        </View>

        <View style={styles.card}>
          {SETTINGS_ROWS.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.settingsRow, i > 0 && styles.settingsRowDivider]}
              activeOpacity={0.6}
            >
              <Ionicons name={row.icon} size={20} color={colors.gray700} />
              <Text variant="body" style={styles.settingsLabel}>
                {row.label}
              </Text>
              {row.value ? (
                <Text variant="bodySmall" color={colors.gray500}>
                  {row.value}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logout}
          onPress={() => router.replace('/')}
          activeOpacity={0.7}
        >
          <Text variant="label" color={colors.error}>
            Se déconnecter
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  hero: {
    backgroundColor: colors.secondary,
    height: 96,
    paddingHorizontal: spacing.lg,
  },
  settingsGear: {
    alignSelf: 'flex-end',
  },
  identity: {
    alignItems: 'center',
    marginTop: -AVATAR_SIZE / 2,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.white,
    marginBottom: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  settingsRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  settingsLabel: {
    flex: 1,
    fontWeight: typography.fontWeight.medium,
  },
  logout: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
});
