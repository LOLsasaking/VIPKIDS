import { Redirect, Tabs } from 'expo-router';
import { LocateFixed, User } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import { C, Fonts } from '@/src/theme';

export default function ChildLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'child') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bgSecondary,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 72,
          paddingTop: 8,
          paddingBottom: 14,
        },
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.textMuted,
        tabBarLabelStyle: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'My Ride', tabBarIcon: ({ color }) => <LocateFixed size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
