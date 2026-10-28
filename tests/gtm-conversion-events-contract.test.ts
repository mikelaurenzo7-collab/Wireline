import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("GTM conversion events contract", () => {
  it("maps product events to GTM aliases", () => {
    const client = read("src/lib/product-event-client.ts");
    expect(client).toContain('agent_created: "agent-created"');
    expect(client).toContain('first_call_completed: "first-call-made"');
    expect(client).toContain('upgrade_to_paid: "upgrade-to-paid"');
  });

  it("pushes wireline metadata to dataLayer", () => {
    const client = read("src/lib/product-event-client.ts");
    expect(client).toContain("wireline_event");
    expect(client).toContain("dataLayer");
  });

  it("documents referral loop spec for post-horizon-0", () => {
    const spec = read("docs/REFERRAL_LOOP_SPEC_2026-07-07.md");
    expect(spec).toContain("Conversation Balance");
  });

  it("does not render industry script excerpts on vertical landing pages", () => {
    const landing = read("src/pages/VerticalLanding.tsx");
    expect(landing).not.toContain("scriptPreview");
    expect(landing).toContain("Create a Bot. Add another whenever you want one.");
  });
});
