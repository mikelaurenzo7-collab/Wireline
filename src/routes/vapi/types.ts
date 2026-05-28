/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */

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
  agent: {
    id: string;
    user_id: string;
  };
  webhookAgentId: string;
  agentVoiceName?: string;
  drizzle: any;
  log: any;
};
