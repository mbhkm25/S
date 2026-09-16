import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};

function readEnv(name: string): string {
  const value = metaEnv[name];
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (metaEnv.DEV && url.protocol === 'http:');
  } catch {
    return false;
  }
}

function deriveProjectRef(urlValue: string): string {
  const explicit = readEnv('VITE_SUPABASE_PROJECT_REF');
  if (explicit) return explicit;
  if (!validHttpUrl(urlValue)) return '';

  try {
    const hostname = new URL(urlValue).hostname;
    if (hostname.endsWith('.supabase.co')) {
      return hostname.split('.')[0] || '';
    }
  } catch {
    return '';
  }

  return '';
}

const configuredSupabaseUrl = readEnv('VITE_SUPABASE_URL');
const configuredSupabaseKey = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
const configuredProjectRef = deriveProjectRef(configuredSupabaseUrl);

export const hasSupabaseConfig = Boolean(
  validHttpUrl(configuredSupabaseUrl)
  && configuredSupabaseKey
  && configuredProjectRef
);

// Fail closed when the local/build environment is incomplete. These inert values
// only allow the React shell to render its existing configuration error screen;
// they never fall back to SANAD production infrastructure.
const supabaseUrl = hasSupabaseConfig ? configuredSupabaseUrl : 'http://127.0.0.1:54321';
const supabaseKey = hasSupabaseConfig ? configuredSupabaseKey : 'sanad-unconfigured-client-key';
const authStorageKey = `sb-${configuredProjectRef || 'sanad-unconfigured'}-auth-token`;

export function clearPersistedSupabaseSession(): void {
  if (typeof window === 'undefined') return;

  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageName];
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key === authStorageKey || key?.startsWith(`${authStorageKey}-`)) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }
}

if (metaEnv.DEV) {
  if (hasSupabaseConfig) {
    console.log('[SANAD Supabase Host]', new URL(configuredSupabaseUrl).hostname);
    console.log('[SANAD Supabase Project]', configuredProjectRef);
  } else {
    console.warn('[SANAD] Supabase development configuration is incomplete; network access is disabled.');
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storageKey: authStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      experimental: {
        passkey: true,
      },
    },
  },
);
