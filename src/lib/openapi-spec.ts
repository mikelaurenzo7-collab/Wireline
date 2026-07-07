// src/lib/openapi-spec.ts
//
// OpenAPI 3.1 description of Wireline's public API surface.
//
// Why this file exists
// ────────────────────
// The full surface of `/api/*` is large (60+ handlers across server.ts and
// the routers in src/routes/*). This spec deliberately covers only the
// **contract-stable, partner-facing** subset — the endpoints external
// integrators, AI agents, and ops dashboards depend on. Internal-only or
// experimental endpoints are out of scope and may change without notice.
//
// The spec is served by `GET /api/openapi.json` (see src/routes/openapi-routes.ts).
// It is published unauthenticated because (a) it is shape information,
// not data, and (b) every endpoint enforces its own auth.
//
// Outbound webhook deliveries are documented under `webhooks:` so partners
// can wire receivers that consume our events (see src/lib/webhook-helpers.ts
// for the runtime catalog).
//
// Extending the spec
// ──────────────────
// 1. Add the new path entry to PATHS below.
// 2. If you add a request/response shape, register it under COMPONENT_SCHEMAS.
// 3. The path coverage test (src/lib/openapi-spec.test.ts) verifies every
//    documented path/method also exists in the codebase, so renames are caught.

import { WEBHOOK_EVENTS } from "./webhook-helpers";

// ──────────────────────────────────────────────────────────────────────
//  Minimal OpenAPI 3.1 typing
// ──────────────────────────────────────────────────────────────────────
// We hand-roll a small subset of the OpenAPI 3.1 type tree rather than
// pull in @types/openapi or openapi3-ts. Keeps the dependency surface
// stable and the spec self-contained.

type JsonSchema = {
  type?:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | readonly ("string" | "number" | "integer" | "boolean" | "object" | "array" | "null")[];
  format?: string;
  description?: string;
  enum?: readonly (string | number | boolean | null)[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  example?: unknown;
  default?: unknown;
  nullable?: boolean;
  $ref?: string;
  oneOf?: readonly JsonSchema[];
  minimum?: number;
  maximum?: number;
};

type ParameterIn = "query" | "header" | "path";

interface ParameterObject {
  name: string;
  in: ParameterIn;
  required?: boolean;
  description?: string;
  schema: JsonSchema;
}

interface ResponseObject {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
  headers?: Record<string, { description?: string; schema: JsonSchema }>;
}

interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: JsonSchema; example?: unknown }>;
}

interface OperationObject {
  summary: string;
  description?: string;
  operationId: string;
  tags?: readonly string[];
  security?: ReadonlyArray<Record<string, readonly string[]>>;
  parameters?: readonly ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
}

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
type PathItem = Partial<Record<HttpMethod, OperationObject>>;

interface OpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    summary?: string;
    description: string;
    contact?: { name?: string; url?: string };
    license?: { name: string; url?: string };
  };
  servers: readonly { url: string; description?: string }[];
  tags: readonly { name: string; description?: string }[];
  security: ReadonlyArray<Record<string, readonly string[]>>;
  paths: Record<string, PathItem>;
  webhooks?: Record<string, PathItem>;
  components: {
    securitySchemes: Record<
      string,
      | { type: "http"; scheme: "bearer"; bearerFormat?: string; description?: string }
      | { type: "apiKey"; in: "header"; name: string; description?: string }
    >;
    schemas: Record<string, JsonSchema>;
  };
}

// ──────────────────────────────────────────────────────────────────────
//  Component schemas
// ──────────────────────────────────────────────────────────────────────

const ErrorResponse: JsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string", description: "Human-readable error message." },
    code: { type: "string", description: "Stable machine-readable error code, when available." },
  },
  additionalProperties: true,
};

const HealthResponse: JsonSchema = {
  type: "object",
  required: ["status", "uptime_s", "capabilities", "timestamp"],
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    uptime_s: { type: "integer", description: "Seconds since the API process started." },
    db: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        latency_ms: { type: "integer" },
        error: { type: "string" },
      },
    },
    capabilities: {
      type: "object",
      description: "Boolean flags indicating which integrations are configured.",
      additionalProperties: { type: "boolean" },
    },
    claude_model: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
  },
};

