import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://api.sanadflow.com';
const SUPABASE_PROJECT_REF = 'hudbzlgclghlhazlduas';
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export function clearPersistedSupabaseSession(): void {
  if (typeof window === 'undefined') return;

  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageName];
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key === SUPABASE_AUTH_STORAGE_KEY || key?.startsWith(`${SUPABASE_AUTH_STORAGE_KEY}-`)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }
}

// Intelligently resolve the anonymous client key.
// Standard Supabase client requires the JWT anon key to handle authentication and row-level security (RLS).
// We prefer VITE_SUPABASE_ANON_KEY if it is a JWT (starts with eyJ), and fall back to others accordingly.
const isJWT = (key: any) => typeof key === 'string' && key.startsWith('eyJ');

let supabaseKey = '';
if (isJWT(metaEnv.VITE_SUPABASE_ANON_KEY)) {
  supabaseKey = metaEnv.VITE_SUPABASE_ANON_KEY;
} else if (isJWT(metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  supabaseKey = metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
} else {
  supabaseKey = metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY || '';
}

// Resilient fallback to the known valid JWT anon key if none is available
if (!supabaseKey || supabaseKey === 'dummy-publishable-key-placeholder') {
  supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZGJ6bGdjbGdobGhhemxkdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzI3NzEsImV4cCI6MjA5ODQ0ODc3MX0.mQvUtmAwmRXPdMJdynPemP56PSeONMUpw_k0rz_pUag';
}

// Print the development host as requested
if (metaEnv.DEV) {
  try {
    console.log('[SANAD v3 Supabase Host]', new URL(supabaseUrl).hostname);
  } catch (e) {
    console.error('خطأ في عنوان Supabase:', e);
  }
}

export const hasSupabaseConfig = !!supabaseKey && supabaseKey !== '';

// Keep one stable auth storage key even when the API hostname changes from the
// default Supabase project URL to the SANAD custom domain. Without this explicit
// key, the same browser origin can read a different cached session after a host
// migration and send an invalid bearer token to PostgREST.
export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      experimental: {
        passkey: true,
      },
    },
  },
);
