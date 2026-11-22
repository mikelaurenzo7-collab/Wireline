import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { lineTextingApprovalCopy } from "../src/components/PhoneSetupPanel";

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
    expect(route).toContain('texting_approval: textingApproval.get(row.phoneNumber) ?? "unknown"');
    expect(route).toMatch(/setTimeout\(\(\) => resolveTimer\("unknown"\), 1500\)/);
  });
});
