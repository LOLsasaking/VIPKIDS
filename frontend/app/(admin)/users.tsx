import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';
import { Api } from '@/src/api';
import { C, S, T, Fonts } from '@/src/theme';

export default function AdminUsers() {
  const [tab, setTab] = useState<'parents' | 'drivers' | 'children'>('children');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'children') setData(await Api.adminChildren());
      else setData(await Api.adminUsers(tab === 'parents' ? 'parent' : 'driver'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab]);

  const remove = (id: string, label: string) => {
    Alert.alert('Remove', `Remove ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          if (tab === 'children') await Api.adminDeleteChild(id);
          else await Api.adminDeleteUser(id);
          load();
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={{ padding: S.md }}>
        <Text style={[T.h2, { fontSize: 24, marginBottom: S.sm }]}>Manage</Text>
        <View style={styles.tabs}>
          {(['children', 'parents', 'drivers'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} testID={`admin-tab-${t}`}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.gold} /> : (
        <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xxxl }}>
          {data.map((u: any) => (
            <View key={u.id} style={styles.row}>
              {u.photo_url ? <Image source={{ uri: u.photo_url }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: C.bgTertiary }]} />}
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <Text style={styles.name}>{u.name}</Text>
                {tab === 'children' && (
                  <Text style={styles.sub}>
                    {u.school} · {u.driver?.name || 'No driver'} · {u.vehicle?.make || ''} {u.vehicle?.model || ''}
                  </Text>
                )}
                {tab !== 'children' && <Text style={styles.sub}>{u.email}{u.phone ? ` · ${u.phone}` : ''}</Text>}
              </View>
              <TouchableOpacity onPress={() => remove(u.id, u.name)} testID={`delete-${u.id}`}>
                <Trash2 size={16} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}
          {data.length === 0 && <Text style={[T.bodySm, { textAlign: 'center', padding: S.lg }]}>No records.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center' },
  tabActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  tabText: { color: C.textSecondary, fontFamily: Fonts.bodyMedium, fontSize: 11, letterSpacing: 1 },
  tabTextActive: { color: C.gold },
  row: { flexDirection: 'row', alignItems: 'center', padding: S.sm, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  av: { width: 44, height: 44, borderRadius: 22 },
  name: { ...T.body, fontSize: 14, fontFamily: Fonts.bodyMedium },
  sub: { ...T.bodySm, fontSize: 11 },
});
