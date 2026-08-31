# AgentMail Production Activation

Status: **Active and verified**  
Last reconciled: **August 31, 2026**

This runbook covers BotBound-managed AgentMail inboxes for paid Bots. Transactional product email is sent through Resend and follows the same `botbound.me` identity, but it is a separate provider plane.

## Verified production state

- `botbound.me` and `bots.botbound.me` are verified BotBound domains.
- The intentional shared mailboxes are `support@botbound.me`, `security@botbound.me`, `dmarc@botbound.me`, and `unsubscribe@botbound.me`.
- Gmail-to-support inbound delivery works.
- Support reply delivery works in the same AgentMail thread.
- Google DMARC aggregate reports reach the dedicated DMARC inbox.
- The placeholder AgentMail inbox has been removed.
- Resend has a verified `botbound.me` sending domain and an enabled negative-delivery webhook.
- Production transactional fallback is `BotBound <noreply@botbound.me>`.
- `trywireline.com` may remain verified only as a deliberate rollback asset. It is not the runtime fallback and must not be used for new paid Bot identities.

## Production boundary

BotBound provisions each eligible paid Bot a managed AgentMail inbox. Production requires:

- `AGENTMAIL_API_KEY`: server-only and organization-scoped;
- `AGENTMAIL_DEFAULT_DOMAIN`: exactly `botbound.me` or a verified BotBound subdomain such as `bots.botbound.me`;
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
- the default domain is under `botbound.me`.

The release-wide read-only provider gate is:

```bash
WIRELINE_RECONCILE_STRIPE_PORTAL=true \
  node scripts/run-release-provider-preflight.mjs
```

Do not place inbox creation, message sending, or webhook mutation inside a Vercel build.

## Paid Bot identity reconciliation

Inspect first without provider writes:

```bash
npx tsx scripts/reconcile-paid-bot-identities.mts
```

Exit code `2` means active paid Bots are missing a phone or managed mailbox. Review the exact Bot IDs and provider readiness before applying anything.

Apply mode can provision both Twilio phone numbers and AgentMail inboxes:

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
https://botbound.me/api/webhooks/agentmail/:accountId
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

- triage `support@botbound.me` and preserve response ownership;
- review `security@botbound.me` without forwarding sensitive material into unsecured channels;
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
