/**
 * Auth context — manages JWT token + current user across the app.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/src/utils/storage';
import { Api, TOKEN_KEY } from './api';
import { DemoRole, demoModeEnabled, demoRoleForCredentials, demoRoleFromToken, demoTokenFor, getDemoUser, isDemoToken } from './demo';
import { clearQueuedCheckins } from './offlineCheckins';
import { registerForPushNotificationsAsync } from './pushNotifications';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'parent' | 'driver' | 'child' | 'admin';
  child_id?: string;
  phone?: string;
  photo_url?: string;
  notif_prefs?: any;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  demoLogin: (role: DemoRole) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const syncPushToken = useCallback(async () => {
    try {
      const registration = await registerForPushNotificationsAsync();
      if (registration) await Api.registerPushToken(registration);
    } catch (error) {
      console.warn('Push notification registration failed', error);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    const token = (await storage.secureGet(TOKEN_KEY, '')) || '';
    if (token) {
      if (isDemoToken(token) && demoModeEnabled()) {
        setUser(getDemoUser(demoRoleFromToken(token)) as User);
        setLoading(false);
        return;
      }
      if (isDemoToken(token)) await storage.secureRemove(TOKEN_KEY);
      try {
        const me = await Api.me();
        setUser(me);
        syncPushToken();
      } catch {
        await storage.secureRemove(TOKEN_KEY);
        setUser(null);
      }
    }
    setLoading(false);
  }, [syncPushToken]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (email: string, password: string) => {
    const demoRole = demoModeEnabled() ? demoRoleForCredentials(email, password) : null;
    if (demoRole) return demoLogin(demoRole);

    const res = await Api.login(email, password);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
    syncPushToken();
    return res.user as User;
  };

  const demoLogin = async (role: DemoRole) => {
    if (!demoModeEnabled()) throw new Error('Demo accounts are unavailable in this build.');
    const demoUser = getDemoUser(role) as User;
    await storage.secureSet(TOKEN_KEY, demoTokenFor(role));
    setUser(demoUser);
    return demoUser;
  };

  const logout = async () => {
    await clearQueuedCheckins();
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const token = (await storage.secureGet(TOKEN_KEY, '')) || '';
      if (isDemoToken(token) && demoModeEnabled()) {
        setUser(getDemoUser(demoRoleFromToken(token)) as User);
        return;
      }
      if (isDemoToken(token)) {
        await storage.secureRemove(TOKEN_KEY);
        setUser(null);
        return;
      }
      const me = await Api.me();
      setUser(me);
    } catch {
      // ignore
    }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, demoLogin, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
