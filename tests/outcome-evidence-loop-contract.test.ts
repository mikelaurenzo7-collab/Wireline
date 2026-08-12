import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outcome evidence loop", () => {
  const ledger = read("src/components/OutcomeLedger.tsx");
  const eventClient = read("src/lib/product-event-client.ts");

  it("keeps call outcomes visible when follow-up enrichment is degraded", () => {
    expect(ledger).toContain("fatalError");
    expect(ledger).toContain("enrichmentWarning");
    expect(ledger).toContain("Follow-up status is temporarily incomplete.");
    expect(ledger).toContain("Call outcomes below are still current.");
    expect(ledger).not.toContain("Some follow-up tasks could not be loaded.");
  });

  it("lets a user inspect real call evidence without inventing a parallel outcome record", () => {
    expect(ledger).toContain("<details");
    expect(ledger).toContain("Transcript");
    expect(ledger).toContain("row.recording_url");
    expect(ledger).toContain('to="/approvals"');
    expect(ledger).toContain('to="/phone?tab=logs"');
  });

  it("counts outcome review only after explicit evidence interaction", () => {
    expect(ledger).toContain('event: "outcome_reviewed"');
    expect(ledger).toContain('source: "outcome_ledger_evidence"');
    expect(ledger).toContain("reviewed: true");
    expect(eventClient).toContain('if (input.event === "outcome_reviewed")');
    expect(eventClient).toContain("return input.metadata?.reviewed === true;");
  });
});
