import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Check, Circle, Phone, ShieldCheck, Snowflake, Sofa, Star } from 'lucide-react-native';
import { C, Fonts, S, T } from '@/src/theme';

const DEFAULT_SUV_IMAGE = require('../../assets/images/vip-black-suv-3d.png');

type Props = {
  driver: any;
  vehicle?: any;
  heading?: string;
};

export default function DriverVehicleProfile({ driver, vehicle, heading = 'EXECUTIVE DRIVER' }: Props) {
  if (!driver) return null;
  const firstName = driver.name?.split(' ')[0] || 'Driver';
  const vehicleName = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ');

  return (
    <View style={styles.card} testID="driver-vehicle-profile">
      <Text style={styles.eyebrow}>{heading}</Text>

      <View style={styles.hero}>
        <Image
          source={driver.photo_url ? { uri: driver.photo_url } : undefined}
          style={styles.driverPhoto}
          contentFit="cover"
          transition={160}
          accessibilityLabel={`${driver.name} profile photo`}
        />
        <View style={styles.heroCopy}>
          <Text style={styles.firstName}>{firstName}</Text>
          <View style={styles.divider} />
          <ServicePoint icon={Check} title="Professional & Reliable" detail="Commitment to safety and comfort." />
          <ServicePoint icon={Circle} title="Experienced Driver" detail="Focused on exceptional service." />
          <ServicePoint icon={Star} title="Client First" detail="Your ride. Your priority." />
        </View>
      </View>

      <View style={styles.vehicleCard}>
        <View style={styles.vehicleTitleBlock}>
          <Text style={styles.vehicleEyebrow}>ASSIGNED VEHICLE</Text>
          <Text style={styles.vehicleName}>{vehicleName || 'Vehicle assignment pending'}</Text>
          <View style={styles.vehicleRule} />
          <View style={styles.featureRow}><Sofa size={16} color={C.bg} /><Text style={styles.featureText}>Spacious {vehicle?.seats || 7} seats</Text></View>
          <View style={styles.featureRow}><ShieldCheck size={16} color={C.bg} /><Text style={styles.featureText}>Premium comfort</Text></View>
          <View style={styles.featureRow}><Snowflake size={16} color={C.bg} /><Text style={styles.featureText}>Clean & maintained</Text></View>
        </View>
        <View style={styles.vehicleVisual}>
          <Image
            source={vehicle?.photo_url || DEFAULT_SUV_IMAGE}
            style={styles.vehiclePhoto}
            contentFit="contain"
            transition={180}
            accessibilityLabel={vehicleName || 'Assigned black SUV'}
          />
          <View style={styles.plate}>
            <Text style={styles.plateLabel}>LICENSE PLATE</Text>
            <Text style={styles.plateValue}>{vehicle?.plate || 'PENDING'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label="Name" value={driver.name} />
        <InfoRow label="Cell phone" value={driver.phone || 'Not available'} onPress={driver.phone ? () => Linking.openURL(`tel:${driver.phone}`) : undefined} />
        <InfoRow label="License" value={driver.license_number || 'On file'} />
        <InfoRow label="Make" value={vehicle?.make || 'Pending'} />
        <InfoRow label="Model" value={vehicle?.model || 'Pending'} />
        <InfoRow label="Color" value={vehicle?.color || 'Black'} />
        <InfoRow label="Plate" value={vehicle?.plate || 'Pending'} last />
      </View>

      <View style={styles.footerMark}>
        <View style={styles.footerLine} />
        <View style={styles.footerCheck}><ShieldCheck size={17} color={C.bg} /></View>
        <Text style={styles.footerText}>PREMIUM SERVICE · EVERY RIDE</Text>
        <View style={styles.footerLine} />
      </View>
    </View>
  );
}

function ServicePoint({ icon: Icon, title, detail }: { icon: any; title: string; detail: string }) {
  return (
    <View style={styles.servicePoint}>
      <View style={styles.serviceIcon}><Icon size={16} color={C.bg} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.serviceTitle}>{title}</Text>
        <Text style={styles.serviceDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value, onPress, last = false }: { label: string; value: string; onPress?: () => void; last?: boolean }) {
  const content = (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, onPress && styles.infoLink]} numberOfLines={2}>{value}</Text>
      {onPress ? <Phone size={14} color={C.gold} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.gold, borderRadius: 22, padding: S.md, overflow: 'hidden' },
  eyebrow: { ...T.caption, color: C.gold, textAlign: 'center', letterSpacing: 3, marginBottom: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 16 },
  driverPhoto: { width: 138, height: 138, borderRadius: 69, backgroundColor: C.bgTertiary, borderWidth: 1, borderColor: C.gold },
  heroCopy: { flex: 1 },
  firstName: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 31, lineHeight: 37 },
  divider: { height: 1, backgroundColor: C.goldMuted, marginVertical: 7 },
  servicePoint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  serviceIcon: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.gold },
  serviceTitle: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  serviceDetail: { color: C.goldMuted, fontFamily: Fonts.body, fontSize: 9, lineHeight: 12 },
  vehicleCard: { minHeight: 252, borderRadius: 16, backgroundColor: C.gold, overflow: 'hidden', flexDirection: 'row' },
  vehicleTitleBlock: { width: '42%', padding: 15, zIndex: 2 },
  vehicleEyebrow: { ...T.caption, color: C.bg, fontSize: 8, letterSpacing: 2 },
  vehicleName: { color: C.bg, fontFamily: Fonts.bodySemiBold, fontSize: 22, lineHeight: 25, textTransform: 'uppercase', marginTop: 12 },
  vehicleRule: { height: 1, backgroundColor: C.bg, marginVertical: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  featureText: { color: C.bg, fontFamily: Fonts.body, fontSize: 10, flex: 1 },
  vehicleVisual: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  vehiclePhoto: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  plate: { alignSelf: 'stretch', margin: 11, marginLeft: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: C.bg, alignItems: 'center' },
  plateLabel: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 7, letterSpacing: 1.5 },
  plateValue: { color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 18, letterSpacing: 1.2, marginTop: 2 },
  infoCard: { marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: C.goldMuted, overflow: 'hidden', backgroundColor: C.bg },
  infoRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.goldMuted },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { width: 86, color: C.gold, fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  infoValue: { flex: 1, color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 12, textTransform: 'uppercase' },
  infoLink: { color: C.gold },
  footerMark: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  footerLine: { height: 1, flex: 1, backgroundColor: C.gold },
  footerCheck: { width: 31, height: 31, borderRadius: 16, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  footerText: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 8, letterSpacing: 1.8 },
});
