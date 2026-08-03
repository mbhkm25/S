import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, ShieldAlert, Store, X } from 'lucide-react';
import type { LinkableBusinessItem } from '../../lib/businessApi';

interface OperationBusinessLinkSheetProps {
  open: boolean;
  businesses: LinkableBusinessItem[];
  linking: boolean;
  success: boolean;
  error: string | null;
  onLink: (businessId: string) => void;
  onClose: () => void;
}

export default function OperationBusinessLinkSheet({
  open,
  businesses,
  linking,
  success,
  error,
  onLink,
  onClose
}: OperationBusinessLinkSheetProps) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !linking) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [linking, onClose, open]);

  if (!open || businesses.length === 0 || typeof document === 'undefined') return null;

  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-2 backdrop-blur-[2px] sm:items-center sm:p-4"
      dir="rtl"
      role="presentation"
      data-operation-business-sheet-overlay
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !linking) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-business-link-title"
        className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-right shadow-2xl sm:rounded-3xl"
        data-operation-business-sheet
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />

        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
              <Store className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h3 id="operation-business-link-title" className="text-sm font-bold text-slate-950">
                ربط العملية بنشاط تجاري
              </h3>
              <p className="mt-0.5 text-[10px] leading-5 text-slate-500">
                حدّد ما إذا كانت العملية تخص نشاطك أم أنها عملية شخصية.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={linking}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="إغلاق نافذة ربط العملية"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="max-h-[min(72dvh,34rem)] overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {success ? (
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center text-emerald-800" role="status" aria-live="polite">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-bold">تم ربط العملية بالنشاط التجاري بنجاح.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-[11px] leading-5 text-rose-800" role="alert">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {businesses.length === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">
                    أنت عضو في فريق <strong className="text-slate-950">{businesses[0].name}</strong>. هل تريد ربط هذه العملية بهذا النشاط؟
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={linking}
                      onClick={() => onLink(businesses[0].business_id)}
                      className="order-1 flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:order-none"
                    >
                      {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ربط بالنشاط'}
                    </button>
                    <button
                      type="button"
                      disabled={linking}
                      onClick={onClose}
                      className="order-2 min-h-[3.25rem] rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      لا، عملية شخصية
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">اختر النشاط الذي تريد إسناد هذه العملية إليه:</p>
                  <div className="space-y-2">
                    {businesses.map((business) => (
                      <button
                        type="button"
                        key={business.business_id}
                        disabled={linking}
                        onClick={() => onLink(business.business_id)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{business.name}</span>
                        <span className="shrink-0 text-[10px] font-medium text-slate-500">{business.label || 'موظف'}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={linking}
                    onClick={onClose}
                    className="min-h-[3.25rem] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    لا، عملية شخصية
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