const Agent: JsonSchema = {
  type: "object",
  description: "A configured voice/email agent owned by the calling tenant.",
  required: ["id", "name", "user_id"],
  properties: {
    id: { type: "string" },
    user_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    archetype: { type: "string", description: "Persona archetype (e.g. Closer, Receptionist)." },
    role: { type: "string", description: "Functional role (lead_qualifier, scheduler, ...)." },
    first_message: { type: "string" },
    voice_id: { type: "string" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
  additionalProperties: true,
};

const CallLog: JsonSchema = {
  type: "object",
  description: "A completed call (Vapi) with enrichment fields populated by Wireline.",
  required: ["id", "user_id"],
  properties: {
    id: { type: "string" },
    user_id: { type: "string", format: "uuid" },
    vapi_call_id: { type: "string" },
    agent_id: { type: "string" },
    customer_number: { type: "string" },
    customer_name: { type: "string" },
    direction: { type: "string", enum: ["inbound", "outbound"] },
    duration_seconds: { type: "integer" },
    transcript: { type: "string" },
    summary: { type: "string" },
    sentiment: { type: "string" },
    bant_score: { type: "integer", minimum: 0, maximum: 100 },
    created_at: { type: "string", format: "date-time" },
  },
  additionalProperties: true,
};

const Settings: JsonSchema = {
  type: "object",
  description: "Tenant-level settings. Shape is intentionally flexible.",
  properties: {
    user_id: { type: "string", format: "uuid" },
    business_name: { type: "string" },
    subscription_status: { type: "string" },
    max_agents: { type: "integer" },
    retention_days_call_logs: { type: "integer", minimum: 90 },
    retention_days_emails: { type: "integer", minimum: 90 },
  },
  additionalProperties: true,
};

const Webhook: JsonSchema = {
  type: "object",
  description: "An outbound webhook subscription.",
  required: ["id", "url", "events"],
  properties: {
    id: { type: "string" },
    url: { type: "string", format: "uri" },
    events: { type: "array", items: { type: "string", enum: [...WEBHOOK_EVENTS] } },
    enabled: { type: "boolean" },
    description: { type: "string" },
    created_at: { type: "string", format: "date-time" },
  },
};

const TriageBucket: JsonSchema = {
  type: "object",
  description:
    "One of the five Triage Inbox buckets: hot leads, compliance, Training gaps, tasks, escalations.",
  properties: {
    hot_leads: { type: "array", items: { type: "object", additionalProperties: true } },
    compliance: { type: "array", items: { type: "object", additionalProperties: true } },
    knowledge_gaps: { type: "array", items: { type: "object", additionalProperties: true } },
    tasks: { type: "array", items: { type: "object", additionalProperties: true } },
    escalations: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  additionalProperties: true,
};

const IntakeLeadRequest: JsonSchema = {
  type: "object",
  required: ["customer_number"],
  properties: {
    customer_number: {
      type: "string",
      description: "E.164 phone number (or accepted alias `phone`/`phone_number`).",
    },
    customer_name: { type: "string" },
    context: {
      type: "string",
      description: "Free-form note shown to the agent on call.",
      default: "",
    },
    metadata: {
      type: "object",
      additionalProperties: true,
      description: "Free-form pass-through (utm_*, source, etc.).",
    },
    agent_id: { type: "string", description: "Optional — pin this lead to a specific agent." },
    idempotency_key: {
      type: "string",
      description:
        "Caller-supplied idempotency key. Also honored via the `Idempotency-Key` header.",
    },
  },
  example: {
    customer_name: "Jane Doe",
    customer_number: "+15551234567",
    context: "Filled out the contact form",
    metadata: { utm_source: "google", landing_page: "/pricing" },
  },
};

const IntakeLeadResponse: JsonSchema = {
  type: "object",
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    lead_id: { type: "integer" },
    status: { type: "string" },
    call_id: { type: "string", nullable: true },
    idempotent_replay: { type: "boolean" },
    auto_dial_initiated: { type: "boolean" },
  },
};

const IntakeLeadsBulkRequest: JsonSchema = {
  type: "object",
  required: ["leads"],
  properties: {
    leads: { type: "array", items: IntakeLeadRequest, description: "Up to 100 leads per batch." },
  },
};

const OutboundCallPurpose: JsonSchema = {
  type: "string",
  enum: ["service_or_requested", "marketing_or_sales", "callback"],
  description:
    "`marketing_or_sales` requires express written consent. `service_or_requested` and `callback` must not fake marketing consent.",
};

const OutboundDialRequest: JsonSchema = {
  type: "object",
  required: ["agentId", "customerNumber", "callPurpose"],
  properties: {
    agentId: { type: "string", description: "Tenant-owned agent id that should place the call." },
    customerNumber: {
      type: "string",
      description: "E.164 phone number, for example +15551234567.",
    },
    customerName: { type: "string" },
    context: {
      type: "string",
      description: "Free-form context shown to the agent before dialing.",
    },
    callPurpose: OutboundCallPurpose,
    hasExpressWrittenConsent: {
      type: "boolean",
      default: false,
      description:
        "Only honored for `marketing_or_sales`; ignored for callbacks and requested calls.",
    },
  },
  additionalProperties: false,
  example: {
    agentId: "agt_123",
    customerNumber: "+15551234567",
    customerName: "Jane Doe",
    context: "Requested a callback about Business pricing.",
    callPurpose: "callback",
    hasExpressWrittenConsent: false,
  },
};

const OutboundDialResponse: JsonSchema = {
  type: "object",
  required: ["success", "callId"],
  properties: {
    success: { type: "boolean" },
    callId: { type: "string" },
  },
};

const DailyBrief: JsonSchema = {
  type: "object",
  description: "Claude-authored daily brief comparing yesterday vs the 7-day baseline.",
  properties: {
    headline: { type: "string" },
    mood: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    action_items: { type: "array", items: { type: "string" } },
    generated_at: { type: "string", format: "date-time" },
  },
  additionalProperties: true,
};

const QuotaUsage: JsonSchema = {
  type: "object",
  description: "Current quota usage vs limits for the calling tenant.",
  properties: {
    claude_tokens: {
      type: "object",
      properties: {
        used_today: { type: "integer" },
        limit_per_day: { type: "integer" },
      },
    },
    voice_minutes: {
      type: "object",
      properties: {
        used_this_month: { type: "integer" },
        limit_per_month: { type: "integer" },
      },
    },
    concurrent_dials: {
      type: "object",
      properties: {
        in_flight: { type: "integer" },
        max: { type: "integer" },
      },
    },
  },
  additionalProperties: true,
};

const BillingStatus: JsonSchema = {
  type: "object",
  description:
    "Tenant billing snapshot: subscription mirror, trial block, email verification, and signup intent.",
  properties: {
    stripe_configured: { type: "boolean" },
    agent_count: { type: "integer" },
    phone_lines_used: {
      type: "integer",
      description: "Rows in wireline_phone_numbers for this tenant.",
    },
    phone_lines_included: {
      type: "integer",
      description:
        "Max provisioned voice numbers while active — equals the subscribed plan agent cap (one number slot per purchased agent seat).",
    },
    email_verified: { type: "boolean" },
    subscription: {
      type: ["object", "null"],
      description: "Mirrored Stripe subscription summary.",
      properties: {
        plan: { type: ["string", "null"] },
        plan_id: { type: ["string", "null"] },
        plan_name: { type: ["string", "null"] },
        max_agents: {
          type: ["integer", "null"],
          description: "Agent seat cap — also the voice-number slot cap.",
        },
        status: { type: ["string", "null"] },
        current_period_end: { type: ["string", "null"], format: "date-time" },
        cancel_at_period_end: { type: "boolean" },
        has_customer: { type: "boolean" },
        customer_state: { type: ["string", "null"] },
        has_subscription: { type: "boolean" },
        updated_at: { type: ["string", "null"], format: "date-time" },
      },
      additionalProperties: true,
    },
    trial: {
      type: ["object", "null"],
      properties: {
        status: { type: "string" },
        days_left: { type: ["integer", "null"] },
        ends_at: { type: ["string", "null"], format: "date-time" },
        outbound_used: { type: "integer" },
        outbound_cap: { type: "integer" },
        agents_cap: { type: "integer" },
        agents_used: { type: "integer" },
      },
      additionalProperties: true,
    },
    signup_intent: {
      type: ["object", "null"],
      properties: {
        plan_id: { type: ["string", "null"] },
        wedge: { type: ["string", "null"] },
        utm_source: { type: ["string", "null"] },
        utm_medium: { type: ["string", "null"] },
        utm_campaign: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

const SloSnapshot: JsonSchema = {
  type: "object",
  description:
    "Evidence-backed SLO snapshot. `status` is ok, degraded, or insufficient_data — never an unconditional SLA claim.",
  properties: {
    status: { type: "string", enum: ["ok", "degraded", "insufficient_data"] },
    banner_status: { type: "string", enum: ["healthy", "degraded", "critical"] },
    window_hours: { type: "integer" },
    dimensions: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: ["ok", "warn", "critical", "healthy", "degraded"],
      },
    },
    targets: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          configured: { type: "boolean" },
          status: { type: "string", enum: ["ok", "degraded", "insufficient_data"] },
          target_label: { type: "string" },
          evidence: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  additionalProperties: true,
};

const IntegrationsReport: JsonSchema = {
  type: "object",
  properties: {
    integrations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          group: { type: "string" },
          required: { type: "boolean" },
          status: { type: "string", enum: ["configured", "missing", "fallback"] },
          envVars: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                present: { type: "boolean" },
              },
              required: ["name", "present"],
            },
          },
          fallback: { type: "string" },
          docsUrl: { type: "string", format: "uri" },
        },
        required: ["id", "label", "group", "required", "status"],
      },
    },
    timestamp: { type: "string", format: "date-time" },
  },
};

