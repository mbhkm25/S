import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toLatinDigits } from '../lib/digits';
import { callSanadAppFunction } from '../lib/sanadFunctions';

const statusLabel: Record<string, string> = {
  active: 'فعال', scheduled: 'مجدول', expired: 'منتهي', cancelled: 'ملغي',
  submitted: 'مستلم', processing: 'قيد التحقق', pending_review: 'قيد المراجعة',
  auto_approved: 'معتمد', approved: 'معتمد', rejected: 'مرفوض', failed: 'تعذر التحقق'
};

function dateText(value?: string | null) {
  return value ? new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

export default function SubscriptionCenter({ onUpgrade }: { onUpgrade: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(false);
    const { data: result, error: requestError } = await supabase.rpc('get_my_subscription_center');
    if (requestError) setError(true); else setData(result);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  if (loading) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) return <div className="space-y-3 rounded-2xl bg-rose-50 p-4 text-xs text-rose-700"><AlertCircle className="h-5 w-5" /><p>تعذر تحميل بيانات الاشتراك.</p><button onClick={load} className="min-h-11 rounded-xl bg-white px-4 font-bold">إعادة المحاولة</button></div>;

  const usage = data?.usage || {};
  const plan = data?.pro_plan || {};
  const subscriptions = data?.subscriptions || [];
  const requests = data?.payment_requests || [];
  const remaining = Number(usage.remaining || 0);
  const limit = Number(usage.limit || 0);
  const used = Number(usage.used || 0);
  const percent = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
  const active = subscriptions.find((item: any) => item.status === 'active');
  const retry = async (id: string) => {
    setRetrying(id);
    try { await callSanadAppFunction('sanad-v3-app-trigger-pro-payment-verify', { payment_request_id: id, source: 'subscription_center_retry' }); }
    finally { setRetrying(null); await load(); }
  };

  return <div className="space-y-4 pb-24">
    <section className="overflow-hidden rounded-[1.7rem] bg-slate-950 p-5 text-white shadow-lg">
      <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">{active ? 'سند Pro فعال' : 'حالة الاستخدام'}</span><Sparkles className="h-5 w-5 text-emerald-400" /></div>
      <h3 className="mt-4 text-lg font-bold">{active ? 'اشتراكك يعمل الآن' : usage.plan?.name || 'الخطة المجانية'}</h3>
      <p className="mt-1 text-xs text-slate-300">{active ? `ينتهي في ${dateText(active.ends_at)}` : 'الرصيد المجاني تأسيسي لمرة واحدة ولا يتجدد شهريًا.'}</p>
      <div className="mt-5 flex justify-between text-xs"><span>متبقي {toLatinDigits(remaining)} عملية</span><span>{toLatinDigits(used)} من {toLatinDigits(limit)}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} /></div>
    </section>

    <section className="rounded-[1.7rem] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between"><div><p className="text-[10px] text-slate-400">الباقة المتاحة</p><h3 className="text-sm font-bold">{plan.name || 'سند Pro'}</h3></div><span className="text-sm font-bold">{toLatinDigits(plan.price || 0)} {plan.currency || 'YER'}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px]"><div className="rounded-xl bg-slate-50 p-3"><CalendarDays className="mx-auto mb-1 h-4 w-4" />{toLatinDigits(plan.duration_days || 30)} يومًا</div><div className="rounded-xl bg-slate-50 p-3"><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />{toLatinDigits(plan.access_limit || 0)} عملية</div></div>
      <button onClick={onUpgrade} className="mt-3 min-h-11 w-full rounded-xl bg-emerald-600 text-xs font-bold text-white">{active ? 'تجديد الاشتراك' : 'الاشتراك في سند Pro'}</button>
    </section>

    <section className="space-y-2"><h3 className="px-1 text-sm font-bold">سجل الاشتراكات</h3>{subscriptions.length ? subscriptions.map((item: any) => <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between"><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold">{statusLabel[item.status] || item.status}</span><span className="text-xs font-bold">{item.plan_name}</span></div><p className="mt-2 text-[11px] text-slate-500">من {dateText(item.starts_at)} إلى {dateText(item.ends_at)}</p></div>) : <p className="rounded-2xl bg-white p-4 text-xs text-slate-500">لا توجد اشتراكات سابقة.</p>}</section>

    <section className="space-y-2"><div className="flex items-center justify-between px-1"><button onClick={load} aria-label="تحديث"><RefreshCw className="h-4 w-4" /></button><h3 className="text-sm font-bold">طلبات التفعيل</h3></div>{requests.length ? requests.map((item: any) => <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between"><span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">{statusLabel[item.status] || item.status}</span><span className="text-xs font-bold">{toLatinDigits(item.amount)} {item.currency}</span></div><p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" />{dateText(item.created_at)}</p>{['submitted','pending_review','failed'].includes(item.status) && <button disabled={retrying === item.id} onClick={() => retry(item.id)} className="mt-3 min-h-10 w-full rounded-xl bg-slate-100 text-[11px] font-bold disabled:opacity-50">{retrying === item.id ? 'جاري إعادة التحقق…' : 'إعادة التحقق بأمان'}</button>}</div>) : <p className="rounded-2xl bg-white p-4 text-xs text-slate-500">لا توجد طلبات تفعيل.</p>}</section>
  </div>;
}
