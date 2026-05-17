import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LogOut, Bell, Mail, Phone, Camera } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import { Api } from '@/src/api';
import { pickPhoto } from '@/src/photoPicker';
import { C, S, T, Fonts } from '@/src/theme';

const PREF_LIST: { key: string; label: string }[] = [
  { key: 'on_the_way', label: 'Driver is on the way' },
  { key: 'picked_up', label: 'Child picked up' },
  { key: 'arrived_school', label: 'Arrived at school' },
  { key: 'leaving_school', label: 'Leaving school' },
  { key: 'arriving_home', label: 'Arriving home' },
  { key: 'delay', label: 'Traffic delays' },
  { key: 'announcements', label: 'Announcements' },
];

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<any>(user?.notif_prefs || {});

  useEffect(() => { setPrefs(user?.notif_prefs || {}); }, [user]);

  const update = async (key: string, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { await Api.updatePrefs(next); await refresh(); } catch {}
  };

  const muteAll = async (value: boolean) => {
    const next = { ...prefs, mute_all: value };
    setPrefs(next);
    try { await Api.updatePrefs(next); await refresh(); } catch {}
  };

  const doLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const changePhoto = async () => {
    const photo = await pickPhoto();
    if (!photo) return;
    try {
      await Api.updatePhoto(photo);
      await refresh();
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    }
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={changePhoto} testID="change-photo-btn" activeOpacity={0.85}>
            {user.photo_url ? <Image source={{ uri: user.photo_url }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: C.bgTertiary }]} />}
            <View style={styles.cameraOverlay}>
              <Camera size={14} color={C.bg} strokeWidth={2} />
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{user.role.toUpperCase()}</Text>
          <View style={styles.meta}>
            <View style={styles.metaRow}><Mail size={14} color={C.textMuted} /><Text style={styles.metaText}>{user.email}</Text></View>
            {user.phone && <View style={styles.metaRow}><Phone size={14} color={C.textMuted} /><Text style={styles.metaText}>{user.phone}</Text></View>}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Bell size={16} color={C.gold} strokeWidth={1.8} />
            <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Mute all</Text>
            <Switch
              value={!!prefs.mute_all}
              onValueChange={muteAll}
              trackColor={{ false: C.borderLight, true: C.goldMuted }}
              thumbColor={prefs.mute_all ? C.gold : C.textMuted}
              testID="mute-all-switch"
            />
          </View>

          {!prefs.mute_all && PREF_LIST.map((p) => (
            <View key={p.key} style={styles.row}>
              <Text style={styles.rowLabel}>{p.label}</Text>
              <Switch
                value={prefs[p.key] ?? true}
                onValueChange={(v) => update(p.key, v)}
                trackColor={{ false: C.borderLight, true: C.goldMuted }}
                thumbColor={prefs[p.key] ? C.gold : C.textMuted}
                testID={`pref-${p.key}`}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={doLogout} testID="logout-button">
          <LogOut size={16} color={C.danger} strokeWidth={1.8} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  profileCard: { alignItems: 'center', backgroundColor: C.bgSecondary, padding: S.lg, borderRadius: 18, borderWidth: 1, borderColor: C.border },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: C.gold, marginBottom: S.md },
  cameraOverlay: { position: 'absolute', bottom: S.md + 4, right: -4, backgroundColor: C.gold, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bgSecondary },
  name: { ...T.h2, fontSize: 24 },
  role: { color: C.gold, fontFamily: Fonts.bodyMedium, letterSpacing: 2, fontSize: 11, marginTop: 4 },
  meta: { marginTop: S.md, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...T.bodySm },
  section: { marginTop: S.lg, backgroundColor: C.bgSecondary, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: S.md, borderBottomColor: C.border, borderBottomWidth: 1 },
  sectionTitle: { ...T.caption, color: C.gold },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10, borderBottomColor: C.border, borderBottomWidth: 1 },
  rowLabel: { ...T.body, fontSize: 14 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: S.lg, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.danger },
  logoutText: { color: C.danger, fontFamily: Fonts.bodySemiBold, letterSpacing: 2, fontSize: 13 },
});
