import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

interface MessageBubbleProps {
  body: string;
  /** Own messages render right-aligned in solid ink; the other
   *  party's render left-aligned on a neutral surface — standard chat
   *  convention (docs/roadmap/phase-08-messaging.md's UX behavior). */
  isOwn: boolean;
  /** Pre-formatted, locale-aware timestamp string — formatting stays at
   *  the screen layer (same discipline as notifications/index.tsx). */
  timestamp: string;
  /** Overrides the theme from context — only for a screen pinned to one palette. */
  theme?: AppPalette;
  /** The other party's real avatar (Stitch's "Conversation / active trip
   *  coordination" shows a small avatar beside each of their bubbles) —
   *  only ever rendered for `!isOwn` messages; own messages never show
   *  one, matching the reference. Omit to render without one (unchanged
   *  behavior for any caller not passing it). */
  avatarUrl?: string | null;
  avatarName?: string;
  /** True when the previous message is from the same sender — the avatar
   *  is shown once per run of messages, not beside every bubble. */
  grouped?: boolean;
}

/**
 * A single chat bubble — the phase doc flagged this as "likely a small new
 * primitive given how central and reused this pattern will be within the
 * screen," since plain Card/Text composition can't cleanly express the
 * asymmetric own/other alignment, bubble tail-corner, and two-tone bubble
 * color without duplicating that logic at every call site.
 */
export function MessageBubble({
  body,
  isOwn,
  timestamp,
  theme: themeOverride,
  avatarUrl,
  avatarName,
  grouped = false,
}: MessageBubbleProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const showAvatar = !isOwn && Boolean(avatarName);
  const themed = {
    row: [styles.row, isOwn ? styles.rowOwn : styles.rowOther],
    bubble: [
      styles.bubble,
      isOwn
        ? { backgroundColor: theme.ink, borderBottomRightRadius: radii.sm }
        : {
            backgroundColor: theme.surface,
            borderBottomLeftRadius: radii.sm,
            borderWidth: 1,
            borderColor: theme.outlineVariant,
          },
    ],
    bodyColor: isOwn ? theme.onInk : theme.ink,
    timestampColor: isOwn ? theme.onInk : theme.inkMuted,
  };

  return (
    <View
      style={themed.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${isOwn ? 'Vous' : 'Autre participant'}, ${timestamp}: ${body}`}
    >
      {showAvatar ? (
        grouped ? (
          <View style={styles.avatarSpacer} />
        ) : (
          <Avatar uri={avatarUrl ?? null} name={avatarName ?? ''} sizePx={28} style={styles.avatar} />
        )
      ) : null}
      <View style={themed.bubble}>
        <Text variant="body" color={themed.bodyColor}>
          {body}
        </Text>
        <Text variant="caption" color={themed.timestampColor} style={[styles.timestamp, isOwn && styles.timestampOwn]}>
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: spacing.xs,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  avatarSpacer: {
    width: 28,
    marginRight: spacing.xs,
  },
  timestampOwn: {
    opacity: 0.7,
  },
  avatar: {
    marginRight: spacing.xs,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    alignSelf: 'flex-end',
  },
});
