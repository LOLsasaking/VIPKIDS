/**
 * Auth context — manages JWT token + current user across the app.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/src/utils/storage';
import { Api, TOKEN_KEY } from './api';
import { DemoRole, demoModeEnabled, demoRoleForCredentials, demoRoleFromToken, demoTokenFor, getDemoUser, isDemoToken } from './demo';
import { clearQueuedCheckins } from './offlineCheckins';
import { registerForPushNotificationsAsync } from './pushNotifications';
import { PUSH_REGISTRATION_KEY } from './pushNotifications';
import { requireSupabase, supabase, supabaseConfigured } from './supabase';

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
  mfaRequired: boolean;
  verifyMfa: (code: string) => Promise<User>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  const pendingVerifiedTotp = useCallback(async () => {
    if (!supabaseConfigured) return null;
    const client = requireSupabase();
    const [assurance, factors] = await Promise.all([
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);
    if (assurance.data?.currentLevel === 'aal1' && assurance.data?.nextLevel === 'aal2') {
      return factors.data?.totp.find((factor) => factor.status === 'verified')?.id || null;
    }
    return null;
  }, []);

  const syncPushToken = useCallback(async () => {
    try {
      const registration = await registerForPushNotificationsAsync();
      if (registration) {
        await Api.registerPushToken(registration);
        await storage.secureSet(PUSH_REGISTRATION_KEY, JSON.stringify(registration));
      }
    } catch (error) {
      console.warn('Push notification registration failed', error);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    if (supabaseConfigured) {
      try {
        const { data } = await requireSupabase().auth.getSession();
        if (data.session) {
          const factorId = await pendingVerifiedTotp();
          if (factorId) {
            setMfaFactorId(factorId);
            setUser(null);
            return;
          }
          const me = await Api.me();
          setUser(me);
          syncPushToken();
        }
      } catch {
        await supabase?.auth.signOut({ scope: 'local' });
        setUser(null);
      } finally {
        setLoading(false);
      }
      return;
    }
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
  }, [pendingVerifiedTotp, syncPushToken]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (email: string, password: string) => {
    const demoRole = demoModeEnabled() ? demoRoleForCredentials(email, password) : null;
    if (demoRole) return demoLogin(demoRole);

    if (supabaseConfigured) {
      const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Invalid email or password' : error.message);
      const factorId = await pendingVerifiedTotp();
      if (factorId) {
        setMfaFactorId(factorId);
        throw new Error('Enter the six-digit code from your authenticator app.');
      }
      try {
        const me = await Api.me();
        setUser(me);
        syncPushToken();
        return me as User;
      } catch (error) {
        await requireSupabase().auth.signOut({ scope: 'local' });
        throw error;
      }
    }

    const res = await Api.login(email, password);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
    syncPushToken();
    return res.user as User;
  };

  const verifyMfa = async (code: string) => {
    if (!mfaFactorId || !/^\d{6}$/.test(code)) throw new Error('Enter a valid six-digit authenticator code.');
    const client = requireSupabase();
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code });
    if (verified.error) throw new Error('That authenticator code was not accepted.');
    setMfaFactorId(null);
    const me = await Api.me();
    setUser(me);
    syncPushToken();
    return me as User;
  };

  const demoLogin = async (role: DemoRole) => {
    if (!demoModeEnabled()) throw new Error('Demo accounts are unavailable in this build.');
    const demoUser = getDemoUser(role) as User;
    await storage.secureSet(TOKEN_KEY, demoTokenFor(role));
    setUser(demoUser);
    return demoUser;
  };

  const logout = async () => {
    try {
      const saved = await storage.secureGet(PUSH_REGISTRATION_KEY, '');
      if (saved) {
        const registration = JSON.parse(saved);
        await Api.unregisterPushToken(registration);
      }
    } catch {
      // Logout must still clear local access if the network is unavailable.
      // Registering this device under the next account disables older bindings.
    } finally {
      await clearQueuedCheckins();
      await storage.secureRemove(PUSH_REGISTRATION_KEY);
      await storage.secureRemove(TOKEN_KEY);
      if (supabaseConfigured) await supabase?.auth.signOut();
      setMfaFactorId(null);
      setUser(null);
    }
  };

  const refresh = async () => {
    try {
      if (supabaseConfigured) {
        setUser(await Api.me());
        return;
      }
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
    <Ctx.Provider value={{ user, loading, login, demoLogin, logout, refresh, mfaRequired: !!mfaFactorId, verifyMfa }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
