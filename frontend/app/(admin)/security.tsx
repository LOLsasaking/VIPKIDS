import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCircle2, KeyRound, LogOut, ShieldAlert } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth } from '@/src/auth';
import { requireSupabase, supabaseConfigured } from '@/src/supabase';
import { C, Fonts, S, T } from '@/src/theme';

type Enrollment = { id: string; secret: string; qr: string };

function decodeSvgDataUri(value: string) {
  const encoded = value.split(',', 2)[1] || '';
  try {
    if (value.slice(0, value.indexOf(',')).includes(';base64')) {
      return globalThis.atob(encoded);
    }
    return decodeURIComponent(encoded);
  } catch {
    return '';
  }
}

export default function AdminSecurity() {
  const { logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [secured, setSecured] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) { setSecured(false); setLoading(false); return; }
    const result = await requireSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    setSecured(result.data?.currentLevel === 'aal2');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const enroll = async () => {
    setBusy(true);
    try {
      const result = await requireSupabase().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'VIP Kids Admin' });
      if (result.error) throw result.error;
      setEnrollment({ id: result.data.id, secret: result.data.totp.secret, qr: decodeSvgDataUri(result.data.totp.qr_code) });
    } catch (error: any) {
      Alert.alert('Unable to start MFA setup', error.message || 'Try again.');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return Alert.alert('Enter code', 'Enter the six-digit code from your authenticator app.');
    setBusy(true);
    try {
      const result = await requireSupabase().auth.mfa.challengeAndVerify({ factorId: enrollment.id, code });
      if (result.error) throw result.error;
      setEnrollment(null); setCode(''); await load();
      Alert.alert('Administrator protected', 'Authenticator verification is active for this admin account.');
    } catch (error: any) {
      Alert.alert('Code not accepted', error.message || 'Check the code and try again.');
    } finally { setBusy(false); }
  };

  const signOut = async () => { await logout(); router.replace('/login'); };
  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>ADMINISTRATOR SECURITY</Text>
        <Text style={styles.title}>Authenticator MFA</Text>
        {!supabaseConfigured ? <View style={styles.status}><ShieldAlert size={24} color={C.gold} /><View style={{ flex: 1 }}><Text style={styles.statusTitle}>PREVIEW DEMO</Text><Text style={styles.statusCopy}>Authenticator setup is available after this build is connected to Supabase production.</Text></View></View> : <View style={[styles.status, secured && styles.statusSecure]}>
          {secured ? <CheckCircle2 size={24} color={C.success} /> : <ShieldAlert size={24} color={C.danger} />}
          <View style={{ flex: 1 }}><Text style={styles.statusTitle}>{secured ? 'THIS SESSION IS PROTECTED' : 'MFA SETUP REQUIRED'}</Text><Text style={styles.statusCopy}>{secured ? 'Sensitive administrator API access is unlocked at assurance level 2.' : 'Admin API routes stay locked until an authenticator code is verified.'}</Text></View>
        </View>}

        {supabaseConfigured && !secured && !enrollment ? <Pressable style={styles.primary} onPress={enroll} disabled={busy}><KeyRound size={18} color={C.bg} /><Text style={styles.primaryText}>SET UP AUTHENTICATOR</Text></Pressable> : null}
        {enrollment ? <View style={styles.enrollCard}>
          <Text style={styles.instructions}>Scan this code with an authenticator app, or enter the setup key manually. Do not send or screenshot this secret.</Text>
          {enrollment.qr ? <View style={styles.qr}><SvgXml xml={enrollment.qr} width={210} height={210} /></View> : null}
          <Text style={styles.secretLabel}>MANUAL SETUP KEY</Text><Text selectable style={styles.secret}>{enrollment.secret}</Text>
          <TextInput style={styles.input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} placeholder="000000" placeholderTextColor={C.textMuted} testID="admin-mfa-code" />
          <Pressable style={styles.primary} onPress={verify} disabled={busy}>{busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryText}>VERIFY & ENABLE</Text>}</Pressable>
        </View> : null}

        <Pressable style={styles.logout} onPress={signOut}><LogOut size={17} color={C.danger} /><Text style={styles.logoutText}>SIGN OUT</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }, content: { padding: S.md, paddingBottom: 110 },
  eyebrow: { ...T.caption, color: C.gold }, title: { ...T.h1, fontSize: 32, marginTop: 3, marginBottom: 16 },
  status: { flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: C.danger, backgroundColor: 'rgba(239,68,68,.08)', borderRadius: 14, padding: 15 }, statusSecure: { borderColor: C.success, backgroundColor: 'rgba(16,185,129,.08)' },
  statusTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: .6 }, statusCopy: { ...T.bodySm, marginTop: 4 },
  primary: { minHeight: 54, marginTop: 14, borderRadius: 11, backgroundColor: C.gold, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1 },
  enrollCard: { marginTop: 14, borderWidth: 1, borderColor: C.goldMuted, borderRadius: 14, padding: 15, backgroundColor: C.bgSecondary }, instructions: { ...T.bodySm }, qr: { marginTop: 14, alignSelf: 'center', padding: 8, backgroundColor: '#FFFFFF', borderRadius: 10 }, secretLabel: { ...T.caption, color: C.gold, marginTop: 14 }, secret: { color: C.text, fontFamily: Fonts.bodyMedium, fontSize: 13, letterSpacing: 1, marginTop: 5 }, input: { minHeight: 54, marginTop: 14, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, color: C.text, backgroundColor: C.bg, fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  logout: { minHeight: 52, marginTop: 22, borderWidth: 1, borderColor: C.danger, borderRadius: 11, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, logoutText: { color: C.danger, fontFamily: Fonts.bodySemiBold, letterSpacing: 1 },
});
