import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Icon, colors, spacing } from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import { useIsOffline } from '../hooks/useIsOffline';

/**
 * A persistent, honest "you're offline" surface — previously this app had
 * no connectivity awareness at all (see useIsOffline.ts), so a fully
 * offline device just watched every screen sit in a loading/error state
 * with no explanation of why. Mounted once at the root (app/_layout.tsx),
 * pinned under the status bar so it never covers a screen's own header.
 */
export function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useIsOffline();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  if (!isOffline) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={t('common:offline.message')}
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.warningDark,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingBottom: spacing.xs,
      }}
    >
      <Icon name="alert-circle-outline" size="xs" color={colors.white} />
      <Text variant="caption" color={colors.white}>
        {t('common:offline.message')}
      </Text>
    </View>
  );
}
