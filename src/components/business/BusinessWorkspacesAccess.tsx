import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronLeft, CircleAlert, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toLatinDigits } from '../../lib/digits';

type WorkspacePermissions = {
  view?: boolean;
  claim?: boolean;
  complete?: boolean;
  release?: boolean;
  reassign?: boolean;
  review?: boolean;
};

type WorkspaceCounts = {
  new?: number;
  mine?: number;
  team_active?: number;
  review_required?: number;
  completed_today?: number;
  open_total?: number;
};

export type BusinessWorkspaceContext = {
  business_id: string;
  business_name: string;
  slug?: string | null;
  is_owner: boolean;
  membership_status?: string | null;
  membership_role?: string | null;
  job_title?: string | null;
  permissions: WorkspacePermissions;
  counts: WorkspaceCounts;
};

type Props = {
  mode?: 'home' | 'profile';
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'مالك النشاط',
  admin: 'مدير النشاط',
  manager: 'مشرف',
  supervisor: 'مشرف',
  cashier: 'كاشير',
  employee: 'عضو فريق',
  member: 'عضو فريق'
};

function roleLabel(workspace: BusinessWorkspaceContext): string {
  if (workspace.is_owner) return 'مالك النشاط';
  const role = String(workspace.membership_role || '').trim().toLowerCase();
  return workspace.job_title?.trim() || ROLE_LABELS[role] || 'عضو فريق';
}

function workspaceUrl(businessId: string): string {
  const params = new URLSearchParams({
    business_id: businessId,
    return_to: '/profile#business-workspaces'
  });
  return `/payment-inbox.html?${params.toString()}`;
}

function countLabel(value: number | undefined): string {
  return toLatinDigits(String(Number(value || 0)));
}

function workspaceCountLabel(count: number): string {
  return count === 1 ? 'مساحة عمل' : 'مساحات عمل';
}

export default function BusinessWorkspacesAccess({ mode = 'profile' }: Props) {
  const [items, setItems] = useState<BusinessWorkspaceContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_business_workspaces');
      if (rpcError) throw rpcError;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل مساحات العمل.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && window.location.hash === '#business-workspaces') {
      window.setTimeout(() => document.getElementById('business-workspaces')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [loading]);

  const totals = useMemo(() => items.reduce((summary, item) => ({
    new: summary.new + Number(item.counts?.new || 0),
    mine: summary.mine + Number(item.counts?.mine || 0)
  }), { new: 0, mine: 0 }), [items]);

  if (loading) {
    return (
      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-sm" dir="rtl">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-xs font-bold">جاري تحميل مساحات العمل...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[1.7rem] border border-rose-100 bg-rose-50 p-4" dir="rtl">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <strong className="block text-xs text-rose-800">تعذر تحميل مساحات العمل</strong>
            <p className="mt-1 break-words text-[10px] leading-5 text-rose-700">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-rose-700 shadow-sm">إعادة المحاولة</button>
          </div>
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section id="business-workspaces" className="scroll-mt-24 overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,23,42,0.07)]" dir="rtl" aria-labelledby={`business-workspaces-${mode}`}>
      <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-sky-50 px-4 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-emerald-300 shadow-lg">
          <BriefcaseBusiness className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold text-emerald-700">التشغيل اليومي للفريق</p>
          <h2 id={`business-workspaces-${mode}`} className="mt-0.5 text-sm font-bold text-slate-950">مساحات العمل</h2>
          <p className="mt-1 text-[9px] leading-5 text-slate-500">كل نشاط تملكه أو ترتبط به كعضو فريق يظهر هنا، مع صلاحياتك الفعلية.</p>
        </div>
        <div className="shrink-0 text-left">
          <strong className="block text-base text-slate-950">{countLabel(items.length)}</strong>
          <span className="block text-[8px] font-bold text-slate-400">{workspaceCountLabel(items.length)}</span>
          <span className="mt-1 block whitespace-nowrap text-[8px] font-bold text-slate-500">جديدة: {countLabel(totals.new)} · لدي: {countLabel(totals.mine)}</span>
        </div>
      </header>

      <div className="grid gap-2 p-3">
        {items.map((workspace) => {
          const canView = workspace.permissions?.view === true;
          const newCount = Number(workspace.counts?.new || 0);
          const mineCount = Number(workspace.counts?.mine || 0);
          const content = (
            <>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${canView ? 'text-slate-700' : 'text-slate-400'}`}>
                {canView ? (workspace.is_owner ? <ShieldCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />) : <LockKeyhole className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-slate-950">{workspace.business_name}</strong>
                <span className="mt-1 block text-[9px] font-bold text-slate-500">{roleLabel(workspace)}</span>
                {canView ? (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-bold text-emerald-800">جديدة: {countLabel(newCount)}</span>
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-[8px] font-bold text-sky-800">لدي: {countLabel(mineCount)}</span>
                    {workspace.permissions.claim && <span className="rounded-full bg-white px-2 py-1 text-[8px] font-bold text-slate-600">يمكنك الاستلام</span>}
                  </span>
                ) : (
                  <span className="mt-2 block text-[9px] leading-5 text-amber-700">عضويتك نشطة، لكن صلاحية وارد المدفوعات لم يمنحها مالك النشاط بعد.</span>
                )}
              </span>
              {canView && <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-1" />}
            </>
          );

          return canView ? (
            <a key={workspace.business_id} href={workspaceUrl(workspace.business_id)} className="group flex items-center gap-3 rounded-[1.35rem] border border-slate-100 bg-slate-50/80 p-3.5 text-right transition active:scale-[0.99] active:bg-slate-100">
              {content}
            </a>
          ) : (
            <article key={workspace.business_id} className="flex items-center gap-3 rounded-[1.35rem] border border-amber-100 bg-amber-50/70 p-3.5 text-right">
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
