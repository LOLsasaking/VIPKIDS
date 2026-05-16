import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MapPin, Clock, Car } from 'lucide-react-native';
import { Api } from '@/src/api';
import LeafletMap from '@/src/components/LeafletMap';
import { C, S, T, Fonts } from '@/src/theme';

export default function ParentMap() {
  const params = useLocalSearchParams<{ childId?: string }>();
  const [children, setChildren] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<any>(null);
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
    try { const t = await Api.parentTrack(selected); setTrack(t); } catch {}
  }, [selected]);

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
  const markers = loc ? [{ lat: loc.lat, lng: loc.lng, label: `${child?.driver?.name || 'Driver'} · ${child?.vehicle?.make || ''}`, color: C.gold }] : [];

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
