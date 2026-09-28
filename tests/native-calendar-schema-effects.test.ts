import { describe, expect, it } from "vitest";
import {
  evaluateNativeCalendarSchemaEffects,
  NATIVE_CALENDAR_FUNCTION_BODY,
} from "../scripts/lib/native-calendar-schema-effects.mjs";

function valid() {
  return {
    tables: ["wireline_settings", "wireline_appointments", "wireline_calendar_events"].map(
      (name) => ({
        name,
        rls_enabled: true,
        can_select: true,
        can_insert: true,
        can_update: true,
        can_delete: true,
      }),
    ),
    policies: ["wireline_settings", "wireline_appointments", "wireline_calendar_events"].map(
      (tablename) => ({
        tablename,
        policyname: "tenant_isolation",
        cmd: "ALL",
        qual: "(user_id = wireline_current_user_id())",
        with_check: "(user_id = wireline_current_user_id())",
      }),
    ),
    columns: [
      {
        table_name: "wireline_settings",
        column_name: "native_calendar",
        udt_name: "jsonb",
        is_nullable: "YES",
      },
      ...["start_at", "end_at"].map((column_name) => ({
        table_name: "wireline_appointments",
        column_name,
        udt_name: "timestamptz",
        is_nullable: "YES",
      })),
      ...["time_zone", "booking_source", "booking_request_key", "booking_fingerprint"].map(
        (column_name) => ({
          table_name: "wireline_appointments",
          column_name,
          udt_name: "text",
          is_nullable: "YES",
        }),
      ),
      {
        table_name: "wireline_appointments",
        column_name: "buffer_minutes",
        udt_name: "int4",
        is_nullable: "NO",
        column_default: "0",
      },
    ],
    indexes: [
      {
        name: "uq_appointments_booking_request",
        table_name: "wireline_appointments",
        unique: true,
        valid: true,
        definition:
          "CREATE UNIQUE INDEX uq_appointments_booking_request ON public.wireline_appointments USING btree (user_id, booking_request_key) WHERE (booking_request_key IS NOT NULL)",
      },
    ],
    constraints: [
      {
        name: "appointments_native_interval_valid",
        table_name: "wireline_appointments",
        validated: true,
        definition:
          "CHECK ((buffer_minutes >= 0) AND (buffer_minutes <= 120) AND (end_at > start_at) AND (booking_source IS DISTINCT FROM 'native') AND booking_fingerprint IS NOT NULL AND booking_request_key IS NOT NULL AND time_zone IS NOT NULL AND booking_fingerprint ~ '^[0-9a-f]{64}$')",
      },
    ],
    triggers: [
      {
        name: "guard_native_calendar_appointment",
        table_name: "wireline_appointments",
        enabled: "O",
        type: 23,
        function_name: "guard_native_calendar_appointment",
      },
    ],
    functions: [
      {
        name: "guard_native_calendar_appointment",
        security_definer: false,
        config: ["search_path=pg_catalog, public"],
        owner_only_execute: true,
        body: NATIVE_CALENDAR_FUNCTION_BODY,
        result: "trigger",
        arguments: "",
      },
    ],
  };
}

describe("native Calendar release schema effects", () => {
  it("accepts all required native invariants together", () =>
    expect(evaluateNativeCalendarSchemaEffects(valid())).toEqual([]));
  it("fails closed when no native migration effects exist", () => {
    expect(
      evaluateNativeCalendarSchemaEffects({
        tables: [],
        policies: [],
        columns: [],
        indexes: [],
        constraints: [],
        triggers: [],
        functions: [],
      }),
    ).toContain("native_calendar:booking_trigger");
  });
  it.each([
    "rls",
    "policy",
    "grant",
    "column",
    "default",
    "unique",
    "constraint",
    "trigger",
    "privilege",
    "definer",
    "path",
    "body",
  ])("rejects %s drift", (kind) => {
    const state = valid();
    if (kind === "rls") state.tables[0].rls_enabled = false;
    if (kind === "policy") state.policies[0].qual = "true";
    if (kind === "grant") state.tables[1].can_insert = false;
    if (kind === "column") state.columns[1].udt_name = "text";
    if (kind === "default") state.columns.at(-1)!.column_default = "15";
    if (kind === "unique") state.indexes[0].unique = false;
    if (kind === "constraint") state.constraints[0].definition = "CHECK (true)";
    if (kind === "trigger") state.triggers[0].enabled = "D";
    if (kind === "privilege") state.functions[0].owner_only_execute = false;
    if (kind === "definer") state.functions[0].security_definer = true;
    if (kind === "path") state.functions[0].config = ["search_path=public"];
    if (kind === "body") state.functions[0].body = "BEGIN RETURN NEW; END;";
    expect(evaluateNativeCalendarSchemaEffects(state).length).toBeGreaterThan(0);
  });
});
