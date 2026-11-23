import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, asTenant, createUser } from "./helpers";

// The app's own pool and tenant scope, pointed at the test database by
// vitest.db.config.ts, so this exercises the production code path.
const { tenantStore } = await import("../../src/lib/server-context");
const { updatePreferenceEnvelope } = await import("../../src/lib/preference-envelope");

const pool = adminPool();
let owner = "";

beforeAll(async () => {
  owner = await createUser(pool, "envelope");
});
afterAll(() => pool.end());

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readEnvelope(userId: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    "SELECT preferences FROM wireline_user_preferences WHERE user_id = $1",
    [userId],
  );
  return (rows[0]?.preferences ?? {}) as Record<string, unknown>;
}

describe("concurrent writers of one preferences envelope", () => {
  it("keeps both changes when two features write at the same time through the lock", async () => {
    await Promise.all([
      tenantStore.run(owner, () =>
        updatePreferenceEnvelope(owner, async (envelope) => {
          await pause(250); // hold the read while the other writer arrives
          envelope.company_identity = { website: "https://ridge.example" };
        }),
      ),
      tenantStore.run(owner, async () => {
        await pause(50);
        return updatePreferenceEnvelope(owner, (envelope) => {
          envelope.missed_call_text_back = { enabled: true };
        });
      }),
    ]);
    const envelope = await readEnvelope(owner);
    expect(envelope.company_identity).toEqual({ website: "https://ridge.example" });
    expect(envelope.missed_call_text_back).toEqual({ enabled: true });
  });

  it("detects the lost update the lock prevents (the harness can see the race)", async () => {
    const racer = await createUser(pool, "unlocked");
    const unlockedWrite = (key: string, delayMs: number) =>
      asTenant(pool, racer, async (c) => {
        const { rows } = await c.query(
          "SELECT preferences FROM wireline_user_preferences WHERE user_id = $1",
          [racer],
        );
        const envelope = { ...((rows[0]?.preferences as object) ?? {}) } as Record<string, unknown>;
        await pause(delayMs);
        envelope[key] = true;
        await c.query(
          `INSERT INTO wireline_user_preferences (user_id, preferences) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences`,
          [racer, JSON.stringify(envelope)],
        );
      });
    await Promise.all([unlockedWrite("first", 250), unlockedWrite("second", 0)]);
    const envelope = await readEnvelope(racer);
    // Without the lock one writer's change is silently undone.
    expect(Object.keys(envelope)).toHaveLength(1);
  });
});
