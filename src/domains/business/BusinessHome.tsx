import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Building2, Loader2, Plus, RefreshCw, Store, UsersRound } from 'lucide-react';
import { rememberActiveManagedBusiness } from '../../lib/businessManagementApi';
import { getBusinessWorkspaces, type BusinessWorkspace } from './businessWorkspaceApi';

interface Props {
  onNavigate: (path: string) => void;
}

export default function BusinessHome({ onNavigate }: Props) {
  const [workspaces, setWorkspaces] = useState<BusinessWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try { setWorkspaces((await getBusinessWorkspaces()).items); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل مساحات الأعمال.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const owned = useMemo(() => workspaces.filter((item) => item.is_owner), [workspaces]);
  const joined = useMemo(() => workspaces.filter((item) => !item.is_owner), [workspaces]);

  const openWorkspace = (workspace: BusinessWorkspace) => {
    rememberActiveManagedBusiness(workspace.business_id);
    onNavigate('/business/manage');
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-6 pt-5" dir="rtl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div><p className="mb-1 text-[12px] font-bold text-emerald-700">سند للأعمال</p><h1 className="text-[30px] font-black tracking-tight text-slate-950">الأعمال</h1><p className="mt-1 max-w-md text-[13px] leading-6 text-slate-500">أنشطتك التجارية ومساحات العمل التي تديرها أو تعمل ضمنها.</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-60" aria-label="تحديث مساحات الأعمال">{refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}</button>
      </header>

      <section className="mb-5 overflow-hidden rounded-[30px] bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold text-emerald-300">مساحة العمل</p><h2 className="mt-1 text-[19px] font-black">نشاطك الواقعي داخل سند</h2><p className="mt-2 max-w-md text-[12px] leading-6 text-slate-300">كل نشاط يحتفظ بهويته وفريقه وعملائه وربطه المحاسبي بصورة مستقلة. تسجيل دخولك هو الهوية البشرية، وأجهزة الربط تُفوّض لاحقًا كأجهزة موثوقة.</p></div><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-300"><BriefcaseBusiness className="h-5 w-5" /></div></div>
      </section>

      {error && <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold leading-5 text-rose-700">{error}</div>}

      {loading ? <div className="flex min-h-[42vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div> : (
        <>
          <WorkspaceSection title="أنشطتي" subtitle="أنشطة تملكها وتديرها" items={owned} emptyText="لا يوجد نشاط مملوك حتى الآن." onOpen={openWorkspace} owner />
          <WorkspaceSection title="أعمل فيها" subtitle="مساحات أضيفت إليها كعضو فريق" items={joined} emptyText="لا توجد عضويات عمل نشطة." onOpen={openWorkspace} />

          <button type="button" onClick={() => onNavigate('/business/create')} className="mt-5 flex w-full items-center justify-between rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-4 text-right">
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Plus className="h-5 w-5" /></div><div><p className="text-[13px] font-black text-slate-950">إضافة نشاط جديد</p><p className="mt-1 text-[10px] leading-5 text-slate-500">أنشئ هوية مستقلة لنشاط تجاري جديد داخل سند.</p></div></div><ArrowLeft className="h-5 w-5 text-slate-400" />
          </button>
        </>
      )}
    </main>
  );
}

function WorkspaceSection({ title, subtitle, items, emptyText, onOpen, owner = false }: { title: string; subtitle: string; items: BusinessWorkspace[]; emptyText: string; onOpen: (workspace: BusinessWorkspace) => void; owner?: boolean }) {
  return (
    <section className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-4"><p className="text-[11px] font-bold text-slate-400">{subtitle}</p><h2 className="mt-1 text-[17px] font-black text-slate-950">{title}</h2></div>
      {items.length ? <div className="space-y-2">{items.map((item) => (
        <button key={item.business_id} type="button" onClick={() => onOpen(item)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-right active:scale-[0.99]">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">{owner ? <Store className="h-5 w-5" /> : <UsersRound className="h-5 w-5" />}</div><div className="min-w-0"><p className="truncate text-[13px] font-black text-slate-950">{item.business_name}</p><p className="mt-1 text-[10px] text-slate-400">{item.is_owner ? 'مالك النشاط' : item.job_title || item.membership_role || 'عضو فريق'}{item.counts.open_total > 0 ? ` · ${item.counts.open_total} قيد مفتوح` : ''}</p></div></div>
          <div className="flex items-center gap-2"><span className="hidden rounded-xl bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 sm:inline">{item.counts.completed_today} مكتملة اليوم</span><ArrowLeft className="h-4 w-4 text-slate-400" /></div>
        </button>
      ))}</div> : <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Building2 className="h-5 w-5 shrink-0 text-slate-300" /><p className="text-[11px] font-bold text-slate-500">{emptyText}</p></div>}
    </section>
  );
}
