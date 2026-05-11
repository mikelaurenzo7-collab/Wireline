/**
 * OpenAPI 3.0 document for Wireline's **public** inbound lead intake API.
 *
 * Served at `GET /api/docs/openapi.json` (no auth) so operators can import
 * the spec into Zapier, Make, n8n, Postman, or internal API gateways.
 *
 * Keep this aligned with `processIntakeLead` + route handlers in `server.ts`.
 */

function intakeServerUrl(): string {
  const raw = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (raw) return raw;
  return "https://YOUR_APP_URL";
}

/** Full OpenAPI object — safe to JSON-serialize. */
export function getWirelineIntakeOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "Wireline Lead Intake API",
      version: "1.0.0",
      description:
        "Push leads into Wireline from Webflow, CRM exports, automation tools, or custom backends. " +
        "Authenticate with an intake API key (`X-Wireline-Key`, prefix `wlk_`) created in Admin → Intake Keys. " +
        "Successful inserts enqueue `lead.received` on the operator's outbound webhooks. " +
        "Optional `Idempotency-Key` on single-lead POST deduplicates per operator (same key returns the original `lead_id`). " +
        "Rate limit: 60 requests per rolling 60 seconds **per intake key** (each bulk row counts as one hit).",
      contact: { name: "Wireline" },
    },
    servers: [{ url: intakeServerUrl(), description: "Set APP_URL to your canonical deployment URL." }],
    tags: [{ name: "Intake", description: "Inbound lead capture (public API key auth)" }],
    paths: {
      "/api/intake/lead": {
        post: {
          tags: ["Intake"],
          operationId: "intakeSingleLead",
          summary: "Create one inbound lead",
          description:
            "Requires a valid `X-Wireline-Key`. Accepts `customer_number`, `phone`, or `phone_number` for the phone field. " +
            "When the intake key has `auto_dial` and a default agent (or `agent_id` in body), an outbound call may start asynchronously.",
          security: [{ WirelineIntakeKey: [] }],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: false,
              schema: { type: "string", maxLength: 255 },
              description:
                "Optional. Same value + same operator returns the original lead with `idempotent_replay: true` (Postgres unique on user_id + idempotency_key).",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IntakeLeadRequest" },
                examples: {
                  minimal: {
                    summary: "Phone only",
                    value: { customer_number: "+15551234567" },
                  },
                  full: {
                    summary: "Name + context + metadata",
                    value: {
                      customer_name: "Jane Doe",
                      customer_number: "+15551234567",
                      context: "Requested a demo from pricing page",
                      metadata: { utm_source: "google", form_id: "pricing-hero" },
                      agent_id: "optional-override-agent-uuid",
                      idempotency_key: "optional-body-fallback-if-no-header",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Lead accepted or idempotent replay",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeLeadSuccess" },
                },
              },
            },
            "400": {
              description: "Validation error (e.g. missing or invalid phone)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
            "401": {
              description: "Missing or invalid X-Wireline-Key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
            "429": {
              description: "Per-key rate limit exceeded",
              headers: {
                "Retry-After": {
                  description: "Seconds until the rolling window allows more requests",
                  schema: { type: "string" },
                },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeRateLimitError" },
                },
              },
            },
            "500": {
              description: "Insert failed or unexpected server error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
          },
        },
      },
      "/api/intake/leads": {
        post: {
          tags: ["Intake"],
          operationId: "intakeBulkLeads",
          summary: "Create up to 100 inbound leads in one request",
          description:
            "Each element in `leads` is processed like a single `/api/intake/lead` call. " +
            "The batch is rejected with 429 if the whole batch would exceed the per-key rate bucket (reserve-before-process). " +
            "Per-lead `idempotency_key` in the body is supported; the `Idempotency-Key` header is ignored for bulk.",
          security: [{ WirelineIntakeKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IntakeBulkRequest" },
                example: {
                  leads: [
                    { customer_number: "+15551234567", customer_name: "Lead A" },
                    { phone: "+15559876543", context: "CSV import row 2" },
                  ],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch processed (check per-row `ok` in results)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeBulkResponse" },
                },
              },
            },
            "400": {
              description: "Empty batch, too many rows, or malformed body",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
            "401": {
              description: "Missing or invalid X-Wireline-Key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
            "429": {
              description: "Batch would exceed per-key rate limit",
              headers: {
                "Retry-After": { schema: { type: "string" } },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeBulkRateLimitError" },
                },
              },
            },
            "500": {
              description: "Unexpected failure",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IntakeError" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        WirelineIntakeKey: {
          type: "apiKey",
          in: "header",
          name: "X-Wireline-Key",
          description: "Per-operator intake key (prefix `wlk_`). Shown once at creation in Admin.",
        },
      },
      schemas: {
        IntakeLeadRequest: {
          type: "object",
          description: "At least one phone field is required.",
          properties: {
            customer_number: { type: "string", description: "E.164 or digits; separators stripped server-side." },
            phone: { type: "string", description: "Alias of customer_number." },
            phone_number: { type: "string", description: "Alias of customer_number." },
            customer_name: { type: "string", maxLength: 200 },
            name: { type: "string", description: "Alias of customer_name." },
            context: { type: "string", maxLength: 4000 },
            message: { type: "string", description: "Alias of context." },
            metadata: {
              type: "object",
              additionalProperties: true,
              description: "Plain object, max 50 keys; values stored as JSON-compatible.",
            },
            agent_id: {
              type: "string",
              description: "Optional. Overrides the intake key's default_agent_id for this lead only.",
            },
            idempotency_key: {
              type: "string",
              maxLength: 255,
              description: "Body fallback when `Idempotency-Key` header is not sent.",
            },
          },
        },
        IntakeLeadSuccess: {
          type: "object",
          required: ["ok"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            lead_id: { type: "integer", format: "int64" },
            idempotent_replay: { type: "boolean" },
            auto_dial_initiated: { type: "boolean" },
            status: { type: "string", description: "Present on idempotent replay from DB." },
            call_id: { type: "string", nullable: true, description: "Vapi call id when replaying a row that was dialed." },
          },
        },
        IntakeBulkRequest: {
          type: "object",
          required: ["leads"],
          properties: {
            leads: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { $ref: "#/components/schemas/IntakeLeadRequest" },
            },
          },
        },
        IntakeBulkResponse: {
          type: "object",
          required: ["ok", "count", "success_count", "failure_count", "results"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            count: { type: "integer" },
            success_count: { type: "integer" },
            failure_count: { type: "integer" },
            results: {
              type: "array",
              description:
                "One entry per input lead, in order. Success rows match IntakeLeadSuccess; failures use ok: false with error and optional code.",
              items: { $ref: "#/components/schemas/IntakeBulkResultRow" },
            },
          },
        },
        IntakeBulkResultRow: {
          type: "object",
          required: ["ok"],
          properties: {
            ok: { type: "boolean" },
            lead_id: { type: "integer", format: "int64" },
            idempotent_replay: { type: "boolean" },
            auto_dial_initiated: { type: "boolean" },
            status: { type: "string" },
            call_id: { type: "string", nullable: true },
            error: { type: "string" },
            code: { type: "string" },
          },
        },
        IntakeError: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
        IntakeRateLimitError: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string", example: "INTAKE_RATE_LIMIT" },
            retry_after_s: { type: "integer" },
          },
        },
        IntakeBulkRateLimitError: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string", example: "INTAKE_RATE_LIMIT" },
            retry_after_s: { type: "integer" },
            accepted_so_far: { type: "integer", description: "How many bucket slots were reserved before rejection." },
          },
        },
      },
    },
  };
}
