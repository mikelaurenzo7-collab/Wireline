import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const engine = read("src/lib/cadence-engine.ts");

describe("cadence engine outbound compliance gate", () => {
  it("routes call/sms steps through the shared federal DNC + TCPA gate, not a DNC-only check", () => {
    // Cadence marketing outbound must clear the same gate as campaign-dialer.ts
    // and intake-routes.ts — internal DNC alone is not federal DNC + consent.
    expect(engine).toContain('import { evaluateOutboundDialGate } from "./outbound-dial-gate"');
    expect(engine).toContain("await evaluateOutboundDialGate({");
    expect(engine).not.toContain('import { isDncBlocked } from "./compliance"');

    const gateBlockMatch = engine.match(
      /if \(\(step\.type === "call" \|\| step\.type === "sms"\)[\s\S]*?\n {2}\}/,
    );
    expect(gateBlockMatch).not.toBeNull();
    const gateBlock = gateBlockMatch![0];

    // Must pass through consent metadata and the lead's call history so the
    // gate can evaluate duplicate-window + express-written-consent, exactly
    // like the other two marketing-outbound call sites.
    expect(gateBlock).toContain("userId: cadence.userId");
    expect(gateBlock).toContain("phone: lead.customerNumber");
    expect(gateBlock).toContain("leadId: lead.id");
    expect(gateBlock).toContain("lastCalledAt: lead.lastCalledAt");
    expect(gateBlock).toContain("metadata: lead.metadata");

    // Fail-closed: any error evaluating the gate must block the step, not
    // silently let a marketing call/text through unchecked.
    expect(gateBlock).toContain("catch (err: any)");
    expect(gateBlock).toContain("ok: false");
  });

  it("selects lastCalledAt and metadata for cadence leads so the gate has what it needs", () => {
    expect(engine).toContain("lastCalledAt: schema.outboundLeads.lastCalledAt");
    expect(engine).toContain("metadata: schema.outboundLeads.metadata");
  });
});
