import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVapiServerConfig } from "../src/lib/vapi-server-config";
import { toVapiFunctionTools, vapiToolRequestStartMessage } from "../src/lib/vapi-tool-format";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("current Vapi assistant payload contract", () => {
  it("wraps tenant functions in Vapi's model.tools DTO", () => {
    expect(
      toVapiFunctionTools([
        {
          name: "book_appointment",
          description: "Book a time.",
          parameters: {
            type: "object",
            properties: { start: { type: "string" } },
            required: ["start"],
          },
        },
      ]),
    ).toEqual([
      {
        type: "function",
        function: {
          name: "book_appointment",
          description: "Book a time.",
          parameters: {
            type: "object",
            properties: { start: { type: "string" } },
            required: ["start"],
          },
        },
        messages: [{ type: "request-start", content: "Let me book that." }],
      },
    ]);
    expect(toVapiFunctionTools([{ description: "missing name" }])).toEqual([]);
  });

  it("acknowledges slow live tools without claiming success", () => {
    expect(vapiToolRequestStartMessage("send_email")).toBe("Let me prepare that email.");
    expect(vapiToolRequestStartMessage("shopify_lookup_order")).toBe(
      "Let me take care of that.",
    );
    expect(vapiToolRequestStartMessage("create_followup_task")).toBeUndefined();
  });

  it("prefers a Vapi Custom Credential and retains the supported migration fallback", () => {
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

  it("uses current nested tools and server objects across every live assistant path", () => {
    const outbound = read("src/lib/vapi-client.ts");
    const inbound = read("src/lib/vapi-assistant-factory-v2.ts");
    const showcase = read("src/lib/showcase-assistant.ts");
    const patcher = read("scripts/patch-vapi-prod-webhooks.mjs");

    for (const source of [outbound, inbound]) {
      expect(source).toContain("toVapiFunctionTools");
      expect(source).toMatch(/model:\s*\{[\s\S]*?tools:/);
      expect(source).not.toMatch(/^\s+functions:/m);
    }
    for (const source of [outbound, inbound, showcase]) {
      expect(source).toContain("server:");
    }
    expect(outbound).not.toContain("serverUrlSecret");
    expect(showcase).not.toContain("serverUrlSecret");
    expect(patcher).not.toContain("serverUrl:");
    expect(patcher).not.toContain("serverUrlSecret");
  });
});
