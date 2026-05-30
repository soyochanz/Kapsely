import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://tnvpostnyyjejexnghfp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnBvc3RueXlqZWpleG5naGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODgzNTAsImV4cCI6MjA4Nzg2NDM1MH0.4ZRtodCo6BEdItYYwFdLJO_BgUXYrf5RE8S3jk3woDI';
export const SUPABASE_PROJECT_REF = 'tnvpostnyyjejexnghfp';
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
export const SUPABASE_AUTH_CODE_VERIFIER_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token-code-verifier`;

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

export function getFriendlyAuthErrorMessage(error: any, fallback = 'No se pudo completar la autenticación ahora mismo.') {
  if (isRetryableAuthError(error)) {
    return 'No se pudo conectar con el servidor de acceso ahora mismo. Inténtalo de nuevo en unos segundos.';
  }
  return error?.message || fallback;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: true
    }
});

export async function clearSupabaseAuthStorage() {
  try {
    localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    localStorage.removeItem(SUPABASE_AUTH_CODE_VERIFIER_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    sessionStorage.removeItem(SUPABASE_AUTH_CODE_VERIFIER_KEY);
  } catch {}
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
