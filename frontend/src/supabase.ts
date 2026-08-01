import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { storage } from '@/src/utils/storage';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const usesSupabase = process.env.EXPO_PUBLIC_BACKEND_MODE === 'supabase';
export const supabaseConfigured = usesSupabase && /^https:\/\/[^/]+\.supabase\.co$/.test(url) && anonKey.length > 20;

const AUTH_CHUNK_SIZE = 1800;

async function removeAuthChunks(key: string) {
  const count = Number((await storage.secureGet(`${key}:chunks`, 0)) || 0);
  await Promise.all(Array.from({ length: count }, (_, index) => storage.secureRemove(`${key}:${index}`)));
  await storage.secureRemove(`${key}:chunks`);
}

const secureAuthStorage = {
  getItem: async (key: string) => {
    const count = Number((await storage.secureGet(`${key}:chunks`, 0)) || 0);
    if (count > 0) {
      const parts = await Promise.all(Array.from({ length: count }, (_, index) => storage.secureGet(`${key}:${index}`, '')));
      return parts.every((part) => typeof part === 'string') ? parts.join('') : null;
    }
    return (await storage.secureGet(key, '')) || null;
  },
  setItem: async (key: string, value: string) => {
    await removeAuthChunks(key);
    if (value.length <= AUTH_CHUNK_SIZE) {
      const saved = await storage.secureSet(key, value);
      if (!saved) throw new Error('Secure authentication storage is unavailable.');
      return;
    }
    await storage.secureRemove(key);
    const chunks = Array.from({ length: Math.ceil(value.length / AUTH_CHUNK_SIZE) }, (_, index) => value.slice(index * AUTH_CHUNK_SIZE, (index + 1) * AUTH_CHUNK_SIZE));
    const saved = await Promise.all(chunks.map((chunk, index) => storage.secureSet(`${key}:${index}`, chunk)));
    if (saved.some((ok) => !ok) || !(await storage.secureSet(`${key}:chunks`, chunks.length))) {
      await removeAuthChunks(key);
      throw new Error('Secure authentication storage is unavailable.');
    }
  },
  removeItem: async (key: string) => {
    await storage.secureRemove(key);
    await removeAuthChunks(key);
  },
};

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
      global: { headers: { 'X-Client-Info': 'vipkids-mobile' } },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase production service is not configured for this build.');
  return supabase;
}
