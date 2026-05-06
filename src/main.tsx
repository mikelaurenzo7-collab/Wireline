import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry} from './lib/sentry';
import {initWebVitals} from './lib/web-vitals';

// Initialize Sentry as early as possible so it can catch render-phase errors.
// No-op when VITE_SENTRY_DSN is unset.
initSentry();

// Initialize Web Vitals monitoring to track real-world performance (LCP, FID, CLS).
// Sends metrics to Sentry as breadcrumbs and measurements. No-op when VITE_SENTRY_DSN is unset.
initWebVitals();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
