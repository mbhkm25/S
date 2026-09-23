import { MessageSquareText, PanelRightClose, X } from 'lucide-react';
import { navigateProduct } from '../../lib/productNavigation';
import SanadUnifiedNavLinks from './SanadUnifiedNavLinks';

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export default function SanadUnifiedSidebar({ mobileOpen, onCloseMobile }: Props) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="إغلاق تنقل سند"
          onClick={onCloseMobile}
          className="absolute inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <aside
        data-sanad-global-sidebar="true"
        className={`sanad-sidebar-surface absolute inset-y-0 right-0 z-50 flex h-full min-h-0 w-[86vw] max-w-[292px] flex-col overflow-hidden border-l border-[var(--sanad-border-subtle)] transition-transform lg:static lg:z-auto lg:w-[264px] lg:max-w-none lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        dir="rtl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--sanad-border-subtle)] px-3 py-3">
          <button
            type="button"
            onClick={() => navigateProduct('sanad-ai')}
            className="sanad-focus-ring flex min-w-0 items-center gap-2 rounded-lg text-right"
          >
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="سند" className="h-8 w-auto object-contain" />
            <span className="min-w-0">
              <strong className="block truncate text-[13px] font-semibold text-[var(--sanad-text-strong)]">سند</strong>
              <span className="block truncate text-[10px] text-[var(--sanad-text-subtle)]">مساحة الذكاء والتشغيل</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="sanad-focus-ring rounded-lg p-2 text-[var(--sanad-text-muted)] lg:hidden"
            aria-label="إغلاق الشريط الجانبي"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-3 py-3">
          <button
            type="button"
            onClick={() => navigateProduct('sanad-ai')}
            className="sanad-focus-ring flex w-full items-center justify-center gap-2 rounded-[var(--sanad-radius-md)] bg-[var(--sanad-surface-inverse)] px-3 py-2.5 text-[13px] font-medium text-white"
          >
            <MessageSquareText className="h-4 w-4" />
            فتح سند
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-gutter:stable]">
          <SanadUnifiedNavLinks dense onNavigate={onCloseMobile} />
        </div>

        <div className="shrink-0 border-t border-[var(--sanad-border-subtle)] px-3 py-2.5 text-[10px] leading-5 text-[var(--sanad-text-subtle)]">
          <div className="flex items-center gap-2">
            <PanelRightClose className="h-3.5 w-3.5" />
            <span>الأقسام القديمة أصبحت قدرات داخل سند.</span>
          </div>
        </div>
      </aside>
    </>
  );
}
