import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/src/auth';
import { destinationForNotification } from '@/src/notificationRoutes';

export default function NotificationNavigation() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const identifier = response.notification.request.identifier;
      if (handled.current === identifier) return;
      handled.current = identifier;
      const data = response.notification.request.content.data;
      router.push(destinationForNotification(user.role, data?.type));
    };

    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [loading, router, user]);

  return null;
}
