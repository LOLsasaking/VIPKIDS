import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, Car, ChevronRight, Clock, MapPin, Navigation, Phone, Plus, ShieldCheck, X } from 'lucide-react-native';
import { Api } from '@/src/api';
import BrandLogo from '@/src/components/BrandLogo';
import { C, Fonts, S, T } from '@/src/theme';

export default function ParentHome() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showAddChild, setShowAddChild] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [dashboard, updates] = await Promise.all([Api.parentDashboard(), Api.notifications()]);
      setData(dashboard);
      setNotifications(updates);
    } catch (err: any) {
      setError(err.message || 'Unable to load today’s route.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 8000);
    return () => clearInterval(poll);
  }, [load]);

  if (loading) {
    return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;
  }

  const children = data?.children || [];
  const announcements = data?.announcements || [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={C.gold} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <BrandLogo compact width={42} />
            <View>
              <Text style={styles.greeting}>Good day</Text>
              <Text style={styles.brand}>VIP KIDS</Text>
              <Text style={styles.concierge}>PRIVATE SCHOOL CHAUFFEUR</Text>
            </View>
          </View>
          <View style={styles.statusBadge} testID="verified-service-badge">
            <ShieldCheck size={14} color={C.gold} strokeWidth={1.8} />
            <Text style={styles.statusText}>VERIFIED SERVICE</Text>
          </View>
        </View>

        {announcements[0] && (
          <View style={styles.announcement} testID="announcement-card">
            <Bell size={17} color={C.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.announcementLabel}>CONCIERGE UPDATE</Text>
              <Text style={styles.announcementTitle}>{announcements[0].title}</Text>
              <Text style={styles.announcementBody}>{announcements[0].body}</Text>
            </View>
          </View>
        )}

        {notifications.length > 0 ? (
          <View style={styles.updatesCard} testID="parent-safety-updates">
            <View style={styles.updatesHeader}>
              <View style={styles.updatesTitleRow}><Bell size={16} color={C.gold} /><Text style={styles.updatesTitle}>LIVE SAFETY UPDATES</Text></View>
              <Text style={styles.unreadCount}>{notifications.filter((item) => !item.read).length} NEW</Text>
            </View>
            {notifications.slice(0, 3).map((item) => {
              const isAbsent = item.type === 'no_show';
              const isPositive = ['picked_up', 'arrived_school', 'arriving_home', 'arrived_home', 'route_completed'].includes(item.type);
              const color = isAbsent ? C.danger : isPositive ? C.success : C.gold;
              return (
                <Pressable key={item.id} style={styles.updateRow} onPress={() => !item.read && Api.markNotificationRead(item.id).then(load).catch(() => {})}>
                  <View style={[styles.updateDot, { backgroundColor: color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.updateHeadline, { color }]}>{item.title || item.type?.replace(/_/g, ' ')}</Text>
                    <Text style={styles.updateBody}>{item.body || item.message}</Text>
                    <Text style={styles.updateTime}>{item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'NOW'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>TODAY’S ASSIGNED ROUTE</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</Text>
        </View>

        <Pressable style={styles.addChildButton} onPress={() => setShowAddChild(true)} testID="parent-add-child-button">
          <Plus size={18} color={C.bg} />
          <Text style={styles.addChildText}>ADD CHILD LOGIN</Text>
        </Pressable>

        {error && (
          <Pressable style={styles.error} onPress={load}>
            <Text style={styles.errorTitle}>Route temporarily unavailable</Text>
            <Text style={styles.errorBody}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {children.map((child: any) => (
          <Pressable
            key={child.id}
            testID={`child-card-${child.id}`}
            style={({ pressed }) => [styles.routeCard, pressed && { opacity: 0.88 }]}
            onPress={() => router.push({ pathname: '/(parent)/map', params: { childId: child.id } })}
            onLongPress={() => router.push({ pathname: '/(parent)/child/[id]', params: { id: child.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Track ${child.name}'s assigned route`}
          >
            <View style={styles.routeTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.school}>{child.school}</Text>
              </View>
              <View style={styles.eventChip}>
                <View style={styles.liveDot} />
                <Text style={styles.eventText}>{child.latest_event?.event_type?.replace(/_/g, ' ').toUpperCase() || 'SCHEDULED'}</Text>
              </View>
            </View>

            <View style={styles.routeTimeline}>
              <View style={styles.rail}><View style={styles.originDot} /><View style={styles.line} /><View style={styles.destinationSquare} /></View>
              <View style={{ flex: 1, gap: 16 }}>
                <View><Text style={styles.stopLabel}>PICKUP · {child.pickup_time}</Text><Text style={styles.stopText}>{child.home_address || 'Home'}</Text></View>
                <View><Text style={styles.stopLabel}>SCHOOL ARRIVAL · {child.dropoff_time}</Text><Text style={styles.stopText}>{child.school_address || child.school}</Text></View>
              </View>
            </View>

            <View style={styles.driverSection}>
              {child.driver?.photo_url && <Image source={{ uri: child.driver.photo_url }} style={styles.driverPhoto} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.driverCaption}>YOUR DEDICATED DRIVER</Text>
                <Text style={styles.driverName}>{child.driver?.name || 'Assignment pending'}</Text>
                <Text style={styles.vehicle}>{child.vehicle ? `${child.vehicle.color || 'Black'} ${child.vehicle.make} ${child.vehicle.model} · ${child.vehicle.plate}` : 'Vehicle assignment pending'}</Text>
              </View>
              <ChevronRight size={21} color={C.gold} />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.meta}><Car size={14} color={C.gold} /><Text style={styles.metaText}>Assigned vehicle</Text></View>
              <View style={styles.meta}><Clock size={14} color={C.gold} /><Text style={styles.metaText}>{child.pickup_time}–{child.dropoff_time}</Text></View>
              <View style={styles.meta}><MapPin size={14} color={C.gold} /><Text style={styles.metaText}>Live GPS</Text></View>
            </View>

            <Pressable style={styles.emergencyLink} onPress={() => router.push({ pathname: '/(parent)/child/[id]', params: { id: child.id } })} testID={`emergency-contact-${child.id}`}>
              <Phone size={14} color={C.gold} />
              <Text style={styles.emergencyLinkText}>VIEW EMERGENCY CONTACT</Text>
              <ChevronRight size={16} color={C.gold} />
            </Pressable>

            <View style={styles.trackButton}>
              <Navigation size={17} color={C.bg} fill={C.bg} />
              <Text style={styles.trackText}>VIEW LIVE ROUTE</Text>
            </View>
          </Pressable>
        ))}

        {children.length === 0 && !error && (
          <View style={styles.empty}><Text style={styles.emptyText}>No child has been added yet. Add your child, then VIP admin will assign the dedicated driver and vehicle.</Text></View>
        )}
      </ScrollView>
      <AddChildModal
        visible={showAddChild}
        onClose={() => setShowAddChild(false)}
        onCreated={() => {
          setShowAddChild(false);
          load();
        }}
      />
    </SafeAreaView>
  );
}

function AddChildModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [pickupTime, setPickupTime] = useState('07:30');
  const [dropoffTime, setDropoffTime] = useState('15:30');
  const [homeAddress, setHomeAddress] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [grade, setGrade] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [childEmail, setChildEmail] = useState('');
  const [childPassword, setChildPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setSchool('');
    setPickupTime('07:30');
    setDropoffTime('15:30');
    setHomeAddress('');
    setSchoolAddress('');
    setGrade('');
    setEmergencyName('');
    setEmergencyPhone('');
    setChildEmail('');
    setChildPassword('');
  };

  const submit = async () => {
    const normalizedEmail = childEmail.trim().toLowerCase();
    if (!name.trim() || !school.trim() || !homeAddress.trim() || !schoolAddress.trim()) {
      return Alert.alert('Missing child details', 'Enter the child name, school, home pickup address, and school address.');
    }
    if (!normalizedEmail || childPassword.length < 8) {
      return Alert.alert('Child login needed', 'Enter the child email and a password with at least 8 characters.');
    }
    setBusy(true);
    try {
      await Api.parentCreateChild({
        name: name.trim(),
        school: school.trim(),
        pickup_time: pickupTime.trim(),
        dropoff_time: dropoffTime.trim(),
        home_address: homeAddress.trim(),
        school_address: schoolAddress.trim(),
        grade: grade.trim() || undefined,
        emergency_contact_name: emergencyName.trim() || undefined,
        emergency_contact_phone: emergencyPhone.trim() || undefined,
        child_email: normalizedEmail,
        child_password: childPassword,
        round_trip: true,
      });
      reset();
      Alert.alert('Child added', 'The child login is ready. VIP admin can now assign the dedicated driver and vehicle.');
      onCreated();
    } catch (err: any) {
      Alert.alert('Unable to add child', err.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalKicker}>PARENT SETUP</Text>
            <Text style={styles.modalTitle}>Add child login</Text>
          </View>
          <Pressable onPress={onClose} style={styles.iconButton} accessibilityLabel="Close add child">
            <X size={20} color={C.gold} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <ModalField label="CHILD NAME" value={name} onChangeText={setName} autoComplete="name" />
          <ModalField label="SCHOOL NAME" value={school} onChangeText={setSchool} />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}><ModalField label="PICKUP" value={pickupTime} onChangeText={setPickupTime} placeholder="07:30" /></View>
            <View style={{ flex: 1 }}><ModalField label="DROPOFF" value={dropoffTime} onChangeText={setDropoffTime} placeholder="15:30" /></View>
          </View>
          <ModalField label="HOME PICKUP ADDRESS" value={homeAddress} onChangeText={setHomeAddress} autoComplete="street-address" />
          <ModalField label="SCHOOL ADDRESS" value={schoolAddress} onChangeText={setSchoolAddress} />
          <ModalField label="GRADE (OPTIONAL)" value={grade} onChangeText={setGrade} />
          <ModalField label="EMERGENCY CONTACT NAME" value={emergencyName} onChangeText={setEmergencyName} />
          <ModalField label="EMERGENCY CONTACT PHONE" value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" autoComplete="tel" />
          <View style={styles.loginBox}>
            <Text style={styles.loginBoxTitle}>Child sign-in</Text>
            <Text style={styles.loginBoxCopy}>This is the email and password your child will use to track only their own assigned driver.</Text>
            <ModalField label="CHILD EMAIL" value={childEmail} onChangeText={setChildEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <ModalField label="CHILD PASSWORD" value={childPassword} onChangeText={setChildPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
          </View>
          <Pressable style={[styles.modalPrimary, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy} testID="parent-add-child-submit">
            {busy ? <ActivityIndicator color={C.bg} /> : <Text style={styles.modalPrimaryText}>CREATE CHILD LOGIN</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ModalField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} style={styles.fieldInput} placeholderTextColor={C.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: 96 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 6, marginBottom: 22 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { ...T.bodySm, color: C.textMuted },
  brand: { fontSize: 31, fontFamily: Fonts.display, color: C.gold, letterSpacing: 3 },
  concierge: { ...T.caption, fontSize: 8, color: C.accent, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: C.gold, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  statusText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 9, letterSpacing: 0.8 },
  announcement: { flexDirection: 'row', gap: 11, backgroundColor: C.bgSecondary, borderRadius: 13, padding: 15, borderLeftWidth: 3, borderLeftColor: C.gold, marginBottom: 22 },
  announcementLabel: { ...T.caption, color: C.gold, fontSize: 9 },
  announcementTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text, marginTop: 4 },
  announcementBody: { ...T.bodySm, marginTop: 3 },
  updatesCard: { marginBottom: 22, overflow: 'hidden', backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border, borderRadius: 14, borderCurve: 'continuous' },
  updatesHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  updatesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  updatesTitle: { ...T.caption, color: C.gold, fontSize: 9 },
  unreadCount: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.8 },
  updateRow: { minHeight: 66, flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  updateDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  updateHeadline: { fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  updateBody: { ...T.bodySm, fontSize: 11, marginTop: 1 },
  updateTime: { color: C.textMuted, fontFamily: Fonts.bodyMedium, fontSize: 9, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  sectionLabel: { ...T.caption, color: C.textSecondary },
  date: { ...T.caption, fontSize: 9, color: C.gold },
  addChildButton: { minHeight: 46, borderRadius: 10, backgroundColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
  addChildText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 1 },
  error: { backgroundColor: 'rgba(239,68,68,.12)', borderColor: C.danger, borderWidth: 1, padding: 15, borderRadius: 12 },
  errorTitle: { fontFamily: Fonts.bodySemiBold, color: C.danger },
  errorBody: { ...T.bodySm, color: C.danger, marginTop: 3 },
  routeCard: { backgroundColor: C.bgSecondary, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  routeTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  childName: { ...T.h3, fontSize: 19 },
  school: { ...T.bodySm, marginTop: 1 },
  eventChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(212,175,55,.12)', borderColor: C.gold, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, maxWidth: 112 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  eventText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 8, letterSpacing: 0.5 },
  routeTimeline: { flexDirection: 'row', gap: 12, marginTop: 18, padding: 13, backgroundColor: C.bg, borderRadius: 10 },
  rail: { width: 14, alignItems: 'center', paddingVertical: 3 },
  originDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.gold },
  line: { width: 1, flex: 1, backgroundColor: C.goldMuted, marginVertical: 3 },
  destinationSquare: { width: 8, height: 8, backgroundColor: C.gold },
  stopLabel: { ...T.caption, fontSize: 8, color: C.gold },
  stopText: { ...T.bodySm, color: C.text, marginTop: 2 },
  driverSection: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, paddingTop: 15, borderTopColor: C.border, borderTopWidth: 1 },
  driverPhoto: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bgTertiary },
  driverCaption: { ...T.caption, fontSize: 8, color: C.gold },
  driverName: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text, marginTop: 1 },
  vehicle: { ...T.bodySm, fontSize: 11, marginTop: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 13 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...T.bodySm, fontSize: 10 },
  emergencyLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, marginBottom: 10, borderWidth: 1, borderColor: C.goldMuted, borderRadius: 9, borderCurve: 'continuous' },
  emergencyLinkText: { flex: 1, color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 9, letterSpacing: 0.9 },
  trackButton: { minHeight: 48, borderRadius: 10, backgroundColor: C.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  trackText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.4 },
  empty: { padding: 28, backgroundColor: C.bgSecondary, borderRadius: 14 },
  emptyText: { ...T.bodySm, textAlign: 'center' },
  modalRoot: { flex: 1, backgroundColor: C.bg },
  modalHeader: { minHeight: 74, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalKicker: { ...T.caption, color: C.gold, fontSize: 9 },
  modalTitle: { ...T.h2, fontSize: 24, lineHeight: 30 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: 18, paddingBottom: 44, gap: 13 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1 },
  fieldInput: { minHeight: 50, borderWidth: 1, borderColor: C.borderLight, borderRadius: 10, paddingHorizontal: 13, color: C.text, backgroundColor: C.bgSecondary, fontFamily: Fonts.body, fontSize: 15 },
  twoCol: { flexDirection: 'row', gap: 10 },
  loginBox: { gap: 11, borderWidth: 1, borderColor: C.goldMuted, backgroundColor: 'rgba(212,175,55,.08)', padding: 13, borderRadius: 12, marginTop: 4 },
  loginBoxTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 15 },
  loginBoxCopy: { ...T.bodySm, fontSize: 11 },
  modalPrimary: { minHeight: 54, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalPrimaryText: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 12, letterSpacing: 1.1 },
});
