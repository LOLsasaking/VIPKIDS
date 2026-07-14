/**
 * Admin Operations dashboard — today's attendance + events history.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock, XCircle, History } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

export default function Operations() {
  const router = useRouter();
  const [ops, setOps] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const poll = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([Api.adminOpsToday(), Api.adminActivity()]);
      setOps(o); setHistory(h);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    poll.current = setInterval(load, 8000);
    return () => clearInterval(poll.current);
  }, [load]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  const counts = ops?.counts || { picked_up: 0, pending: 0, absent: 0 };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="ops-back">
            <ArrowLeft size={18} color={C.gold} />
          </TouchableOpacity>
          <Text style={[T.h2, { fontSize: 24, flex: 1, marginLeft: S.sm }]}>Live Operations</Text>
        </View>
        <Text style={[T.bodySm, { marginBottom: S.md }]}>Date: {ops?.date}</Text>

        <View style={styles.statsRow}>
          <Stat color={C.success} icon={<CheckCircle2 size={16} color={C.success} />} label="PICKED UP" value={counts.picked_up} />
          <Stat color={C.gold} icon={<Clock size={16} color={C.gold} />} label="PENDING" value={counts.pending} />
          <Stat color={C.danger} icon={<XCircle size={16} color={C.danger} />} label="ABSENT" value={counts.absent} />
        </View>

        <Text style={styles.sectionLabel}>CHILDREN STATUS</Text>
        {(ops?.children || []).map((row: any) => {
          const color = row.status === 'picked_up' ? C.success : row.status === 'absent' ? C.danger : C.gold;
          return (
            <View key={row.child.id} style={styles.kidRow} testID={`ops-child-${row.child.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kidName}>{row.child.name}</Text>
                <Text style={styles.kidSub}>
                  {row.driver?.name || 'No driver'} · {row.child.school}
                </Text>
                {row.latest_event && (
                  <Text style={styles.kidEv}>
                    {row.latest_event.event_type.replace(/_/g, ' ').toUpperCase()} · {new Date(row.latest_event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <View style={[styles.pip, { backgroundColor: color, borderColor: color }]}>
                <Text style={[styles.pipText, { color: C.bg }]}>
                  {row.status === 'picked_up' ? 'IN CAR' : row.status === 'absent' ? 'ABSENT' : 'PENDING'}
                </Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowHistory((v) => !v)} testID="ops-toggle-history">
          <History size={14} color={C.gold} />
          <Text style={styles.toggleText}>{showHistory ? 'HIDE' : 'VIEW'} ACTIVITY TIMELINE ({history.length})</Text>
        </TouchableOpacity>

        {showHistory && history.map((e: any) => {
          const color = e.severity === 'critical' ? C.danger : e.severity === 'warning' ? C.gold : e.severity === 'success' ? C.success : C.info;
          return (
            <View key={e.id} style={[styles.histRow, e.severity === 'critical' && styles.histCritical]} testID={`activity-${e.id}`}>
              <View style={[styles.histDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.histType, { color }]}>{e.title || e.type?.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.histDetail}>{[e.child_name, e.driver_name].filter(Boolean).join(' · ') || 'VIP Operations'}</Text>
                <Text style={styles.histTime}>{new Date(e.created_at).toLocaleString()}</Text>
                {e.detail ? <Text style={styles.histMsg}>{e.detail}</Text> : null}
                {e.lat && e.lng ? <Text style={[styles.histMsg, { color: C.danger }]}>LOCATION · {e.lat.toFixed(5)}, {e.lng.toFixed(5)}</Text> : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ color, icon, label, value }: any) {
  return (
    <View style={[styles.statCard, { borderColor: color }]}>
      {icon}
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLab}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  back: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: C.borderLight },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  statCard: { flex: 1, padding: 12, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  statVal: { fontFamily: Fonts.display, fontSize: 26 },
  statLab: { ...T.caption, fontSize: 9, color: C.textMuted },
  sectionLabel: { ...T.caption, color: C.textSecondary, marginBottom: S.sm },
  kidRow: { flexDirection: 'row', alignItems: 'center', padding: S.sm, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  kidName: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  kidSub: { ...T.bodySm, fontSize: 11 },
  kidEv: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, marginTop: 2, letterSpacing: 0.5 },
  pip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  pipText: { fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.gold, marginTop: S.md, marginBottom: S.sm },
  toggleText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 1.5 },
  histRow: { flexDirection: 'row', gap: 8, paddingVertical: S.sm, borderBottomColor: C.border, borderBottomWidth: 1 },
  histCritical: { marginTop: 6, padding: 11, backgroundColor: 'rgba(239,68,68,.1)', borderWidth: 1, borderColor: C.danger, borderRadius: 10 },
  histDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold, marginTop: 6 },
  histType: { ...T.body, fontSize: 12, fontFamily: Fonts.bodySemiBold, letterSpacing: 0.5 },
  histDetail: { ...T.bodySm, fontSize: 11 },
  histTime: { ...T.bodySm, fontSize: 10, color: C.textMuted },
  histMsg: { ...T.bodySm, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
});
