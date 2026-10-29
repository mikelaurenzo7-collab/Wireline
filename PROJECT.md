# Project: BotBound Lean 4-Pillar Production SMB Voice & Automation Suite

## Architecture
BotBound is an omnichannel autonomous AI workforce platform for service businesses (plumbing, HVAC, electrical, dispatch). The system operates on Express/Node 22 with PostgreSQL (Drizzle ORM), Twilio PSTN/WebRTC voice and SMS, Gemini 3.8 Live bidirectional audio/video streaming, Playwright cloud browser sessions (Browserless), Stripe payments, Google & Microsoft Graph calendar synchronization, and AgentMail bot email mailboxes.

```
                    ┌──────────────────────────────┐
                    │    Twilio PSTN Inbound /     │
                    │   Outbound Voice & SMS       │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   BotBound Voice Session     │
                    │   (Gemini Live / Realtime)   │
                    └──────┬───────┬────────┬──────┘
                           │       │        │
           ┌───────────────┘       │        └──────────────┐
           ▼                       ▼                       ▼
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Voice-to-Browserbase│  │   Stripe Text-to-   │  │  Zero-Conflict     │
│ Real-Time Bridge   │  │   Pay & Goodwill   │  │  Calendar Engine   │
│ - Async Non-block  │  │   Wallets          │  │ - Travel Buffers   │
│ - Status Fillers   │  │ - Mid-call SMS Link│  │ - 5-min Soft Holds │
│ - 2FA Owner Alerts │  │ - Webhook Callbacks│  │ - RFC 5545 .ics    │
│ - Portal Mirroring │  │ - $100/mo, $25/res │  │ - Mirroring Hook   │
└──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘
           │                       │                       │
           └───────────────────────┼───────────────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │    Branded AgentMail Bot     │
                    │   - Dedicated Bot Inboxes    │
                    │   - .ics Invites & Receipts  │
                    │   - Inbound Reply Triage     │
                    │   - Human Takeover Alerts    │
                    └──────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Async Browserbase Voice Bridge | Non-blocking tool invocation for cloud computer during active voice calls | M1 | Survey 2 (R2) |
| 2 | Conversational Status Fillers | Streaming filler audio/text phrases to eliminate silence during 3-8s portal tasks | M1 | Survey 2 (R2) |
| 3 | Voice Portal Data Ingestion | Contextual ingestion of extracted portal data back into the voice dialogue | M1 | Survey 2 (R2) |
| 4 | 2FA / CAPTCHA Human Takeover | Detects auth barriers and alerts owner via SMS and AgentMail (`agent_attach_human`) | M1 | Survey 2 (R2) |
| 5 | Vertical Trade Portal Mirroring | Browserbase automation mirroring confirmed bookings into Housecall Pro / ServiceTitan | M1 | Survey 2 (R4) |
| 6 | In-Call Stripe Deposit Route | Dynamic Stripe Checkout / Payment Link generation with Apple Pay and Google Pay | M2 | Survey 3 (R3) |
| 7 | Mid-Call SMS Payment Dispatch | Twilio SMS dispatch of deposit checkout link to the active caller's phone | M2 | Survey 3 (R3) |
| 8 | Live Webhook Voice Session Bridge | In-memory session event bus signaling active voice call when payment succeeds | M2 | Survey 3 (R3) |
| 9 | Autonomous Goodwill Wallets | Server-side policy guard enforcing $100/mo budget and $25/call resolution limit | M2 | Survey 3 (R3) |
| 10 | Location-Aware Travel Buffers | Travel time buffer calculation between consecutive appointment job sites | M3 | Survey 3 (R4) |
| 11 | Ephemeral 5-Minute Soft Holds | Ephemeral slot reservation preventing double bookings during live voice calls | M3 | Survey 3 (R4) |
| 12 | RFC 5545 ICS Invite Generation | Standard iCalendar `.ics` file generator for confirmed appointments | M3 | Survey 3 (R4) |
| 13 | Calendar-to-Dispatch Trigger | Automatic trigger queuing background trade portal mirroring upon booking | M3 | Survey 3 (R4) |
| 14 | AgentMail Attachment Support | Extend `sendAgentMail` to accept file attachments (`.ics`, PDF receipts) | M4 | Survey 3 (R7) |
| 15 | Transactional Email Dispatchers | Automated emails for appointment confirmations with `.ics` and payment receipts | M4 | Survey 3 (R7) |
| 16 | Inbound Email Reply Triage | Intent analysis and human escalation routing (`agent_attach_human`) on replies | M4 | Survey 3 (R7) |
| 17 | Test Suite Mock Hygiene | Fix `tests/openai-sip-long-call-behavior.test.ts` audit mock divergence | M4 | Survey 1 (Hygiene) |
| 18 | Dual-Track E2E Test Suite | 4-tier opaque-box test suite covering all 4 pillars with 100% pass | M5 | Request (Verification) |
| 19 | Adversarial Coverage Hardening | White-box stress testing and gap elimination (Tier 5) | M5 | Request (Verification) |

*(Note: R5 Synthetic Rehearsal Suite and R6 SMS Vision Modal are pruned per explicit user directives. Conceptual note on direct wearable streaming is preserved in documentation.)*

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Voice-to-Browserbase Real-Time Bridge & Trade Portal Mirroring | Features 1, 2, 3, 4, 5 | none | COMPLETE |
| M2 | In-Call Stripe Settlements & Autonomous Goodwill Wallets | Features 6, 7, 8, 9 | none | COMPLETE |
| M3 | Zero-Conflict Calendar Engine & Transactional Invites | Features 10, 11, 12, 13 | none | COMPLETE |
| M4 | Branded Bot Email Identity, Attachments & Reply Triage | Features 14, 15, 16, 17 | none | COMPLETE |
| M5 | Final Integration, E2E Test Suite Pass (Tiers 1-4) & Coverage Hardening (Tier 5) | Features 18, 19 | M1, M2, M3, M4 | VERIFIED |

## Interface Contracts

### 1. Voice Bridge ↔ Browserbase Cloud Computer (`src/lib/cloud-computer/voice-bridge.ts`)
```ts
export interface AsyncBrowserTaskRequest {
  userId: string;
  callSid: string;
  action: "lookup_customer" | "check_parts_portal" | "mirror_dispatch_job";
  portalUrl: string;
  parameters: Record<string, unknown>;
  fillerCallback: (phrase: string) => Promise<void>;
  statusCallback: (status: "running" | "waiting_2fa" | "completed" | "failed", data?: unknown) => Promise<void>;
}

