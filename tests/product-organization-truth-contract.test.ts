import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

/*
 * Launch invariant: an unavailable read must never impersonate an empty account,
 * and each billing job must have one obvious action surface. These are product
 * truth contracts rather than cosmetic snapshots because false setup CTAs and
 * duplicate money controls can create real customer/account mistakes.
 */
describe("product organization truth contracts", () => {
  it("does not render mailbox status outages as disconnected providers", () => {
    const mailboxes = source("src/components/MailboxConnectionCard.tsx");
    expect(mailboxes).toContain("statusUnavailable");
    expect(mailboxes).toContain("setStatusUnavailable(true)");
    expect(mailboxes).toContain("Inbox connection status unavailable");
    expect(mailboxes).toContain("No connection state was changed.");
    expect(mailboxes).toContain("statusUnavailable ? (");
  });

  it("distinguishes an unavailable inbox from a healthy empty inbox", () => {
    const inbox = source("src/components/EmailInbox.tsx");
    expect(inbox).toContain("threads.length === 0 && error");
    expect(inbox).toContain('title="Inbox unavailable"');
    expect(inbox).toContain('title="No email conversations yet"');
    expect(inbox).toContain("Your mailbox connection was not changed.");
    expect(inbox).not.toContain('title="Connect your inbox"');
  });

  it("gives Billing one plan surface and one balance top-up surface", () => {
    const billing = source("src/pages/BillingSettings.tsx");
    const stripeCard = source("src/components/StripeBillingCard.tsx");

    expect(billing).toContain("<StripeBillingCard showBalanceTopUp={false} />");
    expect(billing.match(/CONVERSATION_BALANCE_PRESETS_USD\.map/g)).toHaveLength(1);
    expect(billing).toContain("plan.included_phone_numbers");
    expect(billing).not.toContain("Manage in Stripe");
    expect(billing).not.toContain("View invoices and payment method");
    expect(billing).not.toContain('text-eyebrow text-muted-foreground">Subscription');
    expect(billing).not.toContain('text-eyebrow text-muted-foreground">Current plan');

    expect(stripeCard).toContain("showBalanceTopUp?: boolean");
    expect(stripeCard).toContain("showBalanceTopUp ? (");
    expect(stripeCard).toContain("{canAddBalance && <CreditTopUpCard");
    expect(stripeCard).toContain("Manage subscription");
    expect(stripeCard).not.toContain(">Manage plan<");
    expect(stripeCard).not.toContain("Open billing portal");
  });
});
