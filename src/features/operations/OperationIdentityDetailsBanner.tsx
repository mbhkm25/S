import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ChevronUp, Store } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { OperationIdentityProjection } from '../../lib/operationIdentity';

function readOperationToken() {
  const match = window.location.pathname.match(/\/v\/([^/]+)/);
  return match?.[1] || null;
}

function sourceLabel(source: OperationIdentityProjection['identity_source']) {
  if (source === 'linked_business') return 'مرتبط بالنشاط داخل سند';
  if (source === 'exact_identifier_match') return 'مطابقة دقيقة بمعرّف مالي فريد';
  return 'قراءة مستخرجة من الإشعار';
}

export default function OperationIdentityDetailsBanner() {
  const [token, setToken] = useState<string | null>(() => readOperationToken());
  const [identity, setIdentity] = useState<OperationIdentityProjection | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const syncRoute = () => setToken(readOperationToken());
    window.addEventListener('popstate', syncRoute);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      window.dispatchEvent(new Event('sanad:navigation'));
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event('sanad:navigation'));
    };
    window.addEventListener('sanad:navigation', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('sanad:navigation', syncRoute);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setIdentity(null);
    if (!token) return () => { active = false; };

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const { data, error } = await supabase.rpc('get_operation_identity_by_token', {
        p_public_token: token
      });
      if (!active || error || !data) return;
      setIdentity(data as OperationIdentityProjection);
    };

    void load();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [token]);

  const shouldRender = useMemo(() => Boolean(
    token && identity && (identity.resolved_business_name || identity.has_name_conflict)
  ), [identity, token]);

  if (!shouldRender || !identity) return null;

  return (
    <aside
      dir="rtl"
      className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[125] mx-auto max-w-xl rounded-[1.5rem] border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl"
      aria-label="هوية العملية المحلولة"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-3 text-right"
        aria-expanded={!collapsed}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          {identity.identity_source === 'linked_business' ? <BadgeCheck className="h-5 w-5" /> : <Store className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold text-emerald-700">هوية العملية داخل سند</span>
          <strong className="mt-0.5 block truncate text-sm text-slate-950">
            {identity.resolved_business_name || 'لم تُحل هوية النشاط'}
          </strong>
        </span>
        {collapsed ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <span className="block text-slate-400">مصدر الهوية</span>
              <strong className="mt-1 block leading-5 text-slate-800">{sourceLabel(identity.identity_source)}</strong>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <span className="block text-slate-400">اسم الحساب المالي</span>
              <strong className="mt-1 block leading-5 text-slate-800">{identity.resolved_account_holder_name || 'غير متوفر'}</strong>
            </div>
          </div>
          {identity.raw_receiver_name && (
            <div className={`rounded-xl border p-2.5 text-[10px] ${identity.has_name_conflict ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className="flex items-center gap-1.5 text-slate-500">
                {identity.has_name_conflict && <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />}
                الاسم المستخرج من الإشعار
              </span>
              <strong className="mt-1 block text-xs text-slate-900">{identity.raw_receiver_name}</strong>
              {identity.has_name_conflict && (
                <p className="mt-1 leading-5 text-amber-800">تختلف القراءة المستخرجة عن الهوية المحلولة من المعرّف المالي، لذلك بقي النص الخام محفوظًا دون تصحيح صامت.</p>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
