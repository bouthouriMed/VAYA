import React from 'react';
import { TouchableOpacity, View, Text as RNText, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii } from '../tokens/index';
import { elevation } from '../tokens/elevation';
import type { AppPalette } from '../theme/palette';

interface NotificationBellProps {
  theme: AppPalette;
  /** Real unread count, not just a has-unread boolean — a number reads as
   *  more informative/premium than a bare dot, matching the tab bar's own
   *  `tabBarBadge` convention (messages tab) rather than introducing a
   *  second, weaker unread signal. */
  unreadCount?: number;
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * The one notification-bell button every primary screen's header uses —
 * previously explore.tsx and trips.tsx each hand-rolled their own (one with
 * a border+shadow, one flat with neither; one 20px icon in a 40px circle
 * via raw Ionicons, one via the `Icon` wrapper's "sm" token; one a dot
 * badge, one no badge at all when unread), and messages.tsx/publish.tsx had
 * no bell at all — the exact "position and existence not aligned" gap this
 * consolidates. Every caller gets the same size, elevation, and badge.
 */
export function NotificationBell({
  theme,
  unreadCount = 0,
  onPress,
  accessibilityLabel,
}: NotificationBellProps): React.JSX.Element {
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.button,
        elevation?.sm,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant, shadowColor: theme.ink },
      ]}
    >
      <Ionicons
        name={hasUnread ? 'notifications' : 'notifications-outline'}
        size={20}
        color={theme.ink}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {hasUnread ? (
        <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
          <RNText style={[styles.badgeText, { color: theme.onAccent }]} numberOfLines={1}>
            {badgeLabel}
          </RNText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radii.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
  },
});
