import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/routes/post-call-output-routes.ts"), "utf8");

describe("post-call report destination availability", () => {
  it("requires an active grant and configured provider before offering storage", () => {
    expect(route).toContain("active: schema.crmConnections.active");
    expect(route).toContain("rows.filter((row) => row.active !== false)");
    expect(route).toContain('providers.has("google_sheets") && googleSheetsConfigured()');
    expect(route).toContain('providers.has("microsoft_excel") && microsoftGraphConfigured()');
    expect(route).toContain("google_drive: googleSheetsConnected");
    expect(route).toContain("onedrive: microsoftExcelConnected");
  });
});
