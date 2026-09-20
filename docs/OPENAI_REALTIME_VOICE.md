# OpenAI Realtime Voice — Browser and Twilio PSTN

**Status:** Canonical production voice policy  
**Updated:** September 19, 2026

BotBound uses one live-conversation runtime: OpenAI Realtime on
`gpt-realtime-2.1`. This applies to customer Bots, founder-owned internal Bot
profiles, authenticated Studio rehearsals, authenticated ChatGPT private
simulation, inbound phone calls, and outbound phone calls. Public and guest
audio/call demos are retired. Twilio owns carrier transport, phone numbers,
PSTN/SIP, and SMS.
No alternate voice provider or automatic model fallback is permitted.

## Transport map

| Surface                                           | Transport                                                                         | Runtime                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------- |
| Authenticated Studio / ChatGPT private simulation | Browser WebRTC offer sent to a same-origin BotBound route                         | OpenAI Realtime            |
| Inbound phone                                     | Twilio signed webhook → BotBound TwiML → OpenAI project SIP URI                   | OpenAI Realtime            |
| Outbound phone                                    | Twilio customer leg + AMD → attempt-bound BotBound TwiML → OpenAI project SIP URI | OpenAI Realtime            |
| SMS                                               | Twilio signed webhook and Messaging Service/number                                | BotBound messaging runtime |

The OpenAI project SIP URI is:

```text
sip:<OPENAI_PROJECT_ID>@sip.api.openai.com;transport=tls
```

OpenAI sends signed `realtime.call.incoming` events to:

```text
https://botbound.me/api/webhooks/openai/realtime
```

BotBound accepts the call with the tenant-scoped Bot configuration and then
opens the server-side sideband WebSocket using the OpenAI call id. Tool calls,
knowledge lookup, transfer, hangup, compliance state, and post-call persistence
remain on the server.

## Required production configuration

- `OPENAI_API_KEY`: scoped to the BotBound OpenAI API project.
- `OPENAI_PROJECT_ID`: the `proj_...` project used in the SIP URI.
- `OPENAI_WEBHOOK_SECRET`: signing secret for the Realtime webhook endpoint.
- `OPENAI_REALTIME_MODEL=gpt-realtime-2.1`.
- `OPENAI_REALTIME_TRANSCRIBER=gpt-4o-mini-transcribe`.
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` for signed callback validation.
- A scoped Twilio API key/secret for REST operations when configured.
- `TWILIO_WEBHOOK_BASE_URL=https://botbound.me` when canonical signature
  reconstruction cannot rely on the incoming host.

Every Twilio voice-capable number must use
`https://botbound.me/api/twilio-webhook/openai-inbound` as its voice URL and
the signed `/api/twilio-webhook/openai-inbound-fallback` continuity URL. With
no approved OpenAI-generated outage speech committed, that path plays only the
existing non-speech transfer chime before a configured human transfer; otherwise
it hangs up and never records. The primary SIP `<Dial>` also posts outcomes to the
signed `/api/twilio-webhook/openai-inbound-dial-complete` action so busy,
no-answer, and failed bridges reach the same continuity handler.
Every direct SMS sender must use `/api/twilio-webhook/sms` with the reviewed
Twilio retry fragment.

## Voice roster and studio boundary

Phone and browser sessions use only OpenAI's documented Realtime voices:
`alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`,
and `cedar`. BotBound defaults to `marin`; `cedar` is the second recommended
quality choice. The saved voice remains fixed for an active session and can be
changed before a later session. Studio previews and phone calls resolve the same
saved choice.

BotBound does not operate a separate voice-cloning provider or accept customer
voice uploads. Historical presenter/video records retain an explicit OpenAI
phone fallback, and Studio uses that same fallback for a consistent preview.

## Security and reliability invariants

- Verify Twilio signatures before returning TwiML.
- Verify OpenAI Standard Webhooks signatures before accepting, rejecting, or
  controlling a call.
- Bind outbound bridge and status callbacks to a one-use, attempt-scoped token.
- Fail closed when the called number has no active tenant/Bot assignment.
- Enforce production/test/demo account-environment policy before live spend.
- Keep API keys, ephemeral secrets, and provider call-control URLs out of
  browser responses and logs.
- Reserve expected Realtime spend before session admission and settle measured
  usage afterward.
