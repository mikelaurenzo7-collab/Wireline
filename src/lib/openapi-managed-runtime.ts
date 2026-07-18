type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

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
  const root = asRecord(document);
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

  const dailyBrief = asRecord(schemas.DailyBrief);
  dailyBrief.description =
    "OpenAI-authored daily brief comparing yesterday with the seven-day baseline.";

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
        ],
        properties: {
          ai_tokens_daily: { type: "integer" },
          voice_minutes_daily: { type: "integer" },
          concurrent_dials: { type: "integer" },
          knowledge_rows: { type: "integer" },
          intake_rpm: { type: "integer" },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };

  const dailyBriefPath = asRecord(paths["/api/insights/daily-brief"]);
  const dailyBriefGet = asRecord(dailyBriefPath.get);
  dailyBriefGet.summary = "OpenAI-authored daily operating brief";

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
  return document;
}
