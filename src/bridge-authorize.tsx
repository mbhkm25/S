import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MapPin,
  MonitorCog,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import Auth from './components/Auth';
import { supabase } from './lib/supabase';
import './index.css';

type LocationItem = {
  id: string;
  business_id: string;
  name: string;
  code: string;
  is_primary: boolean;
};

type BusinessItem = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  governorate: string | null;
  is_owner: boolean;
  job_title: string | null;
  locations: LocationItem[];
};

type AuthorizationSession = {
  session_public_id: string;
  device_label: string | null;
  bridge_version: string | null;
  adapter_code: string;
  adapter_version: string | null;
  source_label: string | null;
  source_version: string | null;
  status: string;
  expires_at: string;
  business_id: string | null;
  location_id: string | null;
  authorized_at: string | null;
};

type ContextResponse = {
  ok: boolean;
  error?: string;
  session?: AuthorizationSession;
  businesses?: BusinessItem[];
  business_name?: string | null;
};

type ViewState = 'checking' | 'sign-in' | 'ready' | 'submitting' | 'success' | 'denied' | 'expired' | 'invalid';

const SECRET_STORAGE_PREFIX = 'sanad:bridge-browser-secret:v1:';

function getRequestIdentity(): { sessionPublicId: string; browserSecret: string } {
  const url = new URL(window.location.href);
  const sessionPublicId = url.searchParams.get('session')?.trim() || '';
  if (!sessionPublicId) return { sessionPublicId: '', browserSecret: '' };

  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const hashSecret = hashParams.get('key')?.trim() || '';
  const storageKey = `${SECRET_STORAGE_PREFIX}${sessionPublicId}`;

  if (hashSecret) {
    sessionStorage.setItem(storageKey, hashSecret);
    window.history.replaceState(null, document.title, `${url.pathname}${url.search}`);
    return { sessionPublicId, browserSecret: hashSecret };
  }

  return {
    sessionPublicId,
    browserSecret: sessionStorage.getItem(storageKey)?.trim() || '',
  };
}

function forgetBrowserSecret(sessionPublicId: string) {
  if (!sessionPublicId) return;
  sessionStorage.removeItem(`${SECRET_STORAGE_PREFIX}${sessionPublicId}`);
}

function providerLabel(code?: string | null): string {
  if (code === 'edaa' || code === 'edaa_v5') return 'إبداع سوفت';
  return code || 'النظام المحاسبي';
}

function errorMessage(code?: string): string {
  switch (code) {
    case 'authorization_session_expired':
      return 'انتهت مهلة طلب الربط. ارجع إلى برنامج سند على الكمبيوتر وابدأ الربط من جديد.';
    case 'authorization_session_invalid':
      return 'طلب الربط غير صالح أو تم استخدامه من قبل.';
    case 'accounting_integration_permission_required':
      return 'لا تملك صلاحية ربط النظام المحاسبي بهذا النشاط.';
    case 'business_location_invalid':
      return 'الفرع المحدد لم يعد متاحًا. حدّث الصفحة واختر فرعًا آخر.';
    case 'invalid_user_session':
    case 'not_authenticated':
      return 'انتهت جلسة سند. سجّل الدخول من جديد ثم أعد المحاولة.';
    default:
      return 'تعذر إكمال طلب الربط حاليًا. أعد المحاولة.';
  }
}

