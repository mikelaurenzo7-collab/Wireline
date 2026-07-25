# Deep Audit Wins — 2026-07-22

Status: **Active** — verified product/runtime fixes from a full Wireline audit
(compliance, voice observability, live-video honesty, CSP, Vapi failover).

## Vendor posture (keep)

| Plane | Decision | Why |
| --- | --- | --- |
| AI structured | Keep OpenAI → Gemini → AI Gateway | Already fail-over ready; uniqueness is the product loop, not model shopping |
| PSTN voice | Keep Twilio + Vapi | Carrier + orchestration fit; alternatives don't replace Create→Train→Wire→Run |
| Realtime test | OpenAI Realtime for Studio/ChatGPT/guest | Correctly separated from production PSTN |
| Email | Keep Resend | Transactional fit; swap later if deliverability demands |
| Video | Keep LiveAvatar/HeyGen **gated** | Demand is demo/presenter add-on, not default calls |
| Payments / DB / host | Keep Stripe Cadence, Supabase, Vercel | Catalog + health confirmed this pass |
| Federal DNC | Keep DNCScrub path | Ops credential proof still required before marketing scale |

## Code wins shipped

1. **Manual web + mobile outbound** now call `evaluateOutboundDialGate` (duplicate
   24h window + DNC + TCPA; marketing still requires federal DNC). Manual dials
   stamp `lastCalledAt` so the guard can fire on the next attempt.
2. **Voice observability** routes moved to `/api/voice/metrics` and
   `/api/health/voice-status` so Vercel `/api` rewrites reach Express.
3. **Gemini outbound retry** uses OpenAI (selection fallback), not Gemini again.
4. **Live video add-on checkout** stays hidden while Presence Catalog is paused
   and no saved catalog face exists.
5. **Custom presence** panel is honest — no fake “submit for review” without
   upload infrastructure.
6. **CSP** allows LiveAvatar + LiveKit connect-src; `vercel.json` synced via
   `check-csp-drift --write`.

## Ops still open (not code)

- Real Federal DNCScrub `loginId` on all Vercel envs before marketing dial volume.
- Twilio balance top-up before scaling.
- GitHub Actions phantom `BuildFailed` workflow (Settings/support).

## Verification

```bash
npx vitest run tests/outbound-compliance-contract.test.ts \
  tests/outbound-launch-safety.test.ts \
  tests/voice-observability-api-paths-contract.test.ts \
  tests/vapi-voice-model-policy.test.ts \
  tests/video-presenter-contract.test.ts \
  tests/authenticated-agent-flow-contract.test.ts \
  tests/mobile-tcpa-consent-contract.test.ts
npm run lint:server
npm run csp:check
npm run authz:check
```
