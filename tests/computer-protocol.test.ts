import { describe, expect, it } from "vitest";
import {
  parseComputerStepInput,
  parseComputerStepProposal,
  COMPUTER_LIMITS,
} from "../src/lib/computer-protocol";
import { requestedMcpScopes } from "../src/lib/chatgpt-mcp";
import { validateNativeAction } from "../apps/desktop/src/native";
import {
  isBotBoundDesktopRedirect,
  desktopTokenAccountMetadata,
  desktopPlanningScopesAllowed,
  clientDisplayName,
  connectedAppLabel,
} from "../src/lib/mcp-client-registry";

const input = () => ({
  agent_id: "agent-1",
  task_id: "task-1",
  goal: "Find the supplier address",
  step: 0,
  observation: { id: "view-1", source: { kind: "mcp", label: "Approved contacts" }, text: "Ready" },
  history: [],
  tools: [
    {
      serverId: "contacts",
      name: "find",
      description: "Find a contact",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
  ],
});

function windowInput(platform?: "windows" | "macos") {
  return parseComputerStepInput({
    ...input(),
    observation: {
      id: "view-1",
      source: { kind: "window", label: "Editor", ...(platform ? { platform } : {}) },
      screenshot: { mimeType: "image/png", data: "aGVsbG8=", width: 10, height: 10 },
    },
  });
}
function proposal(action: unknown) {
  return { decision: "action", summary: "Perform the reviewed step", action };
}

describe("shared computer action semantics", () => {
  it.each([
    ["zero scroll", { type: "scroll", x: 1, y: 1, deltaX: 0, deltaY: 0 }, "windows"],
    ["unsupported key", { type: "keypress", keys: ["F1"] }, "windows"],
    ["duplicated alias", { type: "keypress", keys: ["Control", "CTRL", "A"] }, "windows"],
    ["modifier only", { type: "keypress", keys: ["CTRL"] }, "windows"],
    ["misordered modifier", { type: "keypress", keys: ["A", "CTRL"] }, "windows"],
    ["multiple ordinary keys", { type: "keypress", keys: ["A", "B"] }, "windows"],
    ["launcher", { type: "keypress", keys: ["WIN", "R"] }, "windows"],
    ["system shortcut", { type: "keypress", keys: ["Control", "Escape"] }, "windows"],
    ["Mac command on Windows", { type: "keypress", keys: ["Meta", "C"] }, "windows"],
    ["Mac command without OS", { type: "keypress", keys: ["COMMAND", "C"] }, undefined],
    ["Mac quit", { type: "keypress", keys: ["CMD", "Q"] }, "macos"],
    ["Mac desktop switch", { type: "keypress", keys: ["Control", "ArrowLeft"] }, "macos"],
    [
      "OS-dependent shortcut without OS",
      { type: "keypress", keys: ["Control", "ArrowLeft"] },
      undefined,
    ],
    ["embedded tab", { type: "type_text", text: "Name\tSubmit" }, "windows"],
    ["embedded null", { type: "type_text", text: "Name\0Submit" }, "macos"],
    ["C1 control", { type: "type_text", text: "Name\u0085Submit" }, "windows"],
    ["Mac leading newline", { type: "type_text", text: "\nNext line" }, "macos"],
    ["Mac chunk newline", { type: "type_text", text: "a".repeat(20) + "\nNext line" }, "macos"],
    [
      "Mac UTF16 chunk newline",
      { type: "type_text", text: "😀".repeat(10) + "\nNext line" },
      "macos",
    ],
    ["executable URL", { type: "type_text", text: "javascript:alert(1)" }, "macos"],
  ] as const)(
    "rejects %s before presenting an unexecutable proposal",
    (_name, action, platform) => {
      const value = windowInput(platform);
      expect(() => parseComputerStepProposal(proposal(action), value)).toThrow();
      expect(() =>
        validateNativeAction(
          action,
          value.observation.screenshot,
          platform === "windows" ? "win32" : platform === "macos" ? "darwin" : undefined,
        ),
      ).toThrow();
    },
  );
  it.each([
    [
      "windows",
      { type: "type_text", text: "\nNext line" },
      { type: "type_text", text: "\nNext line" },
    ],
    [
      "macos",
      { type: "type_text", text: "a".repeat(19) + "😀\nNext line" },
      { type: "type_text", text: "a".repeat(19) + "😀\nNext line" },
    ],
    [undefined, { type: "keypress", keys: ["Enter"] }, { type: "keypress", keys: ["ENTER"] }],
    [
      "windows",
      { type: "keypress", keys: ["Control", "ArrowLeft"] },
      { type: "keypress", keys: ["CTRL", "LEFT"] },
    ],
    [
      "macos",
      { type: "keypress", keys: ["Meta", "c"] },
      { type: "keypress", keys: ["COMMAND", "C"] },
    ],
    [
      "windows",
      { type: "scroll", x: 1, y: 1, deltaX: 0, deltaY: 100 },
      { type: "scroll", x: 1, y: 1, deltaX: 0, deltaY: 100 },
    ],
    [
      "macos",
      { type: "type_text", text: "Reviewed note\nSecond line 😀" },
      { type: "type_text", text: "Reviewed note\nSecond line 😀" },
    ],
  ] as const)(
    "returns the same canonical action for %s planning and execution",
    (platform, action, expected) => {
      const value = windowInput(platform);
      const parsed = parseComputerStepProposal(proposal(action), value);
      expect(parsed.action).toEqual(expected);
      expect(
        validateNativeAction(
          parsed.action,
          value.observation.screenshot,
          platform === "windows" ? "win32" : platform === "macos" ? "darwin" : undefined,
        ),
      ).toEqual(expected);
    },
  );
});

describe("owner computer proposal boundary", () => {
  it("accepts keyword-named arguments and literal metadata through the shared schema boundary", () => {
    const data = input();
    const inputSchema = {
      type: "object",
      properties: { pattern: { type: "string" }, $ref: { type: "string" } },
      default: { pattern: "literal", $ref: "https://example.test/not-a-schema" },
      required: ["pattern", "$ref"],
    };
    const parsed = parseComputerStepInput({ ...data, tools: [{ ...data.tools[0], inputSchema }] });
    expect(parsed.tools[0].inputSchema).toEqual(inputSchema);
    expect(
      parseComputerStepProposal(
        proposal({
          type: "mcp_call",
          serverId: "contacts",
          name: "find",
          arguments: inputSchema.default,
        }),
        parsed,
      ).action,
    ).toMatchObject({ arguments: inputSchema.default });
  });
  it.each([
    { properties: { query: { pattern: "(a+)+$" } } },
    { default: { pattern: "(a+)+$" }, properties: { query: { $ref: "#/default" } } },
    { default: { $ref: "https://remote.test/schema" }, $ref: "#/default" },
  ])("refuses unsafe active schemas before sending tool metadata to the planner %j", (schema) => {
    const data = input();
    expect(() =>
      parseComputerStepInput({
        ...data,
        tools: [{ ...data.tools[0], inputSchema: { type: "object", ...schema } }],
      }),
    ).toThrow(/regular-expression|remote references/);
  });
  it("accepts a selected tool proposal without granting execution authority", () => {
    const value = parseComputerStepInput(input());
    const action = {
      type: "mcp_call",
      serverId: "contacts",
      name: "find",
      arguments: { query: "supplier" },
    };
    expect(
      parseComputerStepProposal(
        { decision: "action", summary: "Look up the supplier", action },
        value,
      ).action,
    ).toEqual(action);
    expect(() =>
      parseComputerStepProposal(
        { decision: "action", summary: "Run", action: { ...action, confirmed: true } },
        value,
      ),
    ).toThrow();
    expect(() =>
      parseComputerStepProposal(
        { decision: "action", summary: "Run", action: { ...action, serverId: "other" } },
        value,
      ),
    ).toThrow(/not shared/);
  });
  it("rejects native action without screenshot and positions outside observed pixels", () => {
    const value = parseComputerStepInput(input());
    const action = { type: "click", x: 10, y: 10, button: "left", clickCount: 1 };
    expect(() =>
      parseComputerStepProposal({ decision: "action", summary: "Click", action }, value),
    ).toThrow(/screenshot/);
    const window = parseComputerStepInput({
      ...input(),
      observation: {
        id: "view-1",
        source: { kind: "window", label: "Editor" },
        screenshot: { mimeType: "image/png", data: "aGVsbG8=", width: 10, height: 10 },
      },
    });
    expect(() =>
      parseComputerStepProposal({ decision: "action", summary: "Click", action }, window),
    ).toThrow(/outside/);
    expect(() =>
      parseComputerStepProposal({ decision: "complete", summary: "Done", action }, window),
    ).toThrow();
  });
  it("rejects executable variants, changed scope, excessive steps and external schema refs", () => {
    expect(() => parseComputerStepInput({ ...input(), step: COMPUTER_LIMITS.steps })).toThrow();
    expect(() => parseComputerStepInput({ ...input(), user_id: "another-owner" })).toThrow();
    const tool = input().tools[0];
    expect(() =>
      parseComputerStepInput({
        ...input(),
        tools: [{ ...tool, inputSchema: { type: "object", $ref: "http://127.0.0.1/secret" } }],
      }),
    ).toThrow(/Remote/);
    expect(() => parseComputerStepInput({ ...input(), tools: [tool, tool] })).toThrow(/Duplicate/);
    expect(() =>
      parseComputerStepProposal(
        { decision: "action", summary: "Run", action: { type: "shell", command: "echo test" } },
        parseComputerStepInput(input()),
      ),
    ).toThrow();
  });
  it("keeps text proposals within the native execution limit", () => {
    const window = parseComputerStepInput({
      ...input(),
      observation: {
        id: "view-1",
        source: { kind: "window", label: "Editor" },
        screenshot: { mimeType: "image/png", data: "aGVsbG8=", width: 10, height: 10 },
      },
    });
    const proposal = (length: number) => ({
      decision: "action",
      summary: "Enter the reviewed text",
      action: { type: "type_text", text: "a".repeat(length) },
    });
    expect(() => parseComputerStepProposal(proposal(2000), window)).not.toThrow();
    expect(() => parseComputerStepProposal(proposal(2001), window)).toThrow();
  });
  it("accepts explicit native platform context while keeping tools-only input compatible", () => {
    expect(parseComputerStepInput(input()).observation.source.platform).toBeUndefined();
    const withPlatform = (platform: string) => ({
      ...input(),
      observation: {
        ...input().observation,
        source: { ...input().observation.source, platform },
      },
    });
    expect(parseComputerStepInput(withPlatform("windows")).observation.source.platform).toBe(
      "windows",
    );
    expect(parseComputerStepInput(withPlatform("macos")).observation.source.platform).toBe("macos");
    expect(() => parseComputerStepInput(withPlatform("linux"))).toThrow();
  });
  it("requires a new scope request and narrowly recognizes the public desktop callback", () => {
    expect(requestedMcpScopes(undefined)).toEqual(["agents.read", "agents.write", "demo.voice"]);
    expect(requestedMcpScopes("agents.read computer.plan computer.plan")).toEqual([
      "agents.read",
      "computer.plan",
    ]);
    expect(requestedMcpScopes("unknown")).toEqual([]);
    expect(isBotBoundDesktopRedirect("botbound-desktop", "http://127.0.0.1:49511/callback")).toBe(
      true,
    );
    for (const uri of [
      "http://localhost:49511/callback",
      "http://127.0.0.2:49511/callback",
      "http://127.0.0.1:49511/callback?next=evil",
      "http://127.0.0.1:80/callback",
      "https://127.0.0.1:49511/callback",
      "http://127.0.0.1:49511/other",
    ])
      expect(isBotBoundDesktopRedirect("botbound-desktop", uri)).toBe(false);
    expect(isBotBoundDesktopRedirect("unknown", "http://127.0.0.1:49511/callback")).toBe(false);
    expect(clientDisplayName("http://127.0.0.1:49511/callback", "botbound-desktop")).toBe(
      "BotBound Desktop",
    );
    expect(connectedAppLabel("botbound-desktop", null)).toBe("BotBound Desktop");
  });
  it("returns the authenticated account binding only for the desktop token audience", () => {
    expect(desktopPlanningScopesAllowed(["agents.read", "computer.plan"])).toBe(true);
    expect(desktopPlanningScopesAllowed(requestedMcpScopes(undefined))).toBe(false);
    expect(desktopPlanningScopesAllowed(["agents.read", "computer.plan", "agents.write"])).toBe(
      false,
    );
    expect(desktopTokenAccountMetadata("botbound-desktop", "owner-1")).toEqual({
      botbound_account_id: "owner-1",
    });
    expect(desktopTokenAccountMetadata("other-client", "owner-1")).toEqual({});
  });
});
