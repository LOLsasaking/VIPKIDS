import * as Location from 'expo-location';
import { orderedRouteAddresses, RoutePhase } from '@/src/googleMaps';
import { supabase, supabaseConfigured } from '@/src/supabase';

export type PlannedRoutePoint = { lat: number; lng: number };
const ROUTING_BASE_URL = (process.env.EXPO_PUBLIC_ROUTING_BASE_URL || '').replace(/\/$/, '');
const ROUTING_ENDPOINT = (process.env.EXPO_PUBLIC_ROUTING_ENDPOINT || '').replace(/\/$/, '');

type AssignedChild = {
  home_address?: string;
  school_address?: string;
};

function sampleRoute(points: PlannedRoutePoint[], maximum = 900) {
  if (points.length <= maximum) return points;
  const stride = Math.ceil(points.length / maximum);
  const sampled = points.filter((_, index) => index % stride === 0);
  const last = points.at(-1);
  if (last && sampled.at(-1) !== last) sampled.push(last);
  return sampled;
}

export async function buildPlannedRoadRoute(
  children: AssignedChild[],
  phase: RoutePhase,
  start?: PlannedRoutePoint,
) {
  const addresses = orderedRouteAddresses(children, phase);
  const stops: PlannedRoutePoint[] = [];

  for (const address of addresses) {
    try {
      const results = await Location.geocodeAsync(address);
      const result = results[0];
      if (result) stops.push({ lat: result.latitude, lng: result.longitude });
    } catch {
      // Keep Google Maps navigation available even if the device geocoder is unavailable.
    }
  }

  const coordinates = start ? [start, ...stops] : stops;
  if (coordinates.length < 2) return { addresses, points: [] as PlannedRoutePoint[] };

  if (ROUTING_ENDPOINT && ROUTING_ENDPOINT.startsWith('https://')) {
    try {
      const supabaseSession = supabaseConfigured && supabase ? await supabase.auth.getSession() : null;
      const accessToken = supabaseSession?.data.session?.access_token;
      const response = await fetch(ROUTING_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ coordinates }),
      });
      if (response.ok) {
        const data = await response.json();
        const points = Array.isArray(data?.points)
          ? data.points.filter((point: PlannedRoutePoint) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
          : [];
        if (points.length >= 2) return { addresses, points: sampleRoute(points) };
      }
    } catch {
      // Google Maps navigation remains available if route preview is unavailable.
    }
  }

  // A contracted or self-hosted OSRM-compatible endpoint must be supplied for
  // road geometry. Without one, preserve the assigned stop order without
  // sending family coordinates to an unapproved public routing service.
  if (!ROUTING_BASE_URL || (!__DEV__ && !ROUTING_BASE_URL.startsWith('https://'))) {
    return { addresses, points: coordinates };
  }

  const encodedCoordinates = coordinates.map((point) => `${point.lng},${point.lat}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `${ROUTING_BASE_URL}/route/v1/driving/${encodedCoordinates}?overview=simplified&geometries=geojson&steps=false`,
      { signal: controller.signal },
    );
    if (!response.ok) return { addresses, points: [] as PlannedRoutePoint[] };
    const data = await response.json();
    const rawCoordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(rawCoordinates)) return { addresses, points: [] as PlannedRoutePoint[] };
    const points = rawCoordinates
      .filter((coordinate: unknown) => Array.isArray(coordinate) && coordinate.length >= 2)
      .map(([lng, lat]: number[]) => ({ lat, lng }))
      .filter((point: PlannedRoutePoint) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    return { addresses, points: sampleRoute(points) };
  } catch {
    return { addresses, points: [] as PlannedRoutePoint[] };
  } finally {
    clearTimeout(timeout);
  }
}
