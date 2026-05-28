import { describe, expect, it, vi, beforeEach } from "vitest";

// Behavioural guard for reasoning-layer prompt caching (AUDIT_WINS.md §2).
//
// claude-recipes.cache.test.ts proves each recipe *passes* cacheSystem:true.
// This file proves the layer underneath honours it: that runStructured() and
// runCompletion() actually translate cacheSystem:true into a single
// cache_control:ephemeral block on the `system` content sent to the Anthropic
// SDK — and send a bare string (no cache write) when it's off.
//
// Without this, a refactor of the helper could silently stop emitting
// cache_control while every call site still reads "cacheSystem: true" and the
// source-grep test stays green — quietly reverting the reasoning layer to
// full per-call input billing.

// Capture the body handed to the Anthropic SDK. vi.hoisted keeps the mock
// reachable inside the (hoisted) vi.mock factory below.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("./claude-client", () => ({
  getClient: () => ({ messages: { create: createMock } }),
  isClaudeAvailable: () => true,
  ClaudeUnavailableError: class ClaudeUnavailableError extends Error {},
}));

import { runStructured, runCompletion, type ToolSchema } from "./claude-structured";

const TOOL: ToolSchema = {
  name: "probe",
  description: "test probe",
  input_schema: { type: "object", properties: {} },
};

const EPHEMERAL = [{ type: "text", text: "STABLE FRAME", cache_control: { type: "ephemeral" } }];

function structuredReply() {
  return {
    content: [{ type: "tool_use", name: "probe", input: { ok: true } }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

function textReply(cacheRead = 0, cacheCreate = 0) {
  return {
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheCreate,
    },
  };
}

/** The `system` field of the single recorded messages.create() call. */
function recordedSystem(): unknown {
  expect(createMock).toHaveBeenCalledTimes(1);
  return createMock.mock.calls[0][0].system;
}

beforeEach(() => {
  createMock.mockReset();
});

describe("runStructured prompt caching", () => {
  it("wraps system in one cache_control:ephemeral block when cacheSystem:true", async () => {
    createMock.mockResolvedValue(structuredReply());
    await runStructured({ system: "STABLE FRAME", user: "u", tool: TOOL, cacheSystem: true });
    expect(recordedSystem()).toEqual(EPHEMERAL);
  });

  it("sends system as a bare string when cacheSystem is unset (no cache write)", async () => {
    createMock.mockResolvedValue(structuredReply());
    await runStructured({ system: "STABLE FRAME", user: "u", tool: TOOL });
    expect(recordedSystem()).toBe("STABLE FRAME");
  });
});

describe("runCompletion prompt caching", () => {
  it("wraps system in one cache_control:ephemeral block when cacheSystem:true", async () => {
    createMock.mockResolvedValue(textReply());
    await runCompletion({ system: "STABLE FRAME", user: "u", cacheSystem: true });
    expect(recordedSystem()).toEqual(EPHEMERAL);
  });

  it("surfaces cache read/create counters from usage so hits are observable", async () => {
    createMock.mockResolvedValue(textReply(4096, 0));
    const res = await runCompletion({ system: "STABLE FRAME", user: "u", cacheSystem: true });
    expect(res.cacheRead).toBe(4096);
    expect(res.cacheCreate).toBe(0);
    expect(res.text).toBe("ok");
  });
});
