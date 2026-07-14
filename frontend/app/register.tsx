import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import BrandLogo from '@/src/components/BrandLogo';
import { Api } from '@/src/api';
import { C, Fonts, T } from '@/src/theme';

type RequestRole = 'parent' | 'driver';

export default function Register() {
  const router = useRouter();
  const [role, setRole] = useState<RequestRole>('parent');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail) return setError('Enter your full name and email.');
    if (password.length < 8) return setError('Password must contain at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await Api.register({
        role,
        name: name.trim(),
        email: normalizedEmail,
        password,
        phone: phone.trim() || undefined,
        address: role === 'parent' ? address.trim() || undefined : undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Unable to submit your access request.');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <BrandLogo width={138} />
          <View style={styles.successIcon}><CheckCircle2 size={34} color={C.gold} /></View>
          <Text style={styles.successTitle}>Request received</Text>
          <Text style={styles.successBody}>
            Your account is waiting for administrator approval. Parents can sign in after approval, add their child, and then VIP admin assigns the dedicated driver and vehicle.
          </Text>
          <Pressable style={styles.primary} onPress={() => router.replace('/login')} testID="registration-done">
            <Text style={styles.primaryText}>BACK TO SIGN IN</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back to sign in">
            <ArrowLeft size={18} color={C.gold} />
            <Text style={styles.backText}>SIGN IN</Text>
          </Pressable>

          <BrandLogo width={116} />
          <View>
            <Text style={styles.heading}>Request access</Text>
            <Text style={styles.subheading}>Create your own sign-in. The administrator must approve every account.</Text>
          </View>

          <View style={styles.roleRow}>
            {(['parent', 'driver'] as RequestRole[]).map((item) => (
              <Pressable key={item} onPress={() => setRole(item)} style={[styles.role, role === item && styles.roleActive]} testID={`register-role-${item}`}>
                <Text style={[styles.roleText, role === item && styles.roleTextActive]}>{item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

          <Field label="FULL NAME" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
          <Field label="PHONE (OPTIONAL)" value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" />
          {role === 'parent' ? <Field label="HOME ADDRESS (OPTIONAL)" value={address} onChangeText={setAddress} autoComplete="street-address" /> : null}
          <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
          <Field label="CONFIRM PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />

          <Pressable style={({ pressed }) => [styles.primary, pressed && { opacity: 0.82 }]} onPress={submit} disabled={busy} testID="register-submit">
            {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryText}>SUBMIT FOR APPROVAL</Text>}
          </Pressable>

          <View style={styles.notice}><ShieldCheck size={16} color={C.success} /><Text style={styles.noticeText}>After approval, parents can add their child and create the child login. VIP admin still assigns the dedicated driver and vehicle.</Text></View>
          <View style={styles.legalLinks}>
            <Pressable onPress={() => router.push('/privacy')} accessibilityRole="link"><Text style={styles.legalLink}>PRIVACY & DATA USE</Text></Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable onPress={() => router.push('/delete-account')} accessibilityRole="link"><Text style={styles.legalLink}>DELETE ACCOUNT</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor={C.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingBottom: 48, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', minHeight: 42 },
  backText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2 },
  heading: { ...T.h1, color: C.text, marginTop: 6 },
  subheading: { ...T.body, color: C.textSecondary, marginTop: 6 },
  roleRow: { flexDirection: 'row', gap: 8 },
  role: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.bgSecondary },
  roleActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.12)' },
  roleText: { color: C.textMuted, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  roleTextActive: { color: C.gold },
  label: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.1 },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, paddingHorizontal: 14, color: C.text, backgroundColor: C.bgSecondary, fontFamily: Fonts.body, fontSize: 16 },
  primary: { minHeight: 54, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 18 },
  primaryText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.8 },
  error: { backgroundColor: '#2B1517', borderWidth: 1, borderColor: '#5E2429', padding: 12, borderRadius: 9 },
  errorText: { color: '#FF8C94', fontFamily: Fonts.bodyMedium, fontSize: 13 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.bgSecondary },
  noticeText: { flex: 1, color: C.textSecondary, fontFamily: Fonts.body, fontSize: 11, lineHeight: 16 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 38 },
  legalLink: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.9 },
  legalDot: { color: C.textMuted, fontSize: 10 },
  successWrap: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.1)', alignItems: 'center', justifyContent: 'center', marginTop: 34 },
  successTitle: { ...T.h1, color: C.text, textAlign: 'center', marginTop: 20 },
  successBody: { ...T.body, color: C.textSecondary, textAlign: 'center', marginTop: 10, maxWidth: 360 },
});
