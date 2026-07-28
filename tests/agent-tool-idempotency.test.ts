import { describe, expect, it, vi } from "vitest";
import {
  isIdempotentAgentTool,
  runIdempotentAgentToolCall,
} from "../src/lib/agent-tool-idempotency";
import type { ToolCallContext } from "../src/routes/vapi/types";

function context(drizzle: unknown): ToolCallContext {
  return {
    toolCallId: "tool-1",
    payload: { call: { id: "call-1" } },
    message: {},
    agent: { id: "agent-1", user_id: "11111111-1111-1111-1111-111111111111" },
    webhookAgentId: "agent-1",
    drizzle,
    log: { warn: vi.fn() },
  };
}

function cachedTransaction(result: string) {
  const limit = vi.fn().mockResolvedValue([
    {
      id: 1n,
      metadata: { status: "completed", result },
    },
  ]);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const tx = { execute: vi.fn(), select };
  return {
    transaction: vi.fn((work: (value: typeof tx) => unknown) => work(tx)),
  };
}

describe("live agent tool idempotency", () => {
  it("classifies external writes while leaving reads unledgered", () => {
    expect(isIdempotentAgentTool("send_email")).toBe(true);
    expect(isIdempotentAgentTool("book_appointment")).toBe(true);
    expect(isIdempotentAgentTool("shopify_cancel_order")).toBe(true);
    expect(isIdempotentAgentTool("search_knowledge_base")).toBe(false);
    expect(isIdempotentAgentTool("check_calendar_availability")).toBe(false);
  });

  it("bypasses the ledger for read-only tools", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Found it." });
    const drizzle = { transaction: vi.fn() };

    await expect(
      runIdempotentAgentToolCall("search_knowledge_base", context(drizzle), execute),
    ).resolves.toEqual({ toolCallId: "tool-1", result: "Found it." });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(drizzle.transaction).not.toHaveBeenCalled();
  });

  it("returns the original completed result without repeating the side effect", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Duplicate send" });

    await expect(
      runIdempotentAgentToolCall("send_email", context(cachedTransaction("Email sent.")), execute),
    ).resolves.toEqual({ toolCallId: "tool-1", result: "Email sent." });
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails open to direct execution if the ledger is temporarily unavailable", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Email sent." });
    const drizzle = {
      transaction: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    await expect(runIdempotentAgentToolCall("send_email", context(drizzle), execute)).resolves.toEqual({
      toolCallId: "tool-1",
      result: "Email sent.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
