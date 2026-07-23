import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, ExternalLink, Loader2, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';
import {
  getPlatformAdminAccess,
  getPlatformAdminSnapshot,
  reviewAdminBusiness,
  type AdminBusiness
} from '../../src/lib/platformAdminApi';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['admin','api','app','auth','business','help','login','profile','sanad','settings','support','verify','www']);

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function isPendingSlug(value: string): boolean {
  return !value || value.startsWith('pending-');
}

function slugError(value: string): string | null {
  if (value.length < 3) return 'الرابط يجب أن يحتوي على 3 أحرف على الأقل.';
  if (value.length > 80) return 'الرابط أطول من الحد المسموح.';
  if (!SLUG_PATTERN.test(value)) return 'استخدم أحرفًا إنجليزية صغيرة وأرقامًا وشرطة فقط.';
  if (value.startsWith('pending-') || RESERVED.has(value)) return 'هذا الرابط محجوز ولا يمكن استخدامه.';
  return null;
}

export default function BusinessSlugAdministration() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const access = await getPlatformAdminAccess();
      if (!access.allowed) {
        setDenied(true);
        setBusinesses([]);
        return;
      }
      setDenied(false);
      const snapshot = await getPlatformAdminSnapshot(150);
      setBusinesses(snapshot.businesses || []);
      setDrafts((current) => {
        const next = { ...current };
        for (const business of snapshot.businesses || []) {
          if (!(business.id in next)) next[business.id] = isPendingSlug(business.slug) ? '' : business.slug;
        }
        return next;
      });
    } catch {
      setError('تعذر تحميل طلبات الأنشطة وروابطها.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...businesses].sort((a, b) => Number(isPendingSlug(b.slug)) === Number(isPendingSlug(a.slug)) ? 0 : Number(isPendingSlug(b.slug)) - Number(isPendingSlug(a.slug)));
    if (!query) return sorted;
    return sorted.filter((business) => [business.name, business.owner_name, business.owner_phone, business.slug, business.city, business.governorate]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }, [businesses, search]);

  const saveSlug = async (business: AdminBusiness) => {
    const slug = normalizeSlug(drafts[business.id] || '');
    const reason = (reasons[business.id] || '').trim();
    const validation = slugError(slug);
    if (validation) { setError(validation); return; }
    if (reason.length < 5) { setError('اكتب سببًا إداريًا واضحًا من 5 أحرف على الأقل.'); return; }

    setSavingId(business.id);
    setError(null);
    setSuccess(null);
    try {
      const { error: rpcError } = await supabase.rpc('platform_admin_set_business_slug', {
        p_business_id: business.id,
        p_slug: slug,
        p_reason: reason
      });
      if (rpcError) throw rpcError;
      setSuccess(`تم اعتماد الرابط app.sanadflow.com/b/${slug}`);
      await load(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(message.includes('business_slug_already_used')
        ? 'هذا الرابط مستخدم بالفعل. اختر رابطًا آخر.'
        : message.includes('reserved_business_slug')
          ? 'هذا الرابط محجوز للنظام.'
          : 'تعذر حفظ الرابط. تحقق من الصيغة والتوفر ثم أعد المحاولة.');
    } finally {
      setSavingId(null);
    }
  };

  const publish = async (business: AdminBusiness) => {
    if (isPendingSlug(business.slug)) {
      setError('يجب اعتماد رابط عام صالح قبل نشر النشاط.');
      return;
    }
    const reason = (reasons[business.id] || '').trim();
    if (reason.length < 5) {
      setError('اكتب سبب الاعتماد الإداري قبل النشر.');
      return;
    }

    setPublishingId(business.id);
    setError(null);
    setSuccess(null);
    try {
      await reviewAdminBusiness(business.id, 'published', 'تم اعتماد رابط الملف العام ونشر النشاط.', reason);
      setSuccess(`تم نشر ${business.name} على /b/${business.slug}`);
      await load(true);
    } catch {
      setError('تعذر نشر النشاط. تأكد من الرابط ومن اكتمال بيانات المراجعة.');
    } finally {
      setPublishingId(null);
    }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center rounded-3xl bg-white"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (denied) return <div className="rounded-3xl bg-white p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-sm font-bold">صلاحية مدير سند مطلوبة</h2></div>;

  return <section className="space-y-4" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-slate-950 p-5 text-white">
      <div><div className="flex items-center gap-2 text-emerald-300"><Building2 className="h-4 w-4" /><span className="text-[10px] font-bold">مراجعة الهوية الرقمية</span></div><h2 className="mt-2 text-lg font-bold">روابط الملفات العامة</h2><p className="mt-1 text-[10px] leading-5 text-slate-400">اختر رابطًا احترافيًا وفريدًا لكل نشاط قبل اعتماده ونشره.</p></div>
      <button onClick={() => void load(true)} disabled={refreshing} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 disabled:opacity-50" aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
    </div>

    {error && <button onClick={() => setError(null)} className="w-full rounded-xl bg-rose-50 p-3 text-right text-xs font-bold text-rose-700">{error}</button>}
    {success && <button onClick={() => setSuccess(null)} className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 p-3 text-right text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{success}</button>}

    <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم النشاط أو المالك أو الرابط" className="min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-10 text-xs outline-none focus:border-slate-400" /></div>

    <div className="space-y-3">{rows.map((business) => {
      const draft = normalizeSlug(drafts[business.id] || '');
      const validation = draft ? slugError(draft) : null;
      const pending = isPendingSlug(business.slug);
      return <article key={business.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-950">{business.name}</h3><p className="mt-1 text-[10px] text-slate-500">{business.owner_name || business.owner_phone || 'مالك غير محدد'} · {[business.city, business.governorate].filter(Boolean).join('، ')}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{pending ? 'الرابط بانتظار الإدارة' : 'الرابط معتمد'}</span></div>

        {!pending && <a href={`https://app.sanadflow.com/b/${business.slug}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-600"><ExternalLink className="h-4 w-4" />app.sanadflow.com/b/{business.slug}</a>}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1 text-[10px] font-bold text-slate-600">الرابط المقترح<div className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-3" dir="ltr"><span className="shrink-0 text-[10px] text-slate-400">/b/</span><input value={drafts[business.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [business.id]: normalizeSlug(event.target.value) }))} placeholder="bahakem-honey" className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none" /></div>{validation && <span className="block text-[9px] font-normal text-rose-600">{validation}</span>}</label>
          <label className="space-y-1 text-[10px] font-bold text-slate-600">سبب الاختيار الإداري<input value={reasons[business.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [business.id]: event.target.value }))} placeholder="الرابط يطابق الاسم التجاري الرسمي" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-slate-400" /></label>
          <button onClick={() => void saveSlug(business)} disabled={savingId === business.id || Boolean(validation) || !draft} className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:bg-slate-300">{savingId === business.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الرابط</button>
        </div>

        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3"><button onClick={() => void publish(business)} disabled={pending || publishingId === business.id || business.public_status === 'published'} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">{publishingId === business.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{business.public_status === 'published' ? 'النشاط منشور' : 'اعتماد الرابط ونشر النشاط'}</button></div>
      </article>;
    })}{!rows.length && <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">لا توجد أنشطة مطابقة.</div>}</div>
  </section>;
}
