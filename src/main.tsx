import './lib/runtimeCompatibility';
import './lib/navigationScrollReset';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import OperationEntryGate from './features/operations/OperationEntryGate';
import OperationDetailsRuntimeV2 from './features/operations/OperationDetailsRuntimeV2';
import OperationIdentityDetailsBanner from './features/operations/OperationIdentityDetailsBanner';
import OperationDetailsActionIntent from './features/operations/OperationDetailsActionIntent';
import OperationDocumentPreviewEnhancer from './features/operations/OperationDocumentPreviewEnhancer';
import './index.css';
import './lib/publicBusinessProfileSwipe';
import './lib/publicBusinessProfileShare';
import { initializeAndroidNativePush } from './lib/androidNativePush';

import { Capacitor } from '@capacitor/core';

const PwaUpdatePrompt = lazy(() => import('./features/pwa/PwaUpdatePrompt'));
const AndroidUpdatePrompt = lazy(() => import('./features/android/AndroidUpdatePrompt'));
const KnowledgeAdminRoute = lazy(() => import('./components/admin/KnowledgeAdminRoute'));
const PublicInteractiveReport = lazy(() => import('./features/reports/PublicInteractiveReport'));

const isCapacitorNative = Capacitor.isNativePlatform() ||
                          window.location.origin.includes('capacitor') ||
                          window.location.origin.startsWith('file:');
const isAndroidNative = Capacitor.getPlatform() === 'android' && isCapacitorNative;
const enablePwaUpdates = 'serviceWorker' in navigator && !isCapacitorNative && !import.meta.env.DEV;
const enableAndroidUpdates = isAndroidNative && !import.meta.env.DEV;
const isPublicInteractiveReport = /\/reports\/view\/[^/?#]+/.test(window.location.pathname);

if (isAndroidNative && !import.meta.env.DEV) initializeAndroidNativePush();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicInteractiveReport ? (
      <Suspense fallback={null}>
        <PublicInteractiveReport />
      </Suspense>
    ) : (
      <>
        <OperationEntryGate />
        <OperationDetailsRuntimeV2 />
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
        {enableAndroidUpdates && (
          <Suspense fallback={null}>
            <AndroidUpdatePrompt />
          </Suspense>
        )}
      </>
    )}
  </StrictMode>,
);
