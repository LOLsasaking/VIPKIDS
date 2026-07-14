import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MapPin, Clock, Car } from 'lucide-react-native';
import { Api } from '@/src/api';
import LeafletMap from '@/src/components/LeafletMap';
import { C, S, T, Fonts } from '@/src/theme';

type LatLng = { lat: number; lng: number };

// Stable, distinct route color per driver (hashed onto a fixed palette).
const LINE_PALETTE = ['#D4AF37', '#4F9DFF', '#FF6B6B', '#22C55E', '#A855F7', '#F97316', '#14B8A6', '#EC4899'];
function driverColor(id?: string): string {
  if (!id) return LINE_PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return LINE_PALETTE[h % LINE_PALETTE.length];
}

// Free, no-key services: Nominatim geocodes the address, OSRM returns a
// road-following driving route. Geocodes are cached per address.
const geocodeCache: Record<string, LatLng | null> = {};

async function geocode(address: string): Promise<LatLng | null> {
  if (address in geocodeCache) return geocodeCache[address];
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { Accept: 'application/json' } },
    );
    const j = await r.json();
    const hit = j?.[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
    geocodeCache[address] = hit;
    return hit;
  } catch { return null; }
}

async function roadRoute(from: LatLng, to: LatLng): Promise<LatLng[] | null> {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
    );
    const j = await r.json();
    const coords: number[][] | undefined = j?.routes?.[0]?.geometry?.coordinates;
    return coords ? coords.map((c) => ({ lat: c[1], lng: c[0] })) : null;
  } catch { return null; }
}

export default function ParentMap() {
  const params = useLocalSearchParams<{ childId?: string }>();
  const [children, setChildren] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<any>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [dest, setDest] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const interval = useRef<any>(null);

  useEffect(() => {
    Api.parentChildren().then((kids) => {
      setChildren(kids);
      setSelected((params.childId as string) || kids[0]?.id || null);
      setLoading(false);
    });
  }, [params.childId]);

  const refresh = useCallback(async () => {
    if (!selected) return;
    try {
      const t = await Api.parentTrack(selected);
      setTrack(t);
      const l = t?.location;
      const ch = t?.child;
      if (!l || !ch) { setPath([]); setDest(null); return; }
      // demo heuristic: headed home once they've left school, otherwise to school
      const returning = (t.events || []).some((e: any) =>
        ['leaving_school', 'arriving_home'].includes(e.event_type));
      const destAddr = returning ? ch.home_address : ch.school_address;
      const d = destAddr ? await geocode(destAddr) : null;
      if (!d) { setPath([]); setDest(null); return; }
      setDest({ ...d, name: returning ? 'Home' : (ch.school || 'School') });
      const route = await roadRoute({ lat: l.lat, lng: l.lng }, d);
      setPath(route && route.length > 1 ? route : []);
    } catch {}
  }, [selected]);

  // Reset when switching child.
  useEffect(() => { setPath([]); setDest(null); }, [selected]);

  useEffect(() => {
    if (!selected) return;
    refresh();
    interval.current = setInterval(refresh, 4000);
    return () => clearInterval(interval.current);
  }, [selected, refresh]);

  if (loading) {
    return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;
  }

  const loc = track?.location;
  const child = track?.child;
  const lineColor = driverColor(child?.driver?.id);
  const markers = loc ? [
    { lat: loc.lat, lng: loc.lng, label: `${child?.driver?.name || 'Driver'} · ${child?.vehicle?.make || ''}`, color: lineColor, car: true },
    ...(dest ? [{ lat: dest.lat, lng: dest.lng, label: dest.name, color: lineColor }] : []),
  ] : [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
        <Text style={styles.title}>Live Tracking</Text>
        <Text style={styles.subtitle}>Updates every 4 seconds</Text>

        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingVertical: S.sm }}>
            {children.map((c) => (
              <View
                key={c.id}
                style={[styles.chip, selected === c.id && styles.chipActive]}
                onTouchEnd={() => setSelected(c.id)}
                testID={`select-child-${c.id}`}
              >
                <Text style={[styles.chipText, selected === c.id && styles.chipTextActive]}>{c.name}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={{ marginTop: S.md }} testID="live-map">
          <LeafletMap
            markers={markers}
            path={path}
            lineColor={lineColor}
            center={loc ? { lat: loc.lat, lng: loc.lng } : undefined}
            zoom={14}
            height={360}
          />
        </View>

        <View style={styles.infoCard}>
          {loc ? (
            <>
              <View style={styles.row}>
                <Car size={16} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.infoText}>
                  {child?.vehicle ? `${child.vehicle.make} ${child.vehicle.model} · ${child.vehicle.plate}` : 'Vehicle info'}
                </Text>
              </View>
              <View style={styles.row}>
                <MapPin size={16} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.infoText}>
                  {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                </Text>
              </View>
              <View style={styles.row}>
                <Clock size={16} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.infoText}>
                  Last update: {new Date(loc.updated_at).toLocaleTimeString()}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.idle}>
              Driver is not on duty. Live tracking will appear once the route begins.
            </Text>
          )}
        </View>

        <Text style={[styles.title, { fontSize: 18, marginTop: S.lg, marginBottom: S.sm }]}>Recent Events</Text>
        {(track?.events || []).slice(0, 8).map((e: any) => (
          <View key={e.id} style={styles.eventRow}>
            <View style={styles.eventDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{e.event_type.replace(/_/g, ' ').toUpperCase()}</Text>
              <Text style={styles.eventTime}>{new Date(e.created_at).toLocaleString()}</Text>
              {e.message && <Text style={styles.eventMsg}>{e.message}</Text>}
            </View>
          </View>
        ))}
        {(track?.events || []).length === 0 && (
          <Text style={[T.bodySm, { textAlign: 'center', marginTop: S.md }]}>
            No events recorded yet today.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  title: { ...T.h2, fontSize: 24 },
  subtitle: { ...T.bodySm, marginTop: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.15)' },
  chipText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  chipTextActive: { color: C.gold },
  infoCard: { backgroundColor: C.bgSecondary, borderRadius: 14, padding: S.md, borderWidth: 1, borderColor: C.border, marginTop: S.md, gap: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  infoText: { ...T.body, fontSize: 14 },
  idle: { ...T.bodySm, textAlign: 'center', padding: S.sm },
  eventRow: { flexDirection: 'row', gap: S.sm, paddingVertical: S.sm, borderBottomColor: C.border, borderBottomWidth: 1 },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold, marginTop: 6 },
  eventTitle: { ...T.body, fontSize: 13, fontFamily: Fonts.bodySemiBold, letterSpacing: 0.5 },
  eventTime: { ...T.bodySm, fontSize: 11 },
  eventMsg: { ...T.bodySm, fontStyle: 'italic', marginTop: 2 },
});
