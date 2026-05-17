import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<'parent' | 'driver'>('parent');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !email || !password) return setErr('Name, email and password required');
    setBusy(true); setErr(null);
    try {
      await Api.register({ name, email: email.trim(), password, phone, address, role });
      Alert.alert('Account Submitted', 'Your account is pending admin approval. You will be able to log in once confirmed.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: S.lg }} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>VIP KIDS</Text>
          <Text style={[T.bodySm, { textAlign: 'center', marginBottom: S.xl }]}>CREATE YOUR ACCOUNT</Text>

          {err && <View style={styles.err}><Text style={{ color: C.danger }}>{err}</Text></View>}

          <Text style={styles.label}>I AM A</Text>
          <View style={styles.roleRow}>
            {(['parent', 'driver'] as const).map((r) => (
              <TouchableOpacity key={r} onPress={() => setRole(r)} style={[styles.roleBtn, role === r && styles.roleActive]} testID={`role-${r}`}>
                <Text style={[styles.roleText, role === r && { color: C.gold }]}>{r.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>FULL NAME</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.textMuted} testID="register-name" />
          <Text style={styles.label}>EMAIL</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={C.textMuted} testID="register-email" />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={C.textMuted} testID="register-password" />
          <Text style={styles.label}>PHONE (OPTIONAL)</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+1 954 555 0000" placeholderTextColor={C.textMuted} />
          <Text style={styles.label}>ADDRESS (OPTIONAL)</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street, City, State" placeholderTextColor={C.textMuted} testID="register-address" />

          <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy} testID="register-submit">
            {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.btnText}>SUBMIT FOR APPROVAL</Text>}
          </TouchableOpacity>

          <Link href="/login" asChild>
            <TouchableOpacity style={{ marginTop: S.lg, alignItems: 'center' }} testID="back-to-login">
              <Text style={{ color: C.gold, fontFamily: Fonts.bodyMedium, letterSpacing: 1 }}>← BACK TO SIGN IN</Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  brand: { fontSize: 36, fontFamily: Fonts.display, color: C.gold, letterSpacing: 5, textAlign: 'center', marginTop: S.lg },
  label: { ...T.caption, marginBottom: 6, marginTop: S.sm, color: C.textSecondary },
  input: { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, color: C.text, fontFamily: Fonts.body, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 4 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  roleBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center' },
  roleActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  roleText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, letterSpacing: 1.5 },
  btn: { backgroundColor: C.gold, padding: 16, borderRadius: 10, alignItems: 'center', marginTop: S.lg },
  btnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, letterSpacing: 2 },
  err: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: C.danger, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: S.md },
});
