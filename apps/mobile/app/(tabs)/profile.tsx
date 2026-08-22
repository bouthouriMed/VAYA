import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Avatar,
  BottomSheet,
  Icon,
  Modal,
  SkeletonCircle,
  SkeletonText,
  Text,
  elevation,
  haptics,
  radii,
  spacing,
  useAppTheme,
  useToast,
  StatusBarBlend,
  type IconName,
} from '@vaya/design-system';
import { TRUST_TIER_LABELS, type TrustTier } from '@vaya/domain';
import { router } from 'expo-router';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@vaya/config';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { clearAuth } from '../../src/state/authSlice';
import { setAppearance } from '../../src/state/appearanceSlice';
import { clearTokens } from '../../src/services/auth/tokenStorage';
import {
  saveAppearancePreference,
  type AppearancePreference,
} from '../../src/services/settings/appearanceStorage';
import {
  useGetMeQuery,
  useGetMyDriverProfileQuery,
  useGetUserTrustSummaryQuery,
  useLogoutMutation,
  useUpdateMeMutation,
  useUploadFileMutation,
} from '../../src/state/api';

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

/** The Apparence sheet's three choices, in display order. Icons are
 *  decorative (each row is labeled by its text) — the device glyph reads as
 *  "follow the OS", sun/moon as "pin one scheme". */
