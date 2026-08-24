import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { colors, spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface MessageBubbleProps {
  body: string;
  /** Own messages render right-aligned in the brand navy; the other
   *  party's render left-aligned on a neutral surface — standard chat
   *  convention (docs/roadmap/phase-08-messaging.md's UX behavior). */
  isOwn: boolean;
  /** Pre-formatted, locale-aware timestamp string — formatting stays at
   *  the screen layer (same discipline as notifications/index.tsx). */
  timestamp: string;
  /** Optional `useAppTheme()` override (Stitch migration) — own bubbles
   *  render solid-accent/onAccent, others on surfaceMuted with an
   *  outlineVariant hairline. Omit for the legacy static palette. */
  theme?: AppPalette;
  /** The other party's real avatar (Stitch's "Conversation / active trip
   *  coordination" shows a small avatar beside each of their bubbles) —
   *  only ever rendered for `!isOwn` messages; own messages never show
   *  one, matching the reference. Omit to render without one (unchanged
   *  behavior for any caller not passing it). */
  avatarUrl?: string | null;
  avatarName?: string;
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
  theme,
  avatarUrl,
  avatarName,
}: MessageBubbleProps): React.JSX.Element {
  const showAvatar = !isOwn && Boolean(avatarName);
  const themed = theme
    ? {
        row: [styles.row, isOwn ? styles.rowOwn : styles.rowOther],
        bubble: [
          styles.bubble,
          isOwn
            ? { backgroundColor: theme.accent, borderBottomRightRadius: radii.sm }
            : {
                backgroundColor: theme.surfaceMuted,
                borderBottomLeftRadius: radii.sm,
                borderWidth: 1,
                borderColor: theme.outlineVariant,
              },
        ],
        bodyColor: isOwn ? theme.onAccent : theme.ink,
        timestampColor: isOwn ? theme.onAccent : theme.inkMuted,
      }
    : {
        row: [styles.row, isOwn ? styles.rowOwn : styles.rowOther],
        bubble: [styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther],
        bodyColor: isOwn ? colors.white : colors.gray900,
        timestampColor: isOwn ? colors.navyTextMuted : colors.gray500,
      };

  return (
    <View
      style={themed.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${isOwn ? 'Vous' : 'Autre participant'}, ${timestamp}: ${body}`}
    >
      {showAvatar ? (
        <Avatar
          uri={avatarUrl ?? null}
          name={avatarName ?? ''}
          sizePx={28}
          style={styles.avatar}
          fallbackBackgroundColor={theme ? theme.surfaceMuted : undefined}
          fallbackTextColor={theme ? theme.ink : undefined}
        />
      ) : null}
      <View style={themed.bubble}>
        <Text variant="body" color={themed.bodyColor}>
          {body}
        </Text>
        <Text variant="caption" color={themed.timestampColor} style={styles.timestamp}>
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
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radii.sm,
  },
  bubbleOther: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    alignSelf: 'flex-end',
  },
});
