import './lib/runtimeCompatibility';
import './lib/navigationScrollReset';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/local-first-connectivity.css';
import { Capacitor } from '@capacitor/core';

const OperationEntryGate = lazy(() => import('./features/operations/OperationEntryGate'));
const OperationDetailsRuntimeV2 = lazy(() => import('./features/operations/OperationDetailsRuntimeV2'));
const OperationIdentityDetailsBanner = lazy(() => import('./features/operations/OperationIdentityDetailsBanner'));
const OperationDetailsActionIntent = lazy(() => import('./features/operations/OperationDetailsActionIntent'));
const OperationDocumentPreviewEnhancer = lazy(() => import('./features/operations/OperationDocumentPreviewEnhancer'));
const LocalRuntimeController = lazy(() => import('./features/local-first/LocalRuntimeController'));
const CaptureFirstNavigationRuntime = lazy(() => import('./features/local-first/CaptureFirstNavigationRuntime'));
const PwaUpdatePrompt = lazy(() => import('./features/pwa/PwaUpdatePrompt'));
const AndroidUpdatePrompt = lazy(() => import('./features/android/AndroidUpdatePrompt'));
const KnowledgeAdminRoute = lazy(() => import('./components/admin/KnowledgeAdminRoute'));
const PublicInteractiveReport = lazy(() => import('./features/reports/PublicInteractiveReport'));
const FinancialWorkspaceShell = lazy(() => import('./features/financial/FinancialWorkspaceShell'));

const isCapacitorNative = Capacitor.isNativePlatform() ||
                          window.location.origin.includes('capacitor') ||
                          window.location.origin.startsWith('file:');
const isAndroidNative = Capacitor.getPlatform() === 'android' && isCapacitorNative;
const enablePwaUpdates = 'serviceWorker' in navigator && !isCapacitorNative && !import.meta.env.DEV;
const enableAndroidUpdates = isAndroidNative && !import.meta.env.DEV;
const isPublicInteractiveReport = /\/reports\/view\/[^/?#]+/.test(window.location.pathname);
const isFinancialWorkspaceRoute = /\\/(financial(?:\\/(?:overview|actions|accounts|transactions|obligations|budgets|goals|parties))?|commercial(?:\\/(?:overview|actions))?|business\\/manage(?:\\/(?:operations|team|profile|whatsapp-catalog|customers))?|account-center|sanad-ai|today|more|notifications|library|connections|work\\/(?:tasks|approvals|automations))\\/?$/.test(window.location.pathname);
const isLegacyApplicationRoute = !isPublicInteractiveReport && !isFinancialWorkspaceRoute;

if (isAndroidNative && !import.meta.env.DEV) {
  void import('./lib/androidNativePush')
    .then(({ initializeAndroidNativePush }) => initializeAndroidNativePush())
    .catch((error) => console.warn('SANAD Android push initialization failed', error));
}

if (isLegacyApplicationRoute) {
  void import('./features/local-first/deviceLedgerRuntime')
    .then(({ installDeviceLedgerRuntime }) => installDeviceLedgerRuntime())
    .catch((error) => console.warn('SANAD device ledger initialization failed', error));
  void import('./lib/publicBusinessProfileSwipe').catch(() => undefined);
  void import('./lib/publicBusinessProfileShare').catch(() => undefined);
}

function LegacyAppFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] text-xs text-slate-400" aria-busy="true">
      جارٍ فتح سند…
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFinancialWorkspaceRoute ? (
      <Suspense fallback={null}>
        <FinancialWorkspaceShell />
      </Suspense>
    ) : isPublicInteractiveReport ? (
      <Suspense fallback={null}>
        <PublicInteractiveReport />
      </Suspense>
    ) : (
      <>
        <Suspense fallback={<LegacyAppFallback />}>
          <OperationEntryGate />
        </Suspense>
        <Suspense fallback={null}>
          <LocalRuntimeController />
          <CaptureFirstNavigationRuntime />
          <OperationDetailsRuntimeV2 />
          <OperationIdentityDetailsBanner />
          <OperationDetailsActionIntent />
          <OperationDocumentPreviewEnhancer />
          <KnowledgeAdminRoute />
          {enablePwaUpdates && <PwaUpdatePrompt />}
          {enableAndroidUpdates && <AndroidUpdatePrompt />}
        </Suspense>
      </>
    )}
  </StrictMode>,
);
