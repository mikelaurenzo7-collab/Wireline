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

const FAILURE_MODES_TOOL = {
  name: "cluster_failure_modes",
  description: "Group failed or low-intent calls into failure modes.",
  input_schema: {
    type: "object",
    properties: {
      modes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            failure_type: { type: "string" },
            severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
            fix_target: { type: "string" },
            count: { type: "integer" },
            description: { type: "string" },
            recommended_fix: { type: "string" },
          },
          required: ["failure_type", "severity", "fix_target", "count", "recommended_fix"],
        },
      },
    },
    required: ["modes"],
  },
} as const;

export async function clusterFailureModes(input: {
  failedCalls: Array<{
    summary?: string | null;
    transcript?: string | null;
    lead_score?: number | null;
    intent_label?: string | null;
  }>;
}) {
  const payload = input.failedCalls
    .map((c, i) => {
      const excerpt = (c.transcript || c.summary || "").slice(0, 400);
      return `${i + 1}. score=${c.lead_score ?? "—"} intent=${c.intent_label || "—"} ${excerpt}`;
    })
    .join("\n\n");
  return runStructured<{
    modes: Array<{
      failure_type: string;
      severity: "critical" | "high" | "medium" | "low";
      fix_target: string;
      count: number;
      description?: string;
      recommended_fix: string;
    }>;
  }>({
    system:
      "Identify recurring failure patterns in low-performing calls. Return actionable clusters with severity and a single recommended fix each.",
    user: `Failed / low-intent calls:\n${payload}`,
    tool: FAILURE_MODES_TOOL,
    complexity: "medium",
    maxTokens: 1400,
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
      stats_yesterday: { type: "object" },
      week_delta: { type: "object" },
      generated_at: { type: "string" },
    },
    required: ["brief", "stats_yesterday", "week_delta"],
  },
} as const;

export async function composeDailyBrief(input: {
  yesterdayStats: Record<string, unknown>;
  weekDelta: Record<string, unknown>;
  recentWinSamples: unknown[];
  recentLossSamples: unknown[];
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
    stats_yesterday?: Record<string, unknown>;
    week_delta?: Record<string, unknown>;
    generated_at?: string;
  }>({
    system:
      "Write a concise operator daily brief. No fluff. Bullets should be scannable. Mood reflects yesterday vs the 7-day baseline.",
    user: JSON.stringify(input, null, 2),
    tool: DAILY_BRIEF_TOOL,
    complexity: "medium",
    maxTokens: 1600,
    cacheSystem: true,
  });

  return {
    ...result,
    stats_yesterday: result.stats_yesterday ?? input.yesterdayStats,
    week_delta: result.week_delta ?? input.weekDelta,
    generated_at: result.generated_at ?? new Date().toISOString(),
  };
}
