type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

const healthSchemaRef = { $ref: "#/components/schemas/HealthResponse" };

/**
 * Keep the partner-facing OpenAPI document aligned with the active managed
 * runtime and the response bodies the production routes actually emit.
 *
 * The underlying hand-authored spec intentionally keeps broad path coverage in
 * one file. This focused normalizer owns runtime/provider claims and prevents
 * legacy provider names from leaking into the public contract while internal
 * storage aliases are retired gradually.
 */
export function normalizeOpenApiForManagedRuntime<T>(document: T): T {
  // getOpenApiSpec reuses module-level path/schema objects. Clone before
  // normalization so one request or test cannot mutate future raw documents.
  const normalized = JSON.parse(JSON.stringify(document)) as T;
  const root = asRecord(normalized);
  const components = asRecord(root.components);
  const schemas = asRecord(components.schemas);
  const paths = asRecord(root.paths);

  schemas.HealthResponse = {
    type: "object",
    required: ["ok", "timestamp"],
    properties: {
      ok: { type: "boolean", description: "Whether the database-backed liveness probe passed." },
      timestamp: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  };

  schemas.DailyBrief = {
    type: "object",
    description: "OpenAI-authored daily brief comparing yesterday with the seven-day baseline.",
    required: ["brief", "stats_yesterday", "week_delta", "generated_at"],
    properties: {
      brief: {
        type: "object",
        required: ["headline", "mood", "highlights", "concerns", "action_items"],
        properties: {
          headline: { type: "string" },
          mood: {
            type: "string",
            enum: ["positive", "neutral", "concerning", "green", "yellow", "red"],
          },
          key_metrics_takeaway: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          action_items: {
            type: "array",
            items: {
              type: "object",
              required: ["description", "urgency"],
              properties: {
                description: { type: "string" },
                urgency: { type: "string", enum: ["high", "medium", "low"] },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: true,
      },
      stats_yesterday: { type: "object", additionalProperties: true },
      week_delta: { type: "object", additionalProperties: true },
      generated_at: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  };

  schemas.QuotaUsage = {
    type: "object",
    required: ["plan", "limits", "usage"],
    properties: {
      plan: { type: "string" },
      limits: {
        type: "object",
        required: [
          "ai_tokens_daily",
          "voice_minutes_daily",
          "concurrent_dials",
          "knowledge_rows",
          "intake_rpm",
          "simulation_minutes_daily",
        ],
        properties: {
          ai_tokens_daily: {
            type: "integer",
            description: "Managed OpenAI input and output token ceiling per UTC day.",
          },
          voice_minutes_daily: { type: "integer" },
          concurrent_dials: { type: "integer" },
          knowledge_rows: { type: "integer" },
          intake_rpm: { type: "integer" },
          simulation_minutes_daily: {
            type: "integer",
            description: "Live-simulation (realtime voice test) minute ceiling per UTC day.",
          },
        },
        additionalProperties: false,
      },
      usage: {
        type: "object",
        required: [
          "ai_tokens_daily",
          "voice_minutes_daily",
          "concurrent_dials",
          "knowledge_rows",
          "intake_rpm",
          "simulation_minutes_daily",
        ],
        properties: {
          ai_tokens_daily: { type: "integer" },
          voice_minutes_daily: { type: "integer" },
          concurrent_dials: { type: "integer" },
          knowledge_rows: { type: "integer" },
          intake_rpm: { type: "integer" },
          simulation_minutes_daily: { type: "integer" },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };

  const healthPath = asRecord(paths["/api/health"]);
  const healthGet = asRecord(healthPath.get);
  healthGet.description =
    "Public database-backed liveness probe. Returns the same stable envelope for healthy and degraded states.";
  const healthResponses = asRecord(healthGet.responses);
  healthResponses["503"] = {
    description: "Database probe failed.",
    content: { "application/json": { schema: healthSchemaRef } },
  };
  healthGet.responses = healthResponses;

  const dailyBriefPath = asRecord(paths["/api/insights/daily-brief"]);
  const dailyBriefGet = asRecord(dailyBriefPath.get);
  dailyBriefGet.summary = "OpenAI-authored daily operating brief";
  dailyBriefGet.description =
    "Generates a concise OpenAI-authored operating brief from the tenant's measured activity and seven-day baseline.";

  for (const pathItem of Object.values(paths)) {
    const item = asRecord(pathItem);
    for (const operation of Object.values(item)) {
      const op = asRecord(operation);
      const responses = asRecord(op.responses);
      const unavailable = asRecord(responses["503"]);
      if (typeof unavailable.description === "string") {
        unavailable.description = unavailable.description.replace(
          /Dependency unavailable \(e\.g\. Claude \/ Stripe unconfigured\)\./g,
          "Dependency unavailable (for example, the managed OpenAI runtime or Stripe is unconfigured).",
        );
      }
    }
  }

  components.schemas = schemas;
  root.components = components;
  root.paths = paths;
  return normalized;
}
