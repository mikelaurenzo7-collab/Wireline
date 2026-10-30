# BotBound Production Environment Variables & Secrets Matrix

**Document Version**: 1.0.0  
**Effective Date**: 2026-10-29  
**Target Environment**: Production (`https://botbound.app`)  
**Enforcement**: `scripts/check-prod-env.mjs`, Render Blueprint (`render.yaml`), and `src/env.ts`  

---

## 1. Matrix Overview & Classification Standard

This matrix defines every environment variable and secret required across the 10 services and core runtime tiers in BotBound. 

### Classifications
- **Requirement Tier**:
  - `REQUIRED`: Service or application fails to start or refuses production traffic without it.
  - `RECOMMENDED`: Critical for high-reliability operations, fallback routing, or full compliance; system degrades gracefully if absent.
  - `OPTIONAL`: Enables auxiliary integrations (e.g., third-party CRMs, optional voice cloning, beta features).
- **Security Scope**:
  - `SECRET`: Sensitive cryptographic key, token, or connection string. **NEVER** expose to browser clients, client bundles, or unauthenticated logs. Must be stored in Render Secret Store or encrypted environment manager.
  - `PUBLIC`: Safe for client-side exposure via Vite (`VITE_*`) or public HTTP headers.
- **Destination Target**:
  - `Render: API`: Primary web application (`botbound-api`).
  - `Render: Voice`: Persistent media bridge worker (`botbound-voice`).
  - `Render: Crons`: Background task workers (`botbound-jobs-sweep` & `botbound-daily-brief`).
  - `Vite / Client`: Client-side single-page React application.
  - `Supabase`: Managed PostgreSQL database settings.

---

## 2. Complete Environment Variables Matrix

### 2.1. Core Runtime & Infrastructure
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `NODE_ENV` | `REQUIRED` | `PUBLIC` | All Render Services | Node execution environment | Must be `production` | `production` |
| `NODE_VERSION` | `REQUIRED` | `PUBLIC` | All Render Services | Node runtime engine version | Must be `22` | `22` |
| `APP_URL` | `REQUIRED` | `PUBLIC` | API, Voice, Crons | Canonical origin for OAuth redirects, email links, and billing callbacks | Exactly `https://botbound.app` (no trailing slash or port) | `https://botbound.app` |
| `CORS_ORIGINS` | `REQUIRED` | `PUBLIC` | API, Voice | Allowed cross-origin resource sharing origins | Comma-delimited list of HTTPS origins | `https://botbound.app` |
| `WIRELINE_DEPLOYMENT_ENVIRONMENT` | `REQUIRED` | `PUBLIC` | All Render Services | Deployment target identifier | Must be `production` | `production` |
| `PORT` | `OPTIONAL` | `PUBLIC` | API, Voice | Internal server HTTP port | Numeric port between 1024 and 65535 | `10000` |
| `SKIP_INSTALL_DEPS` | `REQUIRED` | `PUBLIC` | All Render Services | Prevents duplicate package installs during Render build | Must be `true` | `true` |
| `HUSKY` | `REQUIRED` | `PUBLIC` | All Render Services | Disables git hooks during container builds | Must be `0` | `0` |

### 2.2. Database & Data Plane (/supabase)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `POSTGRES_URL` | `REQUIRED` | `SECRET` | API, Voice | Direct connection string for DDL, migrations, and session operations | `postgresql://[user]:[pwd]@[host]:5432/[db]`; valid URI | None |
| `DATABASE_POOL_URL` | `REQUIRED` | `SECRET` | API, Voice | High-throughput PgBouncer transaction-pool connection for API runtime | `postgresql://[user]:[pwd]@[host]:6543/[db]`; valid URI | Falls back to `POSTGRES_URL` if absent |
| `DATABASE_POOL_MAX` | `OPTIONAL` | `PUBLIC` | API, Voice | Maximum connections allocated per process pool | Integer between 2 and 20 | `5` |
| `DATABASE_TIMEOUT_MS` | `OPTIONAL` | `PUBLIC` | API, Voice | Query timeout threshold in milliseconds | Positive integer | `10000` |

