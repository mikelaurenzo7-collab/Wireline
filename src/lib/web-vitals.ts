import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { getSentry } from './sentry';

export function initWebVitals(): void {
  // Vite exposes env via import.meta.env (the prior process.env path was
  // never substituted, so this guard always fired and web-vitals never
  // reported). When the DSN isn't set we skip wiring callbacks at all.
  if (!import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  const sendMetricToSentry = (metric: Metric) => {
    // initSentry is awaited in main.tsx before initWebVitals fires, so the
    // namespace is hot by the time these callbacks run.
    const Sentry = getSentry();
    if (!Sentry) return;

    const { name, value, rating } = metric;
    const level = rating === 'good' ? 'info' : rating === 'needs-improvement' ? 'warning' : 'error';

    Sentry.captureMessage(`Web Vital: ${name} = ${value.toFixed(2)}ms (${rating})`, {
      level,
      tags: {
        type: 'web-vital',
        metric: name,
        rating: rating || 'unknown',
      },
    });
  };

  onCLS(sendMetricToSentry);
  onFCP(sendMetricToSentry);
  onINP(sendMetricToSentry);
  onLCP(sendMetricToSentry);
  onTTFB(sendMetricToSentry);
}
