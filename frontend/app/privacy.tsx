import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react-native';
import { C, Fonts, S, T } from '@/src/theme';

const PRIVACY_CONTACT = process.env.EXPO_PUBLIC_PRIVACY_CONTACT || 'gonxander@gmail.com';

const SECTIONS = [
  {
    title: 'Information we process',
    body: 'We process account and contact details, assigned child transportation records, school and pickup addresses, schedules, attendance events, driver and vehicle information, messages, emergency contacts, notification preferences, and profile photos that an adult chooses to provide.',
  },
  {
    title: 'Precise route location',
    body: 'During an active route, the driver app processes precise location approximately every five seconds, including while the app is in the background or Google Maps is open. Assigned families and authorized VIP Kids operations staff use this information for live route tracking, transportation coordination, and safety. Tracking stops when the driver ends the route.',
  },
  {
    title: 'How information is used',
    body: 'Information is used to approve and secure accounts, assign children to dedicated drivers and vehicles, operate routes, communicate pickup and absence events, respond to emergencies, maintain vehicle and driver compliance records, and provide customer support. We do not sell personal information or use it for third-party advertising.',
  },
  {
    title: 'Service providers and sharing',
    body: 'Information is shared only as needed with the assigned parent, assigned driver, authorized VIP Kids administrators, and contracted hosting, database, mapping, routing, notification, and security providers. Route coordinates may be processed by mapping or routing providers to display or navigate the assigned trip.',
  },
  {
    title: 'Children’s information',
    body: 'Approved parents can create child transportation records and restricted child sign-ins for children they are authorized to represent. Administrators can review those records and assign the dedicated driver and vehicle. A child sign-in is restricted to that child’s assigned ride status, assigned driver and vehicle, emergency contact, and fresh live vehicle location while the route is active. It cannot access other children, family addresses, route stops, messages, schedules, or administrative controls.',
  },
  {
    title: 'Retention and security',
    body: 'We retain information only while needed to provide transportation services, meet safety and legal obligations, resolve disputes, and maintain required records. Current live vehicle locations expire quickly; longer-lived route, attendance, message, and compliance records follow the documented business retention schedule. We use access controls, encrypted network connections, password hashing, and role-based authorization.',
  },
  {
    title: 'Your choices and deletion',
    body: 'Parents and drivers can update notification preferences, sign out, and permanently delete their account from Profile. A child can delete the restricted child sign-in without deleting the transportation record controlled by the parent and administrator. The public Delete Account page also accepts deletion requests for pending or suspended accounts. Some records may be retained only when required by law, with access restricted for that purpose.',
  },
];

export default function PrivacyPolicy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/login')} accessibilityLabel="Go back">
          <ArrowLeft size={18} color={C.gold} />
          <Text style={styles.backText}>BACK</Text>
        </Pressable>
        <View style={styles.heroIcon}><ShieldCheck size={29} color={C.gold} /></View>
        <Text style={styles.eyebrow}>VIP KIDS TRANSPORTATION</Text>
        <Text style={styles.title}>Privacy & Data Use</Text>
        <Text style={styles.updated}>Effective July 14, 2026</Text>
        <Text style={styles.intro}>
          This notice explains how VIP Kids Transportation handles information in its parent, driver, restricted child, and administrative applications.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.contactCard}>
          <Mail size={18} color={C.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>Privacy questions</Text>
            <Pressable onPress={() => Linking.openURL(`mailto:${PRIVACY_CONTACT}`)} accessibilityRole="link">
              <Text style={styles.contactEmail}>{PRIVACY_CONTACT}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.lg, paddingBottom: S.xxxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.3 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.08)', marginTop: S.md },
  eyebrow: { ...T.caption, color: C.gold, marginTop: S.md },
  title: { ...T.h1, fontSize: 36, marginTop: 4 },
  updated: { color: C.textMuted, fontFamily: Fonts.bodyMedium, fontSize: 11, marginTop: 5 },
  intro: { ...T.body, color: C.textSecondary, lineHeight: 23, marginTop: S.md, marginBottom: 4 },
  section: { paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  sectionTitle: { ...T.h2, fontSize: 19, color: C.gold },
  body: { ...T.bodySm, color: C.textSecondary, lineHeight: 21, marginTop: 7 },
  contactCard: { flexDirection: 'row', gap: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: S.md, backgroundColor: C.bgSecondary, marginTop: S.lg },
  contactTitle: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 13 },
  contactEmail: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 13, marginTop: 2 },
});
