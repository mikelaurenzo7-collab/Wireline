# AgentMail Production Activation

Status: **botbound.app cutover in progress**
Last reconciled: **September 25, 2026**

AgentMail hosts BotBound-managed inboxes. Resend sends transactional product email. Google Workspace is not required and is not part of this deployment.

## Domain transition

The new target is `botbound.app` with `bots.botbound.app` for paid Bot identities. Configure and verify the new DNS records before changing `AGENTMAIL_DEFAULT_DOMAIN` on Render. The intended shared addresses are `support@botbound.app`, `security@botbound.app`, `dmarc@botbound.app` and `unsubscribe@botbound.app`.

Historical delivery proof from August 31, 2026 applies to `botbound.me` and `bots.botbound.me`: support inbound and replies, DMARC reports, and Resend sending were verified then. That evidence does not establish delivery on the new domain. Preserve existing inboxes and messages; inspect stored account identities before any mailbox migration. Existing webhook URLs require individual reconciliation with the new public origin and their stored signing secrets.

Require fresh domain verification, inbound support delivery, a same-thread reply, transactional delivery and unsubscribe handling on `botbound.app` before opening paid email provisioning or checkout. Neither `botbound.me` nor `trywireline.com` is a fallback for new paid Bot identities.

## Production boundary

BotBound provisions each eligible paid Bot a managed AgentMail inbox. Production requires:

- `AGENTMAIL_API_KEY`: server-only and organization-scoped;
- `AGENTMAIL_DEFAULT_DOMAIN`: exactly `botbound.app` or a verified BotBound subdomain such as `bots.botbound.app`;
- no shared `AGENTMAIL_WEBHOOK_SECRET`: BotBound creates a webhook per mailbox account and stores its AgentMail/Svix signing secret encrypted on that account row.

Keep AgentMail credentials Production-only. Preview and development must not receive the live key. New managed mailboxes fail closed when the key, required permissions, or verified BotBound domain is unavailable. They never fall back to `@agentmail.to`.

Only Stripe `active` subscriptions enter the combined paid phone-and-mail identity lane. Free Builder, `trialing`, inactive, past-due, and canceled states do not allocate a carrier number or durable managed mailbox.

## Readiness verification

From a secure operator environment loaded with the canonical Production configuration, run:

```bash
npm run vendor:readiness
```

Require AgentMail status `ready`. The probe must confirm:

- the API key is accepted and organization-scoped;
- required inbox, message, webhook, and domain permissions exist;
- the configured default domain belongs to the organization;
- the domain status is `VERIFIED`;
- the default domain is under `botbound.app`.

The release-wide read-only provider gate is:

```bash
WIRELINE_RECONCILE_STRIPE_PORTAL=true \
  node scripts/run-release-provider-preflight.mjs
```

Do not place inbox creation, message sending, or webhook mutation inside a deployment build.

## Paid Bot identity reconciliation

Inspect first without provider writes:

```bash
npx tsx scripts/reconcile-paid-bot-identities.mts
```

Exit code `2` means active paid Bots are missing a phone or managed mailbox. Review the exact Bot IDs and provider readiness before applying anything.

Customers first choose an exact available number in Phone setup. Apply mode repairs an already-owned Twilio line and provisions its AgentMail inbox; it never chooses or purchases a new number:

```bash
npx tsx scripts/reconcile-paid-bot-identities.mts --apply
```

Use `--apply` only when all of the following are true:

1. the Stripe subscription is real, active, and owned by the authenticated BotBound user;
2. the intended Bot is durable in the database;
3. AgentMail and Twilio production readiness passed;
4. provider capacity exists;
5. the candidate set is expected and reviewed;
6. rollback and cleanup ownership are assigned.

Re-run the dry run afterward and require zero missing identities. For each active mailbox, verify the stored webhook targets:

```text
https://botbound.app/api/webhooks/agentmail/:accountId
```

Then prove signed inbound delivery using a controlled non-sensitive message.

## Webhook security

AgentMail signs webhooks with Svix headers. BotBound verifies the raw request body against the encrypted per-account secret. Never replace this with an unsigned shared receiver or a single global secret.

Webhook and application logs may contain only redacted addresses, message IDs, status, timestamps, and operational classifications. Do not log message bodies, attachments, provider keys, or signing secrets.

## Capacity and trial policy

Provider capacity is an operating constraint, not a customer entitlement. When AgentMail rejects provisioning because account capacity is exhausted, keep the durable job retryable, add capacity deliberately, and retry without silently changing the customer's plan.

Free Builder currently receives private email-workflow simulation only. Do not enable a real-email trial until automatic expiration, provider cleanup, per-user send/receive limits, abuse controls, a global concurrent-trial ceiling, capacity alerts, and a phone-independent email entitlement are all implemented and tested together.

## Customer-owned domains

`AGENTMAIL_DEFAULT_DOMAIN` is BotBound infrastructure. Never replace it with one customer's domain.

Customer-owned mail remains a support-led advanced setup:

1. confirm the customer controls the domain and authorizes sending and receiving;
2. prefer a dedicated subdomain to avoid disrupting existing corporate mail;
3. publish exactly the provider-generated MX, SPF, DKIM, and DMARC records;
4. merge SPF authorization into the existing record instead of creating multiple SPF records;
5. wait for `VERIFIED` before creating the inbox;
6. connect the verified inbox through the tenant-owned AgentMail path;
7. prove send, receive, reply, signed inbound webhook, bounce, complaint, unsubscribe, and cleanup behavior before live use.

Never request a customer's production API key through ordinary email or chat.

## Operational routine

Daily or alert-driven operations should include:

- triage `support@botbound.app` and preserve response ownership;
- review `security@botbound.app` without forwarding sensitive material into unsecured channels;
- process DMARC reports and investigate authentication regressions;
- process unsubscribe requests promptly and verify suppression state;
- monitor AgentMail capacity and failed identity jobs;
- monitor Resend bounces, complaints, suppressions, and webhook delivery;
- rerun the read-only vendor preflight before a launch-affecting release.

## Rollback

1. Stop new mailbox provisioning and do not run reconciliation with `--apply`.
2. Restore only a known-good organization key and verified BotBound domain in Production, then redeploy the intended exact SHA.
3. Do not delete prior keys, DNS records, inboxes, or webhook registrations while messages or callbacks may still depend on them.
4. Rerun `npm run vendor:readiness` and the reconciliation dry run.
5. Resume provisioning only after the controlled send, receive, reply, signed webhook, and cleanup proof passes again.
6. Use the verified legacy sender only as an explicit rollback action; never reintroduce it as an implicit code fallback.

See [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) for the complete release sequence and [BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md](./BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md) for coordinated origin and callback controls.
