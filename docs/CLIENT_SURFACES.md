# Wireline Client Surfaces and Repository Boundaries

Wireline is one protected assistant platform with multiple deliberate control surfaces. The product must not become a collection of disconnected apps that independently implement policy, prompts, billing, or integrations.

## Ownership model

| Surface | Current build root | Responsibility | Must remain server-owned |
| --- | --- | --- | --- |
| Web workspace | Repository root (`src/`, `server.ts`) | Build, configure, review, and launch assistants | Auth, authorization, billing, providers, tool execution, tenant data |
| Browser Companion | `apps/browser-extension/` | Intentional page and selection handoff into Studio | Session state, extraction policies, assistant lifecycle, outbound execution |
| iOS | `ios/` | Native calls, Siri, widgets, CallKit, and approved CarPlay communication flows | Prompt construction, entitlements, call control decisions, data ownership |
| Android | `android/` | Native calls, notifications, widgets, Telecom, and approved Android Auto communication flows | Prompt construction, consent, plan enforcement, data ownership |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts` | Account-bound private agent drafting and tool-free private simulations | OAuth token security, tenant policy, lifecycle, external actions |

## Immediate layout

```text
/apps
  /browser-extension     # Manifest overlays, service worker, panel, packaging
/android                 # Native Gradle root; preserve until its release pipeline is extracted
/ios                     # Native XcodeGen root; preserve until its release pipeline is extracted
/src                     # Existing web/API runtime; remains deployment root for now
  /routes/chatgpt-*      # ChatGPT transport and OAuth surface
  /lib/chatgpt-*         # ChatGPT policies, widgets, protocol helpers
/docs                    # Product, security, and release contracts
```

The repository root remains the deployed Vercel web/API runtime during this phase. The goal is not to move folders cosmetically; it is to establish clean, testable, release-specific ownership without interrupting Vercel, Xcode, Gradle, Supabase, or store signing.

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
3. Assistant creation may start in any client, but launch, phone provisioning, connected-action authorization, and external side effects remain deliberate server-backed workflows.
4. iOS stays SwiftUI and Android stays Kotlin/Compose. Their OS-level calling, widgets, intents, and push behavior are reasons to preserve native stacks—not reasons to fork backend logic.
5. The browser extension stays a companion. It must never become a hidden scraper, CRM mirror, or independent background agent.
6. The ChatGPT App stays account-bound and draft-only until a separate, reviewed product decision expands its action surface.

## CI and release responsibilities

| Pipeline | Required check |
| --- | --- |
| Root web/API | Type checking, authz/CSP checks, unit tests, Vite build, server-import smoke |
| Browser extension | Manifest policy check, target artifact build, manual store-browser acceptance smoke |
| iOS | XcodeGen generation, simulator build, physical-device PushKit/CallKit acceptance checks |
| Android | Gradle compile, emulator smoke, physical-device Telecom/FCM acceptance checks |
| ChatGPT App | MCP discovery/tool/resource probe, OAuth PKCE reviewer flow, private simulation boundary test |

Every release pipeline can develop at its own speed, but all surfaces consume the same canonical assistant customization contract. That is the organizational line between a platform and a collection of unrelated apps.
