import { describe, expect, it } from "vitest";
import {
  extractEmailFromText,
  hashCallerNumber,
  parseDemoSourceFromQuery,
  resolveShowcaseAgentByNumber,
} from "./demo-funnel";

describe("demo-funnel", () => {
  it("hashes caller numbers consistently", () => {
    const a = hashCallerNumber("+15551234567");
    const b = hashCallerNumber("5551234567");
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("parses demo query attribution", () => {
    expect(parseDemoSourceFromQuery("?demo=maya")).toBe("landing:maya");
    expect(parseDemoSourceFromQuery("?utm_source=readme")).toBe("utm:readme");
  });

  it("resolves showcase agent by dialed number", () => {
    const name = resolveShowcaseAgentByNumber("(630) 642-5661");
    expect(name).toBeTruthy();
  });

  it("extracts email from recap text", () => {
    expect(extractEmailFromText("Reach me at ops@acme.com for follow-up")).toBe("ops@acme.com");
    expect(extractEmailFromText("no email here")).toBeNull();
  });
});
