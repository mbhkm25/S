import { useEffect, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Loader2, WalletCards } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CommercialActions, PersonalFinanceActions } from './FinancialWorkspaceActions';
import { BusinessMasterDataActions, PersonalMasterDataActions } from './FinancialMasterDataActions';
import CommercialSettlementPanel from './CommercialSettlementPanel';
import PersonalFinanceCorrectionPanel from './PersonalFinanceCorrectionPanel';
import { getOwnedBusinesses } from './api/financialApi';
import type { AccountBusiness } from './api/financialTypes';
import { navigateProduct } from '../../lib/productNavigation';

type PersonalActionFocus = 'account' | 'category' | 'party' | 'transaction' | 'budget' | 'obligation' | 'goal' | null;

function personalFocus(): PersonalActionFocus {
  const value = new URLSearchParams(window.location.search).get('focus');
  return ['account', 'category', 'party', 'transaction', 'budget', 'obligation', 'goal'].includes(value || '')
    ? value as Exclude<PersonalActionFocus, null>
    : null;
}

const FOCUS_META: Record<Exclude<PersonalActionFocus, null>, { title: string; back: string }> = {
  account: { title: 'إدارة الحسابات', back: 'financial/accounts' },
  category: { title: 'إدارة التصنيفات', back: 'financial' },
  party: { title: 'إدارة الأطراف', back: 'financial/parties' },
  transaction: { title: 'عملية مالية جديدة', back: 'financial/transactions' },
  budget: { title: 'إدارة الميزانيات', back: 'financial/budgets' },
  obligation: { title: 'إدارة الالتزامات', back: 'financial/obligations' },
  goal: { title: 'إدارة الأهداف', back: 'financial/goals' },
};

export default function FinancialActionRoute() {
  const commercial = /\/commercial\/actions\/?$/.test(window.location.pathname);
  const focus = commercial ? null : personalFocus();
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

  const backPath = commercial ? 'commercial' : focus ? FOCUS_META[focus].back : 'financial';
  const title = commercial ? 'إجراءات سند التجاري' : focus ? FOCUS_META[focus].title : 'إجراءات سند المالي';
  const Icon = commercial ? BriefcaseBusiness : WalletCards;
  const onChanged = () => setRevision(value => value + 1);
  const masterFocus = focus === 'account' || focus === 'category' || focus === 'party' ? focus : null;
  const financeFocus = focus === 'transaction' || focus === 'budget' || focus === 'obligation' || focus === 'goal' ? focus : null;

  return (
    <div className="min-h-screen bg-[#F7F7F5] font-arabic text-slate-900" dir="rtl">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button type="button" onClick={() => navigateProduct(backPath)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="العودة">
            <ArrowRight className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></span>
          <div><p className="text-[9px] font-bold text-slate-400">إجراءات موثقة</p><h1 className="text-base font-black">{title}</h1></div>
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
        {!loading && !error && !commercial ? (
          <div key={revision} className="space-y-4">
            {masterFocus ? <PersonalMasterDataActions onChanged={onChanged} initialMode={masterFocus} /> : null}
            {financeFocus ? <PersonalFinanceActions onChanged={onChanged} initialMode={financeFocus} /> : null}
            {!focus ? (
              <>
                <PersonalMasterDataActions onChanged={onChanged} />
                <PersonalFinanceActions onChanged={onChanged} />
                <PersonalFinanceCorrectionPanel onChanged={onChanged} />
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
