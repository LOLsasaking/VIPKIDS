import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BadgeCheck, CalendarDays, Car, Edit3, IdCard, Link2, X } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, Fonts, S, T } from '@/src/theme';

const DAY = 86_400_000;

function daysRemaining(value?: string) {
  if (!value) return null;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / DAY);
}

function urgency(days: number | null) {
  if (days === null) return C.textMuted;
  if (days < 0) return C.danger;
  if (days <= 30) return C.gold;
  return C.success;
}

function countdownLabel(days: number | null) {
  if (days === null) return 'DATE NEEDED';
  if (days < 0) return `${Math.abs(days)} DAYS EXPIRED`;
  if (days === 0) return 'EXPIRES TODAY';
  return `${days} DAYS LEFT`;
}

export default function Compliance() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDriver, setEditDriver] = useState<any | null>(null);
  const [editVehicle, setEditVehicle] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [driverData, vehicleData] = await Promise.all([Api.adminUsers('driver'), Api.adminVehicles()]);
      setDrivers(driverData);
      setVehicles(vehicleData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reminderCount = useMemo(() => {
    const dates = [
      ...drivers.map((driver) => driver.license_expiry),
      ...vehicles.flatMap((vehicle) => [vehicle.registration_expiry, vehicle.insurance_expiry, vehicle.inspection_expiry]),
    ];
    return dates.filter((date) => {
      const days = daysRemaining(date);
      return days !== null && days <= 30;
    }).length;
  }, [drivers, vehicles]);

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>FLEET DOCUMENTS</Text>
            <Text style={styles.title}>Compliance</Text>
          </View>
          <View style={[styles.reminderBadge, reminderCount > 0 && styles.reminderBadgeActive]}>
            <CalendarDays size={16} color={reminderCount > 0 ? C.gold : C.success} />
            <Text style={[styles.reminderText, { color: reminderCount > 0 ? C.gold : C.success }]}>{reminderCount} REMINDERS</Text>
          </View>
        </View>

        <Text style={styles.description}>Track each driver’s license and the registration documents for the vehicle assigned to them.</Text>

        <Text style={styles.sectionLabel}>DRIVERS · {drivers.length}</Text>
        {drivers.map((driver) => {
          const vehicle = vehicles.find((item) => item.driver_id === driver.id);
          const days = daysRemaining(driver.license_expiry);
          return (
            <Pressable key={driver.id} style={styles.card} onPress={() => setEditDriver(driver)} testID={`compliance-driver-${driver.id}`}>
              <View style={styles.cardTop}>
                {driver.photo_url ? <Image source={driver.photo_url} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><IdCard size={22} color={C.gold} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{driver.name}</Text>
                  <Text style={styles.cardSub}>{driver.license_number || 'License number needed'}</Text>
                </View>
                <Edit3 size={17} color={C.gold} />
              </View>
              <DocumentRow label="DRIVER LICENSE EXPIRY" value={driver.license_expiry || 'Not entered'} days={days} />
              <View style={styles.assignedRow}>
                <Link2 size={15} color={C.gold} />
                <Text style={styles.assignedText}>{vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : 'No vehicle linked to this driver'}</Text>
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.sectionLabel}>VEHICLES · {vehicles.length}</Text>
        {vehicles.map((vehicle) => {
          const driver = drivers.find((item) => item.id === vehicle.driver_id);
          return (
            <Pressable key={vehicle.id} style={styles.card} onPress={() => setEditVehicle(vehicle)} testID={`compliance-vehicle-${vehicle.id}`}>
              <View style={styles.cardTop}>
                {vehicle.photo_url ? <Image source={vehicle.photo_url} style={styles.vehiclePhoto} contentFit="cover" /> : <View style={styles.vehicleFallback}><Car size={25} color={C.gold} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{vehicle.make} {vehicle.model}</Text>
                  <Text style={styles.plate}>{vehicle.plate}</Text>
                  <Text style={styles.cardSub}>{driver ? `Assigned to ${driver.name}` : 'Driver assignment needed'}</Text>
                </View>
                <Edit3 size={17} color={C.gold} />
              </View>
              <DocumentRow label="REGISTRATION DATE" value={vehicle.registration_date || 'Not entered'} />
              <DocumentRow label="REGISTRATION EXPIRY" value={vehicle.registration_expiry || 'Not entered'} days={daysRemaining(vehicle.registration_expiry)} />
              <DocumentRow label="INSURANCE EXPIRY" value={vehicle.insurance_expiry || 'Not entered'} days={daysRemaining(vehicle.insurance_expiry)} />
              <DocumentRow label="INSPECTION EXPIRY" value={vehicle.inspection_expiry || 'Not entered'} days={daysRemaining(vehicle.inspection_expiry)} />
            </Pressable>
          );
        })}
      </ScrollView>

      <DriverComplianceModal driver={editDriver} onClose={() => setEditDriver(null)} onSaved={load} />
      <VehicleComplianceModal vehicle={editVehicle} drivers={drivers} onClose={() => setEditVehicle(null)} onSaved={load} />
    </SafeAreaView>
  );
}

function DocumentRow({ label, value, days }: { label: string; value: string; days?: number | null }) {
  const showCountdown = days !== undefined;
  const color = urgency(days ?? null);
  return (
    <View style={styles.documentRow}>
      <View style={{ flex: 1 }}><Text style={styles.documentLabel}>{label}</Text><Text style={styles.documentValue}>{value}</Text></View>
      {showCountdown ? <View style={[styles.countdown, { borderColor: color }]}><Text style={[styles.countdownText, { color }]}>{countdownLabel(days ?? null)}</Text></View> : null}
    </View>
  );
}

function DriverComplianceModal({ driver, onClose, onSaved }: { driver: any | null; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [permit, setPermit] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNumber(driver?.license_number || '');
    setExpiry(driver?.license_expiry || '');
    setPermit(driver?.permit_expiry || '');
  }, [driver]);

  const save = async () => {
    if (!driver) return;
    setBusy(true);
    try {
      await Api.adminDriverCompliance(driver.id, { license_number: number, license_expiry: expiry, permit_expiry: permit });
      onClose();
      onSaved();
    } catch (error: any) {
      Alert.alert('Unable to save', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ComplianceModal visible={!!driver} title={driver?.name || 'Driver'} onClose={onClose}>
      <Field label="DRIVER LICENSE NUMBER" value={number} onChange={setNumber} placeholder="License number" />
      <Field label="LICENSE EXPIRY (YYYY-MM-DD)" value={expiry} onChange={setExpiry} placeholder="2027-06-30" />
      <Field label="TRANSPORT PERMIT EXPIRY" value={permit} onChange={setPermit} placeholder="2027-06-30" />
      <SaveButton busy={busy} onPress={save} label="SAVE DRIVER DOCUMENTS" />
    </ComplianceModal>
  );
}

function VehicleComplianceModal({ vehicle, drivers, onClose, onSaved }: { vehicle: any | null; drivers: any[]; onClose: () => void; onSaved: () => void }) {
  const [driverId, setDriverId] = useState('');
  const [plate, setPlate] = useState('');
  const [registered, setRegistered] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [inspectionExpiry, setInspectionExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDriverId(vehicle?.driver_id || '');
    setPlate(vehicle?.plate || '');
    setRegistered(vehicle?.registration_date || '');
    setRegistrationExpiry(vehicle?.registration_expiry || '');
    setInsuranceExpiry(vehicle?.insurance_expiry || '');
    setInspectionExpiry(vehicle?.inspection_expiry || '');
  }, [vehicle]);

  const save = async () => {
    if (!vehicle || !plate) return Alert.alert('Missing plate', 'Enter the vehicle license plate.');
    setBusy(true);
    try {
      await Api.adminUpdateVehicle(vehicle.id, {
        make: vehicle.make,
        model: vehicle.model,
        plate,
        color: vehicle.color || 'Black',
        year: vehicle.year,
        photo_url: vehicle.photo_url,
        driver_id: driverId || undefined,
        registration_date: registered || undefined,
        registration_expiry: registrationExpiry || undefined,
        insurance_expiry: insuranceExpiry || undefined,
        inspection_expiry: inspectionExpiry || undefined,
      });
      onClose();
      onSaved();
    } catch (error: any) {
      Alert.alert('Unable to save', error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ComplianceModal visible={!!vehicle} title={vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'} onClose={onClose}>
      <Text style={styles.fieldLabel}>ASSIGNED DRIVER</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {drivers.map((driver) => (
          <Pressable key={driver.id} style={[styles.chip, driverId === driver.id && styles.chipActive]} onPress={() => setDriverId(driver.id)}>
            <Text style={[styles.chipText, driverId === driver.id && styles.chipTextActive]}>{driver.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Field label="LICENSE PLATE" value={plate} onChange={setPlate} placeholder="VIP K7" />
      <Field label="REGISTRATION DATE (YYYY-MM-DD)" value={registered} onChange={setRegistered} placeholder="2026-01-01" />
      <Field label="REGISTRATION EXPIRY" value={registrationExpiry} onChange={setRegistrationExpiry} placeholder="2027-01-01" />
      <Field label="INSURANCE EXPIRY" value={insuranceExpiry} onChange={setInsuranceExpiry} placeholder="2027-01-01" />
      <Field label="INSPECTION EXPIRY" value={inspectionExpiry} onChange={setInspectionExpiry} placeholder="2027-01-01" />
      <SaveButton busy={busy} onPress={save} label="SAVE VEHICLE DOCUMENTS" />
    </ComplianceModal>
  );
}

function ComplianceModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><View><Text style={styles.eyebrow}>EDIT COMPLIANCE</Text><Text style={styles.modalTitle}>{title}</Text></View><Pressable onPress={onClose} style={styles.close}><X size={20} color={C.text} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.textMuted} autoCapitalize="characters" /></View>;
}

function SaveButton({ busy, onPress, label }: { busy: boolean; onPress: () => void; label: string }) {
  return <Pressable style={styles.saveButton} onPress={onPress} disabled={busy}>{busy ? <ActivityIndicator color={C.bg} /> : <><BadgeCheck size={18} color={C.bg} /><Text style={styles.saveText}>{label}</Text></>}</Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: 100, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eyebrow: { ...T.caption, color: C.gold, fontSize: 9 },
  title: { ...T.h1, fontSize: 30 },
  reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  reminderBadgeActive: { borderColor: C.gold },
  reminderText: { fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.7 },
  description: { ...T.bodySm, marginBottom: 6 },
  sectionLabel: { ...T.caption, color: C.textSecondary, marginTop: 7 },
  card: { padding: 14, gap: 10, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, borderRadius: 15, borderCurve: 'continuous' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: C.goldMuted },
  avatarFallback: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.bgTertiary, alignItems: 'center', justifyContent: 'center' },
  vehiclePhoto: { width: 74, height: 51, borderRadius: 9, borderCurve: 'continuous', backgroundColor: C.bgTertiary },
  vehicleFallback: { width: 74, height: 51, borderRadius: 9, backgroundColor: C.bgTertiary, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: Fonts.bodySemiBold, color: C.text, fontSize: 16 },
  cardSub: { ...T.bodySm, fontSize: 11 },
  plate: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.3 },
  documentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  documentLabel: { ...T.caption, fontSize: 8 },
  documentValue: { color: C.text, fontFamily: Fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  countdown: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  countdownText: { fontFamily: Fonts.bodySemiBold, fontSize: 8, letterSpacing: 0.5 },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, backgroundColor: C.bg, borderRadius: 9, borderCurve: 'continuous' },
  assignedText: { flex: 1, color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 11 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  modalCard: { maxHeight: '90%', padding: S.md, backgroundColor: C.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderColor: C.borderLight },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { ...T.h3, fontSize: 20 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgTertiary },
  modalContent: { paddingVertical: 14, gap: 12, paddingBottom: 28 },
  field: { gap: 6 },
  fieldLabel: { ...T.caption, color: C.textSecondary, fontSize: 9 },
  input: { minHeight: 50, paddingHorizontal: 13, color: C.text, fontFamily: Fonts.body, fontSize: 14, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, borderCurve: 'continuous' },
  chipRow: { gap: 7, paddingVertical: 3 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: C.borderLight },
  chipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.12)' },
  chipText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 12 },
  chipTextActive: { color: C.gold },
  saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.gold, borderRadius: 11, borderCurve: 'continuous', marginTop: 4 },
  saveText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
});
