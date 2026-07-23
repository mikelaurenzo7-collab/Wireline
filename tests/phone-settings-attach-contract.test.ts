import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("phone settings attach routing", () => {
  it("attaches agents on /settings/phone via PATCH, not a dead Studio CTA", () => {
    const phone = read("src/pages/PhoneSettings.tsx");
    expect(phone).toContain("attachAgent");
    expect(phone).toContain('method: "PATCH"');
    expect(phone).toContain("`/api/phone-numbers/${activeNumber.id}`");
    expect(phone).toContain('aria-label="Attach AI employee to this number"');
    expect(phone).not.toContain("Attach in Studio");
    expect(phone).toContain("Select AI employee");
    expect(phone).toContain("Create AI employee");
  });
});
