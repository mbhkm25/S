import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

type NativePushRegistration = {
  token?: string;
  permission?: 'granted' | 'denied' | 'default';
  platform?: string;
  appVersion?: string;
  deviceLabel?: string;
  error?: string;
};

declare global {
  interface Window {
    AndroidPush?: {
      register(): void;
      getPermissionState(): string;
    };
  }
}

const isAndroidNative = () => Capacitor.getPlatform() === 'android' && (
  Capacitor.isNativePlatform() || window.location.origin.includes('capacitor') || window.location.origin.startsWith('file:')
);

let initialized = false;
let lastToken: string | null = null;

async function persistRegistration(detail: NativePushRegistration) {
  if (!detail.token || detail.permission !== 'granted') return;
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session?.user) return;
  if (detail.token === lastToken) return;

  const { error } = await supabase.rpc('upsert_my_native_push_device', {
    p_token: detail.token,
    p_device_label: detail.deviceLabel || null,
    p_app_version: detail.appVersion || null,
    p_permission_state: detail.permission,
  });
  if (error) {
    console.warn('[SANAD push] native token registration failed', error.message);
    return;
  }
  lastToken = detail.token;
}

function requestNativeRegistration() {
  if (!isAndroidNative() || !window.AndroidPush) return;
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user) window.AndroidPush?.register();
  });
}

export function initializeAndroidNativePush() {
  if (initialized || !isAndroidNative()) return;
  initialized = true;

  window.addEventListener('sanadNativePushRegistration', (event) => {
    const detail = (event as CustomEvent<NativePushRegistration>).detail || {};
    void persistRegistration(detail);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) requestNativeRegistration();
    else lastToken = null;
  });

  // The JavaScript bridge is attached immediately after BridgeActivity creates the WebView.
  // A short retry handles the race between native bridge attachment and the first JS frame.
  window.setTimeout(requestNativeRegistration, 250);
  window.setTimeout(requestNativeRegistration, 1500);
}
