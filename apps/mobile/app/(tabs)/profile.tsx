import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Avatar,
  BottomSheet,
  EmptyState,
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
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
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
  useRequestPhoneOtpMutation,
  useUpdateMeMutation,
  useUploadFileMutation,
  useVerifyPhoneOtpMutation,
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
  /** Small dot over the row's icon — an incomplete-profile nudge, not an error. */
  alert?: boolean;
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
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const {colors: theme, scheme} = useAppTheme();
  const toast = useToast();

  const { data: me, isLoading: isMeLoading } = useGetMeQuery(undefined, { skip: !accessToken });
  // Skip until me.id exists — trust summary is keyed by user id.
  const { data: trustSummary, isLoading: isTrustLoading } = useGetUserTrustSummaryQuery(
    me?.id ?? '',
    {
      skip: !me,
    },
  );
  const { data: realDriverProfile, isLoading: isDriverProfileLoading } = useGetMyDriverProfileQuery(
    undefined,
    { skip: !accessToken },
  );

  const [logout] = useLogoutMutation();
  const [updateMe] = useUpdateMeMutation();
  const [uploadFile] = useUploadFileMutation();
  const [requestPhoneOtp, { isLoading: isSendingPhoneOtp }] = useRequestPhoneOtpMutation();
  const [verifyPhoneOtp, { isLoading: isVerifyingPhoneOtp }] = useVerifyPhoneOtpMutation();
  const { requireAuth, isAuthSheetVisible, authTrigger, handleAuthenticated, cancelAuth } =
    useContextualAuth();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [pickingLocale, setPickingLocale] = useState(false);
  const [pickingAppearance, setPickingAppearance] = useState(false);
  const [showingAccountInfo, setShowingAccountInfo] = useState(false);
  const [locale, setLocale] = useState<SupportedLocale>('fr');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [addingPhone, setAddingPhone] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code'>('phone');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneDevCode, setPhoneDevCode] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const appearancePreference = useAppSelector((s) => s.appearance.preference);

  const activeLocale: SupportedLocale = me?.locale ?? locale;

  const trustAggregate =
    trustSummary &&
    (trustSummary.driver ?? trustSummary.rider ?? null) &&
    [trustSummary.driver, trustSummary.rider]
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];

  // Every row here is identity-scoped (real name, real stats, real
  // settings) — nothing honest to show a guest, but browsing this tab is
  // still allowed (per the guest-browsing model). A friendly EmptyState
  // replaces the real hub instead of a hard redirect; its CTA opens the
  // same ContextualAuthSheet search/publish already use.
  if (!accessToken) {
    return (
      <View style={[styles.container, styles.guestContainer, { backgroundColor: theme.background }]}>
        <View style={{ height: insets.top + spacing.sm }} />
        <EmptyState
          icon={<Icon name="person-circle-outline" size="lg" color={theme.inkFaint} />}
          title="Votre profil VAYA"
          description="Connectez-vous pour gérer votre profil, suivre vos trajets et accéder à vos réglages."
          actionLabel="Se connecter"
          onAction={() => requireAuth(() => {}, 'account')}
        />
        <StatusBarBlend theme={theme} scheme={scheme} height={insets.top - spacing.sm} />
        <ContextualAuthSheet
          visible={isAuthSheetVisible}
          trigger={authTrigger}
          onClose={cancelAuth}
          onAuthenticated={handleAuthenticated}
        />
      </View>
    );
  }

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

  /** The hub's driver block mirrors the real verification lifecycle —
   *  recruitment pitch before onboarding, an in-progress/refused status
   *  while not approved, and the verified-driver card (with the actual
   *  vehicle) once approved. Never shows the recruitment pitch to someone
   *  who already drives. */
  const driverStatus: 'loading' | 'none' | 'pending' | 'approved' | 'rejected' =
    isDriverProfileLoading
      ? 'loading'
      : ((realDriverProfile?.verificationStatus ?? 'none') as 'none' | 'pending' | 'approved' | 'rejected');
  const primaryVehicle = realDriverProfile?.vehicles[0];

  function goToDriverFlow(): void {
    haptics.selection();
    // Only a genuinely approved profile skips onboarding — any other state
    // (including rejected) belongs back in the wizard.
    router.push(
      driverStatus === 'approved' ? '/(tabs)/publish' : '/driver/onboarding',
    );
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

  function openAddPhone(): void {
    haptics.selection();
    setShowingAccountInfo(false);
    setPhoneDraft('');
    setPhoneOtpCode('');
    setPhoneError(undefined);
    setPhoneDevCode(undefined);
    setPhoneStep('phone');
    setAddingPhone(true);
  }

  const canSendPhoneOtp = phoneDraft.replace(/\s/g, '').length >= 8 && !isSendingPhoneOtp;

  async function sendPhoneOtp(): Promise<void> {
    if (!canSendPhoneOtp) return;
    setPhoneError(undefined);
    try {
      const result = await requestPhoneOtp({
        phone: `+216${phoneDraft.replace(/\s/g, '')}`,
      }).unwrap();
      setPhoneDevCode(result.devCode);
      setPhoneStep('code');
    } catch {
      setPhoneError('Numéro invalide ou envoi impossible. Réessayez.');
    }
  }

  const canVerifyPhoneOtp = phoneOtpCode.length === 6 && !isVerifyingPhoneOtp;

  async function confirmPhoneOtp(): Promise<void> {
    if (!canVerifyPhoneOtp) return;
    setPhoneError(undefined);
    try {
      await verifyPhoneOtp({
        phone: `+216${phoneDraft.replace(/\s/g, '')}`,
        code: phoneOtpCode,
      }).unwrap();
      haptics.success();
      toast({ message: 'Numéro de téléphone vérifié.', tone: 'success' });
      setAddingPhone(false);
    } catch (err) {
      haptics.error();
      const status = (err as { status?: number } | undefined)?.status;
      setPhoneError(
        status === 409
          ? 'Ce numéro est déjà associé à un autre compte VAYA.'
          : 'Code invalide ou expiré. Réessayez.',
      );
      setPhoneOtpCode('');
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
          alert: Boolean(me && !me.phone),
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
          <View style={styles.avatarWrap}>
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
                {/* Small, subtle edit affordance instead of a text link below
                 *  the name — always present (not just when photo-less), the
                 *  modern "tap the badge on the avatar" convention. */}
                <TouchableOpacity
                  onPress={handleChangePhoto}
                  disabled={isUploadingPhoto}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    me.avatarUrl ? 'Modifier la photo de profil' : 'Ajouter une photo de profil'
                  }
                  style={[
                    styles.photoBadge,
                    { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                  ]}
                >
                  {isUploadingPhoto ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Icon name="camera-outline" size="xs" color={theme.inkMuted} />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.identityMeta}>
            {/* The hub's page-heading moment — same headlineDisplay scale as
             *  every other tab root (trips/messages/explore/publish); here
             *  centered because the whole identity block is. Falls back to
             *  an honest skeleton while /users/me loads. */}
            {!isMeLoading ? (
              <Text
                variant="headlineDisplay"
                color={theme.ink}
                numberOfLines={2}
                style={styles.identityName}
              >
                {me?.fullName ?? 'Mon profil'}
              </Text>
            ) : (
              <SkeletonText variant="h2" width={170} />
            )}

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
            ) : me ? (
              // Genuinely zero trips either side (driver and rider trust
              // summaries both null) — an honest "new here" status, not a
              // fabricated stat, standing in for the old redundant photo-CTA
              // text this replaced.
              <View
                style={[
                  styles.tierPill,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
                ]}
              >
                <Icon name="sparkles-outline" size="xs" color={theme.accent} />
                <Text variant="bodySmall" color={theme.inkMuted}>
                  Nouveau sur Vaya
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Driver block — reactive to verification status */}
        {driverStatus === 'loading' ? (
          <View
            style={[
              styles.driverCard,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
            ]}
          >
            <SkeletonCircle size={40} />
            <View style={styles.driverTextCol}>
              <SkeletonText variant="body" width="60%" />
              <SkeletonText variant="bodySmall" width="80%" />
            </View>
          </View>
        ) : driverStatus === 'approved' ? (
          <TouchableOpacity
            style={[
              styles.driverCard,
              styles.driverCardVerified,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.accent },
            ]}
            onPress={() => {
              haptics.selection();
              router.push('/(tabs)/publish');
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              primaryVehicle
                ? `Conducteur vérifié, ${primaryVehicle.make} ${primaryVehicle.model}, publier un trajet`
                : 'Conducteur vérifié, publier un trajet'
            }
          >
            <View style={[styles.driverIconCircle, { backgroundColor: theme.accent }]}>
              <Icon name="checkmark" size="sm" color={theme.onAccent} />
            </View>
            <View style={styles.driverTextCol}>
              <Text variant="body" color={theme.ink} style={styles.driverTitle}>
                Conducteur vérifié
              </Text>
              {primaryVehicle ? (
                <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
                  {`${primaryVehicle.make} ${primaryVehicle.model} · ${primaryVehicle.plateNumber}`}
                </Text>
              ) : null}
              {/* Real aggregate from the driver profile — hidden until there
               *  is something true to show (no fabricated zeros). */}
              {(realDriverProfile?.tripCount ?? 0) > 0 ? (
                <Text variant="caption" color={theme.inkFaint}>
                  {`★ ${realDriverProfile?.ratingAvg} · ${realDriverProfile?.tripCount} trajets`}
                </Text>
              ) : null}
            </View>
            <Icon name="arrow-forward" size="sm" color={theme.outline} />
          </TouchableOpacity>
        ) : driverStatus === 'pending' ? (
          <View
            style={[
              styles.driverCard,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
            ]}
            accessibilityRole="text"
            accessibilityLabel="Vérification du profil conducteur en cours"
          >
            <View style={[styles.driverIconCircle, { backgroundColor: theme.surface }]}>
              <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            </View>
            <View style={styles.driverTextCol}>
              <Text variant="body" color={theme.ink} style={styles.driverTitle}>
                Vérification en cours
              </Text>
              <Text variant="bodySmall" color={theme.inkMuted}>
                Nous vérifions vos documents. Vous pourrez publier dès qu&apos;ils sont validés.
              </Text>
            </View>
          </View>
        ) : driverStatus === 'rejected' ? (
          <TouchableOpacity
            style={[
              styles.driverCard,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.error },
            ]}
            onPress={goToDriverFlow}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Vérification refusée, reprendre la vérification"
          >
            <View style={[styles.driverIconCircle, { backgroundColor: theme.surface }]}>
              <Icon name="alert-circle-outline" size="sm" color={theme.error} />
            </View>
            <View style={styles.driverTextCol}>
              <Text variant="body" color={theme.ink} style={styles.driverTitle}>
                Vérification refusée
              </Text>
              <Text variant="bodySmall" color={theme.inkMuted}>
                Reprenez la vérification pour publier vos trajets.
              </Text>
            </View>
            <Icon name="chevron-forward" size="sm" color={theme.error} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.driverCard,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
            ]}
            onPress={goToDriverFlow}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Rejoignez la communauté Vaya en tant que conducteur"
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
        )}

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
                      <View>
                        <Icon
                          name={row.icon}
                          size="sm"
                          color={row.onPress ? theme.inkMuted : theme.outline}
                        />
                        {row.alert ? (
                          <View
                            style={[styles.rowAlertDot, { backgroundColor: theme.accent, borderColor: theme.surface }]}
                          />
                        ) : null}
                      </View>
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
              styles.logoutCard,
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
              {me.phone ? (
                <Text variant="body" color={theme.ink}>
                  {me.phone}
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={openAddPhone}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter et vérifier votre numéro de téléphone"
                  style={[
                    styles.verifyPhoneChip,
                    { backgroundColor: theme.surfaceMuted, borderColor: theme.accent },
                  ]}
                >
                  <Icon name="shield-checkmark-outline" size="xs" color={theme.accent} />
                  <Text variant="bodySmall" color={theme.accent}>
                    Ajouter et vérifier
                  </Text>
                  <Icon name="chevron-forward" size="xs" color={theme.accent} />
                </TouchableOpacity>
              )}
            </View>
            {me.email ? (
              <View style={[styles.infoRow, { borderBottomColor: theme.outlineVariant }]}>
                <Text variant="caption" color={theme.inkFaint}>
                  Email
                </Text>
                <Text variant="body" color={theme.ink}>
                  {me.email}
                </Text>
              </View>
            ) : null}
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

      <BottomSheet
        visible={addingPhone}
        onClose={() => setAddingPhone(false)}
        title={phoneStep === 'phone' ? 'Ajouter votre numéro' : 'Vérification'}
        heightRatio={0.42}
        theme={theme}
      >
        {phoneStep === 'phone' ? (
          <View style={styles.phoneSheetBody}>
            <Text variant="bodySmall" color={theme.inkMuted}>
              Utilisé pour la vérification et pour vous mettre en contact avec vos covoitureurs.
            </Text>
            <View
              style={[
                styles.phoneInputRow,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant },
              ]}
            >
              <View style={[styles.countryPill, { backgroundColor: theme.surface }]}>
                <Text variant="label" color={theme.ink}>
                  +216
                </Text>
              </View>
              <TextInput
                value={phoneDraft}
                onChangeText={setPhoneDraft}
                placeholder="98 123 456"
                placeholderTextColor={theme.inkFaint}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={() => void sendPhoneOtp()}
                style={[styles.phoneTextInput, { color: theme.ink }]}
                accessibilityLabel="Numéro de téléphone"
                autoFocus
              />
            </View>
            {phoneError ? (
              <Text variant="bodySmall" color={theme.error}>
                {phoneError}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={() => void sendPhoneOtp()}
              disabled={!canSendPhoneOtp}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Envoyer le code"
              accessibilityState={{ disabled: !canSendPhoneOtp, busy: isSendingPhoneOtp }}
              style={[
                styles.phoneCta,
                { backgroundColor: theme.ink },
                !canSendPhoneOtp && styles.ctaDisabled,
              ]}
            >
              {isSendingPhoneOtp ? (
                <ActivityIndicator size="small" color={theme.onInk} />
              ) : (
                <Text variant="label" color={theme.onInk}>
                  Envoyer le code
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.phoneSheetBody}>
            <Text variant="bodySmall" color={theme.inkMuted}>
              Code envoyé au +216 {phoneDraft}
            </Text>
            <TextInput
              value={phoneOtpCode}
              onChangeText={(v) => setPhoneOtpCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => void confirmPhoneOtp()}
              style={[
                styles.otpTextInput,
                {
                  color: theme.ink,
                  borderColor: theme.outlineVariant,
                  backgroundColor: theme.surfaceMuted,
                },
              ]}
              accessibilityLabel="Code de vérification"
              autoFocus
            />
            {phoneDevCode ? (
              <Text variant="bodySmall" color={theme.inkFaint}>
                Code de test : {phoneDevCode}
              </Text>
            ) : null}
            {phoneError ? (
              <Text variant="bodySmall" color={theme.error}>
                {phoneError}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={() => void confirmPhoneOtp()}
              disabled={!canVerifyPhoneOtp}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Vérifier"
              accessibilityState={{ disabled: !canVerifyPhoneOtp, busy: isVerifyingPhoneOtp }}
              style={[
                styles.phoneCta,
                { backgroundColor: theme.ink },
                !canVerifyPhoneOtp && styles.ctaDisabled,
              ]}
            >
              {isVerifyingPhoneOtp ? (
                <ActivityIndicator size="small" color={theme.onInk} />
              ) : (
                <Text variant="label" color={theme.onInk}>
                  Vérifier
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPhoneStep('phone')} accessibilityRole="button">
              <Text variant="bodySmall" color={theme.accent} align="center">
                Changer de numéro
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  guestContainer: {
    justifyContent: 'center',
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
  identityName: {
    marginTop: spacing.xs,
    textAlign: 'center',
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
  driverCardVerified: {
    borderWidth: 1.5,
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
  rowAlertDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
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
  verifyPhoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  phoneSheetBody: {
    gap: spacing.md,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  phoneTextInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: spacing.xs,
  },
  otpTextInput: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
  },
  phoneCta: {
    minHeight: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
