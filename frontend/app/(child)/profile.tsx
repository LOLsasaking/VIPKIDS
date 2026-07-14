import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FileText, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import AccountDeletionSection from '@/src/components/AccountDeletionSection';
import { C, Fonts, S, T } from '@/src/theme';

export default function ChildProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CHILD ACCESS</Text>
        <Text style={styles.title}>My Profile</Text>
        <Text style={styles.subtitle}>A restricted account connected only to your assigned transportation record.</Text>

        <View style={styles.card}>
          <View style={styles.icon}><ShieldCheck size={24} color={C.success} /></View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <View style={styles.notice}>
          <LockKeyhole size={19} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>PRIVACY-PROTECTED VIEW</Text>
            <Text style={styles.noticeCopy}>You can see only your assigned ride. Other children, family addresses, route stops, admin tools, and driver controls are hidden.</Text>
          </View>
        </View>

        <Pressable style={styles.link} onPress={() => router.push('/privacy')} accessibilityRole="link">
          <FileText size={16} color={C.gold} /><Text style={styles.linkText}>PRIVACY & DATA USE</Text>
        </Pressable>
        <Pressable style={styles.logout} onPress={signOut}>
          <LogOut size={17} color={C.gold} /><Text style={styles.logoutText}>SIGN OUT</Text>
        </Pressable>
        <AccountDeletionSection email={user.email} accountRole="child" onDeleted={signOut} />
        <Text style={styles.deleteNote}>Deleting this login removes child sign-in access. The administrator may retain transportation records when legally or operationally required.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.md, paddingBottom: 110 },
  eyebrow: { ...T.caption, color: C.gold },
  title: { ...T.h1, fontSize: 34, marginTop: 2 },
  subtitle: { ...T.bodySm, marginTop: 4, marginBottom: 16 },
  card: { alignItems: 'center', padding: S.lg, borderRadius: 16, borderWidth: 1, borderColor: C.goldMuted, backgroundColor: C.bgSecondary },
  icon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,.1)' },
  name: { ...T.h2, fontSize: 24, marginTop: 10 },
  email: { color: C.textSecondary, fontFamily: Fonts.body, fontSize: 13, marginTop: 3 },
  notice: { flexDirection: 'row', gap: 10, marginTop: 12, padding: 14, borderRadius: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgSecondary },
  noticeTitle: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.7 },
  noticeCopy: { ...T.bodySm, marginTop: 4 },
  link: { marginTop: 18, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  logout: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.goldMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.3 },
  deleteNote: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 4 },
});
