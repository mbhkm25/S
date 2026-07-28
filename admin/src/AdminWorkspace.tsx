import { useMemo, useState } from 'react';
import {
  Activity, Bell, Building2, ChevronDown, ClipboardList, CreditCard,
  FileClock, LayoutDashboard, LogOut, Menu, MessageCircle, Search,
  Settings2, ShieldCheck, Users, X
} from 'lucide-react';
import PlatformAdmin from '../../src/components/admin/PlatformAdmin';
import BusinessSlugAdministration from './BusinessSlugAdministration';
import './admin-workspace.css';

type NavigationItem = {
  label: string;
  icon: typeof LayoutDashboard;
  target: string;
};

const navigation: NavigationItem[] = [
  { label: 'النظرة العامة', icon: LayoutDashboard, target: 'النظرة العامة' },
  { label: 'المستخدمون', icon: Users, target: 'المستخدمون' },
  { label: 'مستخدمو واتساب', icon: MessageCircle, target: 'مستخدمو واتساب' },
  { label: 'العمليات', icon: ClipboardList, target: 'العمليات' },
  { label: 'الأنشطة', icon: Building2, target: 'الأنشطة' },
  { label: 'سند Pro', icon: CreditCard, target: 'سند Pro' },
  { label: 'الإعدادات', icon: Settings2, target: 'الإعدادات' },
  { label: 'سجل الإدارة', icon: FileClock, target: 'سجل الإدارة' }
];

interface Props {
  onNavigate: (page: string, token?: string) => void;
  onSignOut: () => Promise<void>;
  adminEmail: string | null;
}

export default function AdminWorkspace({ onNavigate, onSignOut, adminEmail }: Props) {
  const [activeLabel, setActiveLabel] = useState('النظرة العامة');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const current = useMemo(() => navigation.find((item) => item.label === activeLabel) || navigation[0], [activeLabel]);

  const selectSection = (item: NavigationItem) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.platform-admin-console button'));
    const target = buttons.find((button) => button.textContent?.trim() === item.target);
    target?.click();
    setActiveLabel(item.label);
    setMobileOpen(false);
  };

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
            const active = item.label === activeLabel;
            return <button key={item.label} className={active ? 'is-active' : ''} onClick={() => selectSection(item)}><Icon /><span>{item.label}</span></button>;
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
            <div><Activity /><span>بيانات تشغيلية مباشرة من قاعدة بيانات سند</span></div>
            <span>التحديث الحالي عند فتح القسم أو طلب التحديث يدويًا</span>
          </div>
          {activeLabel === 'الأنشطة' && <BusinessSlugAdministration />}
          <PlatformAdmin onNavigate={onNavigate} />
        </section>
      </main>
    </div>
  );
}
