import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Redirect } from 'expo-router';
import { Text, Icon, EmptyState, SkeletonBlock, useAppTheme, spacing, radii } from '@vaya/design-system';
import { useAppSelector } from '../../src/state/store';
import {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  type AppNotification,
} from '../../src/state/api';
import {
  notificationTypeMeta,
  notificationTone,
  notificationDescription,
  type NotificationTone,
} from '../../src/services/notifications/notificationCopy';
import { resolveNotificationDeepLink } from '../../src/services/notifications/deepLink';
import { trackEvent } from '../../src/services/analytics/analytics';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Aujourd'hui, ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  if (date.toDateString() === yesterday.toDateString()) return `Hier, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/**
 * A tone maps to a real AppPalette role, not a hand-picked hex — this
 * screen has no colors of its own, only VAYA's existing brand tokens
 * (accent/error/info + the ink family for the neutral default), matching
 * every other Stitch-rebuilt screen's discipline in this codebase.
 */
function toneColors(
  tone: NotificationTone,
  theme: ReturnType<typeof useAppTheme>['colors'],
): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: theme.accentGlow, fg: theme.accentStrong };
    case 'error':
      return { bg: theme.errorMuted, fg: theme.error };
    case 'info':
      return { bg: theme.surfaceMuted, fg: theme.ink };
    case 'neutral':
    default:
      return { bg: theme.surfaceMuted, fg: theme.inkFaint };
  }
}

/**
 * Notifications inbox (docs/roadmap/phase-07-notifications.md), rebuilt onto
 * useAppTheme() — the original was the one screen in this flow still on
 * flat static `colors` next to every Stitch-matched screen around it. Real
 * content throughout: each row's preview line is derived from the actual
 * notification payload (notificationCopy.ts's notificationDescription),
 * never a placeholder, and booking_requested rows carry a "Répondre"
 * affordance that (via deepLink.ts) opens the exact ride's request sheet —
 * not just a generic "go check your trips" tap-through.
 */
export default function NotificationsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data: notifications, isLoading } = useListNotificationsQuery(undefined, {
    skip: !accessToken,
  });
  const [markRead] = useMarkNotificationReadMutation();

  // Defensive: only reachable today via the explore/trips bell (both already
  // gate this behind accessToken), but a deep link or a stale push tap could
  // land here directly for a guest — identity-scoped end to end.
  if (!accessToken) {
    return <Redirect href="/sign-in" />;
  }

  function handlePress(notification: AppNotification): void {
    if (!notification.readAt) {
      void markRead(notification.id);
    }
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type, notification.payload);
    if (destination) {
      router.push(destination as Parameters<typeof router.push>[0]);
    }
  }

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: theme.outlineVariant }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore'))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text variant="headlineDisplay" color={theme.ink}>
            Notifications
          </Text>
          {unreadCount > 0 ? (
            <Text variant="bodySmall" color={theme.inkMuted}>
              {unreadCount} non {unreadCount > 1 ? 'lues' : 'lue'}
            </Text>
          ) : null}
        </View>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.loadingList}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={80} radius="xl" />
          ))}
        </View>
      ) : !notifications || notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Icon name="notifications-outline" size="lg" color={theme.inkFaint} />}
            title="Aucune notification"
            description="Les demandes de réservation et leurs réponses apparaîtront ici."
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {notifications.map((notification) => {
            const meta = notificationTypeMeta(notification.type);
            const tone = toneColors(notificationTone(notification.type), theme);
            const isUnread = !notification.readAt;
            const isActionable = notification.type === 'booking_requested';
            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.row,
                  { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                  isUnread && { borderColor: theme.accent },
                ]}
                activeOpacity={0.7}
                onPress={() => handlePress(notification)}
                accessibilityRole="button"
                accessibilityLabel={`${meta.title}${isUnread ? ', non lu' : ''}`}
              >
                <View style={styles.rowTop}>
                  <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
                    <Icon name={meta.icon} size="sm" color={tone.fg} />
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.titleRow}>
                      <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.titleText}>
                        {meta.title}
                      </Text>
                      {isUnread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
                    </View>
                    <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={2}>
                      {notificationDescription(notification.type, notification.payload)}
                    </Text>
                    <Text variant="caption" color={theme.inkFaint} style={styles.timestamp}>
                      {formatWhen(notification.createdAt)}
                    </Text>
                  </View>
                </View>

                {isActionable ? (
                  <View style={[styles.actionRow, { borderTopColor: theme.outlineVariant }]}>
                    <Text variant="bodySmall" color={theme.accent} style={styles.actionLabel}>
                      Répondre
                    </Text>
                    <Icon name="chevron-forward" size="xs" color={theme.accent} />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    alignItems: 'center',
    gap: 1,
  },
  loadingList: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  row: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timestamp: {
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontWeight: '600',
  },
});
