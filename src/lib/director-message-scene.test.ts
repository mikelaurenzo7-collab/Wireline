import { describe, expect, it } from "vitest";
import { detectDirectorMessageScene } from "./director-message-scene";

describe("detectDirectorMessageScene", () => {
  it("prefers creative when previews exist", () => {
    expect(
      detectDirectorMessageScene("Deploy agents", [{ type: "logo" }], {
        actions: [{}],
      }),
    ).toBe("creative");
  });

  it("prefers integration when integration jobs exist", () => {
    expect(
      detectDirectorMessageScene("Sync Shopify orders", undefined, {
        integrationJobs: [{ id: "job-1" }],
      }),
    ).toBe("integration");
  });

  it("prefers document over comms when content has multiple sections", () => {
    const content = `## Executive summary
Plan overview

## Go-to-market
SMS follow-up on day 3`;

    expect(
      detectDirectorMessageScene(content, undefined, {
        actions: [{ type: "sms" }],
      }),
    ).toBe("document");
  });

  it("uses comms when actions exist without a multi-section document", () => {
    expect(
      detectDirectorMessageScene("I'll text them now.", undefined, {
        actions: [{ type: "sms" }],
      }),
    ).toBe("comms");
  });

  it("detects document from keyword patterns when headings are sparse", () => {
    expect(detectDirectorMessageScene("Here is your business plan draft.")).toBe("document");
  });

  it("detects fleet from content keywords", () => {
    expect(detectDirectorMessageScene("Let's deploy a new agent for intake.")).toBe("fleet");
  });

  it("returns general when no signals match", () => {
    expect(detectDirectorMessageScene("Thanks — noted.")).toBe("general");
  });

  it("classifies website deliverables as document, not creative", () => {
    expect(detectDirectorMessageScene("Here is your website sitemap and homepage wireframe.")).toBe(
      "document",
    );
  });

  it("classifies fenced code as code scene", () => {
    const content = "Summary\n\n```typescript\nexport function hello() {}\n```";
    expect(detectDirectorMessageScene(content)).toBe("code");
  });
});