const WebhookDelivery: JsonSchema = {
  type: "object",
  description:
    "Outbound webhook delivery envelope. The HTTP request body posted to your endpoint is `{ event, data, delivery_id, timestamp }`. Verify the `X-Wireline-Signature` header with HMAC-SHA256(body, your_signing_secret).",
  required: ["event", "data", "delivery_id", "timestamp"],
  properties: {
    event: { type: "string", enum: [...WEBHOOK_EVENTS] },
    delivery_id: { type: "string", description: "Unique per delivery attempt." },
    timestamp: { type: "string", format: "date-time" },
    data: { type: "object", additionalProperties: true, description: "Event-specific payload." },
  },
};

const COMPONENT_SCHEMAS: Record<string, JsonSchema> = {
  ErrorResponse,
  HealthResponse,
  Agent,
  CallLog,
  Settings,
  Webhook,
  TriageBucket,
  IntakeLeadRequest,
  IntakeLeadResponse,
  IntakeLeadsBulkRequest,
  OutboundCallPurpose,
  OutboundDialRequest,
  OutboundDialResponse,
  DailyBrief,
  QuotaUsage,
  BillingStatus,
  SloSnapshot,
  IntegrationsReport,
  WebhookDelivery,
};

// ──────────────────────────────────────────────────────────────────────
//  Reusable response objects
// ──────────────────────────────────────────────────────────────────────

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = (description: string): ResponseObject => ({
  description,
  content: { "application/json": { schema: ref("ErrorResponse") } },
});

