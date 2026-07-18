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
import { ArrowRight, CarFront, ShieldCheck, User, UserRound, Users } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import BrandLogo from '@/src/components/BrandLogo';
import { C, Fonts, T } from '@/src/theme';

type DemoRole = 'parent' | 'driver' | 'child' | 'admin';

const DEMO_PASSWORD = 'vipdemo123';
const SHOW_DEMO_ACCOUNTS = __DEV__ || process.env.EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true' || process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === 'true';
const DEMO_ACCOUNTS: Array<{
  role: DemoRole;
  label: string;
  email: string;
  Icon: typeof User;
}> = [
  { role: 'parent', label: 'Parent', email: 'parent.demo@vipkidstest.com', Icon: Users },
  { role: 'driver', label: 'Driver', email: 'driver.demo@vipkidstest.com', Icon: CarFront },
  { role: 'child', label: 'Child', email: 'child.demo@vipkidstest.com', Icon: UserRound },
  { role: 'admin', label: 'Admin', email: 'admin.demo@vipkidstest.com', Icon: ShieldCheck },
];

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueWith = (role: 'parent' | 'driver' | 'child' | 'admin') => {
    if (role === 'parent') router.replace('/(parent)');
    else if (role === 'driver') router.replace('/(driver)');
    else if (role === 'child') router.replace('/(child)');
    else router.replace('/(admin)');
  };

  const submit = async () => {
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      continueWith((await login(email.trim(), password)).role);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const signInDemo = async (demo: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(demo.email);
    setPassword(DEMO_PASSWORD);
    setBusy(true);
    setError(null);
    try {
      continueWith((await login(demo.email, DEMO_PASSWORD)).role);
    } catch (err: any) {
      setError(err.message || `Could not open the ${demo.label} demo.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <BrandLogo width={142} />
            <Text style={styles.tagline}>A familiar driver. A dedicated vehicle. Every school day.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to follow your child’s assigned route.</Text>

            {error && <View style={styles.error} testID="login-error"><Text style={styles.errorText}>{error}</Text></View>}

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={C.textMuted}
              accessibilityLabel="Email"
            />

            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              placeholder="Your password"
              placeholderTextColor={C.textMuted}
              accessibilityLabel="Password"
            />

            <Pressable testID="login-submit-button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={C.bg} /> : <><Text style={styles.primaryText}>Sign in</Text><ArrowRight size={20} color={C.bg} /></>}
            </Pressable>

            {SHOW_DEMO_ACCOUNTS ? (
              <>
                <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>TEST DEMOS</Text><View style={styles.divider} /></View>
                <Text style={styles.demoHint}>Tap a role to sign in automatically. Demo password: {DEMO_PASSWORD}</Text>
                <View style={styles.demoGrid}>
                  {DEMO_ACCOUNTS.map((demo) => {
                    const Icon = demo.Icon;
                    return (
                      <Pressable
                        key={demo.role}
                        testID={`demo-login-${demo.role}`}
                        style={({ pressed }) => [styles.demoButton, pressed && styles.previewPressed]}
                        onPress={() => signInDemo(demo)}
                        disabled={busy}
                      >
                        <Icon size={17} color={C.gold} strokeWidth={1.8} />
                        <Text style={styles.demoLabel}>{demo.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>NEW TO VIP KIDS?</Text><View style={styles.divider} /></View>

            <Pressable
              testID="request-access-button"
              style={({ pressed }) => [styles.secondary, pressed && styles.previewPressed]}
              onPress={() => router.push('/register')}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTitle}>Request access</Text>
                <Text style={styles.previewCopy}>Parents and drivers request access. Approved parents can create the child sign-in.</Text>
              </View>
              <ArrowRight size={18} color={C.gold} />
            </Pressable>

            <View style={styles.securityRow}><ShieldCheck size={15} color={C.success} /><Text style={styles.securityText}>Every new account requires administrator approval.</Text></View>
          </View>

          <View style={styles.legalBlock}>
            <Text style={styles.legal}>Private access is provided after VIP consultation and service approval.</Text>
            <View style={styles.legalLinks}>
              <Pressable onPress={() => router.push('/privacy')} accessibilityRole="link"><Text style={styles.legalLink}>PRIVACY</Text></Pressable>
              <Text style={styles.legalDot}>•</Text>
              <Pressable onPress={() => router.push('/delete-account')} accessibilityRole="link"><Text style={styles.legalLink}>DELETE ACCOUNT</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 28, gap: 34 },
  brandBlock: { alignItems: 'center' },
  tagline: { ...T.bodySm, color: C.textSecondary, marginTop: 12, maxWidth: 320, textAlign: 'center' },
  form: { gap: 10 },
  heading: { ...T.h1, color: C.text },
  subheading: { ...T.body, color: C.textSecondary, marginBottom: 12 },
  label: { fontFamily: Fonts.bodySemiBold, color: C.gold, fontSize: 10, letterSpacing: 1.1, marginTop: 5 },
  input: { minHeight: 54, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, paddingHorizontal: 15, color: C.text, fontFamily: Fonts.body, fontSize: 16, backgroundColor: C.bgSecondary },
  primary: { minHeight: 54, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 9 },
  primaryText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 16 },
  pressed: { opacity: 0.82 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  divider: { height: 1, flex: 1, backgroundColor: C.border },
  dividerText: { color: C.textMuted, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.4 },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demoHint: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, lineHeight: 14, marginTop: -4, marginBottom: 2, textAlign: 'center' },
  demoButton: { width: '48.5%', minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: C.goldMuted, backgroundColor: 'rgba(212,175,55,.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  demoLabel: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 0.9 },
  secondary: { minHeight: 66, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgSecondary, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  previewPressed: { borderColor: C.gold, backgroundColor: C.bgTertiary },
  previewTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 14 },
  previewCopy: { color: C.textSecondary, fontFamily: Fonts.body, fontSize: 11, marginTop: 2 },
  error: { backgroundColor: '#2B1517', borderWidth: 1, borderColor: '#5E2429', padding: 12, borderRadius: 9 },
  errorText: { color: '#FF8C94', fontFamily: Fonts.bodyMedium, fontSize: 13 },
  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  securityText: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10 },
  legal: { color: C.textMuted, fontFamily: Fonts.body, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  legalBlock: { alignItems: 'center', gap: 8 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legalLink: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 1 },
  legalDot: { color: C.textMuted, fontSize: 10 },
});
