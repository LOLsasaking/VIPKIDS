/**
 * Login screen — premium dark luxury, role-agnostic. Backend decides role.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth';
import { C, S, T, Fonts } from '@/src/theme';

const BG = 'https://static.prod-images.emergentagent.com/jobs/7a0535f8-9d71-4d55-aadd-ad0af3e446d6/images/c911da8db961e3b314dda780739fc72165787128a21e141819fe82f66b72883d.png';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) return setErr('Email and password are required');
    setBusy(true);
    setErr(null);
    try {
      const u = await login(email.trim(), password);
      if (u.role === 'parent') router.replace('/(parent)');
      else if (u.role === 'driver') router.replace('/(driver)');
      else router.replace('/(admin)');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const quickFill = (role: 'parent' | 'driver' | 'admin') => {
    setEmail(`${role}@vipkids.com`);
    setPassword(`${role}123`);
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={{ uri: BG }} style={StyleSheet.absoluteFillObject} resizeMode="cover">
        <LinearGradient
          colors={['rgba(9,9,11,0.65)', 'rgba(9,9,11,0.95)', 'rgba(9,9,11,1)']}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.brandWrap}>
              <Text style={styles.brand}>VIP KIDS</Text>
              <View style={styles.divider} />
              <Text style={styles.tagline}>PRIVATE SCHOOL CHAUFFEUR · EST. 2012</Text>
            </View>

            <View style={styles.formWrap}>
              <Text style={[T.h2, { marginBottom: S.sm }]}>Welcome back</Text>
              <Text style={[T.bodySm, { marginBottom: S.lg }]}>
                Sign in to access your concierge dashboard
              </Text>

              {err && (
                <View style={styles.errorBox} testID="login-error">
                  <Text style={styles.errorText}>{err}</Text>
                </View>
              )}

              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                testID="login-email-input"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={C.textMuted}
              />

              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                testID="login-password-input"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={C.textMuted}
              />

              <TouchableOpacity
                testID="login-submit-button"
                style={styles.primaryBtn}
                onPress={submit}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>SIGN IN</Text>
                )}
              </TouchableOpacity>

              <View style={styles.demoWrap}>
                <Text style={styles.demoLabel}>DEMO ACCESS</Text>
                <View style={styles.demoRow}>
                  {(['parent', 'driver', 'admin'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      testID={`demo-fill-${r}`}
                      style={styles.demoChip}
                      onPress={() => quickFill(r)}
                    >
                      <Text style={styles.demoChipText}>{r.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: S.lg, paddingTop: S.xxl },
  brandWrap: { alignItems: 'center', marginTop: S.xxl },
  brand: { fontSize: 42, fontFamily: Fonts.display, color: C.gold, letterSpacing: 6 },
  divider: { width: 60, height: 1, backgroundColor: C.gold, marginVertical: S.md, opacity: 0.7 },
  tagline: { ...T.caption, color: C.accent, letterSpacing: 2 },
  formWrap: { marginTop: S.xxl, padding: S.lg, backgroundColor: 'rgba(24,24,27,0.85)', borderRadius: 20, borderWidth: 1, borderColor: C.border },
  label: { ...T.caption, marginBottom: 6, color: C.textSecondary },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10,
    padding: 14, color: C.text, fontFamily: Fonts.body, fontSize: 15, marginBottom: S.md,
  },
  primaryBtn: {
    backgroundColor: C.gold, borderRadius: 10, paddingVertical: 16, alignItems: 'center',
    marginTop: S.sm,
  },
  primaryBtnText: {
    color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 14, letterSpacing: 2.5,
  },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: C.danger, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: S.md },
  errorText: { color: C.danger, fontFamily: Fonts.body, fontSize: 13 },
  demoWrap: { marginTop: S.lg, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.border },
  demoLabel: { ...T.caption, textAlign: 'center', marginBottom: S.sm },
  demoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: S.sm },
  demoChip: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: C.borderLight, backgroundColor: 'transparent',
  },
  demoChipText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 1.5 },
});
