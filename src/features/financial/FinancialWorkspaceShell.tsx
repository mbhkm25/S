import { Plus } from 'lucide-react';
import FinancialActionRoute from './FinancialActionRoute';
import FinancialWorkspaceRoute from './FinancialWorkspaceRoute';
import ProductBottomNav from '../../components/navigation/ProductBottomNav';

function basePath(): string {
  const value = import.meta.env.VITE_APP_BASE_PATH || '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default function FinancialWorkspaceShell() {
  const pathname = window.location.pathname;
  const isActionRoute = /\/(financial|commercial)\/actions\/?$/.test(pathname);
  if (isActionRoute) return <FinancialActionRoute />;

  const personal = /\/financial\/?$/.test(pathname);
  const commercial = /\/commercial\/?$/.test(pathname);

  return (
    <>
      <FinancialWorkspaceRoute />
      <ProductBottomNav activeArea={personal ? 'financial' : commercial ? 'business' : /\/sanad-ai\/?$/.test(pathname) ? 'assistant' : 'account'} />
      {(personal || commercial) ? (
        <button
          type="button"
          onClick={() => window.location.assign(`${basePath()}${commercial ? 'commercial' : 'financial'}/actions`)}
          className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-[11px] font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.25)] active:scale-[0.98]"
          aria-label={commercial ? 'فتح إجراءات سند التجاري' : 'فتح إجراءات سند المالي'}
        >
          <Plus className="h-4 w-4" />
          {commercial ? 'إجراء تجاري جديد' : 'إجراء مالي جديد'}
        </button>
      ) : null}
    </>
  );
}
