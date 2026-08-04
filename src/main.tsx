import './lib/runtimeCompatibility';
import './lib/navigationScrollReset';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import OperationEntryGate from './features/operations/OperationEntryGate';
import OperationIdentityDetailsBanner from './features/operations/OperationIdentityDetailsBanner';
import OperationDetailsActionIntent from './features/operations/OperationDetailsActionIntent';
import OperationDocumentPreviewEnhancer from './features/operations/OperationDocumentPreviewEnhancer';
import OperationCommandCenter from './features/operations/OperationCommandCenter';
import './index.css';
import './lib/publicBusinessProfileSwipe';
import './lib/publicBusinessProfileShare';

import { Capacitor } from '@capacitor/core';

const PwaUpdatePrompt = lazy(() => import('./features/pwa/PwaUpdatePrompt'));
const KnowledgeAdminRoute = lazy(() => import('./components/admin/KnowledgeAdminRoute'));
const PublicInteractiveReport = lazy(() => import('./features/reports/PublicInteractiveReport'));

const isCapacitorNative = Capacitor.isNativePlatform() ||
                          window.location.origin.includes('capacitor') ||
                          window.location.origin.startsWith('file:');
const enablePwaUpdates = 'serviceWorker' in navigator && !isCapacitorNative && !import.meta.env.DEV;
const isPublicInteractiveReport = /\/reports\/view\/[^/?#]+/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicInteractiveReport ? (
      <Suspense fallback={null}>
        <PublicInteractiveReport />
      </Suspense>
    ) : (
      <>
        <OperationEntryGate />
        <OperationCommandCenter />
        <OperationIdentityDetailsBanner />
        <OperationDetailsActionIntent />
        <OperationDocumentPreviewEnhancer />
        <Suspense fallback={null}>
          <KnowledgeAdminRoute />
        </Suspense>
        {enablePwaUpdates && (
          <Suspense fallback={null}>
            <PwaUpdatePrompt />
          </Suspense>
        )}
      </>
    )}
  </StrictMode>,
);
