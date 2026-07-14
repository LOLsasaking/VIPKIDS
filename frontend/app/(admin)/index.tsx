import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Users, Car, Activity, LogOut, AlertTriangle, ClipboardList } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import LeafletMap, { MapMarker, MapRoute } from '@/src/components/LeafletMap';
import BrandLogo from '@/src/components/BrandLogo';
import { C, S, T, Fonts } from '@/src/theme';

const FLEET_CARD_ASSETS = [
  require('../../assets/images/fleet-chevrolet-suburban-cutout.png'),
  require('../../assets/images/fleet-cadillac-escalade-cutout.png'),
  require('../../assets/images/fleet-gmc-yukon-cutout.png'),
  require('../../assets/images/fleet-lincoln-navigator-cutout.png'),
  require('../../assets/images/fleet-ford-expedition-cutout.png'),
  require('../../assets/images/fleet-jeep-wagoneer-cutout.png'),
  require('../../assets/images/fleet-toyota-sequoia-cutout.png'),
  require('../../assets/images/fleet-lexus-lx600-cutout.png'),
  require('../../assets/images/fleet-infiniti-qx80-cutout.png'),
  require('../../assets/images/fleet-mercedes-gls580-cutout.png'),
];

function fleetCardSource(vehicle: any, index: number) {
  if (vehicle?.photo_url) return vehicle.photo_url;
  const fleetIndex = Number(vehicle?.fleet_index);
  const safeIndex = Number.isFinite(fleetIndex) ? Math.abs(Math.trunc(fleetIndex)) : index;
  return FLEET_CARD_ASSETS[safeIndex % FLEET_CARD_ASSETS.length];
}

