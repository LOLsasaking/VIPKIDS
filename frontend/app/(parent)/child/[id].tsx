/**
 * Parent child-details (read-only view of all child data).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, GraduationCap, MapPin, Clock, Phone, Repeat, AlertTriangle, Car, User } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

export default function ChildDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [child, setChild] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    Api.parentChildDetail(params.id).then((c) => { setChild(c); setLoading(false); }).catch(() => setLoading(false));
  }, [params.id]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;
  if (!child) return <SafeAreaView style={styles.loader}><Text style={T.body}>Child not found</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="back-btn">
          <ArrowLeft size={18} color={C.gold} />
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          {child.photo_url ? (
            <Image source={{ uri: child.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, { backgroundColor: C.bgTertiary }]} />
          )}
          <Text style={styles.name}>{child.name}</Text>
          {child.grade ? <Text style={styles.gradeBadge}>{child.grade}</Text> : null}
          <Text style={styles.readonlyHint}>READ-ONLY · CONTACT ADMIN TO EDIT</Text>
        </View>

        <Section title="PERSONAL">
          <Row icon={<Calendar size={14} color={C.gold} />} label="Birth date" value={child.birth_date || '—'} />
          <Row icon={<GraduationCap size={14} color={C.gold} />} label="Grade" value={child.grade || '—'} />
          <Row icon={<Repeat size={14} color={C.gold} />} label="Trip type" value={child.round_trip === false ? 'One-way only' : 'Round trip (Ida y Vuelta)'} />
        </Section>

        <Section title="SCHEDULE">
          <Row icon={<Clock size={14} color={C.gold} />} label="Pickup" value={child.pickup_time} />
          <Row icon={<Clock size={14} color={C.gold} />} label="Dropoff" value={child.dropoff_time} />
        </Section>

        <Section title="ADDRESSES">
          <Row icon={<MapPin size={14} color={C.gold} />} label="Home" value={child.home_address} />
          <Row icon={<MapPin size={14} color={C.gold} />} label="School" value={child.school_address} />
          <Row icon={<GraduationCap size={14} color={C.gold} />} label="School name" value={child.school} />
        </Section>

        <Section title="ASSIGNMENT">
          {child.driver ? (
            <View style={styles.assignRow}>
              {child.driver.photo_url ? <Image source={{ uri: child.driver.photo_url }} style={styles.miniAvatar} /> : null}
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.assignName}>{child.driver.name}</Text>
                <Text style={styles.assignSub}>{child.driver.phone || 'Driver'}</Text>
              </View>
            </View>
          ) : (
            <Text style={[T.bodySm, { padding: S.sm }]}>No driver assigned</Text>
          )}
          <Row icon={<Car size={14} color={C.gold} />} label="Vehicle" value={child.vehicle ? `${child.vehicle.make} ${child.vehicle.model} · ${child.vehicle.plate}` : '—'} />
        </Section>

        <Section title="EMERGENCY CONTACT">
          <Row icon={<User size={14} color={C.gold} />} label="Name" value={child.emergency_contact_name || '—'} />
          <Row icon={<Phone size={14} color={C.gold} />} label="Phone" value={child.emergency_contact_phone || '—'} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      {icon}
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: S.md },
  backText: { color: C.gold, fontFamily: Fonts.bodyMedium, letterSpacing: 1.5, fontSize: 11 },
  heroCard: { alignItems: 'center', padding: S.lg, backgroundColor: C.bgSecondary, borderRadius: 18, borderWidth: 1, borderColor: C.border },
  photo: { width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: C.gold, marginBottom: S.sm },
  name: { ...T.h2, fontSize: 26 },
  gradeBadge: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 12, letterSpacing: 1.5, marginTop: 4 },
  readonlyHint: { ...T.caption, color: C.textMuted, marginTop: S.sm },
  section: { marginTop: S.md, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  sectionTitle: { ...T.caption, color: C.gold, padding: S.md, paddingBottom: 6, borderBottomColor: C.border, borderBottomWidth: 1 },
  sectionBody: { padding: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  rowLabel: { ...T.caption, fontSize: 9, color: C.textMuted },
  rowValue: { ...T.body, fontSize: 14, marginTop: 2 },
  assignRow: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  miniAvatar: { width: 36, height: 36, borderRadius: 18 },
  assignName: { ...T.body, fontFamily: Fonts.bodyMedium, fontSize: 14 },
  assignSub: { ...T.bodySm, fontSize: 11 },
});
