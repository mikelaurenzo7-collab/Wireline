import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  actionExecutionMode,
  autonomyFromLegacyPermissionLevel,
  autonomyFromPermissionLevel,
  BOT_PERMISSION_LABELS,
  BOT_PERMISSION_LEVELS,
  BOT_PERMISSION_SUMMARIES,
  botDecidesWhenToAsk,
  DEFAULT_NEW_BOT_AUTONOMY,
  DEFAULT_WORKSPACE_AUTONOMY,
  effectiveAutonomy,
  isLegacyPermissionLevel,
  LEGACY_PERMISSION_LEVELS,
  legacyPermissionLevelFromAutonomy,
  nativeAppointmentStatus,
  permissionLevelFromAutonomy,
  STORED_AUTONOMY_VALUES,
} from "../src/lib/bot-permission";
import { pickWritableSettings } from "../src/routes/settings-routes";

describe("per-bot permission", () => {
  it("maps Set Up choices onto the stored autonomy values", () => {
    expect(autonomyFromPermissionLevel("auto")).toBe("auto");
    expect(autonomyFromPermissionLevel("full")).toBe("full");
    expect(autonomyFromPermissionLevel("messages")).toBe("supervised");
    expect(autonomyFromPermissionLevel("ask")).toBe("draft");
    expect(permissionLevelFromAutonomy("auto")).toBe("auto");
    expect(permissionLevelFromAutonomy("full")).toBe("full");
    expect(permissionLevelFromAutonomy("supervised")).toBe("messages");
    expect(permissionLevelFromAutonomy("draft")).toBe("ask");
    // A Bot that follows a workspace nobody has changed runs on Auto.
    expect(permissionLevelFromAutonomy("inherit")).toBe("auto");
    expect(permissionLevelFromAutonomy(null)).toBe("auto");
  });

  it("lets the Bot decide when to ask only on Auto", () => {
    // Auto is where a Bot starts: it acts, and decides when its owner would
    // want a say.
    expect(botDecidesWhenToAsk(null, null)).toBe(true);
    expect(botDecidesWhenToAsk("inherit", "auto")).toBe(true);
    expect(botDecidesWhenToAsk("auto", "draft")).toBe(true);
    // Full never asks. It still acts, books and sends as Auto does.
    expect(botDecidesWhenToAsk("full", "auto")).toBe(false);
    expect(botDecidesWhenToAsk("inherit", "full")).toBe(false);
    expect(effectiveAutonomy("full", "draft")).toBe("full");
    expect(effectiveAutonomy("inherit", "full")).toBe("full");
    for (const actionType of ["send_email", "send_text_message", "create_internal_task"]) {
      expect(actionExecutionMode({ agentLevel: "full", actionType }), actionType).toBe("auto");
    }
    expect(nativeAppointmentStatus({ bookingMode: "inherit", agentLevel: "full" })).toBe(
      "Scheduled",
    );
    // A level that always asks leaves the Bot nothing to decide, and a value
    // nobody can read is never taken for a licence to decide.
    for (const level of ["supervised", "draft", "high", ""]) {
      expect(botDecidesWhenToAsk(level, level), level).toBe(level === "");
    }
  });

  it("acts on its own when nobody asked it to check first", () => {
    // A new Bot follows its workspace, and a workspace nobody changed acts.
    expect(DEFAULT_NEW_BOT_AUTONOMY).toBe("inherit");
    expect(DEFAULT_WORKSPACE_AUTONOMY).toBe("auto");
    expect(effectiveAutonomy(DEFAULT_NEW_BOT_AUTONOMY, DEFAULT_WORKSPACE_AUTONOMY)).toBe("auto");
    // So a workspace whose owner asked every Bot to check first covers new Bots too.
    expect(effectiveAutonomy(DEFAULT_NEW_BOT_AUTONOMY, "draft")).toBe("draft");
    expect(effectiveAutonomy(null, null)).toBe("auto");
    expect(effectiveAutonomy("inherit", null)).toBe("auto");
    expect(effectiveAutonomy("inherit", undefined)).toBe("auto");
    expect(effectiveAutonomy("inherit", "auto")).toBe("auto");
    expect(effectiveAutonomy(undefined, "")).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "inherit", actionType: "send_email" })).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "inherit", actionType: "send_text_message" })).toBe(
      "auto",
    );
    expect(nativeAppointmentStatus({ bookingMode: "inherit", agentLevel: "inherit" })).toBe(
      "Scheduled",
    );
  });

  it("keeps an owner's choice to check first, on the Bot or on the workspace", () => {
    expect(effectiveAutonomy("draft", "auto")).toBe("draft");
    expect(effectiveAutonomy("supervised", "auto")).toBe("supervised");
    expect(effectiveAutonomy("inherit", "draft")).toBe("draft");
    expect(effectiveAutonomy("inherit", "supervised")).toBe("supervised");
    // The Bot's own choice wins over the workspace in both directions.
    expect(effectiveAutonomy("auto", "draft")).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "supervised", actionType: "send_text_message" })).toBe(
      "draft",
    );
    expect(actionExecutionMode({ agentLevel: "draft", actionType: "send_text_message" })).toBe(
      "draft",
    );
  });

  it("never reads a stored value it does not recognise as permission", () => {
    // "high" and "suggest" were found on live Bots. Neither is a value this
    // code writes, so neither may be read as "go ahead".
    for (const unreadable of ["high", "suggest", "Full", "yes", "AUTO "]) {
      expect(effectiveAutonomy(unreadable, "auto"), unreadable).toBe("draft");
      expect(effectiveAutonomy("inherit", unreadable), unreadable).toBe("draft");
      expect(permissionLevelFromAutonomy(unreadable), unreadable).toBe("ask");
    }
  });

  it("refuses to store an autonomy value the runtime cannot read", () => {
    expect([...STORED_AUTONOMY_VALUES]).toEqual(["auto", "full", "supervised", "draft"]);
    for (const value of STORED_AUTONOMY_VALUES) {
      expect(pickWritableSettings({ autonomyLevel: value }, false)).toEqual({
        autonomyLevel: value,
      });
    }
    for (const value of ["high", "Full", "inherit", "", 3, null, undefined]) {
      expect(pickWritableSettings({ autonomyLevel: value }, false)).toEqual({});
    }
    const planner = readFileSync("src/lib/workspace-planner.ts", "utf8");
    expect(planner).toContain("export const WORKSPACE_AUTONOMY_OPTIONS = STORED_AUTONOMY_VALUES;");
    expect(planner).toContain('if (field === "autonomy_level") {');
    expect(planner).toContain(
      "For autonomy_level, value MUST be one of: ${WORKSPACE_AUTONOMY_GUIDE}.",
    );
    const applyChange = readFileSync("src/routes/agent-workspace-routes.ts", "utf8");
    expect(applyChange).toContain(
      "if (!(WORKSPACE_AUTONOMY_OPTIONS as readonly string[]).includes(value)) {",
    );
  });

  it("names the levels in the owner's words, with Auto first", () => {
    expect([...BOT_PERMISSION_LEVELS]).toEqual(["auto", "full", "messages", "ask"]);
    expect(BOT_PERMISSION_LABELS.auto).toBe("Auto: it decides when to check with me");
    expect(BOT_PERMISSION_LABELS.full).toBe("On its own, always");
    expect(BOT_PERMISSION_LABELS.messages).toBe(
      "Check with me before it emails or texts a customer",
    );
    expect(BOT_PERMISSION_LABELS.ask).toBe("Check with me before it does anything");
    // Auto says what the Bot decides about, and Full says it never waits.
    expect(BOT_PERMISSION_SUMMARIES.auto).toContain(
      "checks with you only when it decides you would want a say",
    );
    expect(BOT_PERMISSION_SUMMARIES.full).toContain("never asks before it sends");
    const copy = [
      ...Object.values(BOT_PERMISSION_LABELS),
      ...Object.values(BOT_PERMISSION_SUMMARIES),
    ].join(" ");
    expect(copy).not.toMatch(/approv/i);
    const panel = readFileSync("src/components/StudioAgentWorkspacePanel.tsx", "utf8");
    expect(panel).toContain("{BOT_PERMISSION_LEVELS.map((level) => (");
    expect(panel).toContain("{BOT_PERMISSION_LABELS[level]}");
    expect(panel).toContain("{BOT_PERMISSION_SUMMARIES[permission]}");
    expect(panel).toContain(
      'permission: isBotPermissionLevel(data.autonomy) ? data.autonomy : "auto",',
    );
    for (const retired of ["Full access", "Ask for approval", ">Auto<"]) {
      expect(panel, retired).not.toContain(retired);
    }
    expect(readFileSync("src/lib/studio-setup-drafts.ts", "utf8")).toContain('permission: "auto",');
  });

  it("changes what the action engine executes", () => {
    expect(actionExecutionMode({ agentLevel: "auto", actionType: "send_email" })).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "supervised", actionType: "send_email" })).toBe(
      "draft",
    );
    expect(
      actionExecutionMode({ agentLevel: "supervised", actionType: "create_internal_task" }),
    ).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "draft", actionType: "create_internal_task" })).toBe(
      "draft",
    );
    expect(
      actionExecutionMode({
        agentLevel: "draft",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "automatic",
      }),
    ).toBe("auto");
    expect(
      actionExecutionMode({
        agentLevel: "supervised",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "inherit",
      }),
    ).toBe("auto");
    expect(
      actionExecutionMode({
        agentLevel: "draft",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "inherit",
      }),
    ).toBe("draft");
  });

  it("books an inherited calendar as Requested only when the Bot is Ask", () => {
    expect(
      nativeAppointmentStatus({
        bookingMode: "inherit",
        agentLevel: "draft",
        tenantLevel: "auto",
      }),
    ).toBe("Requested");
    expect(
      nativeAppointmentStatus({
        bookingMode: "inherit",
        agentLevel: "inherit",
        tenantLevel: "draft",
      }),
    ).toBe("Requested");
    expect(
      nativeAppointmentStatus({
        bookingMode: "inherit",
        agentLevel: "supervised",
        tenantLevel: "draft",
      }),
    ).toBe("Scheduled");
    expect(
      nativeAppointmentStatus({
        bookingMode: "automatic",
        agentLevel: "draft",
        tenantLevel: "draft",
      }),
    ).toBe("Scheduled");
    expect(
      nativeAppointmentStatus({
        bookingMode: "approval",
        agentLevel: "auto",
        ownerApproved: true,
      }),
    ).toBe("Requested");
    expect(
      nativeAppointmentStatus({
        bookingMode: "inherit",
        agentLevel: "draft",
        ownerApproved: true,
      }),
    ).toBe("Scheduled");
    expect(permissionLevelFromAutonomy(effectiveAutonomy("inherit", "draft"))).toBe("ask");
    expect(permissionLevelFromAutonomy(effectiveAutonomy("inherit", "supervised"))).toBe(
      "messages",
    );
    expect(permissionLevelFromAutonomy(effectiveAutonomy("inherit", "auto"))).toBe("auto");
    expect(permissionLevelFromAutonomy(effectiveAutonomy("inherit", "full"))).toBe("full");
  });

  it("shows the workspace permission when a Bot is stored as inherit", () => {
    const route = readFileSync("src/routes/agent-routes-v2.ts", "utf8");
    expect(route).toContain(
      "autonomy: permissionLevelFromAutonomy(\n        effectiveAutonomy(record?.autonomyLevel, tenantSettings[0]?.autonomyLevel),",
    );
    expect(route).not.toContain("permissionLevelFromAutonomy(record?.autonomyLevel)");
  });

  it("keeps the old option names meaning what they meant, in their own field", () => {
    // A tab opened before Auto existed still sends these. Read as today's
    // names, "auto" would set a Bot to send on its own while the old screen
    // showed "check before it emails or texts" as saved.
    expect([...LEGACY_PERMISSION_LEVELS]).toEqual(["full", "auto", "ask"]);
    expect(autonomyFromLegacyPermissionLevel("auto")).toBe("supervised");
    expect(autonomyFromLegacyPermissionLevel("ask")).toBe("draft");
    // The old "On its own" stores the value every release can read, never
    // `full`, which a service still on the previous release reads as "wait".
    expect(autonomyFromLegacyPermissionLevel("full")).toBe("auto");
    // An old screen is told the setting in the names it knows.
    expect(legacyPermissionLevelFromAutonomy("supervised")).toBe("auto");
    expect(legacyPermissionLevelFromAutonomy("draft")).toBe("ask");
    for (const stored of ["auto", "full", "inherit", null]) {
      expect(legacyPermissionLevelFromAutonomy(stored), String(stored)).toBe("full");
    }
    expect(legacyPermissionLevelFromAutonomy("high")).toBe("ask");
    expect(isLegacyPermissionLevel("messages")).toBe(false);

    const route = readFileSync("src/routes/agent-routes-v2.ts", "utf8");
    // Today's names are read from `autonomy`, the old ones only from `level`,
    // and a request that names both is not guessed at.
    expect(route).toContain("const choice = isBotPermissionLevel(req.body?.autonomy)");
    expect(route).toContain(
      ": req.body?.autonomy === undefined && isLegacyPermissionLevel(req.body?.level)",
    );
    expect(route).toContain("stored: autonomyFromLegacyPermissionLevel(req.body.level),");
    expect(route).toContain("receipt: { permission: req.body.level },");
    expect(route).toContain("receipt: { autonomy: req.body.autonomy },");
    expect(route).toContain("permission: legacyPermissionLevelFromAutonomy(");
    const panel = readFileSync("src/components/StudioAgentWorkspacePanel.tsx", "utf8");
    expect(panel).toContain("body: JSON.stringify({ autonomy: level }),");
    expect(panel).toContain("receipt.autonomy !== level");
    expect(panel).not.toContain("JSON.stringify({ level })");
  });

  it("starts a new Bot following its workspace, from one shared default", () => {
    for (const file of [
      "src/routes/agent-routes-v2.ts",
      "src/lib/agent-draft-service.ts",
      "src/routes/mobile-routes.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("autonomyLevel: DEFAULT_NEW_BOT_AUTONOMY,");
      expect(source, file).not.toMatch(/autonomyLevel: "(?:supervised|draft|auto)"/);
    }
  });

  it("starts a new workspace working on its own, and moves existing ones once", () => {
    for (const file of ["src/db/schema-base.ts", "src/db/schema.ts"]) {
      expect(readFileSync(file, "utf8"), file).toContain(
        'autonomyLevel: text("autonomy_level").default("auto"),',
      );
    }
    const migration = readFileSync("drizzle/migrations/0201_autonomous_by_default.sql", "utf8");
    expect(migration).toContain(
      `ALTER TABLE public."wireline_settings" ALTER COLUMN "autonomy_level" SET DEFAULT 'auto';`,
    );
    // The reset of existing rows may run once. The column default is the
    // marker, and the guard returns before anything is changed on a replay,
    // so an owner who later chooses to check first is never switched back.
    const guard = migration.indexOf(
      "IF current_default IS NOT NULL AND position('''auto''' IN current_default) > 0 THEN",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(migration.slice(guard)).toMatch(/^IF[^\n]*\n\s*RETURN;\n\s*END IF;/);
    // The default changes first, under a short lock timeout, so the migration
    // fails fast instead of queueing behind a request updating its own row.
    const order = [
      "PERFORM set_config('lock_timeout', '5s', true);",
      `ALTER TABLE public."wireline_settings" ALTER COLUMN "autonomy_level" SET DEFAULT 'auto';`,
      'UPDATE public."wireline_settings"',
      'UPDATE public."wireline_agents"',
    ].map((statement) => migration.indexOf(statement));
    expect(order[0]).toBeGreaterThan(guard);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Bots follow the workspace. A Bot already working on its own is left
    // alone, and so is one its owner set to check before everything.
    expect(migration).toContain(`SET "autonomy_level" = 'inherit'`);
    expect(migration).toContain(`AND "autonomy_level" IS DISTINCT FROM 'auto'`);
    expect(migration).toContain(`AND "autonomy_level" IS DISTINCT FROM 'draft';`);
    const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 99,
      tag: "0201_autonomous_by_default",
    });
  });
});
