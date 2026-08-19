import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { colors, spacing, radii, typography } from '../tokens/index';

interface MessageBubbleProps {
  body: string;
  /** Own messages render right-aligned in the brand navy; the other
   *  party's render left-aligned on a neutral surface — standard chat
   *  convention (docs/roadmap/phase-08-messaging.md's UX behavior). */
  isOwn: boolean;
  /** Pre-formatted, locale-aware timestamp string — formatting stays at
   *  the screen layer (same discipline as notifications/index.tsx). */
  timestamp: string;
}

/**
 * A single chat bubble — the phase doc flagged this as "likely a small new
 * primitive given how central and reused this pattern will be within the
 * screen," since plain Card/Text composition can't cleanly express the
 * asymmetric own/other alignment, bubble tail-corner, and two-tone bubble
 * color without duplicating that logic at every call site.
 */
export function MessageBubble({ body, isOwn, timestamp }: MessageBubbleProps): React.JSX.Element {
  return (
    <View
      style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${isOwn ? 'Vous' : 'Autre participant'}, ${timestamp}: ${body}`}
    >
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text variant="body" color={isOwn ? colors.white : colors.gray900}>
          {body}
        </Text>
        <Text
          variant="caption"
          color={isOwn ? colors.navyTextMuted : colors.gray500}
          style={styles.timestamp}
        >
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
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
