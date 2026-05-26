/**
 * Claude Supervisor / Standalone Tool Schemas
 * ---------------------------------------------------------------------------
 * Tool schemas that are **not** part of the main `TOOLS` registry in
 * `claude-tools.ts`. They are passed directly to specific `runStructured`
 * call sites (e.g. client-communication review, intent scoring) rather
 * than being selected by recipe key.
 *
 * Extracted from claude-tools.ts to keep the registry focused on the
 * recipe-mapped tools.
 */

import type { ToolSchema } from "./claude-structured";

export const CLIENT_COMMUNICATION_SUPERVISOR_TOOL: ToolSchema = {
  name: "review_client_communication",
  description:
    "Review and, when needed, rewrite a client-bound email or text message before it is sent. Preserve accuracy, avoid fabricated commitments, and calibrate urgency.",
  input_schema: {
    type: "object",
    properties: {
      approved: {
        type: "boolean",
        description: "Whether the message is safe and appropriate to send now.",
      },
      subject: {
        type: "string",
        description: "Final subject line for emails. Use an empty string for SMS or WhatsApp.",
      },
      body: {
        type: "string",
        description: "Final plain-text body to send to the client.",
      },
      rationale: {
        type: "string",
        description: "Short explanation of what changed or why the send was blocked.",
      },
    },
    required: ["approved", "subject", "body", "rationale"],
    additionalProperties: false,
  },
};

export const SCORE_INTENT_TOOL: ToolSchema = {
  name: "score_intent",
  description: "Score business / buying intent.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100 },
      label: { type: "string", enum: ["high", "medium", "low", "none"] },
      reasoning: { type: "string" },
    },
    required: ["score", "label"],
    additionalProperties: false,
  },
};
