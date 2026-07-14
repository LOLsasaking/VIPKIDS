import { Tabs, Redirect } from 'expo-router';
import { BadgeCheck, LayoutDashboard, Users, Megaphone } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import { C, Fonts } from '@/src/theme';

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bgSecondary, borderTopColor: C.border, borderTopWidth: 1, height: 72, paddingTop: 8, paddingBottom: 14 },
      tabBarActiveTintColor: C.gold,
      tabBarInactiveTintColor: C.textMuted,
      tabBarLabelStyle: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color }) => <LayoutDashboard size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Users', tabBarIcon: ({ color }) => <Users size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="compliance" options={{ title: 'Compliance', tabBarIcon: ({ color }) => <BadgeCheck size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="announce" options={{ title: 'Announce', tabBarIcon: ({ color }) => <Megaphone size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="operations" options={{ href: null }} />
    </Tabs>
  );
}
