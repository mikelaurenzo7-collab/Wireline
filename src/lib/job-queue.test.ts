import { describe, it, expect } from "vitest";
import { backoffSeconds, DEFAULT_MAX_ATTEMPTS } from "./job-queue";

describe("job-queue · backoffSeconds", () => {
  it("ramps exponentially then caps at longest schedule slice", () => {
    expect(backoffSeconds(0)).toBe(30);
    expect(backoffSeconds(1)).toBe(120);
    expect(backoffSeconds(2)).toBe(600);
    expect(backoffSeconds(3)).toBe(3600);
    expect(backoffSeconds(99)).toBe(3600);
  });

  it("DEFAULT_MAX_ATTEMPTS matches retry schedule length + 1", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
  });
});
