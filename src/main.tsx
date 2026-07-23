import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/publicBusinessProfileSwipe';

import { Capacitor } from '@capacitor/core';

const PwaUpdatePrompt = lazy(() => import('./features/pwa/PwaUpdatePrompt'));

// PWA updates apply only to the browser-installed app. Capacitor releases are
// updated through their native distribution channel.
const isCapacitorNative = Capacitor.isNativePlatform() ||
                          window.location.origin.includes('capacitor') ||
                          window.location.origin.startsWith('file:');
const enablePwaUpdates = 'serviceWorker' in navigator && !isCapacitorNative && !import.meta.env.DEV;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {enablePwaUpdates && (
      <Suspense fallback={null}>
        <PwaUpdatePrompt />
      </Suspense>
    )}
  </StrictMode>,
);
