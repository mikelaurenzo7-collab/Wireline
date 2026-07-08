# Ops Credentials Checklist — Scale Readiness

**Status:** Active · **Owner:** Ops / Vercel

Set these in Vercel **before** scaling outbound marketing or paid acquisition.

| Variable | Why | Validate |
|----------|-----|----------|
| `FEDERAL_DNC_API_URL` + `FEDERAL_DNC_API_KEY` | Federal DNC scrub at outbound scale; fail-closed when configured | Outbound dial on listed number blocks; startup logs clean |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Auth rate limits in serverless (not per-invocation) | No `UPSTASH_REDIS` error in prod startup logs |
| `SENTRY_DSN` | Alerting on 5xx / unhandled rejections | Test error surfaces in Sentry project |
| `POSTGRES_URL` / `INTERNAL_JWT_SECRET` | Core product loop | `/api/health` operational |
| `APP_URL` + `CORS_ORIGINS` | OAuth and cookie security | Sign-in and OAuth complete without CORS errors |

## Pull full integration set (local only)

```bash
npx vercel env pull .env --environment=development --yes --token="$VERCEL_TOKEN"
```

Cursor-injected secrets win over `.env` per `AGENTS.md`.

## Health probes

```bash
curl -s https://trywireline.com/api/health | jq .
curl -s https://trywireline.com/api/health/public | jq .
npm run stripe:audit-live
```

## Startup signals

[`src/lib/startup.ts`](../src/lib/startup.ts) logs at `error` in production when Redis, federal DNC, or Sentry are missing — review Vercel function logs after deploy.
