import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Trash2, X } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, Fonts, S, T } from '@/src/theme';

type Props = {
  email: string;
  onDeleted: () => Promise<void> | void;
  routeActive?: boolean;
  accountRole?: 'parent' | 'driver' | 'child';
};

export default function AccountDeletionSection({ email, onDeleted, routeActive = false, accountRole }: Props) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setConfirmation('');
    setError(null);
  };

  const remove = async () => {
    if (routeActive) return setError('End the active route before deleting this account.');
    if (!password) return setError('Enter your current password.');
    if (confirmation !== 'DELETE') return setError('Type DELETE exactly to confirm.');
    setBusy(true);
    setError(null);
    try {
      await Api.deleteAccount(email, password);
      setOpen(false);
      setPassword('');
      setConfirmation('');
      await onDeleted();
    } catch (err: any) {
      setError(err.message || 'Unable to delete the account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable style={styles.openButton} onPress={() => setOpen(true)} accessibilityRole="button" testID="delete-account-button">
        <Trash2 size={16} color={C.danger} />
        <Text style={styles.openText}>DELETE ACCOUNT</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.warningIcon}><AlertTriangle size={21} color={C.danger} /></View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Delete account?</Text>
                <Text style={styles.subtitle}>This cannot be undone.</Text>
              </View>
              <Pressable onPress={close} accessibilityLabel="Close account deletion"><X size={22} color={C.textMuted} /></Pressable>
            </View>

            <Text style={styles.body}>
              {accountRole === 'child'
                ? 'Your child sign-in will be deleted. The transportation record managed by your parent and VIP administrator is not deleted by this action.'
                : 'Your sign-in and associated personal data will be deleted. Parent deletion also removes assigned child records and route history. Driver deletion removes driver location history and unassigns active records.'}
            </Text>
            {routeActive ? <Text style={styles.error}>End the active route before continuing.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>CURRENT PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
              autoComplete="current-password"
              placeholder="Your password"
              placeholderTextColor={C.textMuted}
              editable={!busy}
            />
            <Text style={styles.label}>TYPE DELETE TO CONFIRM</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              style={styles.input}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={C.textMuted}
              editable={!busy}
            />

            <Pressable
              style={[styles.deleteButton, (busy || routeActive) && styles.disabled]}
              onPress={remove}
              disabled={busy || routeActive}
              accessibilityRole="button"
              testID="confirm-delete-account"
            >
              {busy ? <ActivityIndicator color={C.text} /> : <Text style={styles.deleteText}>PERMANENTLY DELETE ACCOUNT</Text>}
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={close} disabled={busy}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  openButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: S.md, padding: 14, borderRadius: 12 },
  openText: { color: C.danger, fontFamily: Fonts.bodySemiBold, letterSpacing: 1.4, fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.76)', alignItems: 'center', justifyContent: 'center', padding: S.md },
  card: { width: '100%', maxWidth: 440, borderRadius: 18, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.bgSecondary, padding: S.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warningIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,.12)' },
  headerCopy: { flex: 1 },
  title: { ...T.h2, fontSize: 23 },
  subtitle: { ...T.bodySm, color: C.danger },
  body: { ...T.bodySm, color: C.textSecondary, marginTop: S.md, lineHeight: 19 },
  error: { color: '#FF8C94', fontFamily: Fonts.bodyMedium, fontSize: 12, marginTop: 10 },
  label: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.1, marginTop: 14 },
  input: { minHeight: 50, marginTop: 6, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, paddingHorizontal: 13, color: C.text, fontFamily: Fonts.body, fontSize: 16, backgroundColor: C.bg },
  deleteButton: { minHeight: 52, marginTop: S.lg, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.danger },
  disabled: { opacity: 0.45 },
  deleteText: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 0.6 },
  cancelButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: C.textSecondary, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.2 },
});
