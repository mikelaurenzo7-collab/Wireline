import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVapiServerConfig } from "../src/lib/vapi-server-config";
import {
  toVapiFunctionTools,
  vapiToolExecutionGuidance,
  vapiToolMessages,
  vapiToolRequestStartMessage,
} from "../src/lib/vapi-tool-format";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("current Vapi assistant payload contract", () => {
  it("wraps tenant functions in Vapi's model.tools DTO", () => {
    const tools = toVapiFunctionTools([
      {
        name: "book_appointment",
        description: "Book a time.",
        parameters: {
          type: "object",
          properties: { start: { type: "string" } },
          required: ["start"],
        },
      },
    ]);

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      type: "function",
      function: {
        name: "book_appointment",
        parameters: {
          type: "object",
          properties: {
            start: { type: "string" },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            time: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
            timezone: { type: "string" },
          },
        },
      },
      messages: [
        { type: "request-start", content: "Let me book that." },
        {
          type: "request-response-delayed",
          content: "I'm still working on that.",
          timingMilliseconds: 2_500,
        },
        { type: "request-failed", content: "I couldn't complete that action just now." },
      ],
    });
    const required = (tools[0].function.parameters as { required: string[] }).required;
    expect(required).toEqual(expect.arrayContaining(["start", "date", "time", "timezone"]));
    expect(tools[0].function.description).toContain("Book a time.");
    expect(tools[0].function.description).toContain("check_calendar_availability");
    expect(tools[0].function.description).toContain("result explicitly confirms success");
    expect(toVapiFunctionTools([{ description: "missing name" }])).toEqual([]);
  });

  it("acknowledges slow live tools without claiming success", () => {
    expect(vapiToolRequestStartMessage("send_email")).toBe("Let me prepare that email.");
    expect(vapiToolRequestStartMessage("shopify_lookup_order")).toBe("Let me take care of that.");
    expect(vapiToolRequestStartMessage("create_followup_task")).toBeUndefined();
    expect(vapiToolMessages("send_email")).toHaveLength(3);
    expect(vapiToolMessages("create_followup_task")).toBeUndefined();
  });

  it("requires truthful confirmation and prerequisites around sensitive live actions", () => {
    expect(vapiToolExecutionGuidance("send_email")).toContain("Confirm the recipient address");
    expect(vapiToolExecutionGuidance("shopify_cancel_order")).toContain("Look up the order first");
    expect(vapiToolExecutionGuidance("shopify_cancel_order")).toContain(
      "never invent queueing or completion",
    );
    expect(vapiToolExecutionGuidance("add_to_dnc")).toContain("Execute immediately");
    expect(vapiToolExecutionGuidance("search_knowledge_base")).toBeUndefined();
  });

  it("pins the verbal SMS consent script quoted in the Twilio toll-free verification", () => {
    const sms = vapiToolExecutionGuidance("send_text_message");
    expect(sms).toContain(
      '"Want me to text that to you at this number? It will be one message with the info you asked for. Message and data rates may apply, and you can reply STOP at any time to opt out."',
    );
    expect(sms).toContain("only after the caller clearly agrees");
    expect(sms).toContain("do not ask again");
    expect(sms).toContain("never a condition of service");
  });

  it("prefers a Vapi Custom Credential and retains the supported rollback fallback", () => {
    expect(
      buildVapiServerConfig(
        "https://trywireline.com/api/vapi-webhook",
        { credentialId: " cred_live " },
        { VAPI_WEBHOOK_SECRET: "fallback" },
      ),
    ).toEqual({
      url: "https://trywireline.com/api/vapi-webhook",
      credentialId: "cred_live",
    });
    expect(
      buildVapiServerConfig(
        "https://trywireline.com/api/vapi-webhook",
        {},
        { VAPI_WEBHOOK_SECRET: "fallback" },
      ),
    ).toEqual({
      url: "https://trywireline.com/api/vapi-webhook",
      secret: "fallback",
    });
  });

  it("keeps Vapi DTOs on rollback paths and native phone sessions provider-native", () => {
    const facade = read("src/lib/vapi-client.ts");
    const rollbackInbound = read("src/lib/vapi-assistant-factory-v2.ts");
    const showcase = read("src/lib/showcase-assistant.ts");
    const patcher = read("scripts/patch-vapi-prod-webhooks.mjs");
    const nativeRuntime = read("src/lib/voice/xai-agent-runtime.ts");
    const nativeSession = read("src/lib/voice/xai-sip-session.ts");
    const nativeOutbound = read("src/lib/voice/outbound-call-service.ts");

    expect(rollbackInbound).toContain("toVapiFunctionTools");
    expect(rollbackInbound).toMatch(/model:\s*\{[\s\S]*?tools:/);
    expect(rollbackInbound).not.toMatch(/^\s+functions:/m);
    for (const source of [rollbackInbound, showcase]) expect(source).toContain("server:");
    expect(showcase).not.toContain("serverUrlSecret");
    expect(patcher).not.toContain("serverUrl:");
    expect(patcher).not.toContain("serverUrlSecret");

    expect(facade).toContain("Compatibility facade for legacy imports");
    expect(facade).toContain("placeNativeOutboundCall");
    expect(facade).not.toContain("toVapiFunctionTools");
    expect(nativeOutbound).not.toContain("toVapiFunctionTools");
    expect(nativeOutbound).not.toContain("api.vapi.ai");
    expect(nativeRuntime).toContain("tools,");
    expect(nativeRuntime).toContain('tool_choice: "auto"');
    expect(nativeSession).toContain('type: "session.update"');
    expect(nativeSession).toContain('type: "function_call_output"');
  });
});
