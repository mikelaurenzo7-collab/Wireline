import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { lineTextingApprovalCopy, missedCallTextBackCopy } from "../src/components/PhoneSetupPanel";

describe("line texting approval", () => {
  it("tells the owner whether carriers accept texts from the line", () => {
    expect(lineTextingApprovalCopy("approved")).toBe("Approved by US carriers for texting.");
    expect(lineTextingApprovalCopy("pending")).toContain("in review");
    expect(lineTextingApprovalCopy("not_approved")).toContain(
      "register your business with carriers",
    );
    expect(lineTextingApprovalCopy("unknown")).toBeNull();
    expect(lineTextingApprovalCopy(undefined)).toBeNull();
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
