import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BOOKED_APPOINTMENT_STATUSES } from "../src/lib/call-report";
import { formatActivityTime } from "../src/lib/safe-date";
import {
  customerSafeSmsFailureReason,
  spokenSmsFailureReason,
  withoutCarrierVendorName,
} from "../src/lib/sms-customer-errors";
import { readRuntimeBalanceEntries } from "../src/components/RuntimeBalanceActivity";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("what counts as a call that booked", () => {
  it("leaves out a request still waiting for the owner, and a cancelled booking", () => {
    expect([...BOOKED_APPOINTMENT_STATUSES]).toEqual([
      "Scheduled",
      "Confirmed",
      "Rescheduled",
      "Completed",
    ]);
    const report = read("src/lib/call-report.ts");
    expect(report).toContain(
      "inArray(schema.appointments.status, [...BOOKED_APPOINTMENT_STATUSES])",
    );
    expect(report).not.toContain("<> 'Cancelled'");
  });

  it("reads a page of call annotations on one pooled connection", () => {
    const report = read("src/lib/call-report.ts");
    expect(report).toContain("await drizzle.transaction((tx) =>");
    expect(report).toContain("serialQueryBatch([");
    expect(report).not.toContain("Promise.all(");
  });
});

describe("the carrier vendor's name in messages a customer can see", () => {
  it("rewrites only a reason that names the vendor", () => {
    for (const reason of [
      "Twilio messaging is disabled for this workspace.",
      "Twilio credentials are not configured on this deployment.",
      "Configure a Twilio sender or Messaging Service before sending.",
      "Twilio rejected the message send request.",
    ]) {
      expect(withoutCarrierVendorName(reason)).not.toMatch(/twilio/i);
      expect(customerSafeSmsFailureReason({ reason })).not.toMatch(/twilio/i);
    }
    // Another channel's failure keeps its own wording.
    const email = "Reconnect Gmail in Connections, then send again.";
    expect(withoutCarrierVendorName(email)).toBe(email);
  });

  it("gives the Bot one plain sentence it can say to a caller", () => {
    expect(spokenSmsFailureReason({ reason: "Twilio rejected the message send request." })).toBe(
      "The text could not be sent right now.",
    );
    expect(spokenSmsFailureReason({})).toBe("Message send failed.");
    const optedOut = "This number has opted out of texts.";
    expect(spokenSmsFailureReason({ reason: optedOut, code: "SMS_OPTED_OUT" })).toBe(optedOut);
  });

  it("is applied wherever a send failure leaves the server", () => {
    expect(read("src/lib/bot-tools/core.ts")).toContain(
      "notConfirmed(spokenSmsFailureReason(outcome))",
    );
    expect(read("src/routes/agent-workspace-routes.ts")).toContain(
      'withoutCarrierVendorName(String(result.error || "Action failed"))',
    );
    expect(read("src/routes/fleet-routes.ts")).toContain(
      "withoutCarrierVendorName(String(result.error))",
    );
    expect(read("src/lib/cadence-engine.ts")).toContain(
      'withoutCarrierVendorName(result.reason || "unknown")',
    );
    for (const path of [
      "src/routes/native-phone-routing-routes.ts",
      "src/lib/voice/native-phone-carrier.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("could not confirm this line's call routing");
      expect(source, path).not.toContain("Twilio routing");
    }
  });

  it("records refunds in plain words and rewords the ones already recorded", () => {
    const service = read("src/lib/twilio-service.ts");
    expect(service).not.toContain("Twilio provider attempt did not start");
    expect(service).not.toContain("Twilio rejected the outbound message");
    const entries = readRuntimeBalanceEntries([
      {
        id: "a",
        deltaUsd: 0.02,
        balanceAfterUsd: 4,
        createdAt: null,
        entryKind: "refund",
        reason: "runtime_usage_refund",
        customerReason: "Twilio provider attempt did not start",
      },
      {
        id: "b",
        deltaUsd: 0.02,
        balanceAfterUsd: 4,
        createdAt: null,
        entryKind: "refund",
        reason: "runtime_usage_refund",
        customerReason: "Twilio rejected the outbound message",
      },
    ]);
    expect(entries?.map((entry) => entry.description)).toEqual([
      "Text was not sent",
      "Carrier did not accept the text",
    ]);
  });

  it("records a text cost adjustment in plain words and rewords the ones already recorded", () => {
    const reconciliation = read("src/lib/twilio-message-reconciliation.ts");
    expect(reconciliation).not.toMatch(/reason: "[^"]*Twilio/);
    expect(reconciliation.match(/reason: "Text cost adjustment"/g)).toHaveLength(2);
    const entries = readRuntimeBalanceEntries([
      {
        id: "c",
        deltaUsd: 0.01,
        balanceAfterUsd: 4,
        createdAt: null,
        entryKind: "refund",
        reason: "runtime_usage_refund",
        customerReason: "Twilio segment estimate adjustment",
      },
      {
        id: "d",
        deltaUsd: -0.01,
        balanceAfterUsd: 4,
        createdAt: null,
        entryKind: "burn",
        reason: "runtime_usage",
        customerReason: "Twilio segment count adjustment",
      },
    ]);
    expect(entries?.map((entry) => entry.description)).toEqual([
      "Text cost adjustment",
      "Text cost adjustment",
    ]);
  });
});

