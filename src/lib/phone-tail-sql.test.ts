import { describe, expect, it } from "vitest";
import { phoneTailEquals } from "./phone-tail-sql";

describe("phoneTailEquals", () => {
  it("returns a SQL fragment for 10-digit tail equality", () => {
    const col = { name: "customer_number", table: "wireline_call_logs" } as never;
    const fragment = phoneTailEquals(col, "5551234567");
    expect(fragment).toBeTruthy();
    expect(fragment.queryChunks?.length).toBeGreaterThan(0);
  });
});