const COMMON_ERROR_RESPONSES: Record<string, ResponseObject> = {
  "400": errorResponse("Invalid request — see `error` and `code`."),
  "401": errorResponse("Missing or invalid credentials."),
  "403": errorResponse("Authenticated but not authorized for this resource."),
  "404": errorResponse("Resource not found, or owned by another tenant."),
  "429": errorResponse("Rate limit exceeded. Retry after the `Retry-After` header."),
  "500": errorResponse("Internal server error."),
  "503": errorResponse("Dependency unavailable (e.g. Claude / Stripe unconfigured)."),
};

const auth = {
  bearer: [{ bearerAuth: [] }],
  intakeKey: [{ intakeKeyAuth: [] }],
  none: [] as const,
};

// ──────────────────────────────────────────────────────────────────────
//  Paths
// ──────────────────────────────────────────────────────────────────────
// Each path lists the canonical method(s), the operationId an SDK generator
// will use, the security scheme(s), and a focused response shape.

const PATHS: Record<string, PathItem> = {
  // ── Health & discovery ────────────────────────────────────────────
  "/api/health": {
    get: {
      summary: "Health probe",
      description:
        "Public. Returns process uptime, database probe, and capability flags. Stable contract — external monitors may key on the response shape.",
      operationId: "getHealth",
      tags: ["Health"],
      security: auth.none,
      responses: {
        "200": {
          description: "Healthy.",
          content: { "application/json": { schema: ref("HealthResponse") } },
        },
        "503": errorResponse("Database probe failed."),
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },
  "/api/openapi.json": {
    get: {
      summary: "OpenAPI 3.1 spec for this API",
      description:
        "Public. Returns this document. Use it to auto-generate client SDKs, drive contract tests, or expose Wireline as a tool to AI-agent frameworks.",
      operationId: "getOpenApiSpec",
      tags: ["Health"],
      security: auth.none,
      responses: {
        "200": {
          description: "OpenAPI 3.1 document.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
  },
  "/api/health/integrations": {
    get: {
      summary: "Platform-admin integrations health report",
      description:
        "Platform admin only. Per-integration configured/missing/fallback status with the env-var presence map. Powers the Founder → Platform Health panel.",
      operationId: "getIntegrationsReport",
      tags: ["Health"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Integration report.",
          content: { "application/json": { schema: ref("IntegrationsReport") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
        "403": COMMON_ERROR_RESPONSES["403"],
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },
  "/api/health/slos": {
    get: {
      summary: "Evidence-backed operational SLO snapshot",
      description:
        "Monitor token (`x-monitor-token` or Bearer) returns platform-wide measured targets. Platform admins receive the tenant-scoped operator snapshot used by the founder console.",
      operationId: "getSloSnapshot",
      tags: ["Health"],
      security: auth.bearer,
      parameters: [
        {
          name: "window_hours",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 168, default: 24 },
        },
      ],
      responses: {
        "200": {
          description: "SLO snapshot.",
          content: { "application/json": { schema: ref("SloSnapshot") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },

  // ── Lead intake (the partner-facing API) ──────────────────────────
  "/api/intake/lead": {
    post: {
      summary: "Submit a single inbound lead",
      description:
        "Public, authenticated by the `X-Wireline-Key` header. Inserts the lead into the tenant's queue (source=`inbound`) and fires a `lead.received` webhook event. Honors `Idempotency-Key` so retries are safe.",
      operationId: "postIntakeLead",
      tags: ["Intake"],
      security: auth.intakeKey,
      parameters: [
        { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("IntakeLeadRequest") } },
      },
      responses: {
        "200": {
          description: "Lead accepted.",
          content: { "application/json": { schema: ref("IntakeLeadResponse") } },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },
  "/api/intake/leads": {
    post: {
      summary: "Submit a batch of inbound leads",
      description: "Bulk variant of `/api/intake/lead`. Caps apply per intake key.",
      operationId: "postIntakeLeads",
      tags: ["Intake"],
      security: auth.intakeKey,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("IntakeLeadsBulkRequest") } },
      },
      responses: {
        "200": {
          description: "Aggregate result.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accepted: { type: "integer" },
                  rejected: { type: "integer" },
                  results: { type: "array", items: ref("IntakeLeadResponse") },
                },
              },
            },
          },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },

  // ── Agents ────────────────────────────────────────────────────────
  "/api/agents": {
    get: {
      summary: "List the caller's agents",
      operationId: "listAgents",
      tags: ["Agents"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Array of agents owned by the caller.",
          content: { "application/json": { schema: { type: "array", items: ref("Agent") } } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },
  "/api/agents/roles": {
    get: {
      summary: "Authenticated catalog of agent roles",
      description: "Role definitions used when provisioning an agent.",
      operationId: "listAgentRoles",
      tags: ["Agents"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Role catalog.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },

  // ── Calls ─────────────────────────────────────────────────────────
  "/api/calls": {
    get: {
      summary: "List the caller's call logs",
      description:
        "Returns enriched call records owned by the calling tenant. Filterable via query params.",
      operationId: "listCalls",
      tags: ["Calls"],
      security: auth.bearer,
      parameters: [
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 500 },
        },
        { name: "agent_id", in: "query", required: false, schema: { type: "string" } },
      ],
      responses: {
        "200": {
          description: "Array of call logs.",
          content: { "application/json": { schema: { type: "array", items: ref("CallLog") } } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },

  // ── Outbound ──────────────────────────────────────────────────────
  "/api/outbound/dial": {
    post: {
      summary: "Place a tenant-scoped outbound call",
      description:
        "Authenticated manual dial. `callPurpose` is required so requested service calls, callbacks, and marketing/sales calls keep distinct consent semantics. Marketing/sales calls require express written consent and all calls pass DNC/TCPA gates before dispatch.",
      operationId: "postOutboundDial",
      tags: ["Outbound"],
      security: auth.bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("OutboundDialRequest") } },
      },
      responses: {
        "200": {
          description: "Call dispatched.",
          content: { "application/json": { schema: ref("OutboundDialResponse") } },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
        "402": errorResponse("Trial, quota, spend, or billing gate blocked outbound dialing."),
        "403": errorResponse("DNC or TCPA consent gate blocked the call."),
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },
  "/api/mobile/calls/outbound": {
    post: {
      summary: "Place an outbound call from a native client",
      description:
        "Native equivalent of `/api/outbound/dial`. The mobile client must send an explicit `callPurpose`; Siri and CarPlay callbacks use non-marketing purposes and cannot assert marketing consent.",
      operationId: "postMobileOutboundCall",
      tags: ["Outbound"],
      security: auth.bearer,
      requestBody: {
        required: true,
        content: { "application/json": { schema: ref("OutboundDialRequest") } },
      },
      responses: {
        "200": {
          description: "Call dispatched.",
          content: { "application/json": { schema: ref("OutboundDialResponse") } },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
        "402": errorResponse("Trial, quota, spend, or billing gate blocked outbound dialing."),
        "403": errorResponse("DNC or TCPA consent gate blocked the call."),
        "429": COMMON_ERROR_RESPONSES["429"],
      },
    },
  },
  // ── Settings ──────────────────────────────────────────────────────
  "/api/settings": {
    get: {
      summary: "Read the caller's tenant settings",
      operationId: "getSettings",
      tags: ["Settings"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Settings.",
          content: { "application/json": { schema: ref("Settings") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
    post: {
      summary: "Update the caller's tenant settings",
      description: "Partial update — only provided fields are written.",
      operationId: "updateSettings",
      tags: ["Settings"],
      security: auth.bearer,
      requestBody: { required: true, content: { "application/json": { schema: ref("Settings") } } },
      responses: {
        "200": {
          description: "Updated settings.",
          content: { "application/json": { schema: ref("Settings") } },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },

  // ── Triage / Insights ─────────────────────────────────────────────
  "/api/triage": {
    get: {
      summary: "Triage Inbox — five buckets of what needs attention",
      operationId: "getTriage",
      tags: ["Insights"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Triage buckets.",
          content: { "application/json": { schema: ref("TriageBucket") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },
  "/api/insights/daily-brief": {
    get: {
      summary: "Daily Brief — Claude-authored summary of yesterday vs the 7-day baseline",
      operationId: "getDailyBrief",
      tags: ["Insights"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Daily brief.",
          content: { "application/json": { schema: ref("DailyBrief") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
        "402": errorResponse("Spend hard cap reached. Increase cap or wait for next period."),
        "503": COMMON_ERROR_RESPONSES["503"],
      },
    },
  },
  "/api/insights/funnel": {
    get: {
      summary: "Conversion funnel for the calling tenant",
      operationId: "getFunnel",
      tags: ["Insights"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Funnel data.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },
  "/api/insights/leaderboard": {
    get: {
      summary: "Per-agent leaderboard",
      operationId: "getLeaderboard",
      tags: ["Insights"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Leaderboard rows.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },

  // ── Webhooks (CRUD over the outbound subscription list) ──────────
  "/api/webhooks": {
    get: {
      summary: "List the caller's outbound webhook subscriptions",
      operationId: "listWebhooks",
      tags: ["Webhooks"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Subscriptions + the catalog of subscribable events.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  webhooks: { type: "array", items: ref("Webhook") },
                  available_events: {
                    type: "array",
                    items: { type: "string", enum: [...WEBHOOK_EVENTS] },
                  },
                },
              },
            },
          },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
    post: {
      summary: "Create an outbound webhook subscription",
      description:
        "On create, a signing secret is generated and returned **once**. Subsequent reads omit it; persist it on your end.",
      operationId: "createWebhook",
      tags: ["Webhooks"],
      security: auth.bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["url", "events"],
              properties: {
                url: { type: "string", format: "uri" },
                events: { type: "array", items: { type: "string", enum: [...WEBHOOK_EVENTS] } },
                description: { type: "string" },
                enabled: { type: "boolean", default: true },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Created.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        "400": COMMON_ERROR_RESPONSES["400"],
        "401": COMMON_ERROR_RESPONSES["401"],
        "403": COMMON_ERROR_RESPONSES["403"],
        "503": errorResponse("Secret Vault not configured — set WIRELINE_DATA_KEY."),
      },
    },
  },

  // ── Quotas & billing ──────────────────────────────────────────────
  "/api/quotas": {
    get: {
      summary: "Current quota usage and limits",
      operationId: "getQuotas",
      tags: ["Billing"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Quota usage.",
          content: { "application/json": { schema: ref("QuotaUsage") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
      },
    },
  },
  "/api/billing/plans": {
    get: {
      summary: "Public plan catalog",
      description: "No auth. Returns the available plans and their human-readable feature lists.",
      operationId: "listBillingPlans",
      tags: ["Billing"],
      security: auth.none,
      responses: {
        "200": {
          description: "Plan catalog.",
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
  },
  "/api/billing/status": {
    get: {
      summary: "Subscription status for the calling tenant",
      operationId: "getBillingStatus",
      tags: ["Billing"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Subscription status.",
          content: { "application/json": { schema: ref("BillingStatus") } },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
        "503": COMMON_ERROR_RESPONSES["503"],
      },
    },
  },
  "/api/billing/portal": {
    post: {
      summary: "Open a Stripe Customer Portal session",
      description:
        "Returns a short-lived URL to redirect the user to the Stripe-hosted portal where they can manage payment methods and cancel.",
      operationId: "createBillingPortalSession",
      tags: ["Billing"],
      security: auth.bearer,
      responses: {
        "200": {
          description: "Portal URL.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: { url: { type: "string", format: "uri" } },
              },
            },
          },
        },
        "401": COMMON_ERROR_RESPONSES["401"],
        "503": COMMON_ERROR_RESPONSES["503"],
      },
    },
  },
};

// ──────────────────────────────────────────────────────────────────────
//  Outbound webhook events — documented as 3.1 `webhooks:` entries
// ──────────────────────────────────────────────────────────────────────
// Each event becomes a webhook operation so generators can render the
// receiver shape your endpoint will get from us.

function buildWebhookEntries(): Record<string, PathItem> {
  const entries: Record<string, PathItem> = {};
  for (const event of WEBHOOK_EVENTS) {
    entries[event] = {
      post: {
        summary: `Outbound webhook — ${event}`,
        description: `POST sent to the URL you registered. Verify the \`X-Wireline-Signature\` header with HMAC-SHA256(body, your_signing_secret).`,
        operationId: `webhook_${event.replace(/\W+/g, "_")}`,
        tags: ["Webhooks"],
        security: auth.none,
        requestBody: {
          required: true,
          content: { "application/json": { schema: ref("WebhookDelivery") } },
        },
        responses: {
          "2XX": { description: "Acknowledged. Any 2xx is treated as success." },
        },
      },
    };
  }
  return entries;
}

// ──────────────────────────────────────────────────────────────────────
//  Document assembly
// ──────────────────────────────────────────────────────────────────────

/**
 * Build the OpenAPI 3.1 document. The `serverUrl` is inserted into
 * `servers[].url` so generated SDKs target the right deployment.
 *
 * Pass `process.env.APP_URL` (or the request's own origin) at call time.
 */
export function getOpenApiSpec(serverUrl?: string): OpenApiDocument {
  const url = serverUrl?.replace(/\/+$/, "") || "https://your-wireline-deployment.example.com";
  return {
    openapi: "3.1.0",
    info: {
      title: "Wireline API",
      version: "1.0.0",
      summary: "Carrier-grade omnichannel agents for voice, email, and follow-up.",
      description: [
        "Wireline's public API. Designed for three audiences:",
        "",
        "1. **CRM / form / Zapier integrations** — push leads in via `POST /api/intake/lead`.",
        "2. **Account Holders & ops dashboards** — read agents, calls, settings, quotas, SLOs.",
        "3. **AI-agent frameworks** — consume this spec as a tool catalog (Claude Desktop, Cursor, ChatGPT custom GPTs, etc).",
        "",
        "Authentication:",
        "",
        "- `bearerAuth` — Wireline session JWT in `Authorization: Bearer <jwt>`. Used by tenant-scoped endpoints.",
        "- `intakeKeyAuth` — Wireline-issued API key in `X-Wireline-Key: wlk_…`. Used only by `POST /api/intake/lead[s]`.",
        "",
        "Outbound webhook deliveries are documented under `webhooks:` — each entry shows the body shape your receiver will get.",
      ].join("\n"),
      contact: { name: "Wireline" },
      license: { name: "Proprietary" },
    },
    servers: [{ url, description: "This deployment." }],
    tags: [
      {
        name: "Health",
        description: "Liveness, capability flags, integrations report, SLO snapshot.",
      },
      { name: "Intake", description: "Inbound lead intake API used by CRMs / forms / Zapier." },
      {
        name: "Agents",
        description: "Configured voice + email agents owned by the calling tenant.",
      },
      { name: "Calls", description: "Enriched call logs." },
      {
        name: "Outbound",
        description: "Tenant-scoped outbound dialing with DNC/TCPA consent gates.",
      },
      {
        name: "Settings",
        description: "Tenant-level settings (retention, business profile, ...).",
      },
      { name: "Insights", description: "Triage Inbox, Daily Brief, funnel, leaderboard." },
      {
        name: "Webhooks",
        description: "Outbound webhook subscriptions and the events they deliver.",
      },
      { name: "Billing", description: "Stripe-backed subscription, plan catalog, quota usage." },
    ],
    security: [{ bearerAuth: [] }],
    paths: PATHS,
    webhooks: buildWebhookEntries(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Wireline-issued JWT in `Authorization: Bearer <jwt>`.",
        },
        intakeKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-Wireline-Key",
          description: "Wireline-issued intake API key. Manage in Admin → Intake Keys.",
        },
      },
      schemas: COMPONENT_SCHEMAS,
    },
  };
}

/**
 * Convenience for callers (and tests) that need the list of paths /
 * methods this spec claims to cover. Used by the coverage test to verify
 * every documented path/method exists in real route discovery.
 */
export function listSpecOperations(): Array<{ method: HttpMethod; path: string }> {
  const doc = getOpenApiSpec();
  const out: Array<{ method: HttpMethod; path: string }> = [];
  for (const [p, item] of Object.entries(doc.paths)) {
    for (const m of Object.keys(item) as HttpMethod[]) {
      out.push({ method: m, path: p });
    }
  }
  return out;
}
