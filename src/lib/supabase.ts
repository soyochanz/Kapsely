import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = 'https://tnvpostnyyjejexnghfp.supabase.co';
export const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnBvc3RueXlqZWpleG5naGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODgzNTAsImV4cCI6MjA4Nzg2NDM1MH0.4ZRtodCo6BEdItYYwFdLJO_BgUXYrf5RE8S3jk3woDI';
export const SUPABASE_PROJECT_REF = 'tnvpostnyyjejexnghfp';
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
export const SUPABASE_AUTH_CODE_VERIFIER_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token-code-verifier`;

// On web: use native localStorage directly (avoids the AsyncStorage polyfill
// which, combined with navigator.locks, causes a deadlock and infinite loading).
// On native: use AsyncStorage as before.
const ExpoAsyncStorage =
    Platform.OS === 'web'
        ? {
              getItem: (key: string) => {
                  try {
                      return Promise.resolve(localStorage.getItem(key));
                  } catch (e) {
                      return Promise.resolve(null);
                  }
              },
              setItem: (key: string, value: string) => {
                  try {
                      localStorage.setItem(key, value);
                  } catch (e) {}
                  return Promise.resolve();
              },
              removeItem: (key: string) => {
                  try {
                      localStorage.removeItem(key);
                  } catch (e) {}
                  return Promise.resolve();
              },
          }
        : {
              getItem: async (key: string) => {
                  try {
                      return await AsyncStorage.getItem(key);
                  } catch (error) {
                      console.error('Error reading from storage:', error);
                      return null;
                  }
              },
              setItem: async (key: string, value: string) => {
                  try {
                      await AsyncStorage.setItem(key, value);
                  } catch (error) {
                      console.error('Error writing to storage:', error);
                  }
              },
              removeItem: async (key: string) => {
                  try {
                      await AsyncStorage.removeItem(key);
                  } catch (error) {
                      console.error('Error removing from storage:', error);
                  }
              },
          };

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });

export function isRetryableAuthError(error: any) {
    const message = String(error?.message || error?.name || '').toLowerCase();
    const status = String(error?.status || error?.code || '').toLowerCase();
    return (
        message.includes('authretryablefetcherror') ||
        message.includes('authunknownerror') ||
        message.includes('json parse error') ||
        message.includes('unexpected character: <') ||
        message.includes('gateway timeout') ||
        message.includes('timed out') ||
        message.includes('network') ||
        status === '504'
    );
}

export function getFriendlyAuthErrorMessage(error: any, fallback = 'No se pudo completar la autenticación ahora mismo. Inténtalo de nuevo en unos segundos.') {
    if (isRetryableAuthError(error)) {
        return 'No se pudo conectar con el servidor de acceso ahora mismo. Inténtalo de nuevo en unos segundos.';
    }
    return error?.message || fallback;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: ExpoAsyncStorage,
        autoRefreshToken: Platform.OS !== 'web',
        persistSession: true,
        detectSessionInUrl: false,
        // On web: disable navigator.locks to prevent the lock deadlock that occurs
        // when multiple screens call getSession() simultaneously on mount.
        // Using a simple mutex-free lock implementation instead.
        ...(Platform.OS === 'web' && {
            lock: (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
                return fn();
            },
        }),
    },
});

let authSessionSnapshot: Session | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
    authSessionSnapshot = session ?? null;
});

export function setAuthSessionSnapshot(session: Session | null) {
    authSessionSnapshot = session;
}

export function getAuthSessionSnapshot() {
    return authSessionSnapshot;
}

export function getAuthUserIdSnapshot() {
    return authSessionSnapshot?.user?.id ?? null;
}

export async function clearSupabaseAuthStorage() {
    try {
        await ExpoAsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
        await ExpoAsyncStorage.removeItem(SUPABASE_AUTH_CODE_VERIFIER_KEY);
    } catch {}

    if (Platform.OS === 'web') {
        try {
            localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
            localStorage.removeItem(SUPABASE_AUTH_CODE_VERIFIER_KEY);
        } catch {}
        try {
            sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
            sessionStorage.removeItem(SUPABASE_AUTH_CODE_VERIFIER_KEY);
        } catch {}
    }
}

export async function safeLocalSignOut() {
    try {
        await withTimeout(supabase.auth.signOut({ scope: 'local' } as any), 1200, 'local signOut');
    } catch {}
    await clearSupabaseAuthStorage();
}

export async function safeSignOut() {
    try {
        await withTimeout(supabase.auth.signOut(), 2500, 'signOut');
    } catch {
        await safeLocalSignOut();
        return;
    }
    await clearSupabaseAuthStorage();
}

export type Profile = {
    id: string;
    email: string;
    username: string;
    display_name: string;
    birthdate: string;
    avatar_url: string | null;
    bio: string | null;
    favorite_color: string | null;
    favorite_movie: string | null;
    favorite_song: string | null;
    is_verified?: boolean;
    is_admin?: boolean;
    display_name_history?: string[];
    created_at: string;
    updated_at: string;
};
