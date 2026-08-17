# Wireline Client Surfaces and Repository Boundaries

Wireline is one protected agent platform with multiple deliberate control surfaces. The product must not become disconnected apps that independently implement policy, prompts, billing, or integrations.

## Ownership model

| Surface | Current build root | Responsibility | Must remain server-owned |
| --- | --- | --- | --- |
| Web/API | Repository root (`src/`, `server.ts`, `api/`) | Build, train, review, operate, bill, launch agents, and expose versioned contracts | Auth, authorization, billing, providers, tool execution, tenant data, launch controls |
| Browser extension | `apps/browser-extension/` | Explicit page, selection, phone-number, call, text, follow-up, and task handoff into Studio | Session state, extraction policies, agent lifecycle, outbound execution |
| iOS | `ios/` | Native calls, Siri, widgets, CallKit, push, and approved CarPlay communication flows | Prompt construction, entitlements, call control decisions, data ownership |
| Android | `android/` | Native calls, notifications, widgets, Telecom, FCM, and approved Android Auto communication flows | Prompt construction, consent, plan enforcement, data ownership |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, `docs/CHATGPT_APP.md` | Account-bound private agent drafting, refinement, simulation, and tool-safe workflow assistance | OAuth token security, tenant policy, lifecycle, external actions |
| Live Video | `src/lib/video-presenter/`, `src/routes/video-presenter-routes.ts`, `src/components/LiveVideoPresenter.tsx` | Identity badges. Live talking-head is retired. | Vendor credentials stay unused; leftover Stripe webhooks fail-closed; no video file generation |

## Immediate layout

```text
/apps
  /browser-extension     # Wireline Command manifest overlays, service worker, panel, packaging
/android                 # Native Gradle root; preserve until its release pipeline is extracted
/ios                     # Native XcodeGen root; preserve until its release pipeline is extracted
/src                     # Existing web/API runtime; remains deployment root for now
  /routes/chatgpt-*      # ChatGPT transport and OAuth surface
  /lib/chatgpt-*         # ChatGPT policies, widgets, protocol helpers
  /lib/video-presenter   # Presenter provider adapter, consent, catalog, billing, and fallback logic
/docs                    # Product, security, and release contracts
```

The repository root remains the deployed Vercel web/API runtime during this phase. The goal is not to move folders cosmetically; it is to establish clean, testable, release-specific ownership without interrupting Vercel, Xcode, Gradle, Supabase, or store signing.

## Release tiers

Each tier can ship on its own cadence only when it stays inside these boundaries. A release that crosses into server-owned policy, provider credentials, billing, tenant isolation, or launch authority is a web/API release even if a client initiated the work.

### 1. Web/API

| Boundary | Requirement |
| --- | --- |
| Launch status | **Live**. This is the canonical production runtime for the public Build -> Train -> Launch -> Improve loop, implemented through Create, Training, Wire, and Studio, plus billing, voice, integrations, mobile adapters, ChatGPT MCP, and identity/clip APIs. |
| Owning files/directories | `src/`, `server.ts`, `api/`, `shared/`, `drizzle/`, `scripts/`, `tests/`, `docs/` contracts that describe runtime behavior. |
| Required checks before release | `npm run verify`; `npm run verify:full` before merge/release or any auth, billing, CSP, route, data-access, provider, or shared-contract change; `npm run verify:contracts`; targeted smoke for touched provider flows; read-only `npm run db:health` when schema assumptions change. |
| Non-goals | Do not fork client-specific business logic into web-only code; do not make inactive endpoints public contract; do not move native/browser release signing into the root runtime. |
| Security/privacy constraints | Server owns provider secrets, OAuth secrets, tenant-scoped reads/writes, billing decisions, rate limits, prompt assembly, model routing, audit logs, webhooks, and launch/external side effects. No browser-stored JWTs. |
| Rollback criteria | Roll back or disable the release if auth/session integrity, RLS/tenant isolation, billing/metering, phone provisioning, outbound execution, webhooks, CSP, or provider spend controls regress; also roll back if error rates or latency break the first-agent or live-call loop. |

### 2. Browser extension

