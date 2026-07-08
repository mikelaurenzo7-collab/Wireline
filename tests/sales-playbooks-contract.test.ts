import { describe, expect, it } from "vitest";
import {
  SALES_PLAYBOOKS,
  getSalesPlaybook,
  parsePlaybookFromGoal,
  playbookGoalTag,
} from "../src/lib/sales-playbooks";

describe("sales playbooks", () => {
  it("ships six governed sales playbooks", () => {
    expect(SALES_PLAYBOOKS).toHaveLength(6);
    expect(SALES_PLAYBOOKS.map((playbook) => playbook.id)).toEqual([
      "speed-to-lead",
      "missed-call-recovery",
      "quote-follow-up",
      "no-show-rebooking",
      "event-webinar-follow-up",
      "crm-reactivation",
    ]);
  });

  it("round-trips playbook goal tags", () => {
    const tag = playbookGoalTag("speed-to-lead");
    expect(parsePlaybookFromGoal(tag)).toBe("speed-to-lead");
    expect(getSalesPlaybook("crm-reactivation")?.requiresConsent).toBe(true);
  });
});