describe("when a record needs more than a list row shows", () => {
  const lastSeptember = new Date(new Date().getFullYear(), 8, 20, 12, 0, 7);

  it("keeps the year on work that can wait for months", () => {
    const shown = formatActivityTime(lastSeptember, "", { year: true });
    expect(shown).toContain(`Sep 20, ${lastSeptember.getFullYear()}`);
    expect(read("src/components/ApprovalInbox.tsx")).toContain(
      'formatActivityTime(created.dateTime, "", { year: true })',
    );
  });

  it("keeps the year and the seconds on the consent ledger", () => {
    const shown = formatActivityTime(lastSeptember, "", { year: true, seconds: true });
    expect(shown).toContain(String(lastSeptember.getFullYear()));
    expect(shown).toContain("12:00:07");
    const ledger = read("src/components/ComplianceCenter.tsx");
    expect(ledger).toContain(
      'formatActivityTime(entry.created_at, "", { year: true, seconds: true })',
    );
    expect(ledger).toContain("dateTime={entry.created_at || undefined}");
  });

  it("leaves list rows as they were", () => {
    const thisYear = new Date(new Date().getFullYear(), 10, 26, 9, 59);
    expect(formatActivityTime(thisYear)).toBe("Nov 26, 9:59 AM");
  });
});

describe("the person chip on a call, text or email", () => {
  const link = read("src/components/PersonLink.tsx");

  it("looks up and saves only a real phone or address, per account", () => {
    expect(link).toContain("normalizeIdentifier(kind, value)?.value");
    expect(link).toContain('const key = `${user?.id ?? ""}:${kind}:${identifier}`;');
    expect(link).toContain("emailDisplayName(value)");
    expect(link).toContain("peopleAddHref(kind, identifier, saveName)");
  });

  it("sends the customer's phone or email in the body, never in the URL", () => {
    const client = read("src/lib/people-client.ts");
    expect(client).toContain('call<{ person: Person | null }>("/api/people/lookup", {');
    expect(client).toContain("body: JSON.stringify({ kind, value })");
    expect(client).not.toContain("/api/people/lookup?");
  });
});

describe("summaries written when a call never became a conversation", () => {
  it("say what happened without naming a vendor, a protocol or a call leg", async () => {
    const copy = await import("../src/lib/voice/call-summary-copy");
    const summaries = Object.values(copy);
    expect(summaries.length).toBeGreaterThanOrEqual(6);
    for (const text of summaries) {
      expect(text).not.toMatch(
        /openai|xai|grok|twilio|realtime|sip|native voice|bridge|customer leg|persisted/i,
      );
    }
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).not.toContain("OpenAI Realtime voice call");
    expect(session).toContain("summary: CALL_IN_PROGRESS_SUMMARY");
    expect(session).toContain("summary: CALL_OUTCOME_NOT_RECORDED_SUMMARY");
    const outbound = read("src/routes/openai-outbound-routes.ts");
    expect(outbound).not.toContain("OpenAI-generated fallback audio");
    expect(outbound).not.toContain("native voice bridge was not started");
    expect(read("src/lib/voice/openai-sip-session.ts")).not.toContain(
      "before an OpenAI SIP session started",
    );
    expect(read("src/routes/openai-outbound-routes.ts")).not.toContain(
      "before native voice was confirmed",
    );
  });
});