- Do not silently move a failed OpenAI call to another provider. Return an
  observable failure and preserve the retry/reconciliation evidence.

## Release proof

Before changing Twilio production webhooks, require a READY exact-head preview,
green release contracts, a writable/healthy production database, the OpenAI
webhook configured, and the OpenAI data-normalization migration ready. Cut over
one low-risk number first, prove inbound and approved outbound calls plus SMS,
then migrate the remaining inventory. Delete retired provider assets only after
the Twilio/OpenAI path is proven and rollback evidence is captured.

Official implementation references:

- <https://developers.openai.com/api/docs/guides/realtime-sip>
- <https://developers.openai.com/api/docs/guides/realtime-server-controls>
- <https://developers.openai.com/api/docs/guides/realtime-conversations>
- <https://developers.openai.com/api/docs/models/gpt-realtime-2.1>

## Persistent business-call worker and duration

Full inbound and outbound business calls default to **60 minutes**, the documented
OpenAI Realtime session maximum. An explicit positive `OPENAI_SIP_MAX_CALL_SECONDS`
setting can shorten this, with a minimum of 30 seconds and maximum of 3600.
Missing, blank, invalid, zero, and negative values select the 3600-second default.
Twilio's Dial time limit and the sideband timer use the same setting. At one minute
remaining, the worker logs a warning and instructs the Bot to explain the limit,
agree the next step, and offer an approved callback or transfer. It does not splice
a new session into the same call or promise unlimited duration.

Private Studio/ChatGPT rehearsals remain five minutes. Inbound overflow,
after-hours, and completion-grace message-taking remains five minutes; a suspended
subscription's short notice remains 20 seconds. Balance exhaustion alone does not
cut an admitted full conversation. Existing subscription, daily-minute,
concurrency, environment, DNC, and spend admission controls remain in place.

### Why the worker is separate

The Vercel API function is configured for 600 seconds. Vercel `waitUntil` shares
that function timeout, so it cannot own a one-hour sideband. Vercel continues to
own the public application, signed Twilio callbacks, and job sweeps. After verifying
OpenAI's original signature, its SIP webhook forwards the untouched signed bytes
to a persistent Node 22 worker. Both a distinct service secret and the original
OpenAI signature are checked before the worker resolves the tenant, reserves spend,
claims the call, or accepts it. Failed or timed-out forwarding returns retryable
503; an accepted worker call continues independently, and existing durable claims
suppress duplicate signed deliveries.

Mobile handoffs persist confirmed transfer state for the worker to observe.
REFER, deadline/error cleanup and terminal persistence share a tenant/call lock,
so successful transfers are not subsequently hung up by the Bot's watchdog.
Account and destination policy are rechecked after lock acquisition immediately
before REFER. At most two control transactions use the five-connection pool at
once, leaving capacity for active-call leases and accounting. Local notifications
are only a fast path; cross-process handoff behavior is part of release proof.

The worker runs the same SIP router and runtime, including tool handling, DNC,
rolling database ownership leases, transcript capture, terminal persistence and
the durable post-call job. The account-deletion lease now covers the configured
call duration plus five minutes. A sudden host/process failure is still a call
failure, not seamless failover: carrier time limits and the existing recovery
job bound and reconcile abandoned work, and unknown transcripts/durations must
never be invented. A live crash/continuity drill remains release proof.

### Deployment and shutdown

No paid worker host is provisioned by this change. Long-call activation stays
blocked until an always-on instance and its production configuration are deployed.
A Vercel function, scale-to-zero service, or host that kills WebSocket processes
after a short request deadline is not suitable.

- Build: `npm run build:voice-worker`; run: `npm run start:voice-worker`.
- Container: `docker build -f deploy/voice-worker/Dockerfile --build-arg VOICE_WORKER_SOURCE_REVISION=<40-character-release-sha> -t botbound-voice-worker:<release-sha> .`.
  The Docker context includes only package manifests, reviewed source and the
  Dockerfile; environment files and credentials are excluded. Container build
  and runtime smoke must be performed on a Docker-capable host before deployment.
- Build only from the clean reviewed checkout and record the image digest. The
  required build argument populates `WIRELINE_VOICE_WORKER_SOURCE_REVISION` and
  the image revision label. Non-container deployments must set that worker-only
  value explicitly. A supplied SHA labels the source; it does not prove the
  checkout or image is authentic by itself.
