import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("phone settings attach routing", () => {
  it("attaches agents through the shared self-service calling setup", () => {
    const settingsPage = read("src/pages/PhoneSettings.tsx");
    const setup = read("src/components/PhoneSetupPanel.tsx");

    expect(settingsPage).toContain("PhoneSetupPanel");
    expect(setup).toContain("attachAgent");
    expect(setup).toContain('method: "PATCH"');
    expect(setup).toContain("`/api/phone-numbers/${activeNumber.id}`");
    expect(setup).toContain('aria-label="Attach voice agent to this number"');
    expect(setup).not.toContain("Attach in Studio");
    expect(setup).toContain("Select voice agent");
    expect(setup).toContain("Create voice agent");
  });
});
