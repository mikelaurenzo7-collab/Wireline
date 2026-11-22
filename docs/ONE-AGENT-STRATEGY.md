# BotBound One-Product Strategy

Status: Active product direction. Current commercial terms are owned by [Usage Billing](USAGE_BILLING.md) and `src/lib/usage-billing-catalog.ts`; legacy subscriptions retain their own contracts.

## Decision

BotBound leads with one clear promise:

> Your Bot for calls, email, and supervised browser work.

Customers start with the job, not an audience classification. One Bot can carry
the conversation across channels under shared knowledge, rules, approvals, and
memory. SMS retains its sender and recipient permission gates. Role templates change
the Bot's job; they do not create separate products, account modes or backend policies.

**One Bot, one line, one inbox per business is the default.** The Bot takes on more
work through tasks (answer questions, take messages, book appointments, text and email
follow-ups, web work), which turn on bundles of its actions (`src/lib/bot-tasks.ts`).
More Bots are not the way to add work. Carrier registration fits this shape: each
business needs its own A2P Brand and campaign, a Sole Proprietor brand allows one
texting number, and caller reputation builds on one number.

The workspace offers another Bot only to a workspace with none, or to one that already
runs several (`src/lib/bot-roster-policy.ts`). Settings > Advanced keeps "Add another
Bot" for a separate business identity. The server keeps no Bot cap, so API, MCP and
existing multi-Bot workspaces are unchanged. The current Shared Work offer has no
per-Bot charge; included numbers, email addresses, work allowances and execution
limits remain finite. Retained channel packages keep their saved Bot limits. Never infer
an extra-Bot charge from a historical package.

## Focus and expansion

The web workspace is the primary product. Make the first useful call, requested email
or supervised browser task complete with a visible outcome and a recoverable failure.
BotBound owns its conversation, People, appointments, approvals and work history;
external adapters connect an existing customer tool when that tool is actually needed.
An adapter does not require every customer or the founder to subscribe to its vendor.

Browser and MCP clients reuse that workspace's server policy. Native iOS and Android
retain their documented release gates. Hands-free is an opt-in input method; physical
Bluetooth and Meta acceptance remain separate evidence. New mobile frameworks,
standalone dashboards, speculative integrations, live video and voice-cloning expansion
do not take priority over proving the core workflows. The current next-work queue is
[the design master plan](design/master-plan.md); [Client surfaces](CLIENT_SURFACES.md)
owns client release boundaries.

## Positioning rules

| Context                      | Preferred language                                            |
| ---------------------------- | ------------------------------------------------------------- |
| Broad public marketing       | Bot or Phone Bot                                              |
| Workspace                    | Bot, Bots, workspace                                          |
| Role proof                   | Front Desk, Sales Rep, Support, Scheduler, Personal Assistant |
| Channel selection            | Calls, Email, SMS; activate only channels that are ready      |
| CTA                          | Build Your Bot                                                |
| Technical code and contracts | agent and stable legacy identifiers                           |

## Launch copy

Use:

> Your Bot for calls, email, and supervised browser work.

> Paid plans only. Shared work starts at $12/month.

> Start with one job. Choose the channels you need.

Use the current rate card for allowances, identity capacity, add-ons and spending caps.
Extra numbers and email addresses are paid identities; creating another Bot is not an
extra-Bot subscription. Retained Calls-only and Email-only packages do not acquire
each other's identities merely because the public offer changed.

Avoid:

> Personal or Business?

> AI employees for calls, texts, and email.

> Separate Personal and Business workspaces.

## Product doctrine

Public marketing describes capabilities and outcomes with a clear signup action. It does not prescribe a setup sequence.

Bots use the owner's knowledge, tone, rules, tools, approvals, and handoffs. Private testing and channel activation remain operational guidance inside the product, subject to account capacity. Logged conversations, outcomes, and follow-up remain available for review.

## Success metric

Measure activation from a genuine new account: first Bot, successful private rehearsal,
first eligible live outcome, failures and founder support time. A target of 70% reaching
a successful private rehearsal within five minutes is a goal to measure, not an adoption
claim. Do not add another product or client merely to improve a demo.
