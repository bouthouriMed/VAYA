import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Avatar,
  Chip,
  Meter,
  StatTile,
  Modal,
  BottomSheet,
  Icon,
  colors,
  spacing,
  radii,
  elevation,
  typography,
  haptics,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@vaya/config';
import { CURRENT_USER, DRIVERS } from '../../src/mocks/seed-data';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { clearAuth } from '../../src/state/authSlice';
import { clearTokens } from '../../src/services/auth/tokenStorage';
import { useGetMyDriverProfileQuery, useLogoutMutation } from '../../src/state/api';

const SETTINGS_ROWS: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }[] = [
  { icon: 'language-outline', label: 'Langue' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-checkmark-outline', label: 'Confidentialité et sécurité' },
  { icon: 'help-circle-outline', label: 'Aide' },
];

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

export default function ProfileScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const driverProfile = DRIVERS.youssef!;
  const dispatch = useAppDispatch();
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const { data: realDriverProfile } = useGetMyDriverProfileQuery();
  const [logout] = useLogoutMutation();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [locale, setLocale] = useState<SupportedLocale>('fr');
  const [pickingLocale, setPickingLocale] = useState(false);

  async function handleLogout(): Promise<void> {
    if (refreshToken) {
      try {
        await logout({ refreshToken }).unwrap();
      } catch {
        // Best-effort server-side revocation — clearing local state below is
        // what actually signs the device out either way.
      }
    }
    await clearTokens();
    dispatch(clearAuth());
    router.replace('/');
  }

  function goToDriverFlow(): void {
    haptics.selection();
    router.push(realDriverProfile ? '/driver/publish' : '/driver/onboarding');
  }

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
          <StatTile
            value={`★ ${CURRENT_USER.riderRatingAvg.toFixed(1)}`}
            label={`Passager · ${CURRENT_USER.riderTripCount} trajets`}
          />
          <StatTile
            value={`★ ${driverProfile.ratingAvg.toFixed(1)}`}
            label={`Conducteur · ${driverProfile.tripCount} trajets`}
          />
          <StatTile
            value={`${Math.round(driverProfile.responseRate * 100)}%`}
            label="Taux de réponse"
          />
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

        <TouchableOpacity
          style={styles.driverFlowCard}
          onPress={goToDriverFlow}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={realDriverProfile ? 'Publier un trajet' : 'Devenir conducteur'}
        >
          <View style={styles.driverFlowAccent} />
          <View style={styles.vehicleRow}>
            <View style={styles.driverFlowIcon}>
              <Ionicons name="car-sport" size={22} color={colors.white} />
            </View>
            <View style={styles.driverFlowTextCol}>
              <Text variant="label" color={colors.white}>
                {realDriverProfile ? 'Publier un trajet' : 'Devenir conducteur'}
              </Text>
              <Text variant="bodySmall" color={colors.navyTextMuted}>
                {realDriverProfile
                  ? 'Proposez des places sur votre trajet'
                  : 'Ajoutez votre véhicule pour commencer'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.navyTextMuted} />
          </View>
        </TouchableOpacity>

        <View style={styles.card}>
          {SETTINGS_ROWS.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.settingsRow, i > 0 && styles.settingsRowDivider]}
              activeOpacity={0.6}
              onPress={
                row.label === 'Langue'
                  ? () => setPickingLocale(true)
                  : row.label === 'Notifications'
                    ? () => router.push('/notifications')
                    : undefined
              }
            >
              <Ionicons name={row.icon} size={20} color={colors.gray700} />
              <Text variant="body" style={styles.settingsLabel}>
                {row.label}
              </Text>
              {row.label === 'Langue' ? (
                <Text variant="bodySmall" color={colors.gray500}>
                  {LOCALE_LABELS[locale]}
                </Text>
              ) : row.value ? (
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
          onPress={() => setConfirmingLogout(true)}
          activeOpacity={0.7}
        >
          <Text variant="label" color={colors.error}>
            Se déconnecter
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        title="Se déconnecter ?"
        confirmLabel="Se déconnecter"
        confirmDestructive
        onConfirm={() => {
          setConfirmingLogout(false);
          void handleLogout();
        }}
      >
        <Text variant="body" color={colors.gray600}>
          Vous devrez vous reconnecter avec votre numéro de téléphone.
        </Text>
      </Modal>

      <BottomSheet
        visible={pickingLocale}
        onClose={() => setPickingLocale(false)}
        title="Langue"
        heightRatio={0.35}
      >
        {SUPPORTED_LOCALES.map((option) => (
          <TouchableOpacity
            key={option}
            style={styles.localeRow}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={LOCALE_LABELS[option]}
            accessibilityState={{ selected: option === locale }}
            onPress={() => {
              setLocale(option);
              setPickingLocale(false);
            }}
          >
            <Text variant="body">{LOCALE_LABELS[option]}</Text>
            {option === locale ? <Icon name="checkmark" color={colors.secondary} /> : null}
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </View>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
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
  driverFlowTextCol: {
    flex: 1,
  },
  driverFlowCard: {
    backgroundColor: colors.navySurface,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    overflow: 'hidden',
    ...elevation?.lg,
    shadowColor: colors.primary,
  },
  driverFlowAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.secondary,
  },
  driverFlowIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
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
