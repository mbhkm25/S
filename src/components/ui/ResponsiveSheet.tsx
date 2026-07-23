import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
  zIndexClass?: string;
}

export default function ResponsiveSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = 'إغلاق',
  className = '',
  zIndexClass = 'z-[120]'
}: ResponsiveSheetProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClass} flex items-end justify-center overflow-hidden sm:items-center sm:p-4`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <motion.button
            type="button"
            aria-label={closeLabel}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={`relative flex max-h-[min(92dvh,860px)] w-full max-w-xl flex-col overflow-hidden rounded-t-[2rem] border border-white/60 bg-white shadow-[0_-24px_80px_rgba(15,23,42,.24)] sm:rounded-[2rem] ${className}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 42, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34, mass: 0.82 }}
          >
            <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 sm:hidden" />
            <header className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1 text-right">
                <h2 id={titleId} className="text-sm font-bold text-slate-950">{title}</h2>
                {description && <p id={descriptionId} className="mt-1 text-[10px] leading-5 text-slate-500">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label={closeLabel} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition active:scale-95">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-5">
              {children}
            </div>
            {footer && <footer className="shrink-0 border-t border-slate-100 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-5 sm:pb-4">{footer}</footer>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
