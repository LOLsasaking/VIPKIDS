import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Car, Clock, MapPin, Bell, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

export default function ParentHome() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await Api.parentDashboard();
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loader}>
        <ActivityIndicator color={C.gold} />
      </SafeAreaView>
    );
  }

  const children = data?.children || [];
  const announcements = data?.announcements || [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good day</Text>
            <Text style={styles.brand}>VIP KIDS</Text>
          </View>
          <View style={styles.statusBadge} testID="zero-incident-badge">
            <ShieldCheck size={14} color={C.gold} strokeWidth={1.8} />
            <Text style={styles.statusText}>ZERO INCIDENTS</Text>
          </View>
        </View>

        {announcements.length > 0 && (
          <View style={styles.announceCard} testID="announcement-card">
            <View style={styles.announceHeader}>
              <Bell size={14} color={C.gold} strokeWidth={1.8} />
              <Text style={styles.announceLabel}>ANNOUNCEMENT</Text>
            </View>
            <Text style={styles.announceTitle}>{announcements[0].title}</Text>
            <Text style={styles.announceBody}>{announcements[0].body}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>TODAY'S TRIPS</Text>

        {children.map((c: any) => (
          <TouchableOpacity
            key={c.id}
            testID={`child-card-${c.id}`}
            style={styles.tripCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/(parent)/map', params: { childId: c.id } })}
          >
            <View style={styles.tripTop}>
              <Image source={{ uri: c.photo_url }} style={styles.childPhoto} />
              <View style={{ flex: 1, marginLeft: S.md }}>
                <Text style={styles.childName}>{c.name}</Text>
                <Text style={styles.school}>{c.school}</Text>
              </View>
              <View style={styles.eventChip}>
                <Text style={styles.eventChipText}>
                  {c.latest_event?.event_type?.replace(/_/g, ' ').toUpperCase() || 'IDLE'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {c.driver && (
              <View style={styles.driverRow}>
                <Image source={{ uri: c.driver.photo_url }} style={styles.driverPhoto} />
                <View style={{ flex: 1, marginLeft: S.sm }}>
                  <Text style={styles.driverName}>{c.driver.name}</Text>
                  <Text style={styles.driverRole}>Your assigned chauffeur</Text>
                </View>
                <ChevronRight size={20} color={C.textMuted} />
              </View>
            )}

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Car size={14} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.metaText}>{c.vehicle ? `${c.vehicle.make} ${c.vehicle.model}` : '—'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Clock size={14} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.metaText}>{c.pickup_time} · {c.dropoff_time}</Text>
              </View>
              <View style={styles.metaItem}>
                <MapPin size={14} color={C.gold} strokeWidth={1.8} />
                <Text style={styles.metaText}>Live track</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {children.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No children assigned yet. Please contact your concierge.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: S.lg, marginTop: S.sm },
  greeting: { ...T.bodySm, color: C.textMuted },
  brand: { fontSize: 30, fontFamily: Fonts.display, color: C.gold, letterSpacing: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: C.gold, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
  announceCard: { backgroundColor: C.bgSecondary, borderRadius: 14, padding: S.md, borderColor: C.gold, borderWidth: 1, marginBottom: S.lg },
  announceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  announceLabel: { ...T.caption, color: C.gold },
  announceTitle: { ...T.h3, marginBottom: 4, fontSize: 17 },
  announceBody: { ...T.bodySm, color: C.textSecondary, lineHeight: 19 },
  sectionLabel: { ...T.caption, color: C.textSecondary, marginBottom: S.sm },
  tripCard: { backgroundColor: C.bgSecondary, borderRadius: 18, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.md },
  tripTop: { flexDirection: 'row', alignItems: 'center' },
  childPhoto: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.gold },
  childName: { ...T.h3, fontSize: 19 },
  school: { ...T.bodySm },
  eventChip: { backgroundColor: 'rgba(212,175,55,0.15)', borderColor: C.gold, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  eventChipText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 9, letterSpacing: 0.8 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: S.md },
  driverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: S.sm },
  driverPhoto: { width: 40, height: 40, borderRadius: 20 },
  driverName: { ...T.bodyLg, fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  driverRole: { ...T.bodySm, fontSize: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: S.sm, paddingTop: S.sm, borderTopColor: C.border, borderTopWidth: 1, flexWrap: 'wrap', gap: S.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...T.bodySm, fontSize: 11, color: C.textSecondary },
  empty: { padding: S.xl, alignItems: 'center' },
  emptyText: { ...T.bodySm, textAlign: 'center' },
});
