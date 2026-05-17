import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Play, Square, AlertTriangle, Check, X, Phone } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import { C, S, T, Fonts } from '@/src/theme';

const EVENT_OPTIONS = [
  { key: 'on_the_way', label: 'ON THE WAY' },
  { key: 'picked_up', label: 'PICKED UP' },
  { key: 'arrived_school', label: 'ARRIVED AT SCHOOL' },
  { key: 'leaving_school', label: 'LEAVING SCHOOL' },
  { key: 'arriving_home', label: 'ARRIVING HOME' },
  { key: 'no_show', label: 'NO SHOW' },
  { key: 'alt_dropoff', label: 'ALT DROPOFF' },
];

export default function DriverHome() {
  const { user, refresh } = useAuth();
  const [kids, setKids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onDuty, setOnDuty] = useState<boolean>(!!(user as any)?.on_duty);
  const locInterval = useRef<any>(null);

  const load = useCallback(async () => {
    try { setKids(await Api.driverToday()); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startRoute = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS !== 'web') {
          Alert.alert('Permission required', 'Enable location to broadcast GPS during your route.');
          return;
        }
      }
      await Api.driverStart();
      setOnDuty(true);
      // Broadcast location
      const tick = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await Api.driverLocation(loc.coords.latitude, loc.coords.longitude);
        } catch {
          // fallback for web/no-permission: simulate near Hollywood, FL with slight jitter
          const jitter = () => (Math.random() - 0.5) * 0.01;
          await Api.driverLocation(26.0112 + jitter(), -80.1495 + jitter());
        }
      };
      await tick();
      locInterval.current = setInterval(tick, 5000);
      await refresh();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const endRoute = async () => {
    try {
      await Api.driverEnd();
      setOnDuty(false);
      if (locInterval.current) clearInterval(locInterval.current);
      await refresh();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  useEffect(() => () => { if (locInterval.current) clearInterval(locInterval.current); }, []);

  const checkin = async (childId: string, evType: string, extra?: any) => {
    try { await Api.driverCheckin({ child_id: childId, event_type: evType, ...(extra || {}) }); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const altDropoff = (childId: string) => {
    if (Platform.OS === 'ios') {
      Alert.prompt('Alternate Dropoff', 'Enter the alternate address:', (txt) => {
        if (txt) checkin(childId, 'alt_dropoff', { address: txt, message: `Dropped at: ${txt}` });
      });
    } else {
      // Android / web - simple confirm and use placeholder
      Alert.alert('Alternate Dropoff', 'Confirm dropoff at a different address?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => checkin(childId, 'alt_dropoff', { message: 'Dropped at alternate address (see chat for details)' }) },
      ]);
    }
  };

  const sendDelay = (childId: string) => {
    Alert.alert('Traffic Delay', 'Send a delay notification to this parent?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => checkin(childId, 'delay') },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }} refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Welcome,</Text>
            <Text style={styles.name}>{user?.name?.split(' ')[0]}</Text>
          </View>
          <View style={[styles.dutyBadge, onDuty && styles.dutyOn]}>
            <View style={[styles.dot, { backgroundColor: onDuty ? C.success : C.textMuted }]} />
            <Text style={[styles.dutyText, onDuty && { color: C.success }]}>
              {onDuty ? 'ON DUTY' : 'OFF DUTY'}
            </Text>
          </View>
        </View>

        {!onDuty ? (
          <TouchableOpacity style={styles.startBtn} onPress={startRoute} testID="start-route-btn">
            <Play size={18} color={C.bg} />
            <Text style={styles.startBtnText}>START ROUTE · BROADCAST GPS</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.endBtn} onPress={endRoute} testID="end-route-btn">
            <Square size={16} color={C.danger} />
            <Text style={styles.endBtnText}>END ROUTE</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>TODAY'S ROUTE · {kids.length} CHILDREN</Text>

        {kids.map((k, i) => (
          <View key={k.id} style={styles.kidCard} testID={`kid-card-${k.id}`}>
            <View style={styles.kidTop}>
              <View style={styles.orderBadge}>
                <Text style={styles.orderText}>{i + 1}</Text>
              </View>
              <Image source={{ uri: k.photo_url }} style={styles.kidPhoto} />
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.kidName}>{k.name}</Text>
                <Text style={styles.kidSchool}>{k.school}</Text>
                <Text style={styles.kidTime}>{k.pickup_time} → {k.dropoff_time}</Text>
              </View>
            </View>

            <View style={styles.address}>
              <Text style={styles.addressLabel}>FROM</Text>
              <Text style={styles.addressText}>{k.home_address}</Text>
              <Text style={[styles.addressLabel, { marginTop: 6 }]}>TO</Text>
              <Text style={styles.addressText}>{k.school_address}</Text>
            </View>

            {k.parent && (
              <View style={styles.parentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.parentLabel}>PARENT</Text>
                  <Text style={styles.parentName}>{k.parent.name}</Text>
                </View>
                <Text style={styles.parentPhone}>{k.parent.phone}</Text>
              </View>
            )}

            {k.latest_event && (
              <View style={styles.lastEv}>
                <Text style={styles.lastEvText}>
                  LAST: {k.latest_event.event_type.replace(/_/g, ' ').toUpperCase()} · {new Date(k.latest_event.created_at).toLocaleTimeString()}
                </Text>
              </View>
            )}

            <View style={styles.actionsGrid}>
              {EVENT_OPTIONS.map((e) => (
                <TouchableOpacity
                  key={e.key}
                  testID={`checkin-${k.id}-${e.key}`}
                  style={styles.actionBtn}
                  onPress={() => e.key === 'alt_dropoff' ? altDropoff(k.id) : checkin(k.id, e.key)}
                >
                  <Check size={12} color={C.gold} />
                  <Text style={styles.actionText}>{e.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                testID={`delay-${k.id}`}
                style={[styles.actionBtn, { borderColor: C.danger }]}
                onPress={() => sendDelay(k.id)}
              >
                <AlertTriangle size={12} color={C.danger} />
                <Text style={[styles.actionText, { color: C.danger }]}>TRAFFIC DELAY</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {kids.length === 0 && (
          <Text style={[T.bodySm, { textAlign: 'center', padding: S.xl }]}>
            No children assigned yet.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: S.md },
  welcome: { ...T.bodySm },
  name: { ...T.h2, fontSize: 26 },
  dutyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  dutyOn: { borderColor: C.success },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dutyText: { color: C.textMuted, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.gold, padding: 16, borderRadius: 12, marginBottom: S.md },
  startBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 13, letterSpacing: 1.5 },
  endBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, borderRadius: 12, borderColor: C.danger, borderWidth: 1, marginBottom: S.md },
  endBtnText: { color: C.danger, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.5 },
  sectionLabel: { ...T.caption, marginBottom: S.sm, color: C.textSecondary },
  kidCard: { backgroundColor: C.bgSecondary, borderRadius: 16, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.md },
  kidTop: { flexDirection: 'row', alignItems: 'center' },
  orderBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  orderText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  kidPhoto: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: C.gold },
  kidName: { ...T.h3, fontSize: 17 },
  kidSchool: { ...T.bodySm, fontSize: 12 },
  kidTime: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  address: { marginTop: S.sm, padding: 10, backgroundColor: C.bg, borderRadius: 8 },
  addressLabel: { ...T.caption, fontSize: 9, color: C.textMuted },
  addressText: { ...T.bodySm, fontSize: 12, color: C.text },
  parentRow: { flexDirection: 'row', alignItems: 'center', marginTop: S.sm, paddingTop: S.sm, borderTopColor: C.border, borderTopWidth: 1 },
  parentLabel: { ...T.caption, fontSize: 9 },
  parentName: { ...T.body, fontSize: 13, fontFamily: Fonts.bodyMedium },
  parentPhone: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  lastEv: { marginTop: S.sm, backgroundColor: 'rgba(212,175,55,0.1)', padding: 8, borderRadius: 6 },
  lastEvText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.5 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.gold },
  actionText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.5 },
});
