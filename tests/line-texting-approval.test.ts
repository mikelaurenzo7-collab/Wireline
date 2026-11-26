import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { lineTextingApprovalCopy, missedCallTextBackCopy } from "../src/components/PhoneSetupPanel";

describe("line texting approval", () => {
  it("tells the owner whether carriers accept texts from the line", () => {
    expect(lineTextingApprovalCopy("approved")).toBe("Approved by US carriers for texting.");
    expect(lineTextingApprovalCopy("pending")).toContain("in review");
    expect(lineTextingApprovalCopy("not_approved")).toContain(
      "Add your business details under Texting Registration",
    );
    expect(lineTextingApprovalCopy("unknown")).toBeNull();
    expect(lineTextingApprovalCopy(undefined)).toBeNull();
  });

  it("does not ask again for business details the owner already sent", () => {
    const received = lineTextingApprovalCopy("not_approved", true);
    expect(received).toContain("Business details received");
    expect(received).toContain("a few days to two weeks");
    expect(received).not.toContain("Add your business details");
    // Approval states read from Twilio win over the local submission.
    expect(lineTextingApprovalCopy("approved", true)).toBe("Approved by US carriers for texting.");
    expect(lineTextingApprovalCopy("pending", true)).toContain("in review");
    const panel = readFileSync(
      resolve(process.cwd(), "src/components/PhoneSetupPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain('authFetch("/api/texting-registration"');
    expect(panel).toContain("window.addEventListener(TEXTING_REGISTRATION_EVENT, onChange)");
    const form = readFileSync(
      resolve(process.cwd(), "src/components/settings/TextingRegistrationForm.tsx"),
      "utf8",
    );
    expect(form.match(/announceTextingRegistration\(/g)).toHaveLength(2);
  });

  it("reads approval from the same Twilio snapshot as the send path, bounded in time", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/routes/native-phone-routing-routes.ts"),
      "utf8",
    );
    expect(route).toContain("resolveSmsSenderRegistration(phoneNumber)");
    expect(route).toContain(
      'texting_approval: textingApproval.get(row.phoneNumber)?.approval ?? "unknown"',
    );
    expect(route).toContain("missed_call_texts_covered:");
    expect(route).toContain("missedCallsCovered: registration.coversMissedCalls === true");
    expect(route).toMatch(/setTimeout\(\(\) => resolveTimer\(unknown\), 1500\)/);
  });

  it("says plainly when missed-call texts are on but the campaign does not cover them", () => {
    expect(missedCallTextBackCopy(false, false)).toContain("once per caller per day");
    expect(missedCallTextBackCopy(true, true)).toContain("get one text from this line");
    expect(missedCallTextBackCopy(true, false)).toContain("so none will send");
  });
});
