import { useCallback, useEffect, useState } from 'react';
import { Archive, Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  getBusinessErpRetentionPolicy,
  planBusinessErpSnapshotPrune,
  setBusinessErpRetentionPolicy,
  type BusinessErpPrunePlan,
  type BusinessErpRetentionPolicy,
} from '../../lib/businessAccountingApi';

type Props = { businessId: string };

export default function BusinessErpRetentionPolicy({ businessId }: Props) {
  const [policy, setPolicy] = useState<BusinessErpRetentionPolicy | null>(null);
  const [plan, setPlan] = useState<BusinessErpPrunePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPolicy, nextPlan] = await Promise.all([
        getBusinessErpRetentionPolicy(businessId),
        planBusinessErpSnapshotPrune(businessId),
      ]);
      setPolicy(nextPolicy);
      setPlan(nextPlan);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'تعذر تحميل سياسة الاحتفاظ.';
      // Active business members may view accounting data but only owners manage retention.
      if (message.includes('business_owner_required')) {
        setPolicy(null);
        setPlan(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  if (!policy && !error) return null;

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      const next = await setBusinessErpRetentionPolicy(businessId, {
        enabled: policy.enabled,
        retainCompletedSnapshots: policy.retain_completed_snapshots,
        retainDays: policy.retain_days,
        retainRawEventDays: policy.retain_raw_event_days,
      });
      setPolicy(next);
      setPlan(await planBusinessErpSnapshotPrune(businessId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ السياسة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Archive className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold text-amber-700">إدارة النسخ</span>
          <h3 className="mt-0.5 text-sm font-black text-slate-950">سياسة الاحتفاظ بالنسخ السحابية</h3>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">هذه السياسة معطلة افتراضيًا حتى ينجح أول اختبار ميداني للنسخة. التفعيل لا يحذف شيئًا مباشرة؛ الحذف يتم فقط عبر مهمة صيانة service-role.</p>
        </div>
      </div>

      {error && <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-[10px] text-rose-700">{error}</div>}

      {policy && (
        <>
          <label className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <span><strong className="block text-xs text-slate-900">تفعيل سياسة التنظيف</strong><span className="mt-1 block text-[9px] text-slate-500">لا نوصي بتفعيلها قبل اعتماد snapshot الميداني الأول.</span></span>
            <input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy({...policy,enabled:e.target.checked})} className="h-5 w-5" />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="rounded-2xl border border-slate-200 p-3"><span className="block text-[8px] text-slate-400">عدد النسخ المكتملة</span><input type="number" min={2} max={90} value={policy.retain_completed_snapshots} onChange={e=>setPolicy({...policy,retain_completed_snapshots:Number(e.target.value)})} className="mt-1 w-full text-xs font-bold outline-none" /></label>
            <label className="rounded-2xl border border-slate-200 p-3"><span className="block text-[8px] text-slate-400">أيام النسخ</span><input type="number" min={7} max={3650} value={policy.retain_days} onChange={e=>setPolicy({...policy,retain_days:Number(e.target.value)})} className="mt-1 w-full text-xs font-bold outline-none" /></label>
            <label className="rounded-2xl border border-slate-200 p-3"><span className="block text-[8px] text-slate-400">أيام raw evidence</span><input type="number" min={30} max={3650} value={policy.retain_raw_event_days} onChange={e=>setPolicy({...policy,retain_raw_event_days:Number(e.target.value)})} className="mt-1 w-full text-xs font-bold outline-none" /></label>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-sky-100 bg-sky-50 p-3 text-[9px] leading-5 text-sky-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>الخطة الحالية تشير إلى {plan?.items.length || 0} نسخة مؤهلة نظريًا للتنظيف. هذا Preview فقط ولا ينفذ حذفًا.</span>
          </div>

          <button type="button" onClick={()=>void save()} disabled={saving} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 py-3 text-xs font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ السياسة
          </button>
        </>
      )}
    </section>
  );
}
