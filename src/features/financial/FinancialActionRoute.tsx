import { useEffect, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Loader2, WalletCards } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CommercialActions, PersonalFinanceActions } from './FinancialWorkspaceActions';
import { BusinessMasterDataActions, PersonalMasterDataActions } from './FinancialMasterDataActions';
import CommercialSettlementPanel from './CommercialSettlementPanel';
import PersonalFinanceCorrectionPanel from './PersonalFinanceCorrectionPanel';
import { getOwnedBusinesses } from './api/financialApi';
import type { AccountBusiness } from './api/financialTypes';

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default function FinancialActionRoute() {
  const commercial = /\/commercial\/actions\/?$/.test(window.location.pathname);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [businesses, setBusinesses] = useState<AccountBusiness[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !sessionData.session?.user) {
        setError('هذه المساحة تتطلب تسجيل الدخول إلى حساب سند.');
        setLoading(false);
        return;
      }
      if (commercial) {
        const result = await getOwnedBusinesses();
        if (!active) return;
        if (result.error) { setError(result.error.message || 'تعذر تحميل المنشآت.'); setLoading(false); return; }
        const list = result.data || [];
        setBusinesses(list);
        setBusinessId(list[0]?.id || '');
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [commercial]);

  const backPath = commercial ? 'commercial' : 'financial';
  const Icon = commercial ? BriefcaseBusiness : WalletCards;
  const onChanged = () => setRevision(value => value + 1);

  return (
    <div className="min-h-screen bg-[#F7F7F5] font-arabic text-slate-900" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button type="button" onClick={() => window.location.assign(`${basePath()}${backPath}`)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="العودة">
            <ArrowRight className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></span>
          <div><p className="text-[9px] font-bold text-slate-400">إجراءات موثقة</p><h1 className="text-base font-black">{commercial ? 'إجراءات سند التجاري' : 'إجراءات سند المالي'}</h1></div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5 pb-24">
        {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div> : null}
        {!loading && error ? <div className="rounded-[1.5rem] bg-rose-50 p-5 text-xs leading-6 text-rose-800">{error}</div> : null}
        {!loading && !error && commercial ? (
          <>
            {businesses.length ? <label className="block rounded-[1.4rem] bg-white p-4 shadow-sm"><span className="mb-2 block text-[10px] font-bold text-slate-500">المنشأة</span><select value={businessId} onChange={event => { setBusinessId(event.target.value); setRevision(value => value + 1); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none">{businesses.map(item => <option key={item.id} value={item.id}>{item.name || 'نشاط بدون اسم'}</option>)}</select></label> : <div className="rounded-[1.4rem] bg-amber-50 p-4 text-xs leading-6 text-amber-800">لا توجد منشأة مملوكة لهذا الحساب.</div>}
            {businessId ? <div key={`${businessId}-${revision}`} className="space-y-4"><BusinessMasterDataActions businessId={businessId} onChanged={onChanged} /><CommercialActions businessId={businessId} onChanged={onChanged} /><CommercialSettlementPanel businessId={businessId} onChanged={onChanged} /></div> : null}
          </>
        ) : null}
        {!loading && !error && !commercial ? <div key={revision} className="space-y-4"><PersonalMasterDataActions onChanged={onChanged} /><PersonalFinanceActions onChanged={onChanged} /><PersonalFinanceCorrectionPanel onChanged={onChanged} /></div> : null}
      </main>
    </div>
  );
}
