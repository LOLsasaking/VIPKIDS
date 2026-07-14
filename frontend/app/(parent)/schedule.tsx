import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Stethoscope, RefreshCcw, Check } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

const TYPES = [
  { key: 'after_school_activity', label: 'After-School Activity', icon: Calendar },
  { key: 'medical_appointment', label: 'Medical Appointment', icon: Stethoscope },
  { key: 'temporary_change', label: 'Temporary Change', icon: RefreshCcw },
];

export default function Schedule() {
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [type, setType] = useState('after_school_activity');
  const [when, setWhen] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [notes, setNotes] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [kids, reqs] = await Promise.all([Api.parentChildren(), Api.parentListScheduleRequests()]);
    setChildren(kids); if (kids[0]) setChildId(kids[0].id);
    setRequests(reqs);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!childId || !when) {
      Alert.alert('Missing', 'Please choose a child and date/time.');
      return;
    }
    setBusy(true);
    try {
      await Api.parentScheduleRequest({
        child_id: childId, request_type: type, when, pickup_address: pickup, dropoff_address: dropoff, notes,
      });
      setWhen(''); setPickup(''); setDropoff(''); setNotes('');
      await load();
      Alert.alert('Request sent', 'Your concierge will confirm shortly.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
          <Text style={[T.h2, { fontSize: 24 }]}>Route Change Request</Text>
          <Text style={[T.bodySm, { marginBottom: S.lg }]}>Ask your concierge to review a temporary change to the assigned route</Text>

          <Text style={styles.label}>CHILD</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, marginBottom: S.md }}>
            {children.map((c) => (
              <TouchableOpacity key={c.id} onPress={() => setChildId(c.id)} style={[styles.chip, childId === c.id && styles.chipActive]}>
                <Text style={[styles.chipText, childId === c.id && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>REQUEST TYPE</Text>
          <View style={{ gap: S.sm, marginBottom: S.md }}>
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <TouchableOpacity
                  key={t.key}
                  testID={`type-${t.key}`}
                  onPress={() => setType(t.key)}
                  style={[styles.typeCard, type === t.key && styles.typeCardActive]}
                >
                  <Icon size={20} color={type === t.key ? C.gold : C.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.typeText, type === t.key && { color: C.gold }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>WHEN (E.G. TUE 3:30 PM)</Text>
          <TextInput style={styles.input} value={when} onChangeText={setWhen} placeholder="Date and time" placeholderTextColor={C.textMuted} testID="schedule-when" />

          <Text style={styles.label}>TEMPORARY PICKUP ADDRESS</Text>
          <TextInput style={styles.input} value={pickup} onChangeText={setPickup} placeholder="Only if changing the assigned pickup" placeholderTextColor={C.textMuted} />

          <Text style={styles.label}>TEMPORARY DROPOFF ADDRESS</Text>
          <TextInput style={styles.input} value={dropoff} onChangeText={setDropoff} placeholder="Only if changing the assigned dropoff" placeholderTextColor={C.textMuted} />

          <Text style={styles.label}>NOTES</Text>
          <TextInput style={[styles.input, { height: 70 }]} value={notes} onChangeText={setNotes} placeholder="Anything we should know?" placeholderTextColor={C.textMuted} multiline />

          <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={busy} testID="schedule-submit">
            {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>SUBMIT REQUEST</Text>}
          </TouchableOpacity>

          {requests.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: S.xl }]}>YOUR REQUESTS</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.reqCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.reqType}>{r.request_type.replace(/_/g, ' ').toUpperCase()}</Text>
                    <View style={[styles.statusBadge, r.status === 'pending' && { borderColor: C.gold }]}>
                      <Text style={styles.statusText}>{r.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.reqWhen}>{r.when}</Text>
                  {r.notes ? <Text style={styles.reqNotes}>{r.notes}</Text> : null}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  label: { ...T.caption, color: C.textSecondary, marginBottom: 6, marginTop: S.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.15)' },
  chipText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  chipTextActive: { color: C.gold },
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgSecondary },
  typeCardActive: { borderColor: C.gold },
  typeText: { ...T.body, color: C.textSecondary },
  input: { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, color: C.text, fontFamily: Fonts.body, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: S.sm },
  primaryBtn: { backgroundColor: C.gold, padding: 16, borderRadius: 10, alignItems: 'center', marginTop: S.md },
  primaryBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, letterSpacing: 2 },
  reqCard: { backgroundColor: C.bgSecondary, borderRadius: 12, padding: S.md, borderWidth: 1, borderColor: C.border, marginBottom: S.sm },
  reqType: { ...T.body, fontFamily: Fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.5 },
  reqWhen: { ...T.bodySm, marginTop: 4 },
  reqNotes: { ...T.bodySm, marginTop: 4, fontStyle: 'italic' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  statusText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
});
