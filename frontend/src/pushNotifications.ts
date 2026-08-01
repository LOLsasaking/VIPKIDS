import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const VIPKIDS_PUSH_CHANNEL_ID = 'vipkids-safety';
export const PUSH_REGISTRATION_KEY = 'vipkids_push_registration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.expoConfig?.extra?.projectId
  );
}

export async function registerForPushNotificationsAsync(): Promise<{ token: string; platform: 'android' | 'ios' | 'web' | 'unknown' } | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(VIPKIDS_PUSH_CHANNEL_ID, {
      name: 'VIP Kids safety alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4AF37',
      // Hide child/route details until the device is unlocked.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: false,
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (existing.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getProjectId();
  const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'unknown';
  return { token: tokenResult.data, platform };
}
