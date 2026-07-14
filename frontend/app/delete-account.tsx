import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import { C, Fonts, S, T } from '@/src/theme';

export default function DeleteAccountPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);

  const remove = async () => {
    if (!email.trim() || !password) return setError('Enter the account email and current password.');
    if (confirmation !== 'DELETE') return setError('Type DELETE exactly to confirm.');
    setBusy(true);
    setError(null);
    try {
      await Api.deleteAccount(email.trim().toLowerCase(), password);
      await logout();
      setComplete(true);
      setPassword('');
      setConfirmation('');
    } catch (err: any) {
      setError(err.message || 'Unable to delete the account.');
    } finally {
      setBusy(false);
    }
  };

  if (complete) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.complete}>
          <CheckCircle2 size={46} color={C.success} />
          <Text style={styles.title}>Account deleted</Text>
          <Text style={styles.copy}>Your sign-in and the data controlled by that account were removed. You can close this page.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/login')}><Text style={styles.secondaryText}>RETURN TO SIGN IN</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/login')} accessibilityLabel="Go back">
            <ArrowLeft size={18} color={C.gold} /><Text style={styles.backText}>BACK</Text>
          </Pressable>
          <View style={styles.icon}><Trash2 size={27} color={C.danger} /></View>
          <Text style={styles.eyebrow}>ACCOUNT & DATA</Text>
          <Text style={styles.title}>Delete your account</Text>
          <Text style={styles.copy}>
            This page is available to parent, driver, and restricted child accounts, including pending or suspended accounts. Deletion is permanent. Administrator accounts must be managed through VIP Kids operations.
          </Text>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Parent deletion removes the account, assigned child records, messages, schedules, and route history. Driver deletion removes driver location history and unassigns the driver from active records. Child deletion removes only that restricted login; the transportation record remains under parent and administrator control.</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Field label="ACCOUNT EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" editable={!busy && !user?.email} />
          <Field label="CURRENT PASSWORD" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" editable={!busy} />
          <Field label="TYPE DELETE TO CONFIRM" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" placeholder="DELETE" editable={!busy} />
          <Pressable style={[styles.deleteButton, busy && styles.disabled]} onPress={remove} disabled={busy} testID="public-delete-account-submit">
            {busy ? <ActivityIndicator color={C.text} /> : <Text style={styles.deleteText}>PERMANENTLY DELETE ACCOUNT</Text>}
          </Pressable>
          <Pressable style={styles.privacyLink} onPress={() => router.push('/privacy')} accessibilityRole="link"><Text style={styles.privacyText}>READ PRIVACY & DATA USE</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor={C.textMuted} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, padding: S.lg, paddingBottom: S.xxxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.3 },
  icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,.1)', marginTop: S.md },
  eyebrow: { ...T.caption, color: C.gold, marginTop: S.md },
  title: { ...T.h1, fontSize: 34, marginTop: 4 },
  copy: { ...T.body, color: C.textSecondary, lineHeight: 23, marginTop: 10 },
  notice: { padding: S.md, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.bgSecondary, marginTop: S.lg },
  noticeText: { ...T.bodySm, color: C.textSecondary, lineHeight: 19 },
  error: { color: '#FF8C94', fontFamily: Fonts.bodyMedium, fontSize: 12, marginTop: S.md },
  field: { gap: 6, marginTop: S.md },
  label: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.1 },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, paddingHorizontal: 14, color: C.text, backgroundColor: C.bgSecondary, fontFamily: Fonts.body, fontSize: 16 },
  deleteButton: { minHeight: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.danger, marginTop: S.lg },
  disabled: { opacity: 0.5 },
  deleteText: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 0.7 },
  privacyLink: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.1 },
  complete: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl },
  secondaryButton: { minHeight: 50, borderWidth: 1, borderColor: C.gold, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.lg, marginTop: S.lg },
  secondaryText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
});
