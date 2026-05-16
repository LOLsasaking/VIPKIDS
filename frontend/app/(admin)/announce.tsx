import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Megaphone, CloudRain, School, AlertOctagon, Info } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

const CATS = [
  { key: 'general', label: 'General', icon: Info },
  { key: 'weather', label: 'Weather', icon: CloudRain },
  { key: 'school_closing', label: 'School Closing', icon: School },
  { key: 'emergency', label: 'Emergency', icon: AlertOctagon },
];

export default function Announce() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cat, setCat] = useState('general');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<any[]>([]);

  const load = async () => setList(await Api.announcements());
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!title || !body) return Alert.alert('Missing', 'Title and message required');
    setBusy(true);
    try {
      await Api.adminAnnounce({ title, body, category: cat });
      setTitle(''); setBody('');
      await load();
      Alert.alert('Sent', 'All families have been notified.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
          <Text style={[T.h2, { fontSize: 24 }]}>Broadcast</Text>
          <Text style={[T.bodySm, { marginBottom: S.md }]}>Notify all families</Text>

          <Text style={styles.label}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {CATS.map((c) => {
              const Icon = c.icon;
              return (
                <TouchableOpacity key={c.key} onPress={() => setCat(c.key)} style={[styles.catCard, cat === c.key && styles.catActive]} testID={`cat-${c.key}`}>
                  <Icon size={20} color={cat === c.key ? C.gold : C.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.catText, cat === c.key && { color: C.gold }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>TITLE</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="E.g. School closed Friday" placeholderTextColor={C.textMuted} testID="announce-title" />

          <Text style={styles.label}>MESSAGE</Text>
          <TextInput style={[styles.input, { height: 110 }]} value={body} onChangeText={setBody} placeholder="Details for parents" placeholderTextColor={C.textMuted} multiline testID="announce-body" />

          <TouchableOpacity style={styles.btn} onPress={send} disabled={busy} testID="announce-send">
            {busy ? <ActivityIndicator color={C.bg} /> : (
              <>
                <Megaphone size={16} color={C.bg} />
                <Text style={styles.btnText}>SEND TO ALL FAMILIES</Text>
              </>
            )}
          </TouchableOpacity>

          {list.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: S.xl }]}>RECENT</Text>
              {list.map((a) => (
                <View key={a.id} style={styles.aCard}>
                  <Text style={styles.aCat}>{a.category?.toUpperCase()}</Text>
                  <Text style={styles.aTitle}>{a.title}</Text>
                  <Text style={styles.aBody}>{a.body}</Text>
                  <Text style={styles.aTime}>{new Date(a.created_at).toLocaleString()}</Text>
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
  label: { ...T.caption, color: C.textSecondary, marginBottom: 6, marginTop: S.sm },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: S.md },
  catCard: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgSecondary },
  catActive: { borderColor: C.gold },
  catText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  input: { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, color: C.text, fontFamily: Fonts.body, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: S.sm },
  btn: { flexDirection: 'row', backgroundColor: C.gold, padding: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: S.md },
  btnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, letterSpacing: 2, fontSize: 13 },
  aCard: { backgroundColor: C.bgSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  aCat: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 1 },
  aTitle: { ...T.body, fontSize: 14, fontFamily: Fonts.bodySemiBold, marginTop: 4 },
  aBody: { ...T.bodySm, marginTop: 2 },
  aTime: { ...T.bodySm, fontSize: 10, marginTop: 4, color: C.textMuted },
});
