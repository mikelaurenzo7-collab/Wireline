import { describe, expect, it } from "vitest";

import { getRoleToolSet, normalizeEnabledTools, resolveAgentTools } from "./agent-capabilities";

describe("agent capabilities", () => {
  it("returns role defaults when no override exists", () => {
    expect(getRoleToolSet("customer_service")).toContain("send_text_message");
    expect(resolveAgentTools("customer_service", undefined)).toEqual(getRoleToolSet("customer_service"));
  });

  it("accepts a custom enabled_tools override including an empty list", () => {
    expect(normalizeEnabledTools(["send_email", "lookup_phone_number", "send_email"])).toEqual([
      "send_email",
      "lookup_phone_number",
    ]);
    expect(resolveAgentTools("sales", [])).toEqual([]);
  });

  it("rejects invalid tool names", () => {
    expect(normalizeEnabledTools(["send_email", "fax_customer"])).toBeNull();
  });
});
