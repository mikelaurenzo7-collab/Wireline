# AgentMail Production Activation

Status: **Active production runbook**. This is the operator path for BotBound-managed paid Bot
mailboxes. It covers the shared platform domain, not transactional product email sent through
Resend.

## Production boundary

BotBound provisions each eligible paid Bot a managed AgentMail inbox. Production requires:

- `AGENTMAIL_API_KEY`: a server-only, organization-scoped AgentMail key;
- `AGENTMAIL_DEFAULT_DOMAIN`: exactly `botbound.me` or a verified BotBound subdomain such as
  `bots.botbound.me`; and
- no `AGENTMAIL_WEBHOOK_SECRET`: BotBound creates an endpoint per mailbox account and stores its
  AgentMail/Svix signing secret encrypted on that account row.

Keep both variables production-only. Preview and development must not receive the live key. New
managed mailboxes never fall back to AgentMail's shared `@agentmail.to` domain; provisioning fails
closed when the key or verified BotBound domain is unavailable.

Only Stripe `active` subscriptions enter the combined phone-and-mail identity lane. Stripe
`trialing`, Free Builder, inactive, past-due, and canceled states do not allocate a carrier number
or durable managed mailbox.

## Provider capacity and future email trials

Provider capacity is an operational concern, not a customer entitlement or a product-level lock.
For every active paid purchase, BotBound attempts to create the managed inbox first and then the
phone number. If AgentMail rejects provisioning because the provider account needs more capacity,
the durable job remains retryable; upgrade the AgentMail plan or add capacity, then retry without a
code or customer-plan change.

At launch, Free Builder receives private call and email workflow simulation only. Do not enable a
real-email trial until all of these controls exist and are tested together:

- automatic mailbox expiration and provider cleanup;
- a per-user send/receive limit and abuse controls;
- a global concurrent-trial ceiling below the AgentMail plan's available inbox inventory;
- capacity alerts before the ceiling is reached; and
- an email-only entitlement that can never provision a phone number.

When the AgentMail tier is upgraded, confirm the new inbox allowance in the provider dashboard and
repeat the send, reply, inbound-webhook, bounce, complaint, and cleanup proofs below. Do not promise
trial inventory merely because additional provider capacity exists.

## 1. Prepare the AgentMail organization

1. Use an AgentMail plan that supports custom domains. AgentMail currently documents custom
   domains as a Developer-plan-and-above feature.
2. Create an organization-scoped key. The readiness probe requires these permissions:
   `inbox_read`, `inbox_create`, `inbox_delete`, `message_read`, `message_send`, `webhook_read`,
   `webhook_create`, `webhook_delete`, and `domain_read`.
3. Do not use an inbox-scoped or pod-scoped key. Keep the previous working organization key active
   until the replacement has passed the complete proof below.

## 2. Add and verify the BotBound domain

Prefer a dedicated subdomain such as `bots.botbound.me` when changing the apex MX records could
interfere with an existing human mailbox provider.

1. In AgentMail Console, open **Domains**, choose **Add Domain**, and enter the exact intended
   domain.
2. Export/download the zone file when the DNS provider supports import. Otherwise add every record
   AgentMail returns, copying type, host/name, value, priority, and TTL exactly. Do not invent or
   normalize record values.
3. For sending and receiving, publish the returned SPF, DKIM, DMARC, and MX records. If the domain
   already has SPF, merge AgentMail's authorization into the existing SPF policy instead of
   publishing a second SPF record.
4. Wait for DNS propagation, then choose **Verify Domain** in AgentMail. Do not proceed until the
   AgentMail status is `VERIFIED`.

