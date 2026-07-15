import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { Capacitor } from '@capacitor/core';

// Register Service Worker for PWA - exclude Capacitor and dev environments
const isCapacitorNative = Capacitor.isNativePlatform() ||
                          window.location.origin.includes('capacitor') ||
                          window.location.origin.startsWith('file:');
const isDev = import.meta.env.DEV;

if ('serviceWorker' in navigator && !isCapacitorNative && !isDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Save registration instance globally for the future updates prompt phase
        (window as any).swRegistration = reg;
      })
      .catch((err) => {
        if (isDev) {
          console.error('Service Worker registration failed:', err);
        }
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
