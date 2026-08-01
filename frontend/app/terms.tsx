import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, FileCheck2 } from 'lucide-react-native';
import { C, Fonts, S, T } from '@/src/theme';

const SECTIONS = [
  ['Service', 'VIP Kids Transportation coordinates prearranged transportation between approved families and assigned drivers. The app does not let a child or parent request an on-demand ride or select another driver. Service is subject to consultation, approval, route availability, and a separate transportation agreement.'],
  ['Accounts and consent', 'You must provide accurate information and protect your sign-in. A parent creating a child record or restricted child login confirms that they are the child’s parent or authorized guardian and consent to the processing needed to provide transportation and safety features.'],
  ['Location and notifications', 'During an active route, the driver device shares precise location with assigned families and authorized operations staff. Map position and notifications can be delayed by connectivity, device settings, or platform delivery and must not be treated as the only emergency system.'],
  ['Safety and emergencies', 'Drivers must complete required pre-route checks and follow applicable law and company procedures. In an emergency, call 911 or the appropriate local emergency service first. The in-app SOS and messaging features supplement, but do not replace, emergency services.'],
  ['Acceptable use', 'Do not impersonate another person, access another family’s data, interfere with location tracking, submit false attendance events, misuse emergency tools, or attempt to bypass account approval and security controls.'],
  ['Availability', 'The service may be interrupted for maintenance, network failures, severe weather, school changes, safety concerns, or events outside reasonable control. Transportation-specific cancellations, fees, and liability terms belong in the signed service agreement.'],
  ['Ending access', 'You may delete eligible accounts through Profile or the public deletion process. VIP Kids may suspend access for safety, fraud, noncompliance, or violation of these terms. Some operational records may be retained where legally required.'],
];

export default function Terms() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/login')} accessibilityLabel="Go back">
          <ArrowLeft size={18} color={C.gold} /><Text style={styles.backText}>BACK</Text>
        </Pressable>
        <View style={styles.icon}><FileCheck2 size={29} color={C.gold} /></View>
        <Text style={styles.eyebrow}>VIP KIDS TRANSPORTATION</Text>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Draft effective August 1, 2026</Text>
        <Text style={styles.intro}>These terms govern use of the VIP Kids Transportation app. The signed transportation service agreement controls pricing, schedules, cancellations, insurance, and service-specific obligations.</Text>
        {SECTIONS.map(([title, text]) => <View key={title} style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.body}>{text}</Text></View>)}
        <Text style={styles.review}>This draft must be reviewed and approved by VIP Kids Transportation’s qualified legal counsel before public launch.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.lg, paddingBottom: S.xxxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, alignSelf: 'flex-start' },
  backText: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.3 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,175,55,.08)', marginTop: S.md },
  eyebrow: { ...T.caption, color: C.gold, marginTop: S.md },
  title: { ...T.h1, fontSize: 36, marginTop: 4 },
  updated: { color: C.textMuted, fontFamily: Fonts.bodyMedium, fontSize: 11, marginTop: 5 },
  intro: { ...T.body, color: C.textSecondary, lineHeight: 23, marginTop: S.md },
  section: { paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  sectionTitle: { ...T.h2, fontSize: 19, color: C.gold },
  body: { ...T.bodySm, color: C.textSecondary, lineHeight: 21, marginTop: 7 },
  review: { ...T.bodySm, color: C.textMuted, lineHeight: 20, marginTop: S.lg, fontStyle: 'italic' },
});
