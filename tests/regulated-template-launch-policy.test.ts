import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isTemplateLaunchReviewRequired,
  templateLaunchReviewMessage,
} from "../src/lib/template-launch-policy";

const root = process.cwd();

describe("regulated template launch policy", () => {
  it("fails closed for healthcare and hard-debt-recovery templates", () => {
    expect(isTemplateLaunchReviewRequired("scheduler-medical")).toBe(true);
    expect(isTemplateLaunchReviewRequired("collections-soft")).toBe(true);
    expect(isTemplateLaunchReviewRequired(" COLLECTIONS-HARD ")).toBe(true);
    expect(isTemplateLaunchReviewRequired("support-tier1")).toBe(false);
    expect(isTemplateLaunchReviewRequired(undefined)).toBe(false);

    expect(templateLaunchReviewMessage("scheduler-medical")).toContain("signed BAA");
    expect(templateLaunchReviewMessage("collections-soft")).toContain("legal review");
    expect(templateLaunchReviewMessage("collections-hard")).toContain("legal review");
  });

  it("enforces review before the generic create transaction starts", () => {
    const source = fs.readFileSync(path.join(root, "src/routes/agent-routes-v2.ts"), "utf8");
    const policyCheck = source.indexOf("isTemplateLaunchReviewRequired(templateId)");
    const createTransaction = source.indexOf("await drizzle.transaction", policyCheck);

    expect(policyCheck).toBeGreaterThan(-1);
    expect(source.slice(policyCheck, createTransaction)).toContain("TEMPLATE_REVIEW_REQUIRED");
    expect(createTransaction).toBeGreaterThan(policyCheck);
  });
});
