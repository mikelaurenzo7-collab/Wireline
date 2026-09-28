import { describe, expect, it } from "vitest";
import { legacyAppointmentsDestination, resolveAppPageSubTabRoute } from "../src/lib/page-sub-tabs";
import { isWorkspaceRoute } from "../src/lib/workspace-route-scope";
import {
  APP_KEYBOARD_SHORTCUTS,
  isMobileMoreActive,
  workspacePageTitle,
} from "../src/constants/navigation";

describe("one Calendar workspace", () => {
  it("preserves scoped appointment bookmarks while retiring the Calls tab", () => {
    expect(
      legacyAppointmentsDestination("?tab=appointments&agent=bot-a&filter=pending", "#customer"),
    ).toBe("/calendar?agent=bot-a&filter=pending#customer");
    expect(legacyAppointmentsDestination("?tab=appointments")).toBe("/calendar");
    expect(legacyAppointmentsDestination("?tab=setup&agent=bot-a")).toBeNull();
    expect(resolveAppPageSubTabRoute("/phone")?.tabs.map((tab) => tab.id)).not.toContain(
      "appointments",
    );
  });

  it("keeps Calendar protected, discoverable, and owned by mobile More", () => {
    expect(isWorkspaceRoute("/calendar/")).toBe(true);
    expect(isMobileMoreActive("/calendar")).toBe(true);
    expect(workspacePageTitle("/calendar")).toBe("Calendar");
    expect(APP_KEYBOARD_SHORTCUTS.C).toBe("/calendar");
    expect(resolveAppPageSubTabRoute("/calendar")?.tabs.map((tab) => tab.id)).toEqual([
      "agenda",
      "availability",
    ]);
  });
});
