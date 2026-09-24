import { useEffect, useState } from 'react';
import { ArrowUpRight, LogOut, MessageSquarePlus, PanelRightClose, PanelRightOpen, Settings2, UserRound, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SANAD_APP_VERSION } from '../../lib/appVersion';
import { getUserAvatarUrl } from '../../lib/userAvatar';
import { navigateProduct, productHref } from '../../lib/productNavigation';
import NotificationBell from '../notifications/NotificationBell';
import SanadUnifiedNavLinks from './SanadUnifiedNavLinks';
import SanadSidebarConversations from './SanadSidebarConversations';


type Props = {
  userId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  viewportMode: boolean;
};

type HeaderProfile = {
  full_name?: string | null;
  avatar_path?: string | null;
};

export default function SanadUnifiedSidebar({
  userId,
  mobileOpen,
  onCloseMobile,
  viewportMode,
}: Props) {
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(userId));
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('sanad:sidebar-collapsed-v1') === 'true'; }
    catch { return false; }
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try { window.localStorage.setItem('sanad:sidebar-collapsed-v1', String(!current)); }
      catch { /* Browser storage may be unavailable; local state still works. */ }
      return !current;
    });
    setAccountMenuOpen(false);
  };


  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let alive = true;
    setProfileLoading(true);
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,avatar_path')
          .eq('id', userId)
          .maybeSingle();
        if (alive) setProfile((data || null) as HeaderProfile | null);
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [accountMenuOpen]);

  const startConversation = () => {
    onCloseMobile();
    if (/\/sanad-ai\/?$/.test(window.location.pathname)) {
      window.dispatchEvent(new CustomEvent('sanad:new-conversation'));
    } else {
      navigateProduct(`sanad-ai?new=${Date.now()}`);
    }
  };

  const base = import.meta.env.VITE_APP_BASE_PATH || '/';
  const basePath = base.endsWith('/') ? base : `${base}/`;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="إغلاق تنقل سند"
          onClick={onCloseMobile}
          className="fixed inset-0 z-[70] bg-slate-950/20 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <aside
        data-sanad-global-sidebar="true"
        data-sanad-sidebar-position={viewportMode ? 'viewport' : 'document'}
        aria-label="الشريط الجانبي الرئيسي لسند"
        dir="rtl"
        className={`sanad-sidebar-surface fixed inset-y-0 right-0 z-[80] flex h-dvh w-[min(86vw,280px)] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--sanad-border-subtle)] shadow-[var(--sanad-shadow-2)] transition-[transform,width] duration-200 lg:z-10 lg:translate-x-0 lg:shadow-none ${collapsed ? 'lg:w-[72px]' : 'lg:w-[254px]'} ${viewportMode ? 'lg:static lg:self-stretch' : 'lg:sticky lg:top-0 lg:self-start'} ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div data-sanad-brand-lockup="vertical" className={`flex shrink-0 items-start justify-between gap-1 px-3 pb-2 pt-4 ${collapsed ? 'lg:flex-col lg:items-center lg:px-1.5' : ''}`}>
          <a
            href={productHref('sanad-ai')}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigateProduct('sanad-ai');
              onCloseMobile();
            }}
            className={`sanad-focus-ring flex min-w-0 flex-col items-start rounded-lg text-right ${collapsed ? 'lg:items-center' : ''}`}
            aria-label="العودة إلى محادثة سند"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="سند"
              className={`w-auto shrink-0 object-contain object-right ${collapsed ? 'h-12 max-w-[132px] lg:h-8 lg:max-w-[44px]' : 'h-12 max-w-[132px]'}`}
            />
            <span className={`mt-0.5 block text-[10px] font-medium leading-4 text-[var(--sanad-text-muted)] ${collapsed ? 'lg:sr-only' : ''}`}>
              مساحة الذكاء والتشغيل
            </span>
          </a>
          <div className={`flex shrink-0 items-center gap-1 ${collapsed ? 'lg:mt-1' : ''}`}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="sanad-focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] transition-colors hover:bg-[var(--sanad-nav-hover-bg)] lg:flex"
              aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
              title={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] lg:hidden"
              aria-label="إغلاق الشريط الجانبي"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-3 pb-2 pt-2">
          <button
            type="button"
            onClick={startConversation}
            data-sanad-primary-action="new-conversation"
            className={`sanad-focus-ring flex min-h-10 w-full items-center gap-2.5 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border)] bg-[var(--sanad-nav-action-bg)] px-3 py-2 text-right text-[13px] font-medium text-[var(--sanad-text-strong)] transition-colors hover:border-[var(--sanad-brand-mint)] hover:bg-[var(--sanad-nav-hover-bg)] ${collapsed ? 'lg:justify-center lg:px-1' : ''}`}
          >
            <MessageSquarePlus className="h-[18px] w-[18px] shrink-0 text-[var(--sanad-interactive)]" aria-hidden="true" />
            <span className={`min-w-0 flex-1 ${collapsed ? 'lg:sr-only' : ''}`}>محادثة جديدة</span>
            <span aria-hidden="true" className={`text-[15px] font-light text-[var(--sanad-text-muted)] ${collapsed ? 'lg:hidden' : ''}`}>＋</span>
          </button>
        </div>

        <div data-sanad-global-nav-scroll="true" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [scrollbar-gutter:stable] ${collapsed ? 'px-1 lg:px-1.5' : 'px-3'}`}>
          <SanadUnifiedNavLinks sections={['primary']} compact={collapsed} onNavigate={onCloseMobile} />
          <div className="my-2 border-t border-[var(--sanad-border-subtle)]" />
          <SanadSidebarConversations userId={userId} compact={collapsed} onNavigate={onCloseMobile} />
          <div className="mt-3 border-t border-[var(--sanad-border-subtle)] pt-2">
            <SanadUnifiedNavLinks
              sections={['work', 'capabilities', 'connections']}
              compact={collapsed}
              onNavigate={onCloseMobile}
            />
          </div>
        </div>

        <div data-sanad-sidebar-utilities="true" className={`shrink-0 border-t border-[var(--sanad-border-subtle)] bg-[var(--sanad-sidebar-footer-bg)] pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2 ${collapsed ? 'px-1 lg:px-1' : 'px-3'}`}>
          {userId ? (
            <div className={`flex items-center justify-between gap-2 px-1 ${collapsed ? 'lg:flex-col' : ''}`}>
              <NotificationBell onNavigate={() => window.location.assign(`${basePath}notifications`)} />
              <a
                href="/payment-inbox.html"
                className={`sanad-focus-ring inline-flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)] ${collapsed ? 'lg:hidden' : ''}`}
              >
                وارد المدفوعات <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}

          {accountMenuOpen ? (
            <div data-sanad-account-menu="true" className="my-2 space-y-0.5 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border-subtle)] bg-[var(--sanad-surface-1)] p-1.5">
              <a href={`${basePath}profile`} className="sanad-focus-ring flex min-h-9 items-center gap-2 rounded-lg px-2 text-[12px] text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)]">
                <UserRound className="h-4 w-4" /> الملف الشخصي
              </a>
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onCloseMobile();
                  navigateProduct('account-center');
                }}
                className="sanad-focus-ring flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-right text-[12px] text-[var(--sanad-text-strong)] hover:bg-[var(--sanad-nav-hover-bg)]"
              >
                <Settings2 className="h-4 w-4" /> الحساب والإعدادات
              </button>
              {userId ? (
                <button
                  type="button"
                  onClick={() => void supabase.auth.signOut()}
                  className="sanad-focus-ring flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-right text-[12px] text-[var(--sanad-danger)] hover:bg-[var(--sanad-danger-soft)]"
                >
                  <LogOut className="h-4 w-4" /> تسجيل الخروج
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (collapsed) setCollapsed(false);
              setAccountMenuOpen((current) => !current);
            }}
            aria-expanded={accountMenuOpen}
            aria-label="قائمة الحساب"
            className={`sanad-focus-ring mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2 text-[var(--sanad-text-strong)] transition hover:bg-[var(--sanad-nav-hover-bg)] ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sanad-surface-3)] text-[var(--sanad-text-strong)]">
              {profile?.avatar_path ? (
                <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" />
              ) : <span className="text-[12px] font-medium">{profileLoading ? '…' : profile?.full_name?.slice(0, 1) || 'س'}</span>}
            </span>
            <span className={`min-w-0 flex-1 text-right ${collapsed ? 'lg:sr-only' : ''}`}>
              <span className="block truncate text-[12px] font-medium">{profile?.full_name || 'حسابي'}</span>
              <span className="block truncate text-[10px] text-[var(--sanad-text-subtle)]">الحساب والأجهزة</span>
            </span>
            <Settings2 className={`h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)] ${collapsed ? 'lg:hidden' : ''}`} aria-hidden="true" />
          </button>
          <span className={`block px-3 pt-1 text-[9px] text-[var(--sanad-text-subtle)] ${collapsed ? 'lg:sr-only' : ''}`} dir="ltr">SANAD · V{SANAD_APP_VERSION}</span>
        </div>
      </aside>
    </>
  );
}
