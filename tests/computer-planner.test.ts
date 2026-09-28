import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/mcp-agent-coaching", () => ({ getAgentCoachingBrief: vi.fn() }));
vi.mock("../src/lib/channel-entitlements", () => ({ getTenantChannelEntitlements: vi.fn() }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertPrivateTextSimulationAllowed: vi.fn(),
}));
vi.mock("../src/lib/managed-ai-operation-spend", () => ({ runWithManagedAiSpend: vi.fn() }));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("../src/lib/deployment-environment", () => ({ isProductionDeployment: () => false }));
import {
  assertComputerScreenshot,
  computerImageReserveTokens,
  planComputerStep,
} from "../src/lib/computer-planner";
import { parseComputerStepInput } from "../src/lib/computer-protocol";
import { AppError } from "../src/lib/api-error";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
function input() {
  return {
    agent_id: "agent-1",
    task_id: "task-1",
    goal: "Read this window",
    step: 0,
    observation: {
      id: "view-1",
      source: { kind: "window" as const, label: "Editor", platform: "windows" as const },
      screenshot: { mimeType: "image/png" as const, data: png, width: 1, height: 1 },
    },
    history: [],
    tools: [],
  };
}
const complete = { decision: "needs_input", summary: "Please enlarge the window", action: null };
let events: string[];
let deps: Parameters<typeof planComputerStep>[2];
beforeEach(() => {
  events = [];
  deps = {
    context: vi.fn(async (userId, agentId) => {
      events.push("owner");
      expect([userId, agentId]).toEqual(["owner-1", "agent-1"]);
      return {
        agent_id: agentId,
        agent_name: "Front Desk",
        role: "Receptionist",
        channel: "voice",
        on_phone_network: true,
        training_fact_count: 0,
        operating_rule_count: 0,
        training_facts: [],
        operating_rules: [],
        next_step: "",
      };
    }),
    entitlements: vi.fn(async () => ({
      planId: "voice",
      subscriptionStatus: "active",
      channels: ["voice"],
      isOwner: false,
    })),
    environment: vi.fn(async () => {}),
    rateLimit: vi.fn(async () => ({ allowed: true, remaining: 19, resetMs: 60000 })),
    attemptModels: vi.fn(() => ["gpt-5.6-terra", "google/gemini-3.6-flash"]),
    spend: vi.fn(async (value) => {
      events.push("reserve");
      return value.operation();
    }),
    structured: vi.fn(async () => {
      events.push("provider");
      return complete;
    }),
  };
});

