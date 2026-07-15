import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://hudbzlgclghlhazlduas.supabase.co';

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

// Create the Supabase Client
export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      experimental: {
        passkey: true,
      },
    },
  },
);

