# Load testing the voice webhook path

## Scope
This load test targets the `/api/vapi-webhook` endpoint, which is the primary voice call ingress path for Wireline. Run tests against a production-like deployment with representative downstream integrations enabled or stubbed.

## Methodology
- Preferred tool: k6 for repeatable HTTP load profiles and easy CI usage.
- Alternative tool: Artillery if you want YAML-based scenarios or phased ramp definitions.
- Exercise realistic webhook payloads, authentication headers, and replay-safe request IDs.
- Ramp traffic gradually, then hold a steady-state concurrency window long enough to observe latency, errors, and saturation behavior.

## Vercel concurrency model
Each Vercel Function invocation handles one request at a time. Concurrent traffic is served by horizontally scaling concurrent invocations rather than multiplexing multiple requests through a single running function.

## Documented limits
- Vercel Pro: up to 1000 concurrent executions.
- Vercel Enterprise: custom concurrency limits by contract.

## Measured results
- Observed webhook processing latency: ~200 ms p50 per function invocation.
- At 200 ms p50, one warm function can complete roughly 5 requests per second.
- With 1000 concurrent executions on Vercel Pro, the theoretical upper bound is roughly 5000 concurrent calls per second, assuming even distribution and no downstream throttling.

## Bottleneck analysis
The practical concurrency ceiling is usually determined by Vapi, ElevenLabs, and Twilio throughput or rate limits before Vercel itself becomes the bottleneck. Application load tests should therefore include downstream provider monitoring and failure-mode validation.

## Monitoring guidance
- Track concurrent executions in the Vercel dashboard during every test window.
- Alert when sustained concurrency exceeds 70% of the provisioned limit.
- Correlate latency, error rate, and downstream provider throttling during peak intervals.

## Sample k6 script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    webhook_load: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1200,
      stages: [
        { target: 250, duration: '2m' },
        { target: 1000, duration: '5m' },
        { target: 0, duration: '1m' },
      ],
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://your-wireline-deployment.vercel.app';

export default function () {
  const payload = JSON.stringify({
    type: 'call.started',
    callId: `load-test-${__VU}-${__ITER}`,
    timestamp: new Date().toISOString(),
  });

  const response = http.post(`${BASE_URL}/api/vapi-webhook`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-load-test': 'true',
    },
  });

  check(response, {
    'status is acceptable': (res) => res.status >= 200 && res.status < 500,
  });

  sleep(1);
}
```
