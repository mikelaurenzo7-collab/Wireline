import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { BotDeletionProviders } from "../src/lib/bot-deletion";

/**
 * Bot deletion against real Postgres foreign keys.
 *
 * Runs only when BOT_DELETION_TEST_DATABASE_URL names a disposable local
 * database that already has the Drizzle schema, for example:
 *   POSTGRES_URL=<url> npx drizzle-kit push --force
 * The test inserts and deletes rows, so it refuses any host but localhost.
 */
const databaseUrl = process.env.BOT_DELETION_TEST_DATABASE_URL || "";

describe.skipIf(!databaseUrl)("Bot deletion against real foreign keys", () => {
  let client: pg.Client;
  let service: typeof import("../src/lib/bot-deletion");

  beforeAll(async () => {
    const host = new URL(databaseUrl).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
      throw new Error("BOT_DELETION_TEST_DATABASE_URL must point at a local database.");
    }
    process.env.POSTGRES_URL = databaseUrl;
    service = await import("../src/lib/bot-deletion");
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  const query = async (text: string, values: unknown[] = []) =>
    (await client.query(text, values)).rows;

  async function seedAccount() {
    const userId = randomUUID();
    const bot = `agent-${randomUUID()}`;
    const other = `agent-${randomUUID()}`;
    // Numbers are unique across every account.
    const botNumber = `+1${randomInt(2_000_000_000, 9_999_999_999)}`;
    const otherNumber = `+1${randomInt(2_000_000_000, 9_999_999_999)}`;
    // So are mailbox addresses.
    const mailbox = `front-desk-${userId.slice(0, 8)}@botbound.app`;
    await query(`INSERT INTO wireline_users (id, email) VALUES ($1, $2)`, [
      userId,
      `${userId}@example.test`,
    ]);
    await query(
      `INSERT INTO wireline_settings (id, user_id, vapi_phone_inbound_agent_id) VALUES ($1, $2, $3)`,
      [userId, userId, bot],
    );
    for (const id of [bot, other]) {
      await query(`INSERT INTO wireline_agents (id, user_id, name) VALUES ($1, $2, $3)`, [
        id,
        userId,
        id === bot ? "Front Desk" : "Sales Rep",
      ]);
      await query(
        `INSERT INTO wireline_directives (user_id, agent_id, content) VALUES ($1, $2, 'Rule')`,
        [userId, id],
      );
      await query(
        `INSERT INTO wireline_knowledge (user_id, agent_id, content) VALUES ($1, $2, 'Fact')`,
        [userId, id],
      );
      await query(
        `INSERT INTO wireline_personality (agent_id, user_id, content) VALUES ($1, $2, 'Warm')`,
        [id, userId],
      );
      await query(
        `INSERT INTO wireline_phone_numbers (user_id, agent_id, phone_number) VALUES ($1, $2, $3)`,
        [userId, id, id === bot ? botNumber : otherNumber],
      );
      await query(
        `INSERT INTO wireline_jobs (user_id, type, status, payload)
         VALUES ($1, 'paid_bot_identity_reconcile', 'pending', $2)`,
        [userId, JSON.stringify({ userId, agentId: id })],
      );
    }
    const [call] = await query(
      `INSERT INTO wireline_call_logs (user_id, agent_id) VALUES ($1, $2) RETURNING id`,
      [userId, bot],
    );
    await query(`INSERT INTO wireline_appointments (user_id, agent_id) VALUES ($1, $2)`, [
      userId,
      bot,
    ]);
    await query(`INSERT INTO wireline_follow_up_tasks (user_id, agent_id) VALUES ($1, $2)`, [
      userId,
      bot,
    ]);
    await query(
      `INSERT INTO wireline_outbound_leads (user_id, agent_id, status) VALUES ($1, $2, 'New')`,
      [userId, bot],
    );
    await query(
      `INSERT INTO wireline_outbound_campaigns (user_id, agent_id, name, status) VALUES ($1, $2, 'Spring', 'running')`,
      [userId, bot],
    );
    await query(
      `INSERT INTO wireline_cadences (user_id, agent_id, name, steps, active) VALUES ($1, $2, 'Follow up', '[]', true)`,
      [userId, bot],
    );
    const [smsThread] = await query(
      `INSERT INTO wireline_sms_threads (user_id, agent_id, customer_number) VALUES ($1, $2, '+15125550142') RETURNING id`,
      [userId, bot],
    );
    await query(
      `INSERT INTO wireline_sms_messages (user_id, agent_id, thread_id, direction, body) VALUES ($1, $2, $3, 'inbound', 'Hi')`,
      [userId, bot, smsThread.id],
    );
    const [managed] = await query(
      `INSERT INTO wireline_email_accounts (user_id, agent_id, provider, email_address, oauth_granted_scopes)
       VALUES ($1, $2, 'agentmail', $3, 'managed-botbound') RETURNING id`,
      [userId, bot, mailbox],
    );
    await query(
      `INSERT INTO wireline_email_threads (user_id, account_id, agent_id) VALUES ($1, $2, $3)`,
      [userId, managed.id, bot],
    );
    await query(
      `INSERT INTO wireline_email_accounts (user_id, agent_id, provider, email_address)
       VALUES ($1, $2, 'microsoft', $3)`,
      [userId, bot, `owner-${userId}@example.test`],
    );
    await query(
      `INSERT INTO wireline_signal_presence (id, user_id, agent_id, started_at)
       VALUES ($1, $2, $3, now() - interval '3 hours')`,
      [`openai:stale-${userId}`, userId, bot],
    );
    await query(
      `INSERT INTO wireline_intake_keys (user_id, name, key_prefix, key_hash, default_agent_id)
       VALUES ($1, 'Website', 'wl_', $2, $3)`,
      [userId, randomUUID(), bot],
    );
    await query(
      `INSERT INTO wireline_computer_tasks (user_id, agent_id, goal, status) VALUES ($1, $2, 'Check hours', 'completed')`,
      [userId, bot],
    );
    return { userId, bot, other, botNumber, mailbox, callLogId: String(call.id) };
  }

  function fakeProviders(overrides: Partial<BotDeletionProviders> = {}) {
    const released: string[] = [];
    const erased: string[] = [];
    const webhooksDeleted: string[] = [];
    const providers: BotDeletionProviders = {
      async releaseNumber(userId, phoneNumber) {
        released.push(phoneNumber);
        // The real release retires the local row once the carrier confirms.
        await query(`DELETE FROM wireline_phone_numbers WHERE user_id = $1 AND phone_number = $2`, [
          userId,
          phoneNumber,
        ]);
        return { ok: true };
      },
      async eraseManagedMailboxes(mailboxes) {
        erased.push(...mailboxes.map((mailbox) => mailbox.emailAddress));
      },
      async deleteMailboxWebhooks(accountId) {
        webhooksDeleted.push(accountId);
      },
      async withProviderFence(_userId, perform) {
        return { result: await perform() };
      },
      ...overrides,
    };
    return { providers, released, erased, webhooksDeleted };
  }

  const count = async (table: string, where: string, values: unknown[]) =>
    Number((await query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, values))[0].n);

  it("releases the Bot's number and mailbox, keeps history, and leaves other Bots alone", async () => {
    const { userId, bot, other, botNumber, mailbox } = await seedAccount();
    const fake = fakeProviders();

    const preview = await service.previewBotDeletion(userId, bot);
    expect(preview).toEqual({
      name: "Front Desk",
      phoneNumbers: [botNumber],
      mailboxes: [mailbox],
      blockedBy: null,
    });

    await expect(service.deleteBot({ userId, agentId: bot }, fake.providers)).resolves.toEqual({
      phoneNumbersReleased: 1,
      mailboxesReleased: 1,
    });

    expect(fake.released).toEqual([botNumber]);
    expect(fake.erased).toEqual([mailbox]);
    expect(fake.webhooksDeleted).toHaveLength(1);

    expect(await count("wireline_agents", "user_id = $1", [userId])).toBe(1);
    for (const table of ["wireline_directives", "wireline_knowledge", "wireline_personality"]) {
      expect(await count(table, "agent_id = $1", [bot])).toBe(0);
      expect(await count(table, "agent_id = $1", [other])).toBe(1);
    }
    expect(await count("wireline_computer_tasks", "user_id = $1", [userId])).toBe(0);

    // History stays with the account, detached from the deleted Bot.
    for (const table of [
      "wireline_call_logs",
      "wireline_appointments",
      "wireline_follow_up_tasks",
      "wireline_outbound_leads",
      "wireline_sms_threads",
      "wireline_sms_messages",
    ]) {
      expect(await count(table, "user_id = $1 AND agent_id IS NULL", [userId])).toBe(1);
    }

    // The managed inbox and its email are gone; the owner's own mailbox stays.
    expect(await count("wireline_email_accounts", "user_id = $1", [userId])).toBe(1);
    expect(
      await count(
        "wireline_email_accounts",
        "user_id = $1 AND provider = 'microsoft' AND agent_id IS NULL",
        [userId],
      ),
    ).toBe(1);
    expect(await count("wireline_email_threads", "user_id = $1", [userId])).toBe(0);

    expect(await count("wireline_phone_numbers", "user_id = $1", [userId])).toBe(1);
    expect(await count("wireline_phone_numbers", "agent_id = $1", [other])).toBe(1);
    expect(await count("wireline_signal_presence", "user_id = $1", [userId])).toBe(0);
    expect(
      await count("wireline_cadences", "user_id = $1 AND active = false AND agent_id IS NULL", [
        userId,
      ]),
    ).toBe(1);
    expect(
      await count(
        "wireline_outbound_campaigns",
        "user_id = $1 AND status = 'paused' AND agent_id IS NULL",
        [userId],
      ),
    ).toBe(1);
    expect(
      await count("wireline_intake_keys", "user_id = $1 AND default_agent_id IS NULL", [userId]),
    ).toBe(1);
    expect(
      await count("wireline_settings", "user_id = $1 AND vapi_phone_inbound_agent_id IS NULL", [
        userId,
      ]),
    ).toBe(1);
    expect(
      await count("wireline_jobs", "user_id = $1 AND payload->>'agentId' = $2", [userId, bot]),
    ).toBe(0);
    expect(
      await count("wireline_jobs", "user_id = $1 AND payload->>'agentId' = $2", [userId, other]),
    ).toBe(1);
    expect(
      await count(
        "wireline_audit_log",
        "user_id = $1 AND event_type = 'agent.deleted' AND resource_id = $2",
        [userId, bot],
      ),
    ).toBe(1);
  });

  it.each([
    [
      "live_call",
      async (userId: string, bot: string) =>
        query(`INSERT INTO wireline_signal_presence (id, user_id, agent_id) VALUES ($1, $2, $3)`, [
          `openai:live-${userId}`,
          userId,
          bot,
        ]),
    ],
    [
      "live_call",
      async (userId: string, _bot: string, callLogId: string) =>
        query(
          `INSERT INTO wireline_jobs (user_id, type, status, payload) VALUES ($1, 'post_call_digest', 'pending', $2)`,
          [userId, JSON.stringify({ userId, callLogId })],
        ),
    ],
    [
      "outbound_call",
      async (userId: string, bot: string) =>
        query(
          `INSERT INTO wireline_outbound_leads (user_id, agent_id, status, call_id) VALUES ($1, $2, 'Dialing', $3)`,
          [userId, bot, `CA${"a".repeat(32)}`],
        ),
    ],
    [
      "computer_task",
      async (userId: string, bot: string) =>
        query(
          `INSERT INTO wireline_computer_tasks (user_id, agent_id, goal, status) VALUES ($1, $2, 'Book a table', 'running')`,
          [userId, bot],
        ),
    ],
  ] as const)("waits while the Bot is busy (%s) and releases nothing", async (block, makeBusy) => {
    const { userId, bot, callLogId } = await seedAccount();
    await makeBusy(userId, bot, callLogId);
    const fake = fakeProviders();

    expect((await service.previewBotDeletion(userId, bot)).blockedBy).toBe(block);
    await expect(service.deleteBot({ userId, agentId: bot }, fake.providers)).rejects.toMatchObject(
      {
        status: 409,
        code: "BOT_BUSY",
      },
    );
    expect(fake.released).toEqual([]);
    expect(fake.erased).toEqual([]);
    expect(await count("wireline_agents", "id = $1", [bot])).toBe(1);
  });

  it("keeps the Bot when the carrier does not confirm the number release", async () => {
    const { userId, bot } = await seedAccount();
    const fake = fakeProviders({
      async releaseNumber() {
        return { ok: false, error: "The carrier could not confirm release." };
      },
    });

    await expect(service.deleteBot({ userId, agentId: bot }, fake.providers)).rejects.toMatchObject(
      {
        status: 502,
        code: "NUMBER_RELEASE_FAILED",
      },
    );
    expect(fake.erased).toEqual([]);
    expect(await count("wireline_agents", "id = $1", [bot])).toBe(1);
    expect(await count("wireline_knowledge", "agent_id = $1", [bot])).toBe(1);
  });

  it("does not let one account delete another account's Bot", async () => {
    const owner = await seedAccount();
    const stranger = await seedAccount();
    const fake = fakeProviders();

    await expect(
      service.deleteBot({ userId: stranger.userId, agentId: owner.bot }, fake.providers),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.previewBotDeletion(stranger.userId, owner.bot)).rejects.toMatchObject({
      status: 404,
    });
    expect(fake.released).toEqual([]);
    expect(await count("wireline_agents", "id = $1", [owner.bot])).toBe(1);
  });
});
