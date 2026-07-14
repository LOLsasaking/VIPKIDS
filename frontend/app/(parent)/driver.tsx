import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Api } from '@/src/api';
import DriverVehicleProfile from '@/src/components/DriverVehicleProfile';
import { C, Fonts, S, T } from '@/src/theme';

export default function ParentDriver() {
  const [children, setChildren] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Api.parentChildren()
      .then((items) => {
        setChildren(items);
        setSelectedDriverId(items.find((item) => item.driver)?.driver?.id || null);
      })
      .finally(() => setLoading(false));
  }, []);

  const assignments = useMemo(() => {
    const unique = new Map<string, any>();
    children.forEach((child) => {
      if (!child.driver?.id) return;
      const current = unique.get(child.driver.id);
      if (current) current.children.push(child);
      else unique.set(child.driver.id, { driver: child.driver, vehicle: child.vehicle, children: [child] });
    });
    return Array.from(unique.values());
  }, [children]);
  const selected = assignments.find((item) => item.driver.id === selectedDriverId) || assignments[0];

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR DEDICATED CHAUFFEUR</Text>
        <Text style={styles.title}>Driver</Text>
        <Text style={styles.subtitle}>Verified identity and assigned vehicle information for your children’s route.</Text>

        {assignments.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerList}>
            {assignments.map((assignment) => (
              <Pressable
                key={assignment.driver.id}
                style={[styles.picker, selected?.driver.id === assignment.driver.id && styles.pickerActive]}
                onPress={() => setSelectedDriverId(assignment.driver.id)}
              >
                <Image source={{ uri: assignment.driver.photo_url }} style={styles.pickerPhoto} />
                <View>
                  <Text style={styles.pickerName}>{assignment.driver.name}</Text>
                  <Text style={styles.pickerKids}>{assignment.children.map((child: any) => child.name.split(' ')[0]).join(' & ')}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {selected ? (
          <>
            <View style={styles.assignmentBanner}>
              <Text style={styles.assignmentLabel}>ASSIGNED TO</Text>
              <Text style={styles.assignmentNames}>{selected.children.map((child: any) => child.name).join(' · ')}</Text>
            </View>
            <DriverVehicleProfile driver={selected.driver} vehicle={selected.vehicle} />
          </>
        ) : (
          <View style={styles.empty}><Text style={styles.emptyText}>A driver profile will appear after your concierge confirms the assignment.</Text></View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: S.md, paddingBottom: 100 },
  eyebrow: { ...T.caption, color: C.gold },
  title: { ...T.h1, fontSize: 34, marginTop: 2 },
  subtitle: { ...T.bodySm, marginTop: 3, marginBottom: 16 },
  pickerList: { gap: 8, paddingBottom: 14 },
  picker: { minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8, borderRadius: 12, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.border },
  pickerActive: { borderColor: C.gold },
  pickerPhoto: { width: 38, height: 38, borderRadius: 19 },
  pickerName: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 12 },
  pickerKids: { color: C.gold, fontFamily: Fonts.bodyMedium, fontSize: 9, marginTop: 1 },
  assignmentBanner: { padding: 11, backgroundColor: 'rgba(212,175,55,.1)', borderWidth: 1, borderColor: C.goldMuted, borderRadius: 11, marginBottom: 12 },
  assignmentLabel: { ...T.caption, color: C.gold, fontSize: 8 },
  assignmentNames: { color: C.text, fontFamily: Fonts.bodySemiBold, fontSize: 13, marginTop: 2 },
  empty: { padding: 24, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  emptyText: { ...T.bodySm, textAlign: 'center' },
});