AgentMail's current references are [custom-domain setup](https://docs.agentmail.to/knowledge-base/custom-domain-setup),
[domain creation and returned DNS records](https://docs.agentmail.to/api-reference/domains/create),
and [domain verification](https://docs.agentmail.to/api-reference/domains/verify).

## 3. Configure and verify production

1. Set `AGENTMAIL_API_KEY` and `AGENTMAIL_DEFAULT_DOMAIN` in the canonical Vercel project's
   **Production** environment only.
2. Redeploy the intended `main` commit. The deployment boundary rejects a missing key, a missing
   domain, or a domain outside `botbound.me` and its subdomains.
3. In a secure shell with the production environment loaded, run the read-only vendor probe:

   ```bash
   npm run vendor:readiness
   ```

4. Require the AgentMail result to be `ready`. The probe confirms that the key is accepted and
   organization-scoped, the required permissions exist, the configured domain belongs to that
   organization, and its detailed status is `VERIFIED`.
5. Use one controlled founder Bot to prove outbound send, external delivery, reply, inbound
   receipt, signed `message.received` webhook processing, and inbox visibility. Verify bounce and
   complaint behavior before scaling mail volume.

AgentMail signs webhooks with Svix headers. BotBound verifies the raw request against the encrypted
per-account secret; never replace this with a shared unverified receiver. See AgentMail's
[webhook verification guidance](https://docs.agentmail.to/webhook-verification).

## 4. Reconcile existing paid Bots

First inspect without external writes:

```bash
npx tsx scripts/reconcile-paid-bot-identities.mts
```

An exit code of `2` means the dry run found paid Bots missing a phone or managed mailbox. Review the
reported Bot IDs before applying anything. The apply mode can provision both Twilio phone numbers
and AgentMail inboxes, so use it only after both vendors are production-ready and the candidate set
is expected:

```bash
npx tsx scripts/reconcile-paid-bot-identities.mts --apply
```

Re-run the dry run afterward and require zero missing identities. For each active mailbox, confirm
the stored webhook targets `https://botbound.me/api/webhooks/agentmail/:accountId`; send one inbound
message to prove the endpoint and its stored signing secret. Keep legacy callback registrations
until production evidence shows they are no longer needed.

## Customer-owned domains

The global `AGENTMAIL_DEFAULT_DOMAIN` is BotBound infrastructure. Never replace it with one
customer's domain.

A customer who wants `bot@theircompany.com` uses the tenant-owned/custom-domain lane:

1. Confirm the customer controls the domain and approves the sending and receiving use.
2. Prefer a dedicated subdomain to avoid disrupting existing corporate mail.
3. Add the domain in the customer's AgentMail organization and use AgentMail's zone-file export or
   provider-specific copy instructions. If the customer cannot edit DNS, give the exact generated
   records to their registrar or IT administrator; BotBound cannot verify a domain without an
   authorized DNS change.
4. Wait for `VERIFIED`, create the intended inbox, then connect that verified inbox through the
   advanced AgentMail connection path. Never ask a customer to paste a production API key into
   ordinary support email or chat.
5. Prove send, receive, reply, bounce, complaint, and signed inbound webhook behavior before using
   the address for live work.

Until self-serve domain onboarding and DNS-status guidance have their own release proof, treat this
as a support-led advanced setup. The default paid-Bot experience remains automatic on BotBound's
verified managed domain.

## Legacy mail fallback and cutover

`support@botbound.me` completed its production-domain cutover on 2026-08-29. AgentMail accepted
the mailbox on the verified domain, Gmail received its outbound test, and the Gmail reply arrived
in the same AgentMail thread. `security@botbound.me` and `dmarc@botbound.me` were created on the
same domain. Customer, legal, connector, and Stripe surfaces should use these BotBound identities.

`noreply@trywireline.com` and the existing unsubscribe identity remain Resend compatibility
lanes until their sender, bounce, complaint, and unsubscribe proofs are complete. That fallback is
not permission to create new paid Bot mailboxes on a provider-branded or unverified domain. See
`docs/BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md` for the coordinated origin and provider gates.

## Rollback

1. Stop new managed-mailbox provisioning and do not run reconciliation with `--apply`.
2. Restore the previous known-good organization key and verified BotBound domain in Production,
   then redeploy. If no known-good managed-mail configuration exists, keep paid managed email and
   launch blocked rather than setting placeholder values.
3. Do not delete the prior key, domain, inboxes, DNS records, or webhook registrations while
   messages or callbacks may still depend on them.
4. Re-run `npm run vendor:readiness`, then the reconciliation dry run. Resume provisioning only
   after the vendor probe is ready and the controlled send/receive/webhook proof passes again.
5. Keep the verified legacy support/Resend mail path active until the BotBound-domain replacement
   independently passes its cutover gate.
