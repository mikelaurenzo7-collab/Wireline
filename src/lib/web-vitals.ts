import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import * as Sentry from '@sentry/react';

export function initWebVitals(): void {
  if (!process.env.VITE_SENTRY_DSN) {
    return;
  }

  const sendMetricToSentry = (metric: Metric) => {
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