### 2.3. Cryptography, Security & Tenant Isolation
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `INTERNAL_JWT_SECRET` | `REQUIRED` | `SECRET` | API, Voice | HMAC secret for signing and verifying tenant session JWTs | High-entropy string ≥ 32 characters | Legacy fallback: `SUPABASE_JWT_SECRET` |
| `WIRELINE_DATA_KEY` | `REQUIRED` | `SECRET` | API, Voice | AES-256-GCM primary master key for encrypting stored tenant credentials | 32-byte hex or base64 encoded string | None (Fails closed) |
| `OAUTH_STATE_SECRET` | `REQUIRED` | `SECRET` | API, Voice | HMAC secret for generating and verifying OAuth CSRF state tokens | High-entropy string ≥ 32 characters | None |
| `OAUTH_BRIDGE_SECRET` | `REQUIRED` | `SECRET` | API | MCP authorization bridge signing secret | High-entropy string ≥ 32 characters | None |
| `MCP_OAUTH_TOKEN_PEPPER` | `REQUIRED` | `SECRET` | API | Salt pepper for irreversibly hashing MCP OAuth tokens | High-entropy string ≥ 32 characters | None |

### 2.4. Telephony & Media Streams (/twilio)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | `REQUIRED` | `SECRET` | API, Voice | Master Twilio Account identifier | Starts with `AC`, followed by 32 hex chars | None |
| `TWILIO_AUTH_TOKEN` | `REQUIRED` | `SECRET` | API, Voice | Inbound webhook signature verification token | 32-character hex auth token | None |
| `TWILIO_API_KEY` | `REQUIRED` | `SECRET` | API, Voice | Scoped REST API Key SID for non-root operations | Starts with `SK`, followed by 32 hex chars | None |
| `TWILIO_API_SECRET` | `REQUIRED` | `SECRET` | API, Voice | Scoped REST API Secret paired with `TWILIO_API_KEY` | Secret token string ≥ 32 characters | None |
| `TWILIO_WEBHOOK_BASE_URL` | `REQUIRED` | `PUBLIC` | API, Voice | Canonical origin for Twilio signatures and callback deliveries | Exactly `https://botbound.app` | `https://botbound.app` |
| `PLATFORM_SMS_FROM` | `RECOMMENDED` | `PUBLIC` | API, Voice | System sender number for owner alerts & 2FA takeovers | E.164 formatted telephone number | None (Tenant number used) |
| `WIRELINE_AUTO_PROVISION_NUMBERS` | `REQUIRED` | `PUBLIC` | API | Automatically orders and provisions tenant Twilio phone numbers | Must be `true` or `false` | `true` |

