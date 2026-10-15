import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';
import { spacing } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

export type ActivityTone = 'accent' | 'error' | 'info' | 'neutral' | 'warning';

interface ActivityRowProps {
  icon: IconName;
  tone?: ActivityTone;
  title: string;
  description?: string;
  /** Short time ("18:32", "jeu. 8 oct."). */
  timestamp: string;
  unread?: boolean;
  /** The person the event is about — shown with the event icon as a badge. */
  avatar?: { uri?: string | null; name: string };
  /** Draws the thread line down to the next row. */
  connectToNext?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  theme?: AppPalette;
}

const NODE = 40;

function toneColors(tone: ActivityTone, theme: AppPalette): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: theme.accentGlow, fg: theme.accentStrong };
    case 'error':
      return { bg: theme.errorMuted, fg: theme.error };
    case 'warning':
      return { bg: theme.warningMuted, fg: theme.warning };
    case 'info':
      return { bg: theme.surfaceMuted, fg: theme.info };
    case 'neutral':
    default:
      return { bg: theme.surfaceMuted, fg: theme.inkMuted };
  }
}

/**
 * One event in an activity timeline: a tinted node (or the person's photo
 * with the event icon as a badge) on a thread line, the title, one line of
 * detail and the time. Unread rows carry a dot and a heavier title — no
 * boxes, no borders: the list reads as one calm feed.
 */
export function ActivityRow({
  icon,
  tone = 'neutral',
  title,
  description,
  timestamp,
  unread = false,
  avatar,
  connectToNext = false,
  onPress,
  accessibilityLabel,
  theme: themeOverride,
}: ActivityRowProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const { bg, fg } = toneColors(tone, theme);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={styles.row}
    >
      <View style={styles.rail}>
        {avatar ? (
          <View>
            <Avatar uri={avatar.uri} name={avatar.name} sizePx={NODE} />
            <View style={[styles.badge, { backgroundColor: bg, borderColor: theme.background }]}>
              <Icon name={icon} size="xs" color={fg} />
            </View>
          </View>
        ) : (
          <View style={[styles.node, { backgroundColor: bg }]}>
            <Icon name={icon} size="sm" color={fg} />
          </View>
        )}
        {connectToNext ? <View testID="activity-thread" style={[styles.thread, { backgroundColor: theme.outlineVariant }]} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            variant={unread ? 'label' : 'body'}
            color={theme.ink}
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>
          <Text variant="caption" color={unread ? theme.accentStrong : theme.inkFaint}>
            {timestamp}
          </Text>
          {unread ? <View testID="activity-unread" style={[styles.dot, { backgroundColor: theme.accent }]} /> : null}
        </View>
        {description ? (
          <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rail: {
    alignItems: 'center',
    width: NODE,
    marginRight: spacing.xs,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits mostly outside the photo so it never covers the initials.
  badge: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: {
    flex: 1,
    width: 2,
    marginTop: spacing.xs,
    minHeight: spacing.md,
    borderRadius: 1,
  },
  body: {
    flex: 1,
    gap: 2,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
