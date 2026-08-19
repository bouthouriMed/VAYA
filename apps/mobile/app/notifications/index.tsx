import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import {
  Text,
  Row,
  Icon,
  Badge,
  EmptyState,
  SkeletonBlock,
  colors,
  spacing,
  radii,
} from '@vaya/design-system';
import {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  type AppNotification,
} from '../../src/state/api';
import { notificationTypeMeta } from '../../src/services/notifications/notificationCopy';
import { resolveNotificationDeepLink } from '../../src/services/notifications/deepLink';
import { trackEvent } from '../../src/services/analytics/analytics';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Aujourd'hui, ${time}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/**
 * Minimal notifications inbox (docs/roadmap/phase-07-notifications.md):
 * list, unread indicator, mark-as-read, tap-through. The list-item pattern
 * is a small composition of Row/Text/Icon/Badge — no new design-system
 * primitive, per the phase doc's design-system-work note.
 */
export default function NotificationsScreen(): React.JSX.Element {
  const { data: notifications, isLoading } = useListNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();

  function handlePress(notification: AppNotification): void {
    if (!notification.readAt) {
      void markRead(notification.id);
    }
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type);
    if (destination) {
      router.push(destination as Parameters<typeof router.push>[0]);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingList}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={72} radius="xl" />
          ))}
        </View>
      </View>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={<Icon name="notifications-outline" size="lg" color={colors.gray400} />}
          title="Aucune notification"
          description="Les demandes de réservation et leurs réponses apparaîtront ici."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {notifications.map((notification) => {
          const meta = notificationTypeMeta(notification.type);
          const isUnread = !notification.readAt;
          return (
            <TouchableOpacity
              key={notification.id}
              style={[styles.row, isUnread && styles.rowUnread]}
              activeOpacity={0.7}
              onPress={() => handlePress(notification)}
              accessibilityRole="button"
              accessibilityLabel={`${meta.title}${isUnread ? ', non lu' : ''}`}
            >
              <Row gap="sm" align="center">
                <View style={styles.iconWrap}>
                  <Icon name={meta.icon} size="sm" color={colors.gray700} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="label">{meta.title}</Text>
                  <Text variant="bodySmall" color={colors.gray600}>
                    {formatWhen(notification.createdAt)}
                  </Text>
                </View>
                {isUnread ? <Badge label="Nouveau" variant="info" /> : null}
              </Row>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  loadingList: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  rowUnread: {
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});
