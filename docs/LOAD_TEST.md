# Load testing the OpenAI Realtime voice control path

## Scope

Production ingress has two signed boundaries:

- Twilio voice: `POST /api/twilio-webhook/openai-inbound`
- OpenAI Realtime: `POST /api/webhooks/openai/realtime`

Audio does not stream through the Vercel application. Twilio bridges PSTN to
the OpenAI project SIP endpoint, while BotBound handles admission, call-control,
tools, persistence, and policy through signed HTTP plus server-side sideband
sessions.

## Safety boundary

Never load-test production phone numbers or a deployment with live provider
credentials. Use an isolated Preview database and test-only credentials, or a
provider-disabled staging deployment that exercises signature rejection and
database/query capacity without accepting a real call. Do not replay a captured
customer webhook or provider secret.

## Methodology

- Use k6 or Artillery against an exact-head staging deployment.
- Exercise separately: invalid-signature rejection, valid signed admission,
  duplicate delivery, call-id replay, unmatched number, account-environment
  rejection, tenant concurrency overflow, tool burst, and end-of-call fanout.
- Use stable synthetic request ids and fixture tenants containing no customer
  data.
- Ramp gradually, hold steady state, then test a short burst.
- Correlate HTTP latency/error rate with Vercel concurrency, Postgres pool
  saturation, Upstash latency, job depth, and OpenAI/Twilio test-account limits.
- Assert that a valid duplicate never creates a second call, job, message,
  charge, or side effect.

## Acceptance metrics

- Signature failures return before tenant or provider work.
- P95 webhook admission remains within the current SLO under the certified
  launch concurrency.
- No database-pool timeouts, tenant-context leaks, unbounded queue growth, or
  cross-tenant rows occur.
- Overflow degrades to the documented fail-closed behavior.
- Every accepted request carries a durable correlation id; logs contain no
  caller number, provider key, raw signature, or customer content.
- Provider rate limiting is observable and never triggers an alternate call
  runtime.

The exact load profile belongs in a reviewed staging-only script because signed
payload construction and fixture ids change with the provider contract. A raw
unsigned `curl`/k6 sample is intentionally omitted: it would test only the 403
path and could be mistaken for production certification.
