import { Tabs, Redirect } from 'expo-router';
import { Route, MessageCircle, User } from 'lucide-react-native';
import { useAuth } from '@/src/auth';
import { C, Fonts } from '@/src/theme';

export default function DriverLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'driver') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bgSecondary, borderTopColor: C.border, borderTopWidth: 1, height: 72, paddingTop: 8, paddingBottom: 14 },
      tabBarActiveTintColor: C.gold,
      tabBarInactiveTintColor: C.textMuted,
      tabBarLabelStyle: { fontFamily: Fonts.bodyMedium, fontSize: 10, letterSpacing: 0.8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Route', tabBarIcon: ({ color }) => <Route size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} strokeWidth={1.6} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} strokeWidth={1.6} /> }} />
    </Tabs>
  );
}
