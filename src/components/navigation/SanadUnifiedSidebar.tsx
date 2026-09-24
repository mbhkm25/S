import { useEffect } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import { navigateProduct } from '../../lib/productNavigation';
import SanadUnifiedNavLinks from './SanadUnifiedNavLinks';

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  viewportMode: boolean;
};

export default function SanadUnifiedSidebar({ mobileOpen, onCloseMobile, viewportMode }: Props) {
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const openSanad = () => {
    navigateProduct('sanad-ai');
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="إغلاق تنقل سند"
          onClick={onCloseMobile}
          className="fixed inset-0 z-[70] bg-slate-950/30 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <aside
        data-sanad-global-sidebar="true"
        data-sanad-sidebar-position={viewportMode ? 'viewport' : 'document'}
        aria-label="الشريط الجانبي الرئيسي لسند"
        dir="rtl"
        className={`sanad-sidebar-surface fixed inset-y-0 right-0 z-[80] flex h-dvh w-[min(86vw,272px)] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--sanad-border-subtle)] shadow-[var(--sanad-shadow-3)] transition-transform duration-200 lg:z-10 lg:w-[248px] lg:translate-x-0 lg:shadow-none ${viewportMode ? 'lg:static lg:self-stretch' : 'lg:sticky lg:top-0 lg:self-start'} ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--sanad-border-subtle)] px-3.5 py-3">
          <button
            type="button"
            onClick={openSanad}
            className="sanad-focus-ring flex min-w-0 items-center gap-2.5 rounded-lg text-right"
            aria-label="فتح مساحة سند"
          >
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-9 w-9 shrink-0 object-contain" />
            <span className="min-w-0">
              <strong className="block truncate text-[16px] font-semibold leading-6 text-[var(--sanad-text-strong)]">سند</strong>
              <span className="block truncate text-[11px] leading-4 text-[var(--sanad-text-subtle)]">مساحة الذكاء والتشغيل</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="sanad-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sanad-text-muted)] hover:bg-[var(--sanad-surface-2)] lg:hidden"
            aria-label="إغلاق الشريط الجانبي"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 pt-3 pb-2">
          <button
            type="button"
            onClick={openSanad}
            className="sanad-focus-ring flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--sanad-radius-md)] bg-[var(--sanad-surface-inverse)] px-3 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <MessageSquareText className="h-[17px] w-[17px]" aria-hidden="true" />
            فتح سند
          </button>
        </div>

        <div data-sanad-global-nav-scroll="true" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-gutter:stable]">
          <SanadUnifiedNavLinks
            sections={['primary', 'work', 'capabilities']}
            onNavigate={onCloseMobile}
          />
        </div>

        <div className="shrink-0 border-t border-[var(--sanad-border-subtle)] px-3 py-2">
          <SanadUnifiedNavLinks sections={['utility']} onNavigate={onCloseMobile} />
        </div>
      </aside>
    </>
  );
}