describe("metered owner computer planner", () => {
  it("reserves before inference, sends an actual image and omits private pixels from audit metadata/text", async () => {
    await expect(planComputerStep("owner-1", input(), deps)).resolves.toEqual(complete);
    expect(events).toEqual(["owner", "reserve", "provider"]);
    const options = vi.mocked(deps!.structured).mock.calls[0][0];
    expect(options.images).toEqual([
      { type: "image", mimeType: "image/png", data: png, detail: "high" },
    ]);
    expect(options.user).not.toContain(png);
    expect(JSON.parse(options.user).untrusted_observation.source.platform).toBe("windows");
    expect(options.system).toContain("If platform is absent");
    expect(options.system).toContain("cannot execute anything");
    const reservation = vi.mocked(deps!.spend).mock.calls[0][0];
    expect(reservation.reserveUsd).toBeGreaterThan(0.02);
    expect(JSON.stringify(reservation.requestMeta)).not.toContain(png);
    expect(JSON.stringify(reservation.requestMeta)).not.toContain("Read this window");
  });
  it("refuses another tenant's Bot before paid inference", async () => {
    vi.mocked(deps!.context).mockRejectedValue(new Error("Bot not found"));
    await expect(planComputerStep("owner-1", input(), deps)).rejects.toThrow("Bot not found");
    expect(deps!.spend).not.toHaveBeenCalled();
    expect(deps!.structured).not.toHaveBeenCalled();
  });
  it("does not fund planning from an inactive/free account or a refused allowance", async () => {
    vi.mocked(deps!.entitlements).mockResolvedValue({
      planId: null,
      subscriptionStatus: "pending_activation",
      channels: [],
      isOwner: false,
    });
    await expect(planComputerStep("owner-1", input(), deps)).rejects.toMatchObject({
      code: "COMPUTER_PLAN_REQUIRED",
    });
    expect(deps!.structured).not.toHaveBeenCalled();
    vi.mocked(deps!.entitlements).mockResolvedValue({
      planId: "voice",
      subscriptionStatus: "active",
      channels: ["voice"],
      isOwner: false,
    });
    vi.mocked(deps!.spend).mockRejectedValue(
      new AppError(402, "SPEND_CAP_REACHED", "Allowance used", {
        recovery_path: "/settings/billing",
      }),
    );
    await expect(planComputerStep("owner-1", input(), deps)).rejects.toThrow("Allowance used");
    expect(deps!.structured).not.toHaveBeenCalled();
  });
  it("redacts provider errors only after the spend lifecycle sees the original failure", async () => {
    const privateText = `PRIVATE_TOOL_ARGUMENT ${png}`;
    const providerError = new Error(privateText);
    vi.mocked(deps!.structured).mockRejectedValue(providerError);
    vi.mocked(deps!.spend).mockImplementation(async (value) => {
      try {
        return await value.operation();
      } catch (error) {
        expect(error).toBe(providerError);
        events.push("spend settled");
        throw error;
      }
    });
    const result = await planComputerStep("owner-1", input(), deps).catch((error) => error);
    expect(events).toContain("spend settled");
    expect(result).toMatchObject({ status: 502, code: "COMPUTER_PLANNER_UNAVAILABLE" });
    expect(result.message).toContain("No computer action was performed");
    expect(JSON.stringify(result)).not.toContain(png);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOOL_ARGUMENT");
    expect(result.message).not.toContain(privateText);
  });
  it("fails rate limits before reservation and validates the returned proposal", async () => {
    vi.mocked(deps!.rateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetMs: 1000 });
    await expect(planComputerStep("owner-1", input(), deps)).rejects.toMatchObject({
      code: "COMPUTER_PLAN_RATE_LIMIT",
    });
    expect(deps!.spend).not.toHaveBeenCalled();
    vi.mocked(deps!.rateLimit).mockResolvedValue({ allowed: true, remaining: 1, resetMs: 1000 });
    vi.mocked(deps!.structured).mockResolvedValue({
      decision: "action",
      summary: "Run",
      action: { type: "shell", command: "whoami" },
    });
    await expect(planComputerStep("owner-1", input(), deps)).rejects.toThrow(
      "No computer action was performed",
    );
    expect(deps!.spend).toHaveBeenCalledOnce();
  });
  it("rejects false PNG dimensions and incomplete/multiple-frame content before inference", async () => {
    const wrong = input();
    wrong.observation.screenshot.width = 100;
    await expect(planComputerStep("owner-1", wrong, deps)).rejects.toThrow("valid PNG");
    expect(deps!.context).not.toHaveBeenCalled();
    const truncated = input();
    truncated.observation.screenshot.data = Buffer.from(png, "base64")
      .subarray(0, 40)
      .toString("base64");
    expect(() => assertComputerScreenshot(parseComputerStepInput(truncated))).toThrow("valid PNG");
    const extra = input();
    extra.observation.screenshot.data = Buffer.concat([
      Buffer.from(png, "base64"),
      Buffer.from("extra"),
    ]).toString("base64");
    expect(() => assertComputerScreenshot(parseComputerStepInput(extra))).toThrow("valid PNG");
  });
  it("bounds every configured image fallback and refuses unknown model image prices", () => {
    expect(computerImageReserveTokens(["gpt-5.6-terra", "google/gemini-3.6-flash"], true)).toBe(
      3000,
    );
    expect(() => computerImageReserveTokens(["unknown-model"], true)).toThrow(
      "configured AI models",
    );
    expect(computerImageReserveTokens(["unknown-model"], false)).toBe(0);
  });
});
