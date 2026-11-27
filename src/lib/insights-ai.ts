/**
 * AI-backed insights endpoints (topics, failure modes, daily brief).
 */
import { runStructured } from "./ai-structured";
import { isRuntimeAvailable } from "./ai-client";

export function isInsightsAiAvailable(): boolean {
  return isRuntimeAvailable();
}

const TOPICS_TOOL = {
  name: "cluster_call_topics",
  description: "Cluster recent call summaries into ranked topics.",
  input_schema: {
    type: "object",
    properties: {
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            count: { type: "integer" },
            category: { type: "string" },
            trend: { type: "string", enum: ["growing", "new", "steady", "declining"] },
            example_quote: { type: "string" },
          },
          required: ["name", "count", "category"],
        },
      },
      total_analyzed: { type: "integer" },
    },
    required: ["topics", "total_analyzed"],
  },
} as const;

export async function clusterTopics(input: {
  summaries: Array<{ summary: string; intent_label?: string | null }>;
  windowDays: number;
}) {
  const payload = input.summaries
    .map((s, i) => `${i + 1}. [${s.intent_label || "unknown"}] ${s.summary}`)
    .join("\n");
  return runStructured<{
    topics: Array<{
      name: string;
      count: number;
      category: string;
      trend?: string;
      example_quote?: string;
    }>;
    total_analyzed: number;
  }>({
    system:
      "Cluster call summaries into 5-12 concrete topics ranked by frequency. Use short names and realistic counts that sum to at most the number of calls.",
    user: `Window: ${input.windowDays} days\nCalls:\n${payload}`,
    tool: TOPICS_TOOL,
    complexity: "medium",
    maxTokens: 1200,
    cacheSystem: true,
  });
}

const DAILY_BRIEF_TOOL = {
  name: "daily_brief",
  description: "Executive daily brief for a voice AI operator.",
  input_schema: {
    type: "object",
    properties: {
      brief: {
        type: "object",
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
              properties: {
                description: { type: "string" },
                urgency: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["description", "urgency"],
            },
          },
        },
        required: ["headline", "mood", "highlights", "concerns", "action_items"],
      },
    },
    // The model writes prose only. Every number in the brief is computed from
    // the account's own records and attached after the model returns.
    required: ["brief"],
  },
} as const;

const DAILY_BRIEF_SYSTEM =
  "Write a short daily brief for a small-business owner about yesterday. Use only the supplied numbers and items; never invent, recompute, or round them differently. Treat 0 or missing as none, not a decline. Lead with what needs the owner today (open tasks, callbacks), then what went well. At most 3 highlights, 3 concerns, and 3 action items, one sentence each, each tied to a supplied number or item. Mood reflects yesterday vs the 7-day baseline; if both have fewer than 3 calls, mood is neutral.";

export async function composeDailyBrief(input: {
  yesterdayStats: Record<string, unknown>;
  weekDelta: Record<string, unknown>;
  recentCalls: unknown[];
  openTasks: unknown[];
}) {
  const result = await runStructured<{
    brief: {
      headline: string;
      mood: string;
      key_metrics_takeaway?: string;
      highlights: string[];
      concerns: string[];
      action_items: Array<{ description: string; urgency: string }>;
    };
  }>({
    system: DAILY_BRIEF_SYSTEM,
    user: JSON.stringify(input, null, 2),
    tool: DAILY_BRIEF_TOOL,
    complexity: "medium",
    maxTokens: 1600,
    cacheSystem: true,
  });

  // Numbers shown to the owner always come from the computed input, never
  // from model output, and the timestamp is the server's.
  return {
    brief: result.brief,
    stats_yesterday: input.yesterdayStats,
    week_delta: input.weekDelta,
    generated_at: new Date().toISOString(),
  };
}
