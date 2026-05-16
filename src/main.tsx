import './lib/polyfills';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry} from './lib/sentry';
import {initWebVitals} from './lib/web-vitals';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

queueMicrotask(() => {
  initSentry().then(initWebVitals).catch(() => { /* telemetry must never break the app */ });
});
