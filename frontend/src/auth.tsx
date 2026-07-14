/**
 * Auth context — manages JWT token + current user across the app.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/src/utils/storage';
import { Api, TOKEN_KEY } from './api';
import { clearQueuedCheckins } from './offlineCheckins';
import { registerAndSyncPushToken } from './push';

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
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await storage.secureGet(TOKEN_KEY, '');
    if (token) {
      try {
        const me = await Api.me();
        setUser(me);
      } catch {
        await storage.secureRemove(TOKEN_KEY);
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Register this device for ride push notifications whenever a user is signed in.
  useEffect(() => {
    if (user) registerAndSyncPushToken();
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const res = await Api.login(email, password);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
    return res.user as User;
  };

  const logout = async () => {
    await clearQueuedCheckins();
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const me = await Api.me();
      setUser(me);
    } catch {
      // ignore
    }
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
