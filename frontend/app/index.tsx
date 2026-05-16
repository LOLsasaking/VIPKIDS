/**
 * Splash/router — redirects based on auth + role.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth';
import { C, T, Fonts } from '@/src/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.role === 'parent') {
      router.replace('/(parent)');
    } else if (user.role === 'driver') {
      router.replace('/(driver)');
    } else if (user.role === 'admin') {
      router.replace('/(admin)');
    }
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Text style={[T.h1, { color: C.gold, letterSpacing: 3 }]}>VIP KIDS</Text>
      <Text style={[T.caption, { marginTop: 8, color: C.textSecondary }]}>
        Private School Chauffeur
      </Text>
      <ActivityIndicator color={C.gold} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
