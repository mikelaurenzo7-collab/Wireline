import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native phone-number claim validation", () => {
  it("rejects an invalid explicit number instead of falling back to other inventory", () => {
    const carrier = read("src/lib/voice/native-phone-carrier.ts");

    expect(carrier).toContain("preferredRaw");
    expect(carrier).toContain("if (preferredRaw && (!preferred");
    expect(carrier).toContain("phone_number must be a US E.164 number");
    expect(carrier.indexOf("phone_number must be a US E.164 number")).toBeLessThan(
      carrier.indexOf("listNativeAvailableLocalNumbers(input.areaCode, 5)"),
    );
  });
});
