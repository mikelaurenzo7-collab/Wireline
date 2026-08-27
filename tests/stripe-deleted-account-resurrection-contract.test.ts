import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("late Stripe events cannot resurrect a deleted account", () => {
  it("proves subscription metadata belongs to a live user before repairing the mirror", () => {
    const source = read("src/lib/stripe-helpers.ts");
    const sync = source.slice(source.indexOf("export async function syncSubscriptionFromStripe"));
    const metadata = sync.indexOf("const metadataUserId");
    const liveness = sync.indexOf("await stripeOwnerUserExists(metadataUserId)", metadata);
    const repair = sync.indexOf(".insert(schema.subscriptions)", metadata);

    expect(metadata).toBeGreaterThan(-1);
    expect(liveness).toBeGreaterThan(metadata);
    expect(repair).toBeGreaterThan(liveness);
    expect(sync).toContain("await stripeOwnerUserExists(existing.userId)");
    expect(sync).toContain("ignoring late subscription for deleted account");
  });

  it("gates settled plan, add-on, and Runtime Balance fulfillment before mutation", () => {
    const source = read("src/lib/stripe-checkout-fulfillment.ts");
    const planOwner = source.indexOf("await checkoutOwnerStillExists(session, userId)");
    const liveVideo = source.indexOf("resolveCurrentLiveVideoCheckoutEntitlement", planOwner);
    const planRetrieve = source.indexOf("stripe.subscriptions.retrieve", planOwner);
    const topUpBranch = source.indexOf('session.metadata?.purpose !== "credit_topup"');
    const topUpOwner = source.indexOf(
      "await checkoutOwnerStillExists(session, userId)",
      topUpBranch,
    );
    const walletCredit = source.indexOf("await addCredit", topUpBranch);

    expect(planOwner).toBeGreaterThan(-1);
    expect(liveVideo).toBeGreaterThan(planOwner);
    expect(planRetrieve).toBeGreaterThan(planOwner);
    expect(topUpOwner).toBeGreaterThan(topUpBranch);
    expect(walletCredit).toBeGreaterThan(topUpOwner);
    expect(source).toContain("ignoring late event for deleted account");
  });

  it("keeps a database-level cascade guard in both canonical schema declarations", () => {
    for (const path of ["src/db/schema.ts", "src/db/schema-base.ts"]) {
      const source = read(path);
      const declaration = source.slice(source.indexOf('pgTable("wireline_subscriptions"'));
      expect(declaration).toMatch(
        /userId: uuid\("user_id"\)[\s\S]{0,120}\.references\(\(\) => users\.id, \{ onDelete: "cascade" \}\)/,
      );
    }
  });
});
