import { describe, expect, it } from "vitest";

/** Mirrors SmsThreads ConversationMessage author/label mapping. */
export function smsMessagePresentation(direction: "in" | "out", agentId: string | null = null) {
  return {
    author: direction === "out" ? ("assistant" as const) : ("customer" as const),
    label: direction === "out" ? (agentId ? "Bot" : "You") : "Customer",
  };
}

describe("SmsThreads direction → author mapping", () => {
  it("maps account-holder outbound texts to an honestly labeled assistant-side bubble", () => {
    expect(smsMessagePresentation("out")).toEqual({
      author: "assistant",
      label: "You",
    });
  });

  it("labels Bot-authored outbound texts as Bot", () => {
    expect(smsMessagePresentation("out", "agent-1")).toEqual({
      author: "assistant",
      label: "Bot",
    });
  });

  it("maps inbound texts to the customer bubble", () => {
    expect(smsMessagePresentation("in")).toEqual({
      author: "customer",
      label: "Customer",
    });
  });

  it("matches the SmsThreads source contract", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/components/SmsThreads.tsx"), "utf8");
    expect(source).toContain('author={message.direction === "out" ? "assistant" : "customer"}');
    const labelStart = source.indexOf("label={");
    const channelStart = source.indexOf('channel="text"', labelStart);
    const labelBlock = source.slice(labelStart, channelStart);
    expect(labelStart).toBeGreaterThan(-1);
    expect(channelStart).toBeGreaterThan(labelStart);
    expect(labelBlock).toContain('message.direction === "out"');
    expect(labelBlock).toContain("message.agent_id");
    expect(labelBlock).toContain('? "Bot"');
    expect(labelBlock).toContain(': "You"');
    expect(labelBlock).toContain(': "Customer"');
    expect(source).toContain("{activeThread.customer_number}");
    expect(source).toContain('channel="text"');
    expect(source).toContain('direction: "in" | "out"');
  });
});