const APPEARANCE_OPTIONS: readonly {
  value: AppearancePreference;
  label: string;
  icon: IconName;
}[] = [
  { value: 'system', label: 'Automatique', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Clair', icon: 'sunny-outline' },
  { value: 'dark', label: 'Sombre', icon: 'moon-outline' },
] as const;

// Higher = stronger public signal about the person. The pill shows the best
// tier across both marketplace roles (most users start passenger-only).
const TIER_RANK: Record<TrustTier, number> = { new: 0, trusted: 1, top_rated: 2 };

interface ProfileRow {
  key: string;
  icon: IconName;
  label: string;
  /** Current-value text shown before the chevron (e.g. the active locale). */
  value?: string;
  onPress?: () => void;
}

function fileFromUri(uri: string): FormData {
  const formData = new FormData();
  const ext = /\.(\w+)$/.exec(uri)?.[1] ?? 'jpg';
  formData.append('file', {
    uri,
    name: `avatar.${ext}`,
    type: `image/${ext}`,
  } as unknown as Blob);
  return formData;
}

/** Stitch's "Main Profile - World-Class Hub" — identity-first settings hub.
 *
 *  Deviations from the literal mockup, each deliberate:
 *  - Header keeps only the centered "Vaya" title: the mockup's hamburger has
 *    no drawer to open in this app, and a dead button violates "every
 *    interaction works".
 *  - A "Notifications" row is added under Compte so Phase 7's inbox keeps an
 *    entry point.
 *  - Rows whose backing systems genuinely don't exist yet (payment, password
 *    security…) render disabled with a trailing "Bientôt" instead of a
 *    chevron that would promise navigation that can't happen.
 */
export default function ProfileScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const {colors: theme, scheme} = useAppTheme();
  const toast = useToast();

  const { data: me, isLoading: isMeLoading } = useGetMeQuery();
  // Skip until me.id exists — trust summary is keyed by user id.
  const { data: trustSummary, isLoading: isTrustLoading } = useGetUserTrustSummaryQuery(
    me?.id ?? '',
    {
      skip: !me,
    },
  );
  const { data: realDriverProfile } = useGetMyDriverProfileQuery();

  const [logout] = useLogoutMutation();
  const [updateMe] = useUpdateMeMutation();
  const [uploadFile] = useUploadFileMutation();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [pickingLocale, setPickingLocale] = useState(false);
  const [pickingAppearance, setPickingAppearance] = useState(false);
  const [showingAccountInfo, setShowingAccountInfo] = useState(false);
  const [locale, setLocale] = useState<SupportedLocale>('fr');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const appearancePreference = useAppSelector((s) => s.appearance.preference);

  const activeLocale: SupportedLocale = me?.locale ?? locale;

  const trustAggregate =
    trustSummary &&
    (trustSummary.driver ?? trustSummary.rider ?? null) &&
    [trustSummary.driver, trustSummary.rider]
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];

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
    router.push(realDriverProfile ? '/(tabs)/publish' : '/driver/onboarding');
  }

  async function handleChangePhoto(): Promise<void> {
    if (isUploadingPhoto) return;
    haptics.selection();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast({ message: 'Accès à la galerie requis pour choisir une photo.', tone: 'warning' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      const uri = result.canceled ? undefined : result.assets[0]?.uri;
      if (!uri) return;

      setIsUploadingPhoto(true);
      const { url } = await uploadFile(fileFromUri(uri)).unwrap();
      // Server round-trip invalidates Me — the avatar below re-renders from
      // the refetched real URL, never from optimistic local state.
      await updateMe({ avatarFileUrl: url }).unwrap();
      toast({ message: 'Photo de profil mise à jour.', tone: 'success' });
    } catch {
      toast({ message: "Échec de l'envoi de la photo. Réessayez.", tone: 'error' });
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function pickLocale(option: SupportedLocale): void {
    setLocale(option);
    setPickingLocale(false);
    updateMe({ locale: option }).catch(() => {
      toast({ message: 'Langue non enregistrée.', tone: 'error' });
    });
  }

  /** Applies the picked scheme immediately (the store value feeds
   *  ThemedApp → AppThemeProvider at the app root, so the whole UI — tab
   *  bar, status-bar polarity, explore's frosted blend — flips live) and
   *  persists it for next launch. Storage failure surfaces a toast but
   *  never rolls back the in-memory change: this session already runs in
   *  what the user asked for. */
  function pickAppearance(option: AppearancePreference): void {
    haptics.selection();
    setPickingAppearance(false);
    dispatch(setAppearance(option));
    saveAppearancePreference(option).catch(() => {
      toast({ message: "Préférence d'apparence non enregistrée.", tone: 'error' });
    });
  }

  const sections: { title: string; rows: ProfileRow[] }[] = [
    {
      title: 'Identité',
      rows: [
        {
          key: 'personal-info',
          icon: 'person-outline',
          label: 'Informations personnelles',
          onPress: () => setShowingAccountInfo(true),
        },
      ],
    },
    {
      title: 'Compte',
      rows: [
        { key: 'payment', icon: 'card-outline', label: 'Paiement' },
        {
          key: 'notifications',
          icon: 'notifications-outline',
          label: 'Notifications',
          onPress: () => router.push('/notifications'),
        },
        {
          key: 'history',
          icon: 'time-outline',
          label: 'Historique des trajets',
          onPress: () => router.push('/(tabs)/trips'),
        },
      ],
    },
    {
      title: 'Sécurité',
      rows: [
        { key: 'security', icon: 'lock-closed-outline', label: 'Sécurité et mot de passe' },
        { key: 'privacy', icon: 'shield-checkmark-outline', label: 'Confidentialité' },
      ],
    },
    {
      title: 'Préférences',
      rows: [
        { key: 'ride-prefs', icon: 'options-outline', label: 'Préférences de trajet' },
        {
          key: 'language',
          icon: 'language-outline',
          label: 'Langue',
          value: LOCALE_LABELS[activeLocale],
          onPress: () => setPickingLocale(true),
        },
        {
          key: 'appearance',
          icon: 'color-palette-outline',
          label: 'Apparence',
          value: APPEARANCE_OPTIONS.find((o) => o.value === appearancePreference)?.label,
          onPress: () => setPickingAppearance(true),
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Initial spacer so content starts below the OS status bar; once
         *  scrolled, content passes UNDER the pinned StatusBarBlend frost
         *  (rendered after this ScrollView) instead of colliding raw with
         *  the clock/battery/signal icons. */}
        <View style={{ height: insets.top + spacing.sm }} />

        {/* User identity */}
        <View style={styles.identity}>
          <TouchableOpacity
            style={styles.avatarWrap}
            activeOpacity={0.8}
            disabled={isUploadingPhoto || isMeLoading}
            onPress={handleChangePhoto}
            accessibilityRole="button"
            accessibilityLabel={
              me?.avatarUrl ? 'Modifier la photo de profil' : 'Ajouter une photo de profil'
            }
          >
            {isMeLoading || !me ? (
              <SkeletonCircle size={96} />
            ) : (
              <>
                <Avatar
                  uri={me.avatarUrl}
                  name={me.fullName}
                  sizePx={96}
                  fallbackBackgroundColor={theme.surfaceMuted}
                  fallbackTextColor={theme.ink}
                  style={{ borderWidth: 2, borderColor: theme.outlineVariant }}
                />
                {!me.avatarUrl ? (
                  <View
                    style={[
                      styles.photoBadge,
                      { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                    ]}
                  >
                    <Icon name="camera-outline" size="xs" color={theme.inkFaint} />
                  </View>
                ) : null}
              </>
            )}
          </TouchableOpacity>

          <View style={styles.identityMeta}>
            {trustAggregate ? (
              <View
                style={[
                  styles.tierPill,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
                ]}
              >
                <Icon name="star" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {TRUST_TIER_LABELS[trustAggregate.tier]}
                </Text>
              </View>
            ) : isTrustLoading ? (
              <SkeletonText variant="bodySmall" width={110} />
            ) : null}

            {!isMeLoading && me ? (
              <TouchableOpacity
                onPress={handleChangePhoto}
                disabled={isUploadingPhoto}
                accessibilityRole="button"
                accessibilityLabel={
                  me.avatarUrl ? 'Modifier la photo de profil' : 'Ajoutez une photo de profil'
                }
                style={styles.photoCta}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <Text variant="bodySmall" color={theme.inkFaint}>
                    {me.avatarUrl ? 'Modifier la photo de profil' : 'Ajoutez une photo de profil'}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Driver invitation CTA */}
        <TouchableOpacity
          style={[
            styles.driverCard,
            { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
          ]}
          onPress={goToDriverFlow}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            realDriverProfile
              ? 'Publier un trajet'
              : 'Rejoignez la communauté Vaya en tant que conducteur'
          }
        >
          <View style={[styles.driverIconCircle, { backgroundColor: theme.surface }]}>
            <Icon name="car-sport-outline" size="sm" color={theme.ink} />
          </View>
          <View style={styles.driverTextCol}>
            <Text variant="body" color={theme.ink} style={styles.driverTitle}>
              Partagez vos trajets
            </Text>
            <Text variant="bodySmall" color={theme.inkMuted}>
              Rejoignez la communauté Vaya.
            </Text>
          </View>
          <Icon name="arrow-forward" size="sm" color={theme.outline} />
        </TouchableOpacity>

        {/* Grouped navigation sections */}
        <View style={styles.sectionsWrap}>
          {sections.map((section) => (
            <View key={section.title}>
              <Text variant="caption" color={theme.inkFaint} style={styles.sectionTitle}>
                {section.title}
              </Text>
              <View
                style={[
                  styles.groupCard,
                  { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                  elevation?.sm,
                ]}
              >
                {section.rows.map((row, i) => (
                  <View key={row.key}>
                    {i > 0 ? (
                      <View
                        style={[styles.rowDivider, { backgroundColor: theme.outlineVariant }]}
                      />
                    ) : null}
                    <TouchableOpacity
                      style={styles.row}
                      onPress={row.onPress}
                      disabled={!row.onPress}
                      activeOpacity={0.6}
                      accessibilityRole={row.onPress ? 'button' : 'text'}
                      accessibilityLabel={row.label}
                      accessibilityState={{ disabled: !row.onPress }}
                    >
                      <Icon
                        name={row.icon}
                        size="sm"
                        color={row.onPress ? theme.inkMuted : theme.outline}
                      />
                      <Text
                        variant="body"
                        color={row.onPress ? theme.ink : theme.inkFaint}
                        style={styles.rowLabel}
                      >
                        {row.label}
                      </Text>
                      {row.value ? (
                        <Text variant="caption" color={theme.inkFaint}>
                          {row.value}
                        </Text>
                      ) : row.onPress ? (
                        <Icon name="chevron-forward" size="xs" color={theme.outline} />
                      ) : (
                        <Text variant="caption" color={theme.inkFaint}>
                          Bientôt
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Logout */}
          <TouchableOpacity
            style={[
              styles.groupCard,
              styles.logoutCard,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
              elevation?.sm,
            ]}
            onPress={() => setConfirmingLogout(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Déconnexion"
          >
            <Icon name="log-out-outline" size="sm" color={theme.error} />
            <Text variant="label" color={theme.error}>
              Déconnexion
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Pinned frost over the OS status-bar zone — a sibling AFTER the
       *  ScrollView so it stays put (absolute top overlay, paints above
       *  scrolled content) instead of scrolling away with it. Same pattern
       *  as explore's map top edge. */}
      <StatusBarBlend theme={theme} scheme={scheme} height={insets.top - spacing.sm} />

      <Modal
        visible={confirmingLogout}
        onClose={() => setConfirmingLogout(false)}
        title="Se déconnecter ?"
        confirmLabel="Se déconnecter"
        confirmDestructive
        theme={theme}
        onConfirm={() => {
          setConfirmingLogout(false);
          void handleLogout();
        }}
      >
        <Text variant="body" color={theme.inkMuted}>
          Vous devrez vous reconnecter avec votre numéro de téléphone.
        </Text>
      </Modal>

      <BottomSheet
        visible={pickingLocale}
        onClose={() => setPickingLocale(false)}
        title="Langue"
        heightRatio={0.35}
        theme={theme}
      >
        {SUPPORTED_LOCALES.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.sheetRow, { borderBottomColor: theme.outlineVariant }]}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={LOCALE_LABELS[option]}
            accessibilityState={{ selected: option === activeLocale }}
            onPress={() => pickLocale(option)}
          >
            <Text variant="body" color={theme.ink}>
              {LOCALE_LABELS[option]}
            </Text>
            {option === activeLocale ? (
              <Icon name="checkmark" size="xs" color={theme.accent} />
            ) : null}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={pickingAppearance}
        onClose={() => setPickingAppearance(false)}
        title="Apparence"
        heightRatio={0.35}
        theme={theme}
      >
        {APPEARANCE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.sheetRow, { borderBottomColor: theme.outlineVariant }]}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Apparence ${option.label}`}
            accessibilityState={{ selected: option.value === appearancePreference }}
            onPress={() => pickAppearance(option.value)}
          >
            <View style={styles.appearanceOption}>
              <Icon name={option.icon} size="sm" color={theme.inkMuted} />
              <Text variant="body" color={theme.ink}>
                {option.label}
              </Text>
            </View>
            {option.value === appearancePreference ? (
              <Icon name="checkmark" size="xs" color={theme.accent} />
            ) : null}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={showingAccountInfo}
        onClose={() => setShowingAccountInfo(false)}
        title="Informations personnelles"
        heightRatio={0.38}
        theme={theme}
      >
        {me ? (
          <View style={styles.infoGroup}>
            <View style={styles.infoRow}>
              <Text variant="caption" color={theme.inkFaint}>
                Nom complet
              </Text>
              <Text variant="body" color={theme.ink}>
                {me.fullName}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: theme.outlineVariant }]}>
              <Text variant="caption" color={theme.inkFaint}>
                Téléphone
              </Text>
              <Text variant="body" color={theme.ink}>
                {me.phone}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: theme.outlineVariant }]}>
              <Text variant="caption" color={theme.inkFaint}>
                Membre depuis
              </Text>
              <Text variant="body" color={theme.ink}>
                {new Date(me.createdAt).toLocaleDateString('fr-FR', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        ) : (
          <SkeletonText variant="body" width="80%" />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  identity: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  avatarWrap: {
    width: 96,
    height: 96,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityMeta: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 56,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  photoCta: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radii.full,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  driverIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverTextCol: {
    flex: 1,
  },
  driverTitle: {
    fontWeight: '500',
    marginBottom: 2,
  },
  sectionsWrap: {
    gap: spacing.lg,
    marginHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  groupCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: {
    flex: 1,
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 4,
    borderBottomWidth: 1,
  },
  appearanceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoGroup: {
    gap: spacing.xs,
  },
  infoRow: {
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
    gap: 2,
  },
});
