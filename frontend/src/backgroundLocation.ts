import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Api } from '@/src/api';

export const DRIVER_LOCATION_TASK = 'vipkids-driver-location';

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const latest = data.locations[data.locations.length - 1];
    try {
      await Api.driverLocation(latest.coords.latitude, latest.coords.longitude);
    } catch {
      // Keep the last real location stale instead of ever inventing a coordinate.
    }
  });
}

export async function requestRouteLocationPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') throw new Error('Foreground location permission is required to start a route.');
  if (Platform.OS === 'web') return;
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') throw new Error('Allow background location so tracking continues while Google Maps is open.');
}

export async function startRouteLocationUpdates() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 5000,
    distanceInterval: 5,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'VIP Kids route tracking active',
      notificationBody: 'Location is shared with assigned families and operations.',
      notificationColor: '#D4AF37',
    },
  });
}

export async function stopRouteLocationUpdates() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}
