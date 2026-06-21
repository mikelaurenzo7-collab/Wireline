import type { StructuredToolSchema } from "./ai-structured";

export const AI_TOOLS = {
  trainingExtraction: {
    name: "extract_training_data",
    description: "Extract operational directives, knowledge facts, and personality updates from operator input.",
    input_schema: {
      type: "object",
      properties: {
        directives: { type: "array", items: { type: "object", properties: { content: { type: "string" }, priority: { type: "integer", minimum: 1, maximum: 10 } }, required: ["content", "priority"], additionalProperties: false } },
        knowledge: { type: "array", items: { type: "object", properties: { content: { type: "string" } }, required: ["content"], additionalProperties: false } },
        personality: { type: "string" },
      },
      required: ["directives", "knowledge", "personality"],
      additionalProperties: false,
    },
  } as StructuredToolSchema,
  qaScore: {
    name: "score_call_quality",
    description: "Score a call against greeting, discovery, solution, objection handling, and closing. Return concise coaching.",
    input_schema: {
      type: "object",
      properties: {
        greeting: { type: "integer", minimum: 0, maximum: 20 }, discovery: { type: "integer", minimum: 0, maximum: 20 }, solution: { type: "integer", minimum: 0, maximum: 20 }, objection: { type: "integer", minimum: 0, maximum: 20 }, closing: { type: "integer", minimum: 0, maximum: 20 }, coaching_note: { type: "string" },
      },
      required: ["greeting", "discovery", "solution", "objection", "closing", "coaching_note"],
      additionalProperties: false,
    },
  } as StructuredToolSchema,
  workspaceTurn: {
    name: "plan_agent_workspace_turn",
    description: "Reply to an operator and propose agent configuration changes, tool toggles, and actions.",
    input_schema: {
      type: "object",
      properties: { reply: { type: "string" }, config_changes: { type: "array", items: { type: "object" } }, tool_toggles: { type: "array", items: { type: "object" } }, actions: { type: "array", items: { type: "object" } } },
      required: ["reply", "config_changes", "tool_toggles", "actions"], additionalProperties: false,
    },
  } as StructuredToolSchema,
} as const;