- Use a separate HTTPS worker origin with TLS termination. Set
  `WIRELINE_VOICE_WORKER_URL` and a random, independent
  `WIRELINE_VOICE_WORKER_SECRET` of at least 32 bytes on Vercel. Put the same
  service secret on the worker. Neither value belongs in browser code.
- The worker needs the reviewed production database connection, tenant JWT/token
  secrets, OpenAI SIP configuration, canonical `APP_URL=https://botbound.me`,
  Twilio credentials, vault key, and credentials required by its approved Bot
  tools. These remain server-side. Do not set `VERCEL=1` on the worker; its
  entrypoint selects the worker role and prevents forwarding loops.
- Set `OPENAI_SIP_MAX_CALL_SECONDS=3600` on **both** web and worker. Existing
  production values of 300 remain explicit shorter limits until changed.
- `WIRELINE_VOICE_WORKER_MAX_CALLS` defaults to 10, allowed range 1–200.
  It bounds in-flight admission plus active background work on each instance;
  supporting background tasks can conservatively occupy a slot. Tune only after
  concurrency/load testing and confirmation of provider/project limits.
- Startup validates secrets/configuration and performs a read-only database
  tenant-role check before listening. `GET /healthz` returns only a readiness
  boolean and turns 503 during drain. This is process/admission readiness, not a
  continuous probe of provider balances or downstream health.
- Authenticated `GET /readyz` uses the same service header as `/drain`. It returns
  the readiness protocol, source revision, maximum call duration and a keyed
  fingerprint of OpenAI project/webhook and internal JWT settings only after a
  read-only database transaction verifies tenant-role access. It returns 503
  during drain or database failure. The public health route exposes none of this
  metadata. Optional Bot tool credentials and live provider credit still need
  their own checks.
- `node --import tsx scripts/check-voice-worker-readiness.mts` is the isolated
  read-only deployment probe; `npm run vendor:readiness` includes it as a required
  gate. Set `WIRELINE_EXPECTED_SOURCE_REVISION` to the exact release SHA, or use
  its fallback of `VERCEL_GIT_COMMIT_SHA` then local Git HEAD. Unknown source,
  unavailable worker, authentication failure, version/configuration mismatch,
  drain and database failure all block readiness without exposing secrets.
- Before a rolling deployment, send authenticated `POST /drain` with the
  `x-botbound-voice-worker-key` header. Remove the instance from admission traffic;
  authenticated `GET /drain` reports pending handlers and active background work.
  Wait for both to reach zero before stopping/replacing the instance.
- SIGTERM also drains. It waits for HTTP completion, pending admission handlers
  (including disconnected clients), then registered call work. The host must
  allow the full call horizon plus five minutes, **65 minutes at the default**,
  or use the pre-drain procedure. A host-enforced 30-second shutdown grace will
  interrupt calls despite application cleanup.
- Keep the Vercel minute job sweep and production alerts enabled. Prove one
  inbound and one approved outbound call beyond five minutes, late tool use,
  final transcript/usage, service-auth rejection, duplicate delivery, overload,
  and zero-loss rolling drain before enabling sales.

### Rolling provider estimate

The existing initial five-minute provider-spend reservation remains at its
configured amount (default $1). There is no new $12 customer wallet hold to
start a call. As already-admitted SIP work proceeds, its committed provider-cost
estimate grows in five-minute windows (default $12 at one hour). Updates lock
the same budget row as new-work admission, are monotonic and idempotent, and
never erase a larger estimate. The next action sees this spend; the active
conversation continues. Failed writes retry during the call and through durable
post-call replay after DNC, presence and customer usage settle.

These are conservative internal estimates, not measured OpenAI invoices or
additional customer charges. Customer usage still uses included voice minutes
and prepaid Runtime Balance from the frozen call-end duration; slow database
cleanup adds no billable minutes. Estimates remain attributed to the call's
start month. A call spanning UTC month-end therefore retains its continuing
estimate in that period; the resulting next-period cap exposure is bounded by
the configured maximum duration and concurrency, not a strict cross-month
per-token ceiling. Shortening a completed duration does not refund an uncertain
larger provider estimate.

Official limits:
[OpenAI session lifecycle](https://developers.openai.com/api/docs/guides/realtime-conversations#session-lifecycle-events);
[Vercel waitUntil timeout](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).
