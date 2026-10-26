import { describe, expect, it } from "vitest";
import { spokenBusinessName } from "../src/lib/voice/spoken-business-name";

describe("spoken business name", () => {
  it("uses the workspace name, then the account name, before a blank business name", () => {
    expect(
      spokenBusinessName({
        businessName: "  ",
        workspaceDisplayName: "North Side Dental",
        accountDisplayName: "Ada Lovelace",
      }),
    ).toBe("North Side Dental");
    expect(
      spokenBusinessName({
        businessName: null,
        workspaceDisplayName: "",
        accountDisplayName: "Ada Lovelace",
      }),
    ).toBe("Ada Lovelace");
    expect(spokenBusinessName({ businessName: "Acme", workspaceDisplayName: "Other" })).toBe("Acme");
    expect(spokenBusinessName({})).toBeNull();
  });
});
