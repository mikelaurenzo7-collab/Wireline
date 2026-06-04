import { describe, it, expect } from "vitest";
import { DIRECTOR_INTEGRATION_TOOLS } from "./director-integration-tools";
import { AGENT_TOOL_CATALOG } from "./agent-capabilities";

describe("DIRECTOR_INTEGRATION_TOOLS", () => {
  it("includes every OAuth integration tool except comms", () => {
    const oauthTools = AGENT_TOOL_CATALOG.filter(
      (t) => t.integration && t.integration !== "twilio",
    ).map((t) => t.name);
    for (const name of oauthTools) {
      expect(DIRECTOR_INTEGRATION_TOOLS).toContain(name);
    }
  });

  it("includes gemini_ground for Director web research jobs", () => {
    expect(DIRECTOR_INTEGRATION_TOOLS).toContain("gemini_ground");
  });

  it("excludes SMS tools", () => {
    expect(DIRECTOR_INTEGRATION_TOOLS).not.toContain("send_text_message");
  });
});
