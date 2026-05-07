import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry} from './lib/sentry';
import {initWebVitals} from './lib/web-vitals';

// Render first. Sentry + web-vitals are non-blocking telemetry — pulling
// @sentry/react (~100KB) is now a dynamic import behind initSentry, so we
// fire and forget after paint to keep the initial bundle minimal.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Defer telemetry init until the browser has rendered. We chain
// web-vitals after Sentry so the captureMessage callbacks have the
// Sentry namespace hot when the metrics fire.
queueMicrotask(() => {
  initSentry().then(initWebVitals).catch(() => { /* telemetry must never break the app */ });
});