export interface AsyncBrowserTaskResult {
  taskId: string;
  success: boolean;
  extractedData?: Record<string, unknown>;
  requiresTakeover?: boolean;
  takeoverReason?: "captcha" | "two_factor" | "credential_required";
}
```

### 2. In-Call Stripe Settlements ↔ Voice Session Registry (`src/lib/stripe-voice-session.ts`)
```ts
export interface InCallPaymentRequest {
  userId: string;
  callSid: string;
  customerPhone: string;
  amountCents: number;
  description: string;
}

export interface InCallPaymentEvent {
  callSid: string;
  paymentIntentId: string;
  amountCents: number;
  status: "succeeded" | "failed";
  receiptUrl?: string;
}

export interface GoodwillWalletPolicy {
  monthlyCapCents: number; // default $100.00 (10000)
  perResolutionCapCents: number; // default $25.00 (2500)
  currentMonthSpentCents: number;
}
```

### 3. Calendar Engine ↔ Travel Buffers & Ephemeral Holds (`src/lib/calendar-holds.ts`)
```ts
export interface EphemeralCalendarHold {
  holdId: string;
  userId: string;
  callSid: string;
  slotStart: Date;
  slotEnd: Date;
  expiresAt: Date; // TTL 5 minutes (300s)
}

export interface TravelBufferCalculation {
  originAddress?: string;
  destinationAddress: string;
  bufferMinutes: number; // min 15 mins, max 60 mins based on distance/traffic
}
```

### 4. AgentMail ↔ Transactional Dispatch & Triage (`src/lib/agentmail-transactional.ts`)
```ts
export interface SendAppointmentEmailParams {
  userId: string;
  agentId: string;
  customerEmail: string;
  customerName: string;
  appointmentTime: Date;
  serviceTitle: string;
  icsContent: string;
}

export interface SendPaymentReceiptEmailParams {
  userId: string;
  agentId: string;
  customerEmail: string;
  amountUsd: string;
  receiptNumber: string;
  description: string;
}

export interface EmailTriageResult {
  intent: "reschedule" | "cancel" | "urgent_complaint" | "general_inquiry";
  confidence: number;
  requiresHumanEscalation: boolean;
  recommendedAction: string;
}
```

## Code Layout
- `src/lib/cloud-computer/voice-bridge.ts`: Non-blocking tool execution, status fillers, and 2FA takeover alert handler.
- `src/lib/cloud-computer/trade-portal-mirroring.ts`: Background job mirroring into Housecall Pro and ServiceTitan.
- `src/routes/stripe-routes.ts`: In-call text-to-pay deposit creation and webhook verification.
- `src/lib/stripe-voice-session.ts`: In-memory voice session event registry for mid-call webhook callbacks.
- `src/lib/goodwill-wallet-policy.ts`: Server-side goodwill wallet budget and per-call resolution cap enforcement.
- `src/lib/calendar-holds.ts`: Ephemeral 5-minute soft hold manager and location travel buffer calculator.
- `src/lib/ics-generator.ts`: RFC 5545 compliant `.ics` calendar invite string generator.
- `src/lib/agentmail-transactional.ts`: Transactional email dispatcher with `.ics` attachments and payment receipts.
- `src/lib/agentmail-triage.ts`: Inbound email reply intent triage and human escalation router.
- `tests/e2e/`: Opaque-box 4-tier test suite managed by E2E Testing Orchestrator.
