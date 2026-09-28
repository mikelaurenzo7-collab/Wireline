import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("drizzle/migrations/0174_native_booking_calendar.sql");

describe("native booking database invariants", () => {
  it("uses additive columns on already isolated and erased tenant tables", () => {
    expect(migration).toContain(
      "ALTER TABLE public.wireline_settings ADD COLUMN native_calendar jsonb",
    );
    expect(migration).toContain("ALTER TABLE public.wireline_appointments");
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|UPDATE\s+public\.wireline_appointments/i);
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain('table: "wireline_appointments"');
    expect(deletion).toContain('table: "wireline_settings"');
  });

  it("guards every database writer with the same tenant lock and preserves identity receipts", () => {
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.wireline_appointments");
    expect(migration).toContain(
      "pg_advisory_xact_lock(hashtextextended('native-calendar:' || NEW.user_id::text, 0))",
    );
    expect(migration).toContain("a.user_id = NEW.user_id");
    expect(migration).toContain("OLD.booking_request_key IS NOT NULL");
    expect(migration).toContain("OLD.booking_fingerprint IS NOT NULL");
    expect(migration).toContain("ON public.wireline_appointments (user_id, booking_request_key)");
    expect(migration).toContain("booking_fingerprint IS NOT NULL");
    expect(migration).toContain("'Requested'");
    expect(migration).not.toContain("SECURITY DEFINER");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.guard_native_calendar_appointment() FROM PUBLIC",
    );
  });

  it("ships a journal entry and current snapshot including the new interval fields", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json"));
    expect(journal.entries.at(-1)).toMatchObject({ idx: 72, tag: "0174_native_booking_calendar" });
    const prior = JSON.parse(read("drizzle/migrations/meta/0071_snapshot.json"));
    const next = JSON.parse(read("drizzle/migrations/meta/0072_snapshot.json"));
    expect(next.prevId).toBe(prior.id);
    expect(next.tables["public.wireline_settings"].columns.native_calendar.type).toBe("jsonb");
    const table = next.tables["public.wireline_appointments"];
    expect(table.columns.start_at.type).toBe("timestamp with time zone");
    expect(table.indexes.uq_appointments_booking_request.isUnique).toBe(true);
    expect(table.checkConstraints.appointments_native_interval_valid.value).toContain(
      "booking_fingerprint IS NOT NULL",
    );
  });
});
