import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { haptics } from '../utils/haptics';
import { useAppTheme } from '../theme/AppThemeProvider';

type ScreenHeaderTone = 'default' | 'overlay' | 'light' | 'dark';

interface ScreenHeaderProps {
  /** The screen's real name ("Ma réservation", "Profil") — never the app
   *  name. Wraps to two lines instead of truncating. Omit for an icon-only
   *  header over a hero. */
  title?: string;
  /** One short supporting line under the title (e.g. "2 non lues"). */
  subtitle?: string;
  /** Omit together with `leading` for a tab-root screen with no back control. */
  onBack?: () => void;
  /** 'back' (chevron) for pushed screens, 'close' (×) for modals. */
  leading?: 'back' | 'close' | 'none';
  /** Localized accessibility label for the leading control. */
  backLabel?: string;
  /** Right-aligned actions — use `HeaderIconButton` for consistency. */
  right?: React.ReactNode;
  /** The device's top safe-area inset; the header pads itself below it. */
  topInset?: number;
  /** Hairline divider under the header (default true unless transparent). */
  bordered?: boolean;
  /** No background fill — for headers floating over a map or hero. */
  transparent?: boolean;
  /** 'overlay' (legacy alias 'dark') is for screens with a photo/camera/dark
   *  hero behind the header: light icons on translucent circles. */
  tone?: ScreenHeaderTone;
  style?: StyleProp<ViewStyle>;
}

const SIDE_SIZE = 40;

interface HeaderIconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Unread count / dot — renders a small accent badge. */
  badge?: number | boolean;
  tone?: ScreenHeaderTone;
  directional?: boolean;
}

/** The one round header action: back, close, search, mark-all-read, bell. */
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge,
  tone = 'default',
  directional,
}: HeaderIconButtonProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const overlay = tone === 'overlay' || tone === 'dark';
  const showBadge = typeof badge === 'number' ? badge > 0 : Boolean(badge);
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconBtn,
        overlay
          ? styles.iconBtnOverlay
          : { backgroundColor: theme.surface, borderColor: theme.outlineVariant, borderWidth: 1 },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={icon} size="sm" color={overlay ? '#FFFFFF' : theme.ink} directional={directional} />
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.background }]}>
          {typeof badge === 'number' ? (
            <Text variant="caption" color={theme.onAccent} style={styles.badgeText}>
              {badge > 9 ? '9+' : String(badge)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The one header every pushed screen renders: a round back/close control,
 * a centered `title`-variant name (two lines max, never truncated to the
 * app name), and an optional right action. Owns its own top safe-area
 * padding so screens stop hand-rolling `paddingTop: 44`.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  leading,
  backLabel = 'Retour',
  right,
  topInset = 0,
  bordered,
  transparent = false,
  tone = 'default',
  style,
}: ScreenHeaderProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const overlay = tone === 'overlay' || tone === 'dark';
  const resolvedLeading = leading ?? (onBack ? 'back' : 'none');
  const showBorder = bordered ?? !transparent;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topInset + spacing.sm },
        !transparent && { backgroundColor: theme.background },
        showBorder && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.outlineVariant },
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side}>
          {resolvedLeading !== 'none' && onBack ? (
            <HeaderIconButton
              icon={resolvedLeading === 'close' ? 'close' : 'chevron-back'}
              onPress={onBack}
              accessibilityLabel={backLabel}
              tone={tone}
              directional={resolvedLeading === 'back'}
            />
          ) : null}
        </View>

        <View style={styles.titleCol} accessibilityRole="header">
          {title ? (
            <Text variant="title" color={overlay ? '#FFFFFF' : theme.ink} align="center" numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" color={overlay ? '#FFFFFF' : theme.inkMuted} align="center" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: SIDE_SIZE + spacing.xs,
  },
  // Equal-flex side slots keep the title optically centered even when the
  // right side carries two actions and the left only a back button.
  side: {
    flex: 1,
    minWidth: SIDE_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  titleCol: {
    flex: 3,
    alignItems: 'center',
  },
  iconBtn: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOverlay: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});
