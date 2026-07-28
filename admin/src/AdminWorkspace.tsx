import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, BookOpen, Building2, CheckCircle2, ChevronDown,
  ClipboardList, CreditCard, FileClock, LayoutDashboard, LogOut, Menu,
  MessageCircle, Search, Settings2, ShieldCheck, Users, X
} from 'lucide-react';
import PlatformAdmin from '../../src/components/admin/PlatformAdmin';
import KnowledgeAdminSection from '../../src/components/admin/KnowledgeAdminSection';
import BusinessSlugAdministration from './BusinessSlugAdministration';
import './admin-workspace.css';

type AdminSection = 'overview' | 'users' | 'whatsapp' | 'operations' | 'businesses' | 'pro' | 'knowledge' | 'settings' | 'audit';

type NavigationItem = {
  id: AdminSection;
  label: string;
  icon: typeof LayoutDashboard;
  legacyTarget?: string;
};

const navigation: NavigationItem[] = [
  { id: 'overview', label: 'النظرة العامة', icon: LayoutDashboard, legacyTarget: 'النظرة العامة' },
  { id: 'users', label: 'المستخدمون', icon: Users, legacyTarget: 'المستخدمون' },
  { id: 'whatsapp', label: 'مستخدمو واتساب', icon: MessageCircle, legacyTarget: 'مستخدمو واتساب' },
  { id: 'operations', label: 'العمليات', icon: ClipboardList, legacyTarget: 'العمليات' },
  { id: 'businesses', label: 'الأنشطة', icon: Building2, legacyTarget: 'الأنشطة' },
  { id: 'pro', label: 'سند Pro', icon: CreditCard, legacyTarget: 'سند Pro' },
  { id: 'knowledge', label: 'إدارة المعرفة', icon: BookOpen },
  { id: 'settings', label: 'الإعدادات', icon: Settings2, legacyTarget: 'الإعدادات' },
  { id: 'audit', label: 'سجل الإدارة', icon: FileClock, legacyTarget: 'سجل الإدارة' }
];

const sectionIds = new Set<AdminSection>(navigation.map((item) => item.id));

function getInitialSection(): AdminSection {
  const hash = window.location.hash.replace(/^#\/?/, '') as AdminSection;
  return sectionIds.has(hash) ? hash : 'overview';
}

interface Props {
  onNavigate: (page: string, token?: string) => void;
  onSignOut: () => Promise<void>;
  adminEmail: string | null;
}

export default function AdminWorkspace({ onNavigate, onSignOut, adminEmail }: Props) {
  const [activeSection, setActiveSection] = useState<AdminSection>(getInitialSection);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceSuccess, setWorkspaceSuccess] = useState<string | null>(null);
  const current = useMemo(() => navigation.find((item) => item.id === activeSection) || navigation[0], [activeSection]);

  useEffect(() => {
    const syncFromHash = () => {
      const next = window.location.hash.replace(/^#\/?/, '') as AdminSection;
      if (sectionIds.has(next)) setActiveSection(next);
    };
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const selectSection = (item: NavigationItem) => {
    setWorkspaceError(null);
    setWorkspaceSuccess(null);
    setActiveSection(item.id);
    setMobileOpen(false);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${item.id}`);

    // توافق مؤقت مع PlatformAdmin القديم إلى أن تُفصل صفحاته الداخلية بالكامل.
    if (item.legacyTarget) {
      requestAnimationFrame(() => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.platform-admin-console button'));
        buttons.find((button) => button.textContent?.trim() === item.legacyTarget)?.click();
      });
    }
  };

  const showKnowledge = activeSection === 'knowledge';

  return (
    <div className="sanad-admin-shell" dir="rtl">
      <aside className={`sanad-admin-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="التنقل الإداري">
        <div className="sanad-admin-brand">
          <div className="sanad-admin-brand-mark"><ShieldCheck /></div>
          <div><strong>سند</strong><span>لوحة إدارة المنصة</span></div>
          <button className="sanad-admin-mobile-close" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة"><X /></button>
        </div>

        <nav className="sanad-admin-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return <button key={item.id} className={active ? 'is-active' : ''} onClick={() => selectSection(item)} aria-current={active ? 'page' : undefined}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>

        <div className="sanad-admin-sidebar-footer">
          <div className="sanad-admin-system-state"><span className="status-dot" /><div><strong>الاتصال متاح</strong><span>Supabase · جلسة محمية</span></div></div>
          <button onClick={() => onNavigate('profile')}><LogOut /><span>العودة إلى تطبيق سند</span></button>
        </div>
      </aside>

      {mobileOpen && <button className="sanad-admin-backdrop" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} />}

      <main className="sanad-admin-main">
        <header className="sanad-admin-topbar">
          <div className="sanad-admin-heading">
            <button className="sanad-admin-menu" onClick={() => setMobileOpen(true)} aria-label="فتح القائمة"><Menu /></button>
            <div><span>مركز تشغيل سند</span><h1>{current.label}</h1></div>
          </div>
          <div className="sanad-admin-top-actions">
            <label className="sanad-admin-global-search"><Search /><input placeholder="بحث سريع في لوحة الإدارة" /></label>
            <button className="sanad-admin-icon-button" aria-label="الإشعارات"><Bell /></button>
            <div className="relative">
              <button className="sanad-admin-profile" type="button" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}>
                <div className="avatar">س</div><div><strong>مدير سند</strong><span>{adminEmail || 'Platform Admin'}</span></div><ChevronDown />
              </button>
              {accountOpen && <div className="absolute left-0 top-[calc(100%+8px)] z-50 min-w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <button type="button" onClick={() => void onSignOut()} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-right text-[10px] font-bold text-rose-700 hover:bg-rose-50"><LogOut className="h-4 w-4" />تسجيل الخروج من الإدارة</button>
              </div>}
            </div>
          </div>
        </header>

        <section className="sanad-admin-content">
          <div className="sanad-admin-context-strip">
            <div><Activity /><span>{showKnowledge ? 'مصادر المعرفة الرسمية التي يعتمد عليها مساعد سند' : 'بيانات تشغيلية مباشرة من قاعدة بيانات سند'}</span></div>
            <span>التحديث الحالي عند فتح القسم أو طلب التحديث يدويًا</span>
          </div>

          {workspaceError && <button type="button" onClick={() => setWorkspaceError(null)} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-rose-50 p-3 text-right text-xs font-bold text-rose-700"><AlertTriangle className="h-4 w-4" />{workspaceError}</button>}
          {workspaceSuccess && <button type="button" onClick={() => setWorkspaceSuccess(null)} className="mb-3 flex w-full items-center gap-2 rounded-xl bg-emerald-50 p-3 text-right text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{workspaceSuccess}</button>}

          {showKnowledge ? (
            <KnowledgeAdminSection setError={setWorkspaceError} setSuccess={setWorkspaceSuccess} />
          ) : (
            <>
              {activeSection === 'businesses' && <BusinessSlugAdministration />}
              <PlatformAdmin onNavigate={onNavigate} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
