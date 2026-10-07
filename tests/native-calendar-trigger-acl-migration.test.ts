import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("native Calendar inherited execute privilege repair", () => {
  it("preserves applied 0174 and removes only the observed non-owner execute grant", () => {
    const applied = read("drizzle/migrations/0174_native_booking_calendar.sql");
    expect(createHash("sha256").update(applied).digest("hex")).toBe(
      "0bba6c7fa3b2f02301d25baff0ee9609f0ad4af87e887bc3c5d8e0835ade8cbe",
    );
    const repair = read("drizzle/migrations/0175_native_calendar_trigger_execute_acl.sql");
    const sql = repair.replace(/^--.*$/gm, "").trim();
    expect(sql).toBe(
      "REVOKE EXECUTE ON FUNCTION public.guard_native_calendar_appointment() FROM service_role;",
    );
  });

  it("journals the ACL-only repair with an unchanged schema snapshot linked to 0174", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    const entry = journal.entries.find(
      (candidate: { tag: string }) => candidate.tag === "0175_native_calendar_trigger_execute_acl",
    );
    expect(entry).toMatchObject({
      idx: 73,
      tag: "0175_native_calendar_trigger_execute_acl",
      when: 1790556900000,
    });
    const previous = JSON.parse(read("drizzle/migrations/meta/0072_snapshot.json"));
    const current = JSON.parse(read("drizzle/migrations/meta/0073_snapshot.json"));
    expect(current.prevId).toBe(previous.id);
    expect(current.id).not.toBe(previous.id);
    expect({ ...current, id: previous.id, prevId: previous.prevId }).toEqual(previous);
  });
});
