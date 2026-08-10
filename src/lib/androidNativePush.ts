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

type NativePushAction = {
  sanad_notification_id?: string;
  sanad_action_type?: string;
  sanad_action_payload?: string;
};

declare global {
  interface Window {
    AndroidPush?: {
      register(): void;
      getPermissionState(): string;
      consumePendingAction(): string;
    };
  }
}

const isAndroidNative = () => Capacitor.getPlatform() === 'android' && (
  Capacitor.isNativePlatform() || window.location.origin.includes('capacitor') || window.location.origin.startsWith('file:')
);

let initialized = false;
let lastToken: string | null = null;
let lastActionId: string | null = null;

async function persistRegistration(detail: NativePushRegistration) {
  if (!detail.token || detail.permission !== 'granted') return;
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session?.user || detail.token === lastToken) return;
  const { error } = await supabase.rpc('upsert_my_native_push_device', {
    p_token: detail.token,
    p_device_label: detail.deviceLabel || null,
    p_app_version: detail.appVersion || null,
    p_permission_state: detail.permission,
  });
  if (error) { console.warn('[SANAD push] native token registration failed', error.message); return; }
  lastToken = detail.token;
}

function navigate(target: string) {
  if (window.location.pathname === target) return;
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function handleNativeAction(raw: string | NativePushAction | null | undefined) {
  if (!raw) return;
  let action: NativePushAction;
  try { action = typeof raw === 'string' ? JSON.parse(raw) as NativePushAction : raw; } catch { return; }
  if (action.sanad_notification_id && action.sanad_notification_id === lastActionId) return;
  if (action.sanad_notification_id) lastActionId = action.sanad_notification_id;

  let payload: Record<string, unknown> = {};
  try { payload = action.sanad_action_payload ? JSON.parse(action.sanad_action_payload) as Record<string, unknown> : {}; } catch { payload = {}; }
  const actionType = action.sanad_action_type || 'none';
  if (actionType === 'operation_details' && typeof payload.public_token === 'string' && payload.public_token) {
    navigate(`/v/${encodeURIComponent(payload.public_token)}?src=app`);
  } else if (actionType === 'reports') {
    navigate('/reports');
  }
}

function consumePendingAction() {
  if (!isAndroidNative() || !window.AndroidPush?.consumePendingAction) return;
  try { handleNativeAction(window.AndroidPush.consumePendingAction()); } catch { /* bridge not ready yet */ }
}

function requestNativeRegistration() {
  if (!isAndroidNative() || !window.AndroidPush) return;
  void supabase.auth.getSession().then(({ data }) => { if (data.session?.user) window.AndroidPush?.register(); });
}

export function initializeAndroidNativePush() {
  if (initialized || !isAndroidNative()) return;
  initialized = true;

  window.addEventListener('sanadNativePushRegistration', (event) => {
    const detail = (event as CustomEvent<NativePushRegistration>).detail || {};
    void persistRegistration(detail);
  });
  window.addEventListener('sanadNativePushAction', (event) => {
    handleNativeAction((event as CustomEvent<string>).detail);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) requestNativeRegistration(); else lastToken = null;
  });

  window.setTimeout(() => { requestNativeRegistration(); consumePendingAction(); }, 250);
  window.setTimeout(() => { requestNativeRegistration(); consumePendingAction(); }, 1500);
}
