import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ExternalLink, Loader2, ShieldAlert, Store, X } from 'lucide-react';
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

function inboxUrl(businessId: string): string {
  const params = new URLSearchParams({ view: 'payment-inbox', business_id: businessId });
  return `/business/manage/operations?${params.toString()}`;
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
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.business_id === selectedBusinessId) || null,
    [businesses, selectedBusinessId]
  );

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

  useEffect(() => {
    if (!open) setSelectedBusinessId(null);
    if (open && businesses.length === 1) setSelectedBusinessId(businesses[0].business_id);
  }, [businesses, open]);

  if (!open || businesses.length === 0 || typeof document === 'undefined') return null;

  const approve = (businessId: string) => {
    setSelectedBusinessId(businessId);
    onLink(businessId);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-[2px] sm:items-center sm:p-4"
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800"><Store className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
              <h3 id="operation-business-link-title" className="text-sm font-bold text-slate-950">هل تخص هذه العملية نشاطًا تجاريًا؟</h3>
              <p className="mt-0.5 text-[10px] leading-5 text-slate-500">اعتمادها للنشاط يسجلها كعملية مكتملة بواسطتك داخل وارد المدفوعات.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={linking} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 disabled:opacity-50" aria-label="إغلاق نافذة اعتماد العملية"><X className="h-[18px] w-[18px]" /></button>
        </header>

        <div className="max-h-[min(72dvh,34rem)] overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {success && selectedBusiness ? (
            <div className="space-y-4" role="status" aria-live="polite">
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center text-emerald-800">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <span className="text-sm font-bold">تم اعتماد العملية لنشاط {selectedBusiness.name} وتسجيلها باسمك.</span>
              </div>
              <a href={inboxUrl(selectedBusiness.business_id)} className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">
                <ExternalLink className="h-4 w-4" /> عرض وارد المدفوعات
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-[11px] leading-5 text-rose-800" role="alert"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /><span>{error}</span></div>}
              {businesses.length === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">أنت عضو في فريق <strong className="text-slate-950">{businesses[0].name}</strong>. عند الاعتماد ستُضاف العملية إلى سجل النشاط كعملية مكتملة بواسطتك.</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button type="button" disabled={linking} onClick={() => approve(businesses[0].business_id)} className="order-1 flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:order-none">{linking ? <Loader2 className="h-4 w-4 animate-spin" /> : `اعتمادها لنشاط ${businesses[0].name}`}</button>
                    <button type="button" disabled={linking} onClick={onClose} className="order-2 min-h-[3.25rem] rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">إبقاؤها عملية شخصية</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-slate-600">اختر النشاط الذي تريد اعتماد العملية له. ستُسجل العملية مكتملة باسمك داخل وارد المدفوعات.</p>
                  <div className="space-y-2">
                    {businesses.map((business) => (
                      <button type="button" key={business.business_id} disabled={linking} onClick={() => approve(business.business_id)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right disabled:opacity-50">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">اعتمادها لنشاط {business.name}</span>
                        <span className="shrink-0 text-[10px] font-medium text-slate-500">{business.label || 'عضو فريق'}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={linking} onClick={onClose} className="min-h-[3.25rem] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">إبقاؤها عملية شخصية</button>
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
