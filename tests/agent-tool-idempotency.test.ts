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
    log: { warn: vi.fn(), error: vi.fn() },
  };
}

function existingTransaction(metadata: Record<string, unknown>) {
  const limit = vi.fn().mockResolvedValue([{ id: 1n, metadata }]);
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
  it("classifies external writes and transfers while leaving reads and legal opt-outs unledgered", () => {
    expect(isIdempotentAgentTool("send_email")).toBe(true);
    expect(isIdempotentAgentTool("book_appointment")).toBe(true);
    expect(isIdempotentAgentTool("shopify_cancel_order")).toBe(true);
    expect(isIdempotentAgentTool("escalate_to_human")).toBe(true);
    expect(isIdempotentAgentTool("search_knowledge_base")).toBe(false);
    expect(isIdempotentAgentTool("check_calendar_availability")).toBe(false);
    expect(isIdempotentAgentTool("add_to_dnc")).toBe(false);
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

  it("keeps DNC opt-outs independent of the auxiliary audit ledger", async () => {
    const execute = vi.fn().mockResolvedValue({
      toolCallId: "tool-1",
      result: "+14155551234 is now on the Do Not Call list.",
    });
    const drizzle = { transaction: vi.fn().mockRejectedValue(new Error("audit unavailable")) };

    await expect(runIdempotentAgentToolCall("add_to_dnc", context(drizzle), execute)).resolves.toEqual({
      toolCallId: "tool-1",
      result: "+14155551234 is now on the Do Not Call list.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(drizzle.transaction).not.toHaveBeenCalled();
  });

  it("returns the original completed result without repeating the side effect", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Duplicate send" });

    await expect(
      runIdempotentAgentToolCall(
        "send_email",
        context(existingTransaction({ status: "completed", result: "Email sent." })),
        execute,
      ),
    ).resolves.toEqual({ toolCallId: "tool-1", result: "Email sent." });
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves a cached transfer destination without resending the alert", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Duplicate transfer" });
    const output = {
      toolCallId: "tool-1",
      result: "Transferring you now — please hold.",
      destination: {
        type: "number" as const,
        number: "+14155551234",
        message: "Please hold while I connect you.",
      },
    };

    await expect(
      runIdempotentAgentToolCall(
        "escalate_to_human",
        context(existingTransaction({ status: "completed", output })),
        execute,
      ),
    ).resolves.toEqual(output);
    expect(execute).not.toHaveBeenCalled();
  });

  it("never re-executes an already-started tool-call id", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Duplicate send" });

    const result = await runIdempotentAgentToolCall(
      "send_email",
      context(
        existingTransaction({
          status: "processing",
          startedAt: "2020-01-01T00:00:00.000Z",
        }),
      ),
      execute,
    );

    expect(result.result).toContain("already started");
    expect(result.result).toContain("Do not run it again");
    expect(execute).not.toHaveBeenCalled();
  });

  it("caches failed tool-call ids instead of silently retrying a side effect", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Duplicate send" });

    const result = await runIdempotentAgentToolCall(
      "send_email",
      context(
        existingTransaction({
          status: "failed",
          result: "The email was not sent. Reconfirm the address before trying again.",
        }),
      ),
      execute,
    );

    expect(result.result).toBe("The email was not sent. Reconfirm the address before trying again.");
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed if the ledger cannot safely claim an external write", async () => {
    const execute = vi.fn().mockResolvedValue({ toolCallId: "tool-1", result: "Email sent." });
    const drizzle = {
      transaction: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    const result = await runIdempotentAgentToolCall("send_email", context(drizzle), execute);
    expect(result.toolCallId).toBe("tool-1");
    expect(result.result).toContain("did not run it again");
    expect(execute).not.toHaveBeenCalled();
  });
});
