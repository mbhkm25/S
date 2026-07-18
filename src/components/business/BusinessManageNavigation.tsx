import { useEffect } from 'react';
import {
  Clock,
  Database,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PlusCircle,
  Puzzle,
  ShoppingBag,
  UserCheck,
  Users,
  Wrench,
  X
} from 'lucide-react';
import { INTERNAL_BUSINESS_CATALOG_ENABLED } from '../../lib/urlUtils';

export type BusinessManageTab =
  | 'overview'
  | 'products'
  | 'services'
  | 'hours'
  | 'accounts'
  | 'complaints'
  | 'reports'
  | 'integrations'
  | 'addons'
  | 'customers'
  | 'team';

interface BusinessManageNavigationProps {
  activeTab: BusinessManageTab;
  complaintsCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (tab: BusinessManageTab) => void;
}

const primaryTabs = [
  { id: 'overview', label: 'لوحة الأداء والنظرة العامة', shortLabel: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'products', label: 'كتالوج المنتجات المصور', shortLabel: 'المنتجات', icon: ShoppingBag },
  { id: 'services', label: 'قائمة الخدمات والحلول', shortLabel: 'الخدمات', icon: Wrench },
  { id: 'hours', label: 'الدوام ومواقع التواصل', shortLabel: 'الدوام والتواصل', icon: Clock },
  { id: 'accounts', label: 'الحسابات المالية للنشاط', shortLabel: 'الحسابات المالية', icon: Database },
  { id: 'customers', label: 'إدارة العملاء', shortLabel: 'إدارة العملاء', icon: Users },
  { id: 'team', label: 'فريق العمل والصلاحيات', shortLabel: 'فريق العمل', icon: UserCheck },
  { id: 'complaints', label: 'صندوق الشكاوى والملاحظات', shortLabel: 'الشكاوى', icon: MessageSquare },
  { id: 'reports', label: 'التقارير', shortLabel: 'التقارير', icon: FileText }
] as const;

const secondaryTabs = [
  { id: 'integrations', label: 'خيار التكاملات', shortLabel: 'التكاملات', icon: Puzzle },
  { id: 'addons', label: 'متجر إضافات سند', shortLabel: 'الإضافات', icon: PlusCircle }
] as const;

export default function BusinessManageNavigation({
  activeTab,
  complaintsCount,
  open,
  onOpenChange,
  onSelect
}: BusinessManageNavigationProps) {
  const tabs = primaryTabs.filter((tab) => tab.id !== 'products' || INTERNAL_BUSINESS_CATALOG_ENABLED);
  const active = [...tabs, ...secondaryTabs].find((tab) => tab.id === activeTab) || tabs[0];

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const choose = (tab: BusinessManageTab) => {
    onSelect(tab);
    onOpenChange(false);
  };

  const renderButton = (tab: (typeof primaryTabs)[number] | (typeof secondaryTabs)[number], compact = false) => {
    const Icon = tab.icon;
    const selected = activeTab === tab.id;
    const label = tab.id === 'complaints' && complaintsCount > 0
      ? `${compact ? tab.shortLabel : tab.label} (${complaintsCount})`
      : compact ? tab.shortLabel : tab.label;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => choose(tab.id as BusinessManageTab)}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right text-[11px] font-bold transition ${selected ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{label}</span>
      </button>
    );
  };

  return (
    <>
      <div className="w-full lg:hidden">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-right shadow-sm"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl bg-slate-100 p-2 text-slate-700"><active.icon className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-[9px] font-bold text-slate-400">قسم إدارة النشاط</span>
              <span className="block truncate text-xs font-bold text-slate-900">{active.shortLabel}</span>
            </span>
          </span>
          <Menu className="h-5 w-5 text-slate-600" />
        </button>
      </div>

      <aside className="hidden w-64 shrink-0 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm lg:block">
        <div className="mb-2 border-b border-slate-100 px-2 pb-3 text-[10px] font-bold text-slate-400">أقسام التحكم</div>
        <div className="space-y-1">{tabs.map((tab) => renderButton(tab))}</div>
        <div className="my-3 border-t border-slate-100" />
        <div className="px-2 pb-2 text-[10px] font-bold text-slate-400">الإضافات والربط</div>
        <div className="space-y-1">{secondaryTabs.map((tab) => renderButton(tab))}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/60 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label="أقسام إدارة النشاط">
          <button className="absolute inset-0" onClick={() => onOpenChange(false)} aria-label="إغلاق القائمة" />
          <section className="relative z-10 flex max-h-[86dvh] w-full min-h-0 flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4">
              <div><h2 className="text-sm font-bold text-slate-950">أقسام إدارة النشاط</h2><p className="mt-1 text-[10px] text-slate-500">انتقل مباشرة إلى القسم المطلوب</p></div>
              <button onClick={() => onOpenChange(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X className="h-4 w-4" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-2 gap-2">{tabs.map((tab) => renderButton(tab, true))}</div>
              <div className="my-4 border-t border-slate-100" />
              <p className="mb-2 text-[10px] font-bold text-slate-400">الإضافات والربط</p>
              <div className="grid grid-cols-2 gap-2">{secondaryTabs.map((tab) => renderButton(tab, true))}</div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
