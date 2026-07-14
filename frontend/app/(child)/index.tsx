import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, CheckCircle2, Phone, ShieldCheck } from 'lucide-react-native';
import { Api } from '@/src/api';
import LeafletMap, { MapPoint } from '@/src/components/LeafletMap';
import { C, Fonts, S, T } from '@/src/theme';

const DEFAULT_SUV_IMAGE = require('../../assets/images/vip-black-suv-3d.png');

export default function ChildRide() {
  const [track, setTrack] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTrack(await Api.childTrack());
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const sendReady = async () => {
    setReadyBusy(true);
    try {
      const result = await Api.childReady();
      setReadySent(true);
      Alert.alert('Driver notified', result.message);
    } catch (error: any) {
      Alert.alert('Unable to notify', error.message || 'Please try again.');
    } finally {
      setReadyBusy(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  const child = track?.child;
  const driver = track?.driver;
  const vehicle = track?.vehicle;
  const lastLocation = track?.location as (MapPoint & { updated_at?: string }) | undefined;
  const locationAge = lastLocation?.updated_at ? Date.now() - new Date(lastLocation.updated_at).getTime() : Number.POSITIVE_INFINITY;
  const location = !refreshFailed && locationAge <= 20_000 ? lastLocation : undefined;
  const routePoints = (track?.route_points || []) as MapPoint[];
  const latestEvent = track?.events?.[0];
  const markers = location ? [{
    ...location,
    id: driver?.id,
    label: `${driver?.name || 'Assigned driver'} · ${vehicle?.model || 'Assigned SUV'}`,
    type: 'vehicle' as const,
    color: C.gold,
    vehicleModel: vehicle?.model,
    vehicleVariant: vehicle?.fleet_index || 0,
  }] : [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>YOUR ASSIGNED RIDE</Text>
        <Text style={styles.title}>Hi, {child?.name?.split(' ')[0] || 'there'}</Text>
        <Text style={styles.subtitle}>See only your assigned driver and ride status. Location refreshes about every 5 seconds while the route is active.</Text>

        <View style={styles.mapCard}>
          <LeafletMap
            testID="child-live-map"
            markers={markers}
            routes={[{ points: routePoints, color: C.gold, label: 'Route traveled' }]}
            center={location}
            fitRoute={routePoints.length > 1}
            zoom={location ? 15 : 11}
            height={350}
          />
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, !location && styles.offlineDot]} />
            <Text style={[styles.liveText, !location && { color: C.textSecondary }]}>{location ? 'LIVE' : 'WAITING FOR ROUTE'}</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>CURRENT STATUS</Text>
            <Text style={styles.statusTitle}>{latestEvent?.message || (location ? 'Your driver is on the route' : 'Route has not started')}</Text>
            <Text style={styles.statusMeta}>{child?.school || 'Assigned school'} · Pickup {child?.pickup_time || 'scheduled'}</Text>
          </View>
          <ExpoImage source={vehicle?.photo_url || DEFAULT_SUV_IMAGE} style={styles.vehicleImage} contentFit="contain" />
        </View>

        <View style={styles.driverCard}>
          <ShieldCheck size={20} color={C.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{driver?.name || 'Driver assignment pending'}</Text>
            <Text style={styles.driverMeta}>{vehicle ? `${vehicle.color || ''} ${vehicle.make || ''} ${vehicle.model || ''} · ${vehicle.plate || ''}`.trim() : 'Vehicle assignment pending'}</Text>
          </View>
        </View>

        <Pressable style={[styles.readyButton, (readyBusy || readySent) && styles.disabled]} onPress={sendReady} disabled={readyBusy || readySent}>
          {readyBusy ? <ActivityIndicator color={C.bg} /> : readySent ? <CheckCircle2 size={20} color={C.bg} /> : <BellRing size={20} color={C.bg} />}
          <Text style={styles.readyText}>{readySent ? 'DRIVER NOTIFIED' : 'I’M READY FOR PICKUP'}</Text>
        </Pressable>
        <Text style={styles.readyNote}>Use once when you are ready at the assigned pickup. This does not change the route or pickup address.</Text>

        <View style={styles.safetyRow}>
          <Pressable style={styles.safetyButton} onPress={() => driver?.phone && Linking.openURL(`tel:${driver.phone}`)} disabled={!driver?.phone}>
            <Phone size={18} color={C.gold} /><Text style={styles.safetyText}>CALL DRIVER</Text>
          </Pressable>
          <Pressable style={styles.safetyButton} onPress={() => child?.emergency_contact_phone && Linking.openURL(`tel:${child.emergency_contact_phone}`)} disabled={!child?.emergency_contact_phone}>
            <ShieldCheck size={18} color={C.gold} /><Text style={styles.safetyText}>EMERGENCY CONTACT</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>{refreshFailed ? 'Connection interrupted · live location hidden until verified' : 'For an immediate emergency, call 911.'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: 110 },
  eyebrow: { ...T.caption, color: C.gold },
  title: { ...T.h1, fontSize: 34, marginTop: 2 },
  subtitle: { ...T.bodySm, marginTop: 4, marginBottom: 14 },
  mapCard: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: C.borderLight, position: 'relative' },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.borderLight, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
  offlineDot: { backgroundColor: C.textMuted },
  liveText: { color: C.success, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  statusCard: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusLabel: { ...T.caption, color: C.gold, fontSize: 9 },
  statusTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 17, marginTop: 4 },
  statusMeta: { ...T.bodySm, marginTop: 3 },
  vehicleImage: { width: 118, height: 72 },
  driverCard: { marginTop: 10, padding: 14, borderRadius: 13, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  driverName: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  driverMeta: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 11, marginTop: 3 },
  readyButton: { minHeight: 55, marginTop: 14, borderRadius: 12, backgroundColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  readyText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.6 },
  disabled: { opacity: 0.65 },
  readyNote: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 7 },
  safetyRow: { flexDirection: 'row', gap: 8, marginTop: 13 },
  safetyButton: { flex: 1, minHeight: 54, padding: 8, borderRadius: 11, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.bgSecondary, alignItems: 'center', justifyContent: 'center', gap: 5 },
  safetyText: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 9, textAlign: 'center', letterSpacing: 0.4 },
  footer: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, textAlign: 'center', marginTop: 14 },
});
