# Recap and Proposal Artifacts

Status: **Active** — call and weekly recap artifacts are live (this PR); proposals with a real download action follow in a separate PR.

Every account holder on Starter Plus, Pro, or Business now receives a Letterpress-styled shareable URL alongside their post-call digest and weekly review. The URL renders on `trywireline.com`, cannot be indexed by search engines, honors the tenant's workspace brand within a Wireline-owned structural design, and expires under a per-artifact TTL. This document is the source of truth for the primitive; the code is at `src/lib/shareable-artifact/` and `src/routes/shareable-artifact-routes.ts`.

## What ships in this pass

- One shared primitive for shareable Wireline pages: table + service + public route + template kit.
- Two surfaces on top of the primitive:
  - **Call recap** — publishes on every post-call digest for entitled tenants (see `src/lib/post-call-digest.ts`). The digest email includes a "Open the recap →" CTA at the top and threads the signed URL through.
  - **Weekly review** — publishes on the weekly cadence of `generateScheduledOperatingReport` (`src/lib/scheduled-report-service.ts`). Daily cadence keeps its existing plain delivery; recap fatigue is real.
- Workspace branding surface on `wireline_settings`: display name, accent hex (WCAG-validated against the chosen theme), theme (`obsidian` or `cool_light`), logo URL (trusted-host allowlist, reserved for proposals), contact line, and a "hide Wireline credit" toggle available to Pro and Business only.

## Entitlement

- Free Builder (`personal`) and Starter (`starter`): the existing plain-email digest continues to send exactly as it does today; no artifact is published.
- Starter Plus (`team`), Pro (`business`), Business (`enterprise`): artifacts are published on every entitled digest. Only Pro and Business can hide the "Powered by Wireline" credit on proposals.

Entitlement is enforced server-side by `isBrandedArtifactEntitled` (`src/lib/shareable-artifact/entitlement.ts`) which reads the canonical plan catalog. There is no client-side gate.

## URL contract

- Shape: `https://trywireline.com/recap/<slug>?t=<token>`
  - `slug` is 16 base62 characters (~95 bits) minted at publish time.
  - `token` is 24 random bytes rendered as URL-safe base64. It is returned to the caller once at publish time and is not persisted.
- Storage: the server stores `sha256("v1|slug|token")`. Timing-safe comparison on resolve. A database dump cannot forge access to any artifact.
- Failure modes — unknown slug, expired, revoked, and bad token — all return a Wireline-branded 404 page. The caller cannot distinguish which reason applies.
- Rate limits: 60/minute per source IP, 20/minute per slug.
- Response headers: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive, nocache`, plus a same-origin CSP and `Referrer-Policy: no-referrer`.
- Default TTL: 90 days; maximum 365. The owner can revoke early via `DELETE /api/recap-artifacts/:id`.

## Design contract

- **Recaps stay Wireline-branded by default.** The account owner is the audience; the design system is the reason they chose Wireline. The workspace display name appears as an eyebrow ("Rita's Dental · Call Recap · Oct 12") but the Letterpress structure — hairline wire divider, obsidian ground, editorial hierarchy, print-perfect CSS, mono utility set — is not tenant-configurable.
- **Proposals (future PR) are tenant-branded by default.** The tenant's own customer is the audience; the tenant's identity is what belongs on the wire. Wireline appears only as a footer credit that Pro and Business tiers can hide.
- **Personalization surface** — a workspace can inject: display name; a single accent hex validated for ≥3.0 WCAG contrast against the chosen theme's canvas (invalid values silently fall back to the theme default); a theme; a logo URL on trusted hosts (proposals only); a contact line; a credit-visibility toggle. Never a stylesheet, script, or arbitrary HTML.
- **The craft is the moat; identity is the surface.** Tenants cannot pick a bad grid or a wrong type-scale; they choose how the page is signed.

## Data model

Single table, one row per published artifact:

```
wireline_recap_artifacts(
  id UUID PK,
  user_id UUID NOT NULL,
  agent_id TEXT (FK -> wireline_agents.id, ON DELETE SET NULL),
  kind TEXT CHECK (kind IN ('call_recap', 'weekly_recap', 'proposal')),
  source_ref TEXT,
  slug TEXT UNIQUE (matches ^[A-Za-z0-9_-]{12,32}$),
  token_hash TEXT,
  content JSONB,
  published_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '90 days',
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
```

Indexes: unique `slug`; `(user_id, published_at DESC)`; `(kind, published_at DESC)`; `source_ref` partial where non-null. RLS is enabled with a `deny_direct_api_access` policy; only the server role reads or writes. `content` shapes are versioned; the resolver returns `null` for unknown versions.

Migration: `drizzle/migrations/0102_shareable_recap_artifacts.sql`.

## Public route

`GET /recap/:slug?t=<token>` — mounted at the root, not under `/api`, so the URL is short and readable. `vercel.json` includes a rewrite so the request lands on the Express handler and not the SPA fallback. Registered in `src/server/register-api-routes.ts`; added to the public authz allowlist in `scripts/generate-authz-matrix.ts` and `docs/AUTHZ_MATRIX.md`.

Owner surfaces (both authenticated):

- `GET /api/recap-artifacts` — list published artifacts for the current workspace with view metadata.
- `DELETE /api/recap-artifacts/:id` — soft-revoke; subsequent public reads return the not-found page identically.

## Hook points

- **Post-call digest**: `runPostCallDigest` (`src/lib/post-call-digest.ts`) invokes `maybePublishCallRecap` before the digest email composes. When the tenant is entitled, the returned URL is threaded into `renderDigestEmail` as an "Open the recap →" CTA and a small "Shareable Wireline recap · private link" eyebrow. When the tenant is not entitled, publish returns `null` and the digest email renders exactly as it did before.
- **Weekly report**: `generateScheduledOperatingReport` (`src/lib/scheduled-report-service.ts`) invokes `maybePublishWeeklyRecap` only when the frequency is `"weekly"`. The URL surfaces on the return payload as `shareableRecapUrl`; delivery jobs can attach it to the operating-report email.

Both hooks are wrapped in try/catch that logs and swallows errors so the digest path is never blocked by an artifact-storage outage.

## Tests / contracts

- `tests/shareable-artifact-token-contract.test.ts` — slug shape, entropy, timing-safe verify, versioned hash pinning.
- `tests/shareable-artifact-entitlement-contract.test.ts` — Free/Starter blocked; Team/Business/Enterprise entitled; white-label toggle limited to Business/Enterprise.
- `tests/shareable-artifact-branding-contract.test.ts` — accent contrast floor pinned; default accents pass; broken hex rejected.
- `tests/shareable-artifact-template-contract.test.ts` — shell contract (robots, theme variables, footer signature); recap + weekly + not-found render; no vendor names on the customer surface; tenant strings HTML-escaped.
- `tests/shareable-artifact-authz-contract.test.ts` — router registered; public allowlist entry pinned; SPA fallback excludes `/recap/`; public route unauthenticated; owner surfaces authenticated.

## Follow-up

Proposal artifacts (the tenant-branded outward surface) and the download endpoint that produces a real PDF land in a separate PR. The primitive already stores `kind = 'proposal'` and the template kit shell accepts brand-primary treatment, so the follow-up is scoped narrowly: a proposal renderer, a hook point on the discovery-call flow, a PDF path, and the tenant-brand contract tests. See `docs/LAUNCH_PERFECTION_PASS_2026-07-19.md` for the launch-perfection posture that surfaced this work.