| Boundary | Requirement |
| --- | --- |
| Launch status | **Early access**. Local install and packaging checks are active through `/apps/command`; store submission waits on review readiness. Aligns with `CLIENT_SURFACE_POSTURE.browser`. |
| Owning files/directories | `apps/browser-extension/`, its manifest overlays, service worker, side panel/sidebar, build scripts, package artifacts, and extension README. |
| Required checks before release | `node apps/browser-extension/scripts/build.mjs --check`; target builds for Chromium and Firefox; manual install smoke in each target browser; explicit-action context handoff smoke into Studio; permissions review against store policies. |
| Non-goals | Not a hidden scraper, CRM mirror, independent background agent, or always-on page monitor. It does not provision phone numbers, own sessions, execute outbound actions, or duplicate Studio. |
| Security/privacy constraints | Browser context is **explicit-user-action only**. No silent browsing, broad host permissions, background page harvesting, auth-token storage, provider keys, or model instructions that bypass the server. Captured context is minimized and handed to server-owned workflows. |
| Rollback criteria | Roll back/unpublish if the extension requests broader permissions than approved, collects context without an explicit click/command, persists sensitive page data or tokens, breaks login handoff, or causes store-policy rejection that would misrepresent the product. |

### 3. iOS

| Boundary | Requirement |
| --- | --- |
| Launch status | **Planned**. Native control surface exists in-repo; TestFlight/App Store remain gated by device acceptance, signing, and privacy review. Aligns with `CLIENT_SURFACE_POSTURE.ios`. |
| Owning files/directories | `ios/`, XcodeGen project files, SwiftUI views, native networking/auth adapters, widgets, Siri/intent surfaces, PushKit/CallKit integration, and iOS README. |
| Required checks before release | XcodeGen generation; simulator build; unit/UI smoke for login, mobile API reads/writes, approvals, notifications, and wallet/review surfaces; physical-device PushKit/CallKit acceptance; App Privacy labels and account deletion verification. |
| Non-goals | Not a full admin clone, backend fork, provider-key holder, or independent call-control authority. Native-first work should prioritize urgent owner control, not every Studio configuration screen. |
| Security/privacy constraints | Use Bearer-token mobile API contracts; keep prompts, provider credentials, launch decisions, billing, and data ownership server-side; respect OS privacy prompts, account deletion, push-token lifecycle, and call-record/notification minimization. |
| Rollback criteria | Roll back/TestFlight-expire if auth refresh fails, push/call handling becomes unreliable, account deletion/privacy declarations are wrong, mobile API writes bypass server policy, or crash rates block urgent owner workflows. |

### 4. Android

| Boundary | Requirement |
| --- | --- |
| Launch status | **Internal beta**. Native control surface exists; Play release remains gated by emulator/physical-device acceptance, signing, and privacy review. Aligns with `CLIENT_SURFACE_POSTURE.android`. |
| Owning files/directories | `android/`, Gradle configuration, Kotlin/Compose UI, native networking/auth adapters, widgets, Telecom/FCM integrations, Android Auto-approved communication surfaces, and Android README. |
| Required checks before release | Gradle compile; emulator smoke for login, mobile API reads/writes, approvals, notifications, wallet/review, and handoff; physical-device Telecom and FCM acceptance; Play Data safety/account deletion review; release signing verification. |
| Non-goals | Not a full admin clone, backend fork, background dialer, or independent consent/plan-enforcement engine. Do not duplicate Studio or web billing controls in native-only logic. |
| Security/privacy constraints | Use `/api/mobile/*` contracts except auth; server owns prompts, provider credentials, tenant policy, billing, launches, and external side effects; minimize call/notification data and respect Android permission, foreground-service, and cleartext restrictions. |
| Rollback criteria | Roll back/halt rollout if auth refresh, FCM, Telecom, permissions, data-safety declarations, or crash rates regress; also roll back if native writes bypass server policy or urgent call/approval workflows become unsafe. |

### 5. ChatGPT App

| Boundary | Requirement |
| --- | --- |
| Launch status | **Early access**. Account-bound MCP/OAuth app is active behind reviewed tools; Claude and Cursor share the same `/mcp` server (no separate plugin packages). No guest tool transport exists. Aligns with `CLIENT_SURFACE_POSTURE.chatgpt`. |
| Owning files/directories | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, `scripts/check-chatgpt-app-release.mjs`, `docs/CHATGPT_APP.md`, and related OAuth/config docs. |
| Required checks before release | `node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com` for production-target release; local MCP discovery/tool/resource probe; OAuth PKCE reviewer flow; private simulation boundary test; contract review for every new tool. |
| Non-goals | ChatGPT App cannot provision numbers, dial, launch agents, perform outbound communication, change billing, bypass approvals, or claim external actions happened unless Wireline actually performed them through server-owned workflows. |
| Security/privacy constraints | Account-bound OAuth only; least-privilege MCP tools/resources; no provider keys or broad tenant data in ChatGPT; draft/simulate by default; respect tenant authorization and redact/minimize returned data. |
| Rollback criteria | Disable tools or roll back if OAuth/PKCE, tenant scoping, tool discovery, or reviewer flow fails; immediately remove any tool that can provision numbers, dial, launch agents, or trigger side effects outside approved server authorization. |