### 2.5. Billing, Subscriptions & Deposits (/stripe)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | `REQUIRED` | `SECRET` | API | Stripe REST API key for checkout, portals, and deposit links | Must start with `sk_live_` or `rk_live_` in prod | None |
| `STRIPE_WEBHOOK_SECRET` | `REQUIRED` | `SECRET` | API | Cryptographic signature secret for Stripe webhooks | Starts with `whsec_` | None |
| `VITE_STRIPE_PUBLIC_KEY` | `REQUIRED` | `PUBLIC` | API, Client | Publishable key for Stripe Elements and client checkout UI | Starts with `pk_live_` in production | None |
| `WIRELINE_SELF_SERVE_BILLING_ENABLED`| `REQUIRED` | `PUBLIC` | API | Feature gate permitting self-serve subscription checkouts | Must be `true` or `false` | `true` |
| `WIRELINE_RECONCILE_STRIPE_PORTAL` | `REQUIRED` | `PUBLIC` | API | Enforces fail-closed Customer Portal configuration checks | Must be `true` | `true` |
| `STRIPE_VOICE_PRICE_ID` | `REQUIRED` | `SECRET` | API | Stripe Price ID for BotBound Calls (Monthly) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_VOICE_ANNUAL_PRICE_ID` | `REQUIRED` | `SECRET` | API | Stripe Price ID for BotBound Calls (Annual) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_VOICE_REGULAR_PRICE_ID` | `RECOMMENDED`| `SECRET` | API | Stripe Price ID for BotBound Regular (Monthly) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_VOICE_REGULAR_ANNUAL_PRICE_ID`| `RECOMMENDED`| `SECRET` | API | Stripe Price ID for BotBound Regular (Annual) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_VOICE_HIGH_PRICE_ID` | `RECOMMENDED`| `SECRET` | API | Stripe Price ID for BotBound High (Monthly) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_VOICE_HIGH_ANNUAL_PRICE_ID` | `RECOMMENDED`| `SECRET` | API | Stripe Price ID for BotBound High (Annual) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_PERSONAL_PRICE_ID` | `RECOMMENDED`| `SECRET` | API | Stripe Price ID for Personal Plan | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_PERSONAL_ANNUAL_PRICE_ID` | `RECOMMENDED`| `SECRET` | API | Stripe Price ID for Personal Plan (Annual) | Valid Stripe Price ID (`price_...`) | Verified Catalog ID |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | `RECOMMENDED`| `PUBLIC` | API | Automatically calculates sales tax via Stripe Tax | `true` or `false` | `true` |
| `GOODWILL_WALLET_MONTHLY_BUDGET_USD` | `OPTIONAL` | `PUBLIC` | API | Monthly discretionary goodwill credit cap per tenant | Numeric integer/float | `100.00` |
| `GOODWILL_WALLET_MAX_PER_RESOLUTION_USD`| `OPTIONAL`| `PUBLIC` | API | Maximum goodwill credit allowable per customer resolution | Numeric integer/float | `25.00` |

### 2.6. Transactional Email & Messaging (/resend)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `RESEND_API_KEY` | `REQUIRED` | `SECRET` | API, Voice | Resend REST API key for sending emails | Starts with `re_` followed by token chars | None |
| `RESEND_WEBHOOK_SECRET` | `RECOMMENDED`| `SECRET` | API | Svix webhook secret for delivery and bounce feedback | Starts with `whsec_` | None |
| `RESEND_FROM_EMAIL` | `RECOMMENDED`| `PUBLIC` | API, Voice | Default sender email address for transactional system mail | Valid email format (`notifications@botbound.app`) | `notifications@botbound.app` |
| `RESEND_FROM_DOMAIN` | `RECOMMENDED`| `PUBLIC` | API, Voice | Verified sending domain | Valid domain | `botbound.app` |
| `WIRELINE_POSTAL_ADDRESS` | `RECOMMENDED`| `PUBLIC` | API, Voice | Physical postal address appended to commercial emails | Non-empty physical address string | Required by CAN-SPAM |
| `WIRELINE_UNSUBSCRIBE_MAILTO` | `REQUIRED` | `PUBLIC` | API, Voice | Mailto address for email unsubscribe headers | Valid email | `unsubscribe@botbound.app` |

### 2.7. Branded Bot Email Identity (/agentmail)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `AGENTMAIL_API_KEY` | `REQUIRED` | `SECRET` | API, Voice | Platform API credential for provisioning Bot mailboxes | High-entropy AgentMail API token | None |
| `AGENTMAIL_DEFAULT_DOMAIN` | `REQUIRED` | `PUBLIC` | API, Voice | Domain/subdomain used for dedicated Bot email inboxes | Must be `bots.botbound.app` or `mail.botbound.app` | `bots.botbound.app` |

### 2.8. Retired Gemini Live Voice (historical; not an active deployment requirement)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `GEMINI_API_KEY` | `RETIRED` | `SECRET` | None | Legacy Gemini Live credential; HTTP and voice-worker Gemini entry points are retired | Do not provision for the current voice runtime | Not required |
| `GEMINI_LIVE_MODEL` | `RETIRED` | `PUBLIC` | None | Former Gemini Live model selector | Inactive; no effect on the supported voice runtime | Not required |
| `GEMINI_LIVE_VOICE_NAME` | `RETIRED` | `PUBLIC` | None | Former Gemini voice selector | Inactive; no effect on the supported voice runtime | Not required |

### 2.9. Structured Reasoning & Voice Telephony (/xai)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `XAI_API_KEY` | `RECOMMENDED`| `SECRET` | API, Voice | Primary structured reasoning and Grok 4.7 engine token | Starts with `xai-` followed by token chars | OpenAI fallback if unset |
| `XAI_MANAGEMENT_API_KEY` | `RECOMMENDED`| `SECRET` | API | xAI Management API key for building Bot knowledge index | Valid management token string | None |
| `WIRELINE_PHONE_VOICE_PROVIDER` | `OPTIONAL` | `PUBLIC` | API, Voice | Selects voice telephony engine (`openai`, `xai`, `gemini`) | Enum: `openai`, `xai`, `gemini` | `gemini` (or `openai`) |

### 2.10. Browser Automation & Cloud Computer (/automation)
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `BROWSERBASE_API_KEY` | `REQUIRED` | `SECRET` | API, Voice | Browserbase cloud computer API key for headless automation sessions | Starts with `bb_` | None |
| `BROWSERBASE_PROJECT_ID` | `REQUIRED` | `SECRET` | API, Voice | Browserbase project identifier for tenant browser isolation | Valid UUID / project identifier | None |
| `CLOUD_COMPUTER_BROWSER_WS_URL`| `OPTIONAL` | `SECRET` | API, Voice | Isolated hosted-browser WebSocket CDP URL | Valid `wss://` URI | Browserbase default endpoint |
| `BROWSERBASE_TIMEOUT_MS` | `OPTIONAL` | `PUBLIC` | API, Voice | Maximum session execution duration for background tasks | Numeric integer | `60000` (60s) |

