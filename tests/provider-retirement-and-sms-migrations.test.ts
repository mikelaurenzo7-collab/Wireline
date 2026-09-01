import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("provider retirement and durable SMS migrations", () => {
  it("registers and materializes the four append-only migrations in order", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const expected = [
      { idx: 67, tag: "0169_remove_legacy_voice_provider" },
      { idx: 68, tag: "0170_sms_destination_routing" },
      { idx: 69, tag: "0171_sms_send_idempotency" },
      { idx: 70, tag: "0172_remove_retired_xai_voice_bindings" },
    ];

    expect(journal.entries.slice(-4).map(({ idx, tag }) => ({ idx, tag }))).toEqual(expected);
    for (const idx of [67, 68, 69, 70]) {
      expect(
        existsSync(
          resolve(
            process.cwd(),
            `drizzle/migrations/meta/${String(idx).padStart(4, "0")}_snapshot.json`,
          ),
        ),
      ).toBe(true);
    }

    const afterLegacyVoiceRetirement = read("drizzle/migrations/meta/0067_snapshot.json");
    const afterDestinationRouting = read("drizzle/migrations/meta/0068_snapshot.json");
    const afterSmsIdempotency = read("drizzle/migrations/meta/0069_snapshot.json");
    const afterXaiRetirement = read("drizzle/migrations/meta/0070_snapshot.json");
    expect(afterLegacyVoiceRetirement).not.toContain('"public.wireline_cloned_voices"');
    expect(afterLegacyVoiceRetirement).toContain('"public.wireline_xai_phone_bindings"');
    expect(afterDestinationRouting).toContain('"destination_number"');
    expect(afterSmsIdempotency).toContain('"public.wireline_sms_send_operations"');
    expect(afterSmsIdempotency).toContain('"public.wireline_xai_phone_bindings"');
    expect(afterXaiRetirement).not.toContain('"public.wireline_xai_phone_bindings"');
    expect(afterXaiRetirement).toContain('"public.wireline_sms_send_operations"');
  });

  it("makes legacy voice-provider retirement fail closed before destructive DDL", () => {
    const migration = read("drizzle/migrations/0169_remove_legacy_voice_provider.sql");
    const inventory = migration.indexOf(
      "SELECT EXISTS (SELECT 1 FROM public.wireline_cloned_voices)",
    );
    const refusal = migration.indexOf("Refusing to retire the legacy voice provider");
    const reconcile = migration.indexOf("$reconcile_legacy_voice_preflight$");
    const drop = migration.indexOf("DROP TABLE IF EXISTS public.wireline_cloned_voices");

    expect(migration).toContain("to_regclass('public.wireline_cloned_voices')");
    expect(inventory).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(inventory);
    expect(reconcile).toBeGreaterThan(refusal);
    expect(drop).toBeGreaterThan(reconcile);
    expect(migration).toContain("wireline_account_environment_promotion_preflight(uuid)");
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.wireline_revoke_cloned_voice_assignments()",
    );
  });

  it("binds SMS threads to an exact destination without guessing unresolved legacy rows", () => {
    const migration = read("drizzle/migrations/0170_sms_destination_routing.sql");
    const schema = read("src/db/schema-base.ts");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS destination_number text");
    expect(migration).not.toContain("SET destination_number =");
    expect(migration).not.toContain("twilio_sms_from_number");
    expect(migration).toContain(
      "ON public.wireline_sms_threads (user_id, destination_number, customer_number)",
    );
    expect(migration).toContain("WHERE destination_number IS NOT NULL");
    expect(migration).toContain("WHERE destination_number IS NULL");
    expect(migration).toContain("null legacy rows cannot send until resolved");
    expect(schema).toContain('destinationNumber: text("destination_number")');
    expect(schema).toContain('uniqueIndex("idx_sms_threads_user_destination_customer")');
    expect(schema).toContain('uniqueIndex("idx_sms_threads_legacy_user_customer")');
    expect(schema).toContain(".where(sql`${table.destinationNumber} IS NOT NULL`)");
    expect(schema).toContain(".where(sql`${table.destinationNumber} IS NULL`)");
  });

  it("persists an at-most-once SMS provider-attempt fence with tenant ownership", () => {
    const migration = read("drizzle/migrations/0171_sms_send_idempotency.sql");
    const schema = read("src/db/schema-base.ts");
    const deletion = read("src/lib/account-deletion.ts");
    const route = read("src/routes/sms-routes.ts");

    for (const status of ["reserved", "attempting", "accepted", "rejected", "ambiguous"]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain(
      "ON public.wireline_sms_send_operations (user_id, idempotency_key)",
    );
    expect(migration).toContain(
      "ALTER TABLE public.wireline_sms_send_operations ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("FOR ALL TO wireline_server");
    expect(migration).toContain("USING (user_id = (SELECT public.wireline_current_user_id()))");
    expect(schema).toContain("export const smsSendOperations = pgTable(");
    expect(schema).toContain('"wireline_sms_send_operations"');
    const schemaStart = schema.indexOf("export const smsSendOperations = pgTable(");
    const schemaEnd = schema.indexOf("// 3.1c AGENT TEAMS", schemaStart);
    const operationSchema = schema.slice(schemaStart, schemaEnd);
    expect(operationSchema).toContain('.references(() => users.id, { onDelete: "cascade" })');
    expect(operationSchema).toContain('.references(() => smsThreads.id, { onDelete: "cascade" })');
    expect(operationSchema).toContain('status: text("status").notNull().default("reserved")');
    expect(operationSchema).toContain(".defaultNow().notNull()");
    expect(operationSchema).toContain("wireline_sms_send_operations_status_check");
    expect(operationSchema).toContain(").enableRLS();");
    expect(deletion).toContain(
      '{ table: "wireline_sms_send_operations", userColumns: ["user_id"] }',
    );

    const replyRoute = route.indexOf('"/api/sms/threads/:id/reply"');
    const operationKey = route.indexOf(
      "const idempotencyKey = smsReplyOperationKey(req)",
      replyRoute,
    );
    const initialLoad = route.indexOf(
      "await loadSmsSendOperation(req.user.id, idempotencyKey)",
      replyRoute,
    );
    const environmentGate = route.indexOf(
      "await assertSmsReplyExternalActionAllowed(req.user.id, thread.customerNumber!)",
      initialLoad,
    );
    const complianceGate = route.indexOf("await evaluateSmsThreadReplyGate({", environmentGate);
    const reserve = route.indexOf("await reserveSmsSendOperation({", complianceGate);
    const claim = route.indexOf(
      "await claimSmsProviderAttempt(req.user.id, operation.id)",
      reserve,
    );
    const carrier = route.indexOf("await sendTenantMessage(req.user.id", reserve);
    expect(operationKey).toBeGreaterThan(replyRoute);
    expect(initialLoad).toBeGreaterThan(operationKey);
    expect(environmentGate).toBeGreaterThan(initialLoad);
    expect(complianceGate).toBeGreaterThan(environmentGate);
    expect(reserve).toBeGreaterThan(complianceGate);
    expect(claim).toBeGreaterThan(reserve);
    expect(carrier).toBeGreaterThan(reserve);
    expect(route.indexOf("beforeProviderAttempt:", reserve)).toBeLessThan(claim);
    expect(route).toContain("assertSmsSendOperationMatchesRequest(existingOperation, requestHash)");
    expect(route).toContain("if (operation.requestHash !== requestHash)");
    expect(route).toContain('"IDEMPOTENCY_KEY_REUSED"');
    expect(route).toContain('"IDEMPOTENCY_KEY_REQUIRED"');
    expect(route).toContain("interrupted requests can be retried safely");
    expect(route).not.toContain("randomUUID");
    expect(route).not.toContain("sms-inbox/${randomUUID()}");
  });

  it("removes the retired xAI binding ledger only after an empty-inventory assertion", () => {
    const migration = read("drizzle/migrations/0172_remove_retired_xai_voice_bindings.sql");
    const deletion = read("src/lib/account-deletion.ts");
    const inventory = migration.indexOf(
      "SELECT EXISTS (SELECT 1 FROM public.wireline_xai_phone_bindings)",
    );
    const refusal = migration.indexOf("retired xAI phone binding inventory is no longer empty");
    const reconcile = migration.indexOf("$reconcile_retired_provider_preflight$");
    const drop = migration.indexOf("DROP TABLE IF EXISTS public.wireline_xai_phone_bindings");

    expect(migration).toContain("to_regclass('public.wireline_xai_phone_bindings')");
    expect(inventory).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(inventory);
    expect(reconcile).toBeGreaterThan(refusal);
    expect(drop).toBeGreaterThan(reconcile);
    expect(migration).toContain("wireline_account_environment_promotion_preflight(uuid)");
    expect(migration).toContain("$managed_voice_count$");
    expect(migration).toContain("$presenter_resource_count$");
    expect(migration).toContain("managed OpenAI catalog voices still block production promotion");
    expect(migration).toContain("wireline_claim_xai_phone_binding");
    expect(migration).toContain("wireline_scrub_xai_phone_bindings_for_purge");
    expect(deletion).toContain('"public.wireline_scrub_xai_phone_bindings_for_purge(uuid)"');
    expect(deletion).toContain("await functionExists(");
  });
});
