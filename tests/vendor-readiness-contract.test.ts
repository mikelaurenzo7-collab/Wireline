import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("vendor readiness contract", () => {
  const probe = read("scripts/check-vendor-readiness.mjs");

  it("probes launch-critical providers without billable inference or calls", () => {
    for (const id of [
      "postgres",
      "upstash",
      "xai",
      "openai",
      "vapi",
      "twilio",
      "stripe",
      "resend",
      "federal_dnc",
    ]) {
      expect(probe).toContain(`"${id}"`);
    }

    expect(probe).toContain("/v1/models");
    expect(probe).toContain("/phone-number?limit=1");
    expect(probe).not.toContain('/call"');
    expect(probe).not.toContain("/chat/completions");
  });

  it("blocks invalid funding/auth posture and keeps optional voice separate", () => {
    expect(probe).toContain("stripeAvailable >= 0");
    expect(probe).toContain("Twilio credentials missing or rejected");
    expect(probe).toContain('validHttpsUrl("FEDERAL_DNC_API_URL")');
    expect(probe).toContain('"elevenlabs",\n  false');
    expect(probe).toContain("No immediate top-up required");
  });

  it("is exposed as an explicit owner command rather than a default local test", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["vendor:readiness"]).toBe("node scripts/check-vendor-readiness.mjs");
    expect(packageJson.scripts.verify).not.toContain("vendor:readiness");
  });
});
