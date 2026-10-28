/* eslint-disable @typescript-eslint/no-explicit-any -- provider tool envelopes are dynamic JSON. */

export type ToolCallResult = {
  toolCallId: string;
  result: string;
  destination?: {
    type: "number";
    number: string;
    message?: string;
  };
};

export type ToolCallContext = {
  toolCallId: string;
  payload: Record<string, unknown>;
  message: Record<string, any>;
  agent: { id: string; user_id: string };
  webhookAgentId: string;
  userId?: string;
  agentId?: string;
  agentVoiceName?: string;
  /** Cancels new live-call side effects when the durable call lease is lost. */
  abortSignal?: AbortSignal;
  drizzle: any;
  log: any;
};