### 6. Live Video

| Boundary | Requirement |
| --- | --- |
| Launch status | **Retired** live talking-head. Identity badges remain. Video files and clip-script substitutes are not offered. Leftover Stripe Live Video SKUs stay for webhook reconciliation only. |
| Owning files/directories | `src/lib/video-presenter/`, `src/routes/video-presenter-routes.ts`, `src/components/LiveVideoPresenter.tsx`, presenter catalog/consent UI, provider environment configuration, billing/entitlement policy, and product copy that references Live Video. |
| Required checks before release | Web/API verification; provider-env readiness check; consent-state and voice-fallback smoke; presenter catalog review; Stripe add-on and entitlement readback; live-session cost/metering review; customer-copy review to ensure vendor names are hidden; accessibility, degraded-network, and emergency-disable smoke. |
| Non-goals | Not a separate video product, not a vendor-branded feature, not a replacement for voice reliability, and not generally available without provider, checkout, entitlement, pricing, consent, and support gates. |
| Security/privacy constraints | Explicit customer consent before enabling live visual identity; vendor credentials stay server-side; copy says presenter/face/Live Video rather than vendor names; face/avatar assets and session metadata are scoped, auditable, and deletable according to account policy. |
| Rollback criteria | Disable the add-on if consent states, voice fallback, provider availability, billing/entitlement, cost controls, customer copy, or privacy handling regress; roll back any release that exposes vendor names or enables presenter sessions without account-level authorization. |

## Target structure: staged, not disruptive

When the current root build is stable under its own CI, extract shared assets in this order:

```text
/apps
  /web                  # Vite React workspace when its build is independently reproducible
  /api                  # Express/Vercel adapter when it can deploy independently
  /browser-extension
  /ios
  /android
/packages
  /contracts            # API request/response schemas and generated client-safe types
  /brand                # Token source and platform export artifacts only
  /config               # Shared TypeScript, lint, formatting, and release config
```

Do **not** extract business behavior into a client package. `packages/contracts` can hold schemas and types; provider credentials, runtime prompts, model routing, billable usage, consent, rate limits, tenant scoping, and webhooks remain in the API runtime.

## Non-negotiable client rules

1. Every client authenticates as a user and talks to a versioned Wireline API contract.
2. No client stores provider keys, billing authority, OAuth secrets, broad browser access, or model instructions that can bypass the server.
3. Agent creation may start in any client, but launch, phone provisioning, connected-action authorization, and external side effects remain deliberate server-backed workflows.
4. iOS stays SwiftUI and Android stays Kotlin/Compose. Their OS-level calling, widgets, intents, and push behavior are reasons to preserve native stacks—not reasons to fork backend logic.
5. Wireline Command is a user-initiated browser command surface. It must never become a hidden scraper, CRM mirror, or independent background agent.
6. The ChatGPT App stays account-bound, draft/simulation-first, and unable to provision numbers, dial, or launch agents until a separate, reviewed product decision expands its action surface.
7. Live talking-head video remains retired. Identity badges stay. Clip scripts are reviewable drafts. Do not call a Grok Bot API and do not generate Imagine files.

## Mobile API adapter discipline

Native clients authenticate with Bearer tokens and should use the complete `/api/mobile/*` adapter surface for mobile product behavior. Agent creation, setup reads/writes, tool toggles, calls, wallet, devices, and handoff now have mobile-shaped endpoints. New native capabilities must be added under `/api/mobile/*` first, reusing shared backend services instead of duplicating business logic.

## CI and release responsibilities

| Pipeline | Required check |
| --- | --- |
| Root web/API | Type checking, authz/CSP checks, unit tests, Vite build, server-import smoke, contract checks |
| Browser extension | Manifest policy check, target artifact build, manual store-browser acceptance smoke, explicit-action context smoke |
| iOS | XcodeGen generation, simulator build, physical-device PushKit/CallKit acceptance checks, privacy/account deletion review |
| Android | Gradle compile, emulator smoke, physical-device Telecom/FCM acceptance checks, Play Data safety/account deletion review |
| ChatGPT App | MCP discovery/tool/resource probe, OAuth PKCE reviewer flow, private simulation boundary test, no-side-effect tool review |
| Live Video | Consent/voice-fallback smoke, provider readiness, Stripe entitlement, cost/metering, emergency-disable, copy/privacy review |

Every release pipeline can develop at its own speed, but all surfaces consume the same canonical agent customization contract. That is the organizational line between a platform and a collection of unrelated apps.