### 2.11. Operations, Schedulers & Distributed State
| Variable Name | Tier | Scope | Target Destination | Purpose | Constraints & Validation | Default / Fallback |
|---|---|---|---|---|---|---|
| `CRON_SECRET` | `REQUIRED` | `SECRET` | API, Crons | Bearer token for authenticating Render cron HTTP requests | High-entropy string ≥ 32 characters | None |
| `RENDER_CRON_ENABLED` | `REQUIRED` | `PUBLIC` | Crons | Enables job execution on Render cron workers | Must be `true` | `true` |
| `HEALTH_MONITOR_TOKEN` | `RECOMMENDED`| `SECRET` | API | Secret token required to query `/api/health/launch-readiness` | High-entropy string ≥ 32 characters | None |
| `UPSTASH_REDIS_REST_URL` | `REQUIRED` | `SECRET` | API, Voice | Upstash Redis REST URL for distributed API rate-limiting | Valid HTTPS URI | None |
| `UPSTASH_REDIS_REST_TOKEN` | `REQUIRED` | `SECRET` | API, Voice | Upstash Redis authentication token | High-entropy token string | None |
| `SENTRY_DSN` | `RECOMMENDED`| `SECRET` | API, Voice | Backend error tracking DSN | Valid Sentry DSN URI | None |
| `BOTBOUND_TRAFFIC_ENABLED` | `REQUIRED` | `PUBLIC` | API | Global release switch permitting public HTTP traffic | Must be `true` | `true` |
| `BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED`| `REQUIRED`| `PUBLIC`| API, Voice | Permits operational outbound calls and SMS notifications | Must be `true` | `true` |
| `WIRELINE_LAUNCH_DEMO_MODE` | `REQUIRED` | `PUBLIC` | API | Telemetry tagging flag | Must be `false` in production | `false` |
| `LAUNCH_HARD_GATE` | `REQUIRED` | `PUBLIC` | API | Pre-launch blocking gate | Unset or empty in production (Score=100) | Unset |

---

## 3. Secret Rotation & Compliance Protocols

1. **Zero Secret Leakage in Client Bundles**:
   - Only variables with prefix `VITE_` are exposed to frontend clients (`VITE_STRIPE_PUBLIC_KEY`).
   - All provider keys (`STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `AGENTMAIL_API_KEY`, `GEMINI_API_KEY`, `BROWSERBASE_API_KEY`) remain strictly encapsulated within Render server runtimes.
2. **Deterministic Domain Isolation**:
   - Outbound agent emails must use `bots.botbound.app` or dedicated verified subdomains, keeping `botbound.app` apex domain safe from spam flags or blacklisting.
3. **Emergency Secret Rotation Procedure**:
   - In case of credential compromise, rotate keys directly via the Render Dashboard secret store.
   - For database credentials, recycle connection pools on Supabase first, update `DATABASE_POOL_URL` in Render, and trigger zero-downtime worker restarts.
