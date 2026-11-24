/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import { assertLiveExternalActionAllowed } from "../account-environment-policy";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

/**
 * Fresh public research for live calls. The tool keeps its stored name
 * (`gemini_ground`) so saved Bot selections still resolve; the answer comes
 * from whichever managed research provider `fresh-public-research` selects.
 */
export async function handleResearchToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  if (fn !== "gemini_ground") return null;

  const { agent, toolCallId } = context;
  try {
    const { query } = args || {};
    if (!query || typeof query !== "string") {
      return {
        toolCallId,
        result: "Could you tell me what you'd like me to look up?",
      };
    }

    const userId = agent?.user_id;
    if (!userId) throw new Error("Tenant identity is unavailable");
    await assertLiveExternalActionAllowed(userId, "vapi_live_public_research");

    const { freshPublicResearch } = await import("../fresh-public-research");
    const grounded = await freshPublicResearch(query);
    const sourceTail =
      grounded.sources.length > 0
        ? ` (sources: ${grounded.sources
            .slice(0, 3)
            .map((s) => s.title || s.uri || "")
            .filter(Boolean)
            .join("; ")})`
        : "";
    return {
      toolCallId,
      result: grounded.answer + sourceTail,
    };
  } catch {
    return {
      toolCallId,
      result: "I wasn't able to look that up right now. Let me help you another way.",
    };
  }
}
