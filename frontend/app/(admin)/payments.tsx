/**
 * Admin payments — monthly tracking.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Plus, X, DollarSign, ArrowLeft, Trash2, CheckCircle2, Clock } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

const NOW = new Date();
const CUR_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

export default function Payments() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [parents, setParents] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const p = await Api.adminPayments(); setItems(p); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); Api.adminUsers('parent').then(setParents).catch(() => {}); }, [load]);

  const totals = items.reduce(
    (acc, p) => {
      acc.total += p.amount;
      acc[p.status] = (acc[p.status] || 0) + p.amount;
      return acc;
    },
    { total: 0, paid: 0, pending: 0, overdue: 0 } as any,
  );

  const setStatus = async (p: any, status: string) => {
    try { await Api.adminUpdatePayment(p.id, { ...p, status }); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };
  const remove = (p: any) => {
    Alert.alert('Delete', `Remove ${p.month} payment?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await Api.adminDeletePayment(p.id); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ padding: S.md }}>
        <View style={styles.headRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="payments-back">
            <ArrowLeft size={18} color={C.gold} />
          </TouchableOpacity>
          <Text style={[T.h2, { fontSize: 24, flex: 1, marginLeft: S.sm }]}>Payments</Text>
          <TouchableOpacity onPress={() => setShow(true)} style={styles.addBtn} testID="add-payment-btn">
            <Plus size={14} color={C.bg} />
            <Text style={styles.addBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stats}>
          <StatBox label="TOTAL" value={`$${totals.total.toFixed(0)}`} color={C.gold} />
          <StatBox label="PAID" value={`$${(totals.paid || 0).toFixed(0)}`} color={C.success} />
          <StatBox label="PENDING" value={`$${(totals.pending || 0).toFixed(0)}`} color={C.textSecondary} />
          <StatBox label="OVERDUE" value={`$${(totals.overdue || 0).toFixed(0)}`} color={C.danger} />
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.gold} /> : (
        <ScrollView contentContainerStyle={{ padding: S.md, paddingTop: 0, paddingBottom: S.xxxl }}>
          {items.map((p) => (
            <View key={p.id} style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payName}>{p.parent?.name || 'Unknown'}</Text>
                <Text style={styles.paySub}>{p.month} · ${p.amount.toFixed(2)}</Text>
                {p.notes ? <Text style={[T.bodySm, { fontSize: 11, fontStyle: 'italic', marginTop: 2 }]}>{p.notes}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={[styles.statusPill, p.status === 'paid' && { borderColor: C.success }, p.status === 'overdue' && { borderColor: C.danger }]}>
                  <Text style={[styles.statusText, p.status === 'paid' && { color: C.success }, p.status === 'overdue' && { color: C.danger }]}>
                    {p.status.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {p.status !== 'paid' && (
                    <TouchableOpacity onPress={() => setStatus(p, 'paid')} testID={`mark-paid-${p.id}`} style={styles.smBtn}>
                      <CheckCircle2 size={14} color={C.success} />
                    </TouchableOpacity>
                  )}
                  {p.status !== 'overdue' && (
                    <TouchableOpacity onPress={() => setStatus(p, 'overdue')} testID={`mark-overdue-${p.id}`} style={styles.smBtn}>
                      <Clock size={14} color={C.danger} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => remove(p)} testID={`delete-payment-${p.id}`} style={styles.smBtn}>
                    <Trash2 size={14} color={C.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          {items.length === 0 && <Text style={[T.bodySm, { textAlign: 'center', padding: S.lg }]}>No payments recorded yet.</Text>}
        </ScrollView>
      )}

      <AddPaymentModal visible={show} onClose={() => setShow(false)} parents={parents} onCreated={load} />
    </SafeAreaView>
  );
}

function StatBox({ label, value, color }: any) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLab}>{label}</Text>
    </View>
  );
}

function AddPaymentModal({ visible, onClose, parents, onCreated }: any) {
  const [parentId, setParentId] = useState('');
  const [month, setMonth] = useState(CUR_MONTH);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!parentId || !amount) return Alert.alert('Missing', 'Parent and amount are required.');
    setBusy(true);
    try {
      await Api.adminCreatePayment({ parent_id: parentId, month, amount: parseFloat(amount), status: 'pending', notes });
      setAmount(''); setNotes(''); setParentId(''); onClose(); onCreated();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={[T.h3, { fontSize: 20 }]}>Record Payment</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.lab}>PARENT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {parents.map((p: any) => (
                <TouchableOpacity key={p.id} onPress={() => setParentId(p.id)} style={[styles.chip, parentId === p.id && styles.chipActive]} testID={`pay-pick-parent-${p.id}`}>
                  <Text style={[styles.chipText, parentId === p.id && { color: C.gold }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.lab}>MONTH (YYYY-MM)</Text>
            <TextInput style={styles.inp} value={month} onChangeText={setMonth} placeholderTextColor={C.textMuted} testID="payment-month" />
            <Text style={styles.lab}>AMOUNT (USD)</Text>
            <TextInput style={styles.inp} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="850.00" placeholderTextColor={C.textMuted} testID="payment-amount" />
            <Text style={styles.lab}>NOTES</Text>
            <TextInput style={[styles.inp, { height: 60 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={C.textMuted} />
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} disabled={busy} testID="payment-submit">
              {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>RECORD PAYMENT</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: C.borderLight },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  stats: { flexDirection: 'row', gap: 8, marginTop: S.md },
  statBox: { flex: 1, padding: 10, backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  statVal: { fontFamily: Fonts.display, fontSize: 18 },
  statLab: { ...T.caption, fontSize: 9, marginTop: 2 },
  payRow: { flexDirection: 'row', alignItems: 'center', padding: S.sm, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  payName: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  paySub: { ...T.bodySm, fontSize: 11 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  statusText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 9, letterSpacing: 0.8 },
  smBtn: { padding: 6, borderRadius: 6 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.md, maxHeight: '90%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: S.sm, borderBottomColor: C.border, borderBottomWidth: 1, marginBottom: S.sm },
  lab: { ...T.caption, color: C.textSecondary, marginTop: S.sm, marginBottom: 6 },
  inp: { backgroundColor: C.bg, borderRadius: 10, padding: 12, color: C.text, fontFamily: Fonts.body, fontSize: 14, borderWidth: 1, borderColor: C.border },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.15)' },
  chipText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  primaryBtn: { backgroundColor: C.gold, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: S.md, marginBottom: S.lg },
  primaryBtnText: { color: C.bg, fontFamily: Fonts.bodySemiBold, letterSpacing: 2 },
});
