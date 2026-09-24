import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquarePlus, Menu, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SANAD_APP_VERSION } from '../../lib/appVersion';
import { getUserAvatarUrl } from '../../lib/userAvatar';
import { navigateProduct, productHref } from '../../lib/productNavigation';
import NotificationBell from '../notifications/NotificationBell';
import SanadUnifiedNavLinks from './SanadUnifiedNavLinks';

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
        className={`sanad-sidebar-surface fixed inset-y-0 right-0 z-[80] flex h-dvh w-[min(86vw,280px)] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--sanad-border-subtle)] shadow-[var(--sanad-shadow-2)] transition-transform duration-200 lg:z-10 lg:w-[254px] lg:translate-x-0 lg:shadow-none ${viewportMode ? 'lg:static lg:self-stretch' : 'lg:sticky lg:top-0 lg:self-start'} ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex shrink-0 items-center justify-between px-3.5 pb-2 pt-4">
          <a
            href={productHref('sanad-ai')}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigateProduct('sanad-ai');
              onCloseMobile();
            }}
            className="sanad-focus-ring flex min-w-0 items-center gap-2.5 rounded-lg text-right"
            aria-label="العودة إلى محادثة سند"
          >
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-8 w-8 shrink-0 object-contain" />
            <span className="min-w-0">
              <strong className="block truncate text-[15px] font-semibold leading-6 text-[var(--sanad-text-strong)]">سند</strong>
              <span className="block truncate text-[10px] leading-4 text-[var(--sanad-text-subtle)]">مساحة الذكاء والتشغيل</span>
            </span>
          </a>
          <button
            type="button"
            onClick={onCloseMobile}
            className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] lg:hidden"
            aria-label="إغلاق الشريط الجانبي"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 pb-2 pt-2">
          <button
            type="button"
            onClick={startConversation}
            data-sanad-primary-action="new-conversation"
            className="sanad-focus-ring flex min-h-10 w-full items-center gap-2.5 rounded-[var(--sanad-radius-md)] border border-[var(--sanad-border)] bg-[var(--sanad-nav-action-bg)] px-3 py-2 text-right text-[13px] font-medium text-[var(--sanad-text-strong)] transition-colors hover:border-[var(--sanad-brand-mint)] hover:bg-[var(--sanad-nav-hover-bg)]"
          >
            <MessageSquarePlus className="h-[18px] w-[18px] shrink-0 text-[var(--sanad-interactive)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">محادثة جديدة</span>
            <span aria-hidden="true" className="text-[15px] font-light text-[var(--sanad-text-muted)]">＋</span>
          </button>
        </div>

        <div data-sanad-global-nav-scroll="true" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-gutter:stable]">
          <SanadUnifiedNavLinks
            sections={['primary', 'work', 'capabilities']}
            onNavigate={onCloseMobile}
          />
        </div>

        <div data-sanad-sidebar-utilities="true" className="shrink-0 border-t border-[var(--sanad-border-subtle)] bg-[var(--sanad-sidebar-footer-bg)] px-3 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2">
          {userId ? (
            <div className="flex items-center justify-between gap-2 px-1">
              <NotificationBell onNavigate={() => window.location.assign(`${basePath}notifications`)} />
              <a
                href="/payment-inbox.html"
                className="sanad-focus-ring inline-flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-nav-hover-bg)]"
              >
                وارد المدفوعات <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}

          <a
            href={`${basePath}profile`}
            className="sanad-focus-ring mt-1 flex min-h-11 items-center gap-2.5 rounded-[var(--sanad-radius-md)] px-2 text-[var(--sanad-text-strong)] transition hover:bg-[var(--sanad-nav-hover-bg)]"
            aria-label="فتح الحساب الشخصي"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sanad-surface-3)] text-[var(--sanad-text-strong)]">
              {profile?.avatar_path ? (
                <img
                  src={getUserAvatarUrl(profile.avatar_path)}
                  alt={profile.full_name || 'صورة المستخدم'}
                  className="h-full w-full object-cover"
                />
              ) : <span className="text-[12px] font-medium">{profileLoading ? '…' : profile?.full_name?.slice(0, 1) || 'س'}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{profile?.full_name || 'حسابي'}</span>
              <span className="block truncate text-[10px] text-[var(--sanad-text-subtle)]">الحساب والأجهزة</span>
            </span>
            <Menu className="h-3.5 w-3.5 shrink-0 text-[var(--sanad-text-subtle)]" aria-hidden="true" />
          </a>
          <SanadUnifiedNavLinks sections={['utility']} onNavigate={onCloseMobile} />
          <span className="block px-3 pt-1 text-[9px] text-[var(--sanad-text-subtle)]" dir="ltr">SANAD · V{SANAD_APP_VERSION}</span>
        </div>
      </aside>
    </>
  );
}
