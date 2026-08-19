import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useToast } from '@vaya/design-system';
import { trackEvent } from '../analytics/analytics';
import { resolveNotificationDeepLink } from './deepLink';

function readNotificationType(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'type' in data) {
    const type = (data as { type?: unknown }).type;
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

/**
 * Wires the two event streams expo-notifications exposes to what this
 * phase actually needs:
 *  - foreground delivery -> our own Toast (Phase 2), since
 *    notificationClient.ts's handler suppresses the native banner while
 *    the app is in the foreground.
 *  - a tap (foreground, background, or from killed) -> the minimal 3-type
 *    deep-link map in deepLink.ts.
 *
 * Mount once, near the app root, inside ToastProvider (see
 * app/_layout.tsx's NotificationBridge) — listening doesn't itself request
 * OS permission, so this is safe to run unconditionally from app start,
 * unlike the permission *request* (registerForPushNotifications.ts),
 * which is intentionally contextual.
 */
export function useNotificationSetup(): void {
  const toast = useToast();

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const type = readNotificationType(notification.request.content.data);
      const message =
        notification.request.content.body ?? notification.request.content.title ?? 'Nouvelle notification';
      toast({ message, tone: 'info' });
      trackEvent('notification_delivered', { type: type ?? 'unknown' });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const type = readNotificationType(data);
      trackEvent('notification_tapped', { type: type ?? 'unknown' });
      const destination = type
        ? resolveNotificationDeepLink(type, data as Record<string, unknown>)
        : null;
      if (destination) {
        router.push(destination as Parameters<typeof router.push>[0]);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [toast]);
}
