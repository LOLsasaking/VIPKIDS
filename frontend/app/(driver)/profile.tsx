import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FileText, LogOut, ShieldCheck } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import DriverVehicleProfile from '@/src/components/DriverVehicleProfile';
import AccountDeletionSection from '@/src/components/AccountDeletionSection';
import { stopRouteLocationUpdates } from '@/src/backgroundLocation';
import { C, Fonts, S, T } from '@/src/theme';

export default function DriverProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setChildren(await Api.driverToday()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doLogout = async () => {
    try {
      const current = await Api.me();
      if (current.on_duty) {
        Alert.alert('Route still active', 'End the route and complete the vehicle-empty check before signing out.');
        return;
      }
    } catch {
      // If the session is already invalid, local sign-out is still safe.
    }
    try { await stopRouteLocationUpdates(); } catch {}
    await logout();
    router.replace('/login');
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;
  if (!user) return null;

  const assignment = children.find((child) => child.driver || child.vehicle);
  const driver = { ...user, ...(assignment?.driver || {}) };
  const vehicle = assignment?.vehicle;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.eyebrow}>VIP DRIVER IDENTITY</Text>
        <Text style={styles.title}>My Profile</Text>
        <Text style={styles.subtitle}>The verified driver and vehicle information families see for your assigned route.</Text>

        <View style={styles.verifiedBanner}>
          <ShieldCheck size={17} color={C.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifiedTitle}>IDENTITY & VEHICLE VERIFIED</Text>
            <Text style={styles.verifiedCopy}>Profile changes are reviewed by VIP administration.</Text>
          </View>
        </View>

        <DriverVehicleProfile driver={driver} vehicle={vehicle} heading="EXECUTIVE DRIVER PROFILE" />

        <View style={styles.assignmentCard}>
          <Text style={styles.assignmentLabel}>TODAY’S ASSIGNED CHILDREN</Text>
          <Text style={styles.assignmentNames}>{children.map((child) => child.name).join(' · ') || 'No children assigned'}</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} testID="driver-logout-button">
          <LogOut size={16} color={C.danger} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>
        <Pressable style={styles.privacyLink} onPress={() => router.push('/privacy')} accessibilityRole="link">
          <FileText size={15} color={C.gold} />
          <Text style={styles.privacyText}>PRIVACY & DATA USE</Text>
        </Pressable>
        <AccountDeletionSection
          email={user.email}
          routeActive={!!(user as any).on_duty}
          onDeleted={async () => { await logout(); router.replace('/login'); }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: 100 },
  eyebrow: { ...T.caption, color: C.gold },
  title: { ...T.h1, fontSize: 34, marginTop: 2 },
  subtitle: { ...T.bodySm, marginTop: 3, marginBottom: 14 },
  verifiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: C.success, backgroundColor: 'rgba(16,185,129,.08)', marginBottom: 12 },
  verifiedTitle: { color: C.success, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.8 },
  verifiedCopy: { color: C.textSecondary, fontFamily: Fonts.body, fontSize: 10, marginTop: 2 },
  assignmentCard: { padding: 13, marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgSecondary },
  assignmentLabel: { ...T.caption, color: C.gold, fontSize: 8 },
  assignmentNames: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 13, marginTop: 3 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: S.lg, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.danger },
  logoutText: { color: C.danger, fontFamily: Fonts.bodySemiBold, letterSpacing: 2, fontSize: 13 },
  privacyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: S.md, minHeight: 42 },
  privacyText: { color: C.gold, fontFamily: Fonts.bodySemiBold, letterSpacing: 1.1, fontSize: 10 },
});
