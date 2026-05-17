import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Users, Car, Activity, LogOut, AlertTriangle, ClipboardList } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import LeafletMap, { MapMarker } from '@/src/components/LeafletMap';
import { C, S, T, Fonts } from '@/src/theme';

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
    poll.current = setInterval(() => Api.adminLiveRoutes().then(setLive).catch(() => {}), 5000);
    return () => clearInterval(poll.current);
  }, [load]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  const markers: MapMarker[] = live.filter((r) => r.location).map((r) => ({
    lat: r.location.lat, lng: r.location.lng, label: `${r.driver.name} · ${r.children.length} kids`, color: C.gold,
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
          <View>
            <Text style={styles.welcome}>Concierge</Text>
            <Text style={styles.brand}>{user?.name}</Text>
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
            {alerts.slice(0, 4).map((a, i) => (
              <Text key={i} style={styles.alertText}>
                {a.kind === 'vehicle' ? `${a.item.make} ${a.item.model} ${a.item.plate}` : a.item.name} — {a.field.replace(/_/g, ' ')} {a.expired ? 'EXPIRED' : 'expires'} {a.expires_on}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>LIVE FLEET MAP</Text>
        <LeafletMap markers={markers} height={300} zoom={11} />

        <Text style={[styles.sectionLabel, { marginTop: S.lg }]}>ACTIVE DRIVERS</Text>
        {live.map((r) => (
          <View key={r.driver.id} style={styles.driverCard}>
            <Image source={{ uri: r.driver.photo_url }} style={styles.avatar} />
            <View style={{ flex: 1, marginLeft: S.sm }}>
              <Text style={styles.dName}>{r.driver.name}</Text>
              <Text style={styles.dKids}>{r.children.length} children · {r.location ? 'BROADCASTING' : 'OFF DUTY'}</Text>
            </View>
            <View style={[styles.statusPip, { backgroundColor: r.location ? C.success : C.textMuted }]} />
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
  welcome: { ...T.bodySm },
  brand: { fontSize: 24, fontFamily: Fonts.display, color: C.gold, letterSpacing: 1 },
  logoutIcon: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderLight },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  statCard: { flex: 1, backgroundColor: C.bgSecondary, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 4 },
  statValue: { color: C.text, fontFamily: Fonts.display, fontSize: 24 },
  statLabel: { ...T.caption, fontSize: 9, color: C.textMuted },
  sectionLabel: { ...T.caption, marginBottom: S.sm, color: C.textSecondary },
  driverCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSecondary, padding: S.sm, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  dName: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  dKids: { ...T.bodySm, fontSize: 11 },
  statusPip: { width: 10, height: 10, borderRadius: 5 },
  alertCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: C.danger, borderWidth: 1, borderRadius: 12, padding: S.sm, marginBottom: S.md, gap: 4 },
  alertText: { color: C.danger, fontFamily: Fonts.body, fontSize: 11 },
  opsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.gold, padding: 14, borderRadius: 10, marginTop: S.lg },
  opsBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.5 },
});