function BridgeAuthorizeApp() {
  const request = useMemo(getRequestIdentity, []);
  const [view, setView] = useState<ViewState>('checking');
  const [sessionUser, setSessionUser] = useState<SupabaseUser | null>(null);
  const [sessionInfo, setSessionInfo] = useState<AuthorizationSession | null>(null);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [linkedBusinessName, setLinkedBusinessName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const invokeAuthorization = useCallback(async (action: 'context' | 'authorize' | 'deny', extras: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('sanad-bridge-authorize-v1', {
      body: {
        action,
        session_public_id: request.sessionPublicId,
        browser_secret: request.browserSecret,
        ...extras,
      },
    });

    if (error) {
      const response = data as ContextResponse | null;
      throw new Error(response?.error || 'authorization_request_failed');
    }
    return (data || {}) as ContextResponse & Record<string, unknown>;
  }, [request.browserSecret, request.sessionPublicId]);

  const loadContext = useCallback(async () => {
    if (!request.sessionPublicId || !request.browserSecret) {
      setView('invalid');
      setMessage('رابط الربط غير مكتمل. ابدأ العملية من برنامج سند على الكمبيوتر.');
      return;
    }

    setView('checking');
    try {
      const result = await invokeAuthorization('context');
      const session = result.session;
      if (!session) throw new Error('authorization_session_invalid');
      setSessionInfo(session);

      if (session.status === 'expired') {
        setView('expired');
        return;
      }
      if (session.status === 'denied') {
        setView('denied');
        return;
      }
      if (session.status === 'authorized' || session.status === 'consumed') {
        setLinkedBusinessName(result.business_name || null);
        forgetBrowserSecret(request.sessionPublicId);
        setView('success');
        return;
      }

      const nextBusinesses = result.businesses || [];
      setBusinesses(nextBusinesses);
      if (nextBusinesses.length === 1) {
        const onlyBusiness = nextBusinesses[0];
        setSelectedBusinessId(onlyBusiness.id);
        const primary = onlyBusiness.locations.find((item) => item.is_primary) || onlyBusiness.locations[0];
        setSelectedLocationId(primary?.id || '');
      }
      setView('ready');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'authorization_request_failed';
      if (code === 'authorization_session_expired') setView('expired');
      else if (code === 'invalid_user_session' || code === 'not_authenticated') setView('sign-in');
      else setView('invalid');
      setMessage(errorMessage(code));
    }
  }, [invokeAuthorization, request.sessionPublicId, request.browserSecret]);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      if (!request.sessionPublicId || !request.browserSecret) {
        if (mounted) {
          setView('invalid');
          setMessage('رابط الربط غير مكتمل. ابدأ العملية من برنامج سند على الكمبيوتر.');
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const user = data.session?.user || null;
      setSessionUser(user);
      if (!user) {
        setView('sign-in');
        return;
      }
      await loadContext();
    };

    void boot();
    return () => { mounted = false; };
  }, [loadContext, request.browserSecret, request.sessionPublicId]);

  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId) || null;

  useEffect(() => {
    if (!selectedBusiness) {
      setSelectedLocationId('');
      return;
    }
    if (selectedLocationId && selectedBusiness.locations.some((item) => item.id === selectedLocationId)) return;
    const primary = selectedBusiness.locations.find((item) => item.is_primary) || selectedBusiness.locations[0];
    setSelectedLocationId(primary?.id || '');
  }, [selectedBusiness, selectedLocationId]);

  const authorize = async () => {
    if (!selectedBusinessId) {
      setMessage('اختر النشاط التجاري الذي تريد ربطه بهذا الكمبيوتر.');
      return;
    }
    setMessage(null);
    setView('submitting');
    try {
      const result = await invokeAuthorization('authorize', {
        business_id: selectedBusinessId,
        location_id: selectedLocationId || null,
      });
      setLinkedBusinessName((result.business_name as string | undefined) || selectedBusiness?.name || null);
      forgetBrowserSecret(request.sessionPublicId);
      setView('success');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'authorization_failed';
      setMessage(errorMessage(code));
      setView(code === 'authorization_session_expired' ? 'expired' : 'ready');
    }
  };

  const deny = async () => {
    setMessage(null);
    setView('submitting');
    try {
      await invokeAuthorization('deny');
      forgetBrowserSecret(request.sessionPublicId);
      setView('denied');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'authorization_denial_failed';
      setMessage(errorMessage(code));
      setView('ready');
    }
  };

  if (view === 'sign-in') {
    return (
      <main className="min-h-screen bg-slate-50" dir="rtl">
        <div className="mx-auto max-w-lg px-4 pt-8 text-center">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            سجّل الدخول بحساب سند نفسه لاختيار النشاط التجاري الذي سيتصل به هذا الكمبيوتر. بيانات الدخول تبقى داخل موقع سند ولا تُرسل إلى برنامج Windows.
          </div>
        </div>
        <Auth
          onAuthSuccess={(user) => {
            setSessionUser(user);
            void loadContext();
          }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8" dir="rtl">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="سند" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-700">SANAD BRIDGE</p>
              <h1 className="text-xl font-bold text-slate-950">ربط النظام المحاسبي</h1>
            </div>
          </div>
          {sessionUser && <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm sm:inline">حساب سند موثّق</span>}
        </header>

        {(view === 'checking' || view === 'submitting') && (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-600" />
            <h2 className="font-bold text-slate-900">{view === 'submitting' ? 'جارٍ تثبيت التفويض…' : 'جارٍ التحقق من طلب الربط…'}</h2>
            <p className="mt-2 text-sm text-slate-500">لن يتم تخزين كلمة مرور سند أو قاعدة بيانات إبداع على هذه الصفحة.</p>
          </section>
        )}

        {view === 'ready' && sessionInfo && (
          <div className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><MonitorCog className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500">طلب من هذا الكمبيوتر</p>
                  <h2 className="mt-1 truncate text-lg font-bold text-slate-950">{sessionInfo.device_label || 'كمبيوتر النشاط'}</h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{providerLabel(sessionInfo.adapter_code)}</span>
                    {sessionInfo.source_label && <span className="rounded-full bg-slate-100 px-2.5 py-1">{sessionInfo.source_label}</span>}
                    {sessionInfo.bridge_version && <span className="rounded-full bg-slate-100 px-2.5 py-1">Bridge {sessionInfo.bridge_version}</span>}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <h2 className="font-bold text-slate-950">اختر النشاط التجاري</h2>
                  <p className="text-sm text-slate-500">تظهر فقط الأنشطة التي تملك صلاحية إدارة تكاملاتها المحاسبية.</p>
                </div>
              </div>

              {businesses.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  لا يوجد نشاط تجاري في حسابك يمنحك صلاحية ربط نظام محاسبي. يجب أن تكون مالك النشاط أو يمنحك المالك صلاحية إدارة التكاملات المحاسبية.
                </div>
              ) : (
                <div className="space-y-2">
                  {businesses.map((business) => {
                    const selected = selectedBusinessId === business.id;
                    return (
                      <button
                        key={business.id}
                        type="button"
                        onClick={() => setSelectedBusinessId(business.id)}
                        className={`w-full rounded-2xl border p-4 text-right transition ${selected ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">{business.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{business.is_owner ? 'مالك النشاط' : business.job_title || 'عضو فريق مفوّض'}</p>
                          </div>
                          <ChevronLeft className={`h-5 w-5 ${selected ? 'text-emerald-600' : 'text-slate-300'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedBusiness && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><MapPin className="h-4 w-4 text-slate-500" /> الفرع</div>
                  {selectedBusiness.locations.length > 0 ? (
                    <select
                      value={selectedLocationId}
                      onChange={(event) => setSelectedLocationId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500"
                    >
                      {selectedBusiness.locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}{location.is_primary ? ' — الرئيسي' : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">سيُنشأ تلقائيًا «الفرع الرئيسي» لهذا النشاط.</div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div className="text-sm leading-6 text-emerald-950">
                  <p className="font-bold">صلاحية قراءة فقط</p>
                  <p>يسمح هذا الربط لـSANAD Bridge بقراءة التحديثات من النظام المحاسبي وإرسالها إلى النشاط المحدد. لا يمنح سند صلاحية الكتابة إلى إبداع في هذه المرحلة.</p>
                </div>
              </div>
            </section>

            {message && <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{message}</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!selectedBusinessId}
                onClick={() => void authorize()}
                className="rounded-2xl bg-emerald-600 px-5 py-4 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                ربط هذا الكمبيوتر بالنشاط
              </button>
              <button
                type="button"
                onClick={() => void deny()}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-700 transition hover:bg-slate-100"
              >
                <Unplug className="h-5 w-5" /> رفض الطلب
              </button>
            </div>
          </div>
        )}

        {view === 'success' && (
          <section className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-9 w-9" /></div>
            <h2 className="text-xl font-bold text-slate-950">تم اعتماد الربط</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">تم تفويض هذا الكمبيوتر ليتصل بنشاط <strong>{linkedBusinessName || 'النشاط المحدد'}</strong>. يمكنك إغلاق هذه الصفحة والعودة إلى برنامج SANAD Bridge على الكمبيوتر.</p>
          </section>
        )}

        {view === 'denied' && (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Unplug className="mx-auto mb-4 h-10 w-10 text-slate-400" />
            <h2 className="text-xl font-bold text-slate-950">تم رفض طلب الربط</h2>
            <p className="mt-3 text-sm text-slate-600">لم يحصل الكمبيوتر على أي صلاحية. يمكنك إغلاق الصفحة.</p>
          </section>
        )}

        {(view === 'expired' || view === 'invalid') && (
          <section className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-rose-500" />
            <h2 className="text-xl font-bold text-slate-950">تعذر إكمال الربط</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{message || (view === 'expired' ? errorMessage('authorization_session_expired') : errorMessage('authorization_session_invalid'))}</p>
          </section>
        )}
      </div>
    </main>
  );
}

const root = document.getElementById('bridge-authorize-root');
if (!root) throw new Error('bridge_authorize_root_missing');
createRoot(root).render(<BridgeAuthorizeApp />);
