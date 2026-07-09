import { describe, expect, it } from "vitest";

/** Mirrors SmsThreads ConversationMessage author/label mapping. */
export function smsMessagePresentation(direction: "in" | "out") {
  return {
    author: direction === "out" ? ("assistant" as const) : ("customer" as const),
    label: direction === "out" ? "You" : "Customer",
  };
}

describe("SmsThreads direction → author mapping", () => {
  it("maps outbound texts to the assistant bubble", () => {
    expect(smsMessagePresentation("out")).toEqual({
      author: "assistant",
      label: "You",
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
    expect(source).toContain('label={message.direction === "out" ? "You" : "Customer"}');
    expect(source).toContain('direction: "in" | "out"');
  });
});
