import { describe, expect, it } from "vitest";
import {
  normalizeAppPageSubTabParam,
  resolveAppPageSubTabId,
  resolveAppPageSubTabRoute,
} from "./page-sub-tabs";

describe("page-sub-tabs", () => {
  const ops = resolveAppPageSubTabRoute("/ops")!;

  it("resolves ops tab aliases (actions → intel)", () => {
    expect(normalizeAppPageSubTabParam(ops, "actions")).toBe("intel");
    expect(resolveAppPageSubTabId(ops, "actions")).toBe("intel");
  });

  it("falls back to default tab for unknown params", () => {
    expect(resolveAppPageSubTabId(ops, "unknown")).toBe("floor");
    expect(resolveAppPageSubTabId(ops, null)).toBe("floor");
  });

  it("keeps canonical tab ids", () => {
    expect(resolveAppPageSubTabId(ops, "analytics")).toBe("analytics");
    expect(resolveAppPageSubTabId(ops, "intel")).toBe("intel");
  });
});
