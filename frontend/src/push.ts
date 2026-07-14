/**
 * Push notifications — registers this device's Expo push token with the backend
 * so the server can send ride updates ("picked up", "on the way", "arrived at
 * school", ...) like Uber. Backend delivery lives in server.py (push_to_user).
 *
 * No-ops safely on web, on simulators, without permission, or before the EAS
 * projectId exists — so the app never crashes if push isn't set up yet.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Api } from './api';

// Show ride alerts even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registered = false;

export async function registerAndSyncPushToken(): Promise<void> {
  if (registered || Platform.OS === 'web' || !Device.isDevice) return;

  try {
    // Android needs an explicit channel; must match channelId sent by the backend.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-updates', {
        name: 'Ride updates',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4AF37',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      (Constants as any).easConfig?.projectId;
    if (!projectId) return; // not linked to an EAS project yet

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) {
      await Api.savePushToken(token, Platform.OS);
      registered = true;
    }
  } catch {
    // Best-effort: a failure here must never block using the app.
  }
}
