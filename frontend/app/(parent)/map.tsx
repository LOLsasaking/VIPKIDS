import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, LocateFixed, MessageCircle, Phone, ShieldCheck } from 'lucide-react-native';
import { Api } from '@/src/api';
import LeafletMap, { MapPoint } from '@/src/components/LeafletMap';
import { C, Fonts, T } from '@/src/theme';

const DEFAULT_SUV_IMAGE = require('../../assets/images/vip-black-suv-3d.png');

export default function ParentMap() {
  const params = useLocalSearchParams<{ childId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [children, setChildren] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<any>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Api.parentChildren()
      .then((kids) => {
        setChildren(kids);
        setSelected(params.childId || kids[0]?.id || null);
      })
      .finally(() => setLoading(false));
  }, [params.childId]);

  const refresh = useCallback(async () => {
    if (!selected) return;
    try {
      setTrack(await Api.parentTrack(selected));
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  }, [selected]);

  useEffect(() => {
    refresh();
    if (!selected) return;
    interval.current = setInterval(refresh, 5000);
    return () => { if (interval.current) clearInterval(interval.current); };
  }, [selected, refresh]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  const lastLocation = track?.location as (MapPoint & { updated_at?: string }) | undefined;
  const locationAge = lastLocation?.updated_at ? Date.now() - new Date(lastLocation.updated_at).getTime() : Number.POSITIVE_INFINITY;
  const location = !refreshFailed && locationAge <= 20_000 ? lastLocation : undefined;
  const child = track?.child || children.find((item) => item.id === selected);
  const latestEvent = track?.events?.[0] || child?.latest_event;
  const plannedRoutePoints = (track?.planned_route_points || []) as MapPoint[];
  const traveledRoutePoints = (track?.route_points || []) as MapPoint[];
  const routePoints = plannedRoutePoints.length > 1 ? plannedRoutePoints : traveledRoutePoints;
  const routeColor = track?.route_color || C.gold;
  const markers = location
    ? [{ ...location, id: child?.driver?.id || child?.id, label: `${child?.driver?.name || 'Dedicated driver'} · ${child?.vehicle?.model || 'Assigned vehicle'}`, type: 'vehicle' as const, color: routeColor, vehicleModel: child?.vehicle?.model, vehicleVariant: child?.vehicle?.fleet_index || 0 }]
    : [];
  const mapHeight = Math.max(390, Math.round(height * 0.58));
  const updatedAt = lastLocation?.updated_at
    ? new Date(lastLocation.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : null;

  const showSafety = () => {
    Alert.alert(
      'VIP Safety',
      'If there is an immediate emergency, call 911. For route questions, contact your dedicated driver or VIP concierge.',
    );
  };

  return (
    <View style={styles.root}>
      <LeafletMap
        testID="live-map"
        markers={markers}
        routes={[{ points: routePoints, color: routeColor, label: 'Your assigned route' }]}
        fitRoute={plannedRoutePoints.length > 1}
        center={location}
        zoom={location ? 15 : 11}
        height={mapHeight}
      />

      <View style={[styles.mapHeader, { top: insets.top + 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.map((item) => (
            <Pressable
              key={item.id}
              testID={`select-child-${item.id}`}
              onPress={() => setSelected(item.id)}
              style={[styles.childPicker, selected === item.id && styles.childPickerActive]}
            >
              <Text style={styles.childPickerText}>{item.name?.split(' ')[0]}</Text>
              <ChevronDown size={15} color={C.gold} />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.mapButton} onPress={refresh} accessibilityLabel="Refresh assigned vehicle location">
          <LocateFixed size={21} color={C.gold} />
        </Pressable>
      </View>

      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.liveRow}>
                <View style={[styles.liveDot, !location && styles.offlineDot]} />
                <Text style={[styles.liveLabel, !location && styles.offlineLabel]}>{location ? 'LIVE ASSIGNED ROUTE' : 'ASSIGNED ROUTE'}</Text>
              </View>
              <Text style={styles.statusTitle}>{location ? 'Route in progress' : 'Not live right now'}</Text>
              <Text style={styles.statusCopy}>
                {location
                  ? latestEvent?.message || 'Your dedicated vehicle location is available.'
                  : 'The vehicle will appear here when your dedicated driver starts the route.'}
              </Text>
            </View>
            <ExpoImage
              source={child?.vehicle?.photo_url || DEFAULT_SUV_IMAGE}
              style={styles.vehiclePhoto}
              contentFit="contain"
              transition={180}
              accessibilityLabel="Black assigned SUV"
            />
          </View>

          {child?.driver && (
            <View style={styles.driverCard}>
              {child.driver.photo_url && <Image source={{ uri: child.driver.photo_url }} style={styles.driverPhoto} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{child.driver.name}</Text>
                <Text style={styles.driverMeta}>Verified dedicated driver</Text>
                {child.vehicle && (
                  <Text style={styles.vehicleMeta}>
                    {[child.vehicle.color, child.vehicle.make, child.vehicle.model].filter(Boolean).join(' ')}
                    {child.vehicle.plate ? ` · ${child.vehicle.plate}` : ''}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <Action icon={MessageCircle} label="Message" onPress={() => router.push('/(parent)/chat')} />
            <Action icon={Phone} label="Call driver" onPress={() => child?.driver?.phone && Linking.openURL(`tel:${child.driver.phone}`)} disabled={!child?.driver?.phone} />
            <Action icon={ShieldCheck} label="Safety" onPress={showSafety} />
          </View>

          {child && (
            <View style={styles.routeSummary}>
              <View style={styles.routeRail}><View style={styles.originDot} /><View style={styles.routeLine} /><View style={styles.destinationSquare} /></View>
              <View style={{ flex: 1, gap: 15 }}>
                <Text style={styles.routePlanLabel}>{plannedRoutePoints.length > 1 ? 'PLANNED ROAD ROUTE · SAME STOPS AS DRIVER' : 'ASSIGNED ROUTE'}</Text>
                <View><Text style={styles.routeLabel}>ASSIGNED PICKUP</Text><Text style={styles.routeText}>{child.home_address || 'Home pickup'}</Text></View>
                <View><Text style={styles.routeLabel}>ASSIGNED SCHOOL</Text><Text style={styles.routeText}>{child.school_address || child.school || 'School'}</Text></View>
              </View>
            </View>
          )}

          <Text style={styles.updated}>{location && updatedAt ? `Verified location updated ${updatedAt}` : refreshFailed ? 'Connection interrupted · live location hidden until verified' : 'Waiting for a verified driver location'}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

function Action({ icon: Icon, label, onPress, disabled = false }: { icon: any; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.action, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.actionIcon}><Icon size={20} color={C.gold} /></View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  mapHeader: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  childPicker: { height: 48, paddingHorizontal: 8, paddingRight: 12, borderRadius: 24, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 7, boxShadow: '0 3px 12px rgba(0,0,0,.28)' },
  childPickerActive: { borderColor: C.gold },
  childPickerText: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 14 },
  mapButton: { marginLeft: 'auto', width: 46, height: 46, borderRadius: 23, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.gold, alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(0,0,0,.28)' },
  sheet: { flex: 1, marginTop: -24, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: C.borderLight, boxShadow: '0 -6px 22px rgba(0,0,0,.35)' },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: C.goldMuted, marginTop: 8 },
  sheetContent: { padding: 18, paddingBottom: 100 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.success },
  offlineDot: { backgroundColor: C.textMuted },
  liveLabel: { color: C.success, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  offlineLabel: { color: C.gold },
  statusTitle: { ...T.h2, fontSize: 25, marginTop: 5 },
  statusCopy: { ...T.bodySm, marginTop: 2 },
  vehiclePhoto: { width: 132, height: 82, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: C.goldMuted, backgroundColor: C.bgSecondary },
  driverCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14, marginTop: 14 },
  driverPhoto: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.bgTertiary, borderWidth: 1, borderColor: C.goldMuted },
  driverName: { fontFamily: Fonts.bodySemiBold, color: C.text, fontSize: 16 },
  driverMeta: { fontFamily: Fonts.body, color: C.textSecondary, fontSize: 12, marginTop: 2 },
  vehicleMeta: { fontFamily: Fonts.bodyMedium, color: C.gold, fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15 },
  action: { alignItems: 'center', minWidth: 76, minHeight: 56 },
  actionDisabled: { opacity: 0.35 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: C.text, marginTop: 5 },
  routeSummary: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, borderRadius: 12 },
  routePlanLabel: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.7 },
  routeRail: { width: 14, alignItems: 'center', paddingVertical: 3 },
  originDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.gold },
  routeLine: { width: 2, flex: 1, backgroundColor: C.borderLight, marginVertical: 3 },
  destinationSquare: { width: 8, height: 8, backgroundColor: C.gold },
  routeLabel: { ...T.caption, fontSize: 9, color: C.goldMuted },
  routeText: { fontFamily: Fonts.bodyMedium, color: C.text, fontSize: 13, marginTop: 2 },
  updated: { textAlign: 'center', fontFamily: Fonts.body, fontSize: 10, color: C.textMuted, marginTop: 10 },
});