export default function AdminOverview() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [live, setLive] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [kids, setKids] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const poll = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [l, u, k, a] = await Promise.all([Api.adminLiveRoutes(), Api.adminUsers(), Api.adminChildren(), Api.adminComplianceAlerts()]);
      setLive(l); setUsers(u); setKids(k); setAlerts(a);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    poll.current = setInterval(() => Api.adminLiveRoutes().then(setLive).catch(() => {
      setLive((current) => current.map((route) => ({ ...route, location: null })));
    }), 5000);
    return () => clearInterval(poll.current);
  }, [load]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  const markers: MapMarker[] = live.filter((r) => r.location).map((r) => ({
    lat: r.location.lat,
    lng: r.location.lng,
    id: r.driver.id,
    label: `${r.driver.name} · ${r.vehicle?.make || ''} ${r.vehicle?.model || ''} · ${r.children.length} children`,
    color: r.route_color || C.gold,
    type: 'vehicle',
    vehicleNumber: String(live.indexOf(r) + 1).padStart(2, '0'),
    vehicleModel: r.vehicle?.model,
    vehicleVariant: live.indexOf(r),
  }));
  const fleetRoutes: MapRoute[] = live.map((r) => ({
    points: r.planned_route_points?.length > 1 ? r.planned_route_points : (r.route_points || []),
    color: r.route_color || C.gold,
    label: `${r.route_name || 'Assigned route'} · ${r.driver.name}`,
  }));
  const stats = {
    drivers: users.filter((u) => u.role === 'driver').length,
    parents: users.filter((u) => u.role === 'parent').length,
    kids: kids.length,
    active: live.filter((r) => r.location).length,
  };

  const doLogout = async () => { await logout(); router.replace('/login'); };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <BrandLogo compact width={42} />
            <View>
              <Text style={styles.welcome}>Concierge</Text>
              <Text style={styles.brand}>{user?.name}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={doLogout} testID="admin-logout" style={styles.logoutIcon}>
            <LogOut size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="ACTIVE" value={stats.active} icon={<Activity size={14} color={C.gold} />} />
          <StatCard label="DRIVERS" value={stats.drivers} icon={<Car size={14} color={C.gold} />} />
          <StatCard label="FAMILIES" value={stats.parents} icon={<Users size={14} color={C.gold} />} />
          <StatCard label="CHILDREN" value={stats.kids} icon={<Users size={14} color={C.gold} />} />
        </View>

        {alerts.length > 0 && (
          <View style={styles.alertCard} testID="compliance-alerts">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} color={C.danger} />
              <Text style={[T.caption, { color: C.danger }]}>COMPLIANCE ALERTS · {alerts.length}</Text>
            </View>
            {alerts.slice(0, 4).map((a, i) => {
              const color = a.expired ? C.danger : C.gold;
              return (
                <Text key={i} style={[styles.alertText, { color }]}>
                  {a.kind === 'vehicle' ? `${a.item.make} ${a.item.model} ${a.item.plate}` : a.item.name} — {a.field.replace(/_/g, ' ')} {a.expired ? 'EXPIRED' : `${a.days_left} DAYS LEFT`}
                </Text>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionLabel}>LIVE FLEET MAP</Text>
        <LeafletMap markers={markers} routes={fleetRoutes} fitRoute height={370} zoom={10} testID="admin-live-fleet-map" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
          {live.map((r, index) => (
            <View key={`legend-${r.driver.id}`} style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: r.route_color || C.gold }]} />
              <Text style={styles.legendText}>{String(index + 1).padStart(2, '0')} · {r.driver.name.split(' ')[0]}</Text>
            </View>
          ))}
        </ScrollView>

        <Text style={[styles.sectionLabel, { marginTop: S.lg }]}>ACTIVE DRIVERS · ASSIGNED SUVs</Text>
        {live.map((r, index) => (
          <View key={r.driver.id} style={[styles.driverCard, { borderLeftColor: r.route_color || C.gold }]}>
            <View style={styles.driverTopRow}>
              <Image source={{ uri: r.driver.photo_url }} style={styles.avatar} />
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.routeName}>{r.route_name || `ROUTE ${String(index + 1).padStart(2, '0')}`}</Text>
                <Text style={styles.dName}>{r.driver.name}</Text>
                <Text style={styles.dKids}>{r.children.length} child{r.children.length === 1 ? '' : 'ren'} · {r.location ? 'BROADCASTING LIVE' : 'OFF DUTY'}</Text>
              </View>
              <View style={[styles.statusPip, { backgroundColor: r.location ? C.success : C.textMuted }]} />
            </View>
            <View style={styles.vehicleRow}>
              <ExpoImage source={fleetCardSource(r.vehicle, index)} style={styles.vehiclePhoto} contentFit="contain" transition={120} />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleModel}>{r.vehicle?.make} {r.vehicle?.model}</Text>
                <Text style={styles.vehicleMeta}>BLACK · {r.vehicle?.plate} · {r.vehicle?.seats || 7} SEATS</Text>
                <Text style={styles.kidNames} numberOfLines={2}>{r.children.map((child: any) => child.name).join(' · ')}</Text>
              </View>
              <View style={[styles.routeBadge, { borderColor: r.route_color || C.gold }]}>
                <Text style={[styles.routeBadgeText, { color: r.route_color || C.gold }]}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.opsBtn} onPress={() => router.push('/(admin)/operations')} testID="open-operations">
          <ClipboardList size={18} color={C.bg} />
          <Text style={styles.opsBtnText}>OPEN LIVE OPERATIONS DASHBOARD</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: any) {
  return (
    <View style={styles.statCard}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: S.md },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcome: { ...T.bodySm },
  brand: { fontSize: 24, fontFamily: Fonts.display, color: C.gold, letterSpacing: 1 },
  logoutIcon: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderLight },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  statCard: { flex: 1, backgroundColor: C.bgSecondary, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 4 },
  statValue: { color: C.text, fontFamily: Fonts.display, fontSize: 24 },
  statLabel: { ...T.caption, fontSize: 9, color: C.textMuted },
  sectionLabel: { ...T.caption, marginBottom: S.sm, color: C.textSecondary },
  legend: { paddingVertical: 10, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border },
  legendLine: { width: 18, height: 3, borderRadius: 2 },
  legendText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 10 },
  driverCard: { backgroundColor: C.bgSecondary, padding: S.sm, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, marginBottom: 10 },
  driverTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  routeName: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.7 },
  dName: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  dKids: { ...T.bodySm, fontSize: 11 },
  statusPip: { width: 10, height: 10, borderRadius: 5 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  vehiclePhoto: { width: 104, height: 64 },
  vehicleModel: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  vehicleMeta: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  kidNames: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, lineHeight: 13, marginTop: 3 },
  routeBadge: { minWidth: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  routeBadgeText: { fontFamily: Fonts.bodySemiBold, fontSize: 11 },
  alertCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: C.danger, borderWidth: 1, borderRadius: 12, padding: S.sm, marginBottom: S.md, gap: 4 },
  alertText: { color: C.danger, fontFamily: Fonts.body, fontSize: 11 },
  opsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, padding: 14, borderRadius: 10, marginTop: S.lg },
  opsBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.5 },
});
