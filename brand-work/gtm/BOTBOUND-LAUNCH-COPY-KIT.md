# BotBound Launch Copy Kit

Source review: September 20, 2026. Product baseline: `e31d23cabb6b37e967bdfc89647e2ec1ed56819c` (merged PR #1225). This describes source capabilities, not deployed availability. Vercel recovery and deployment remain launch blockers at this review.

The [September Refresh](../launch-2026-09-refresh/README.md) reconciles this kit with the September 15–19 Drive sales campaign and pilot notes. Sales remains a creative variant alongside the general product story and the incoming-call pilot focus.

## Message Hierarchy

| Purpose | Copy |
| --- | --- |
| Brand | Your Next Hire Is a Bot. |
| Category | Inbound & Outbound Bots |
| Channels | Bots for calls, texts, and email. |
| Current flagship | Stay in the Work. |
| Broad team variant | Small Team. Bigger Reach. |
| Second Ring variant | Hands Full? Bot on the Line. |
| Control | Your Bots. Your Rules. |
| Primary CTA | Start Free |
| Offer disclosure | Private testing free. Live use paid. |

Lead with a recognizable business moment, then explain what a Bot can handle. Use one headline, one short support line when needed, and one CTA. Author titles and headlines in Title Case; body copy uses sentence case. Keep setup instructions inside the product and partner support notes.

## Product Descriptions

**Micro:** Bots for calls, texts, and email.

**Short:** Bots for calls and follow-up, built around your business.

**Extended:** BotBound brings calls, texts, and email into one workspace. Each Bot works from your business knowledge and rules, with configured actions, approvals, and handoffs. Free Builder supports one private draft Bot and bounded rehearsal. Paid plans add live Bot capacity, a dedicated number and managed email identity for each active Bot, and included usage. Activation depends on availability and account eligibility.

## Preserved Sales Campaign

The September Drive campaign **Your Next Sales Hire**, with its **Give Sales a Hand** extension, remains an audience-specific variant. “Sales hire” is a metaphor for software, not a staffing or human-equivalence claim.

| Purpose | Copy |
| --- | --- |
| Category | AI Sales Bots |
| Invitation | Meet Your Next Sales Hire. |
| Owner story | Give Sales a Hand. |
| Control | Your Offer. Your Voice. Your Rules. |
| Capability | Answer questions, qualify interest, and help book the next step. |
| CTA | Start Free |
| Disclosure | Private testing free. Live use paid. |

Do not present “Every Lead. A Next Step.” as an outcome guarantee. Deal memory, adaptive plans, quote assistance, daily decision briefs, and complete sales-cycle autonomy remain proposed concepts until their exact behavior is shipped and verified. Outbound-specific distribution still requires readiness approval.

## First Design-Partner Kit

Start the pilot with incoming calls and one configured, permitted follow-up. A narrow pilot scope is not a product-wide limit on Bots.

| Piece | Source | Purpose |
| --- | --- | --- |
| Hero still | Current reviewed refresh or Hands Full export | Recognizable owner problem |
| Founder post | [Refresh copy](../launch-2026-09-refresh/COPY-KIT.md) | Explain the product and invite interest |
| Product evidence | Exact deployed-source labeled test call and outcome | Show the real workflow once verified |
| One-pager | [Investor source](../launch-2026-09/investor/BOTBOUND-INVESTOR-ONE-PAGER.md) and reviewed PDF | Explain model and pilot posture |
| Setup/support note | Template below | Agree the job, handoff, and support path |

### Partner Setup and Support Note

**Subject:** Your Front Desk Bot

Hi [first name],

Let's start with [business]'s incoming calls and [one agreed next step].

Build free at `https://botbound.me/signup?plan=free`. Add your hours, services, common questions, and when the Bot should hand off. We'll rehearse privately before directing customer calls to it.

I'll confirm activation, routing, and a labeled test call with the expected follow-up and Inbox record before live use. Free setup can continue while activation is unavailable.

For help, reply or email `support@botbound.me` with the Bot name, what you expected, and the issue time. Do not send passwords, payment details, or private customer conversations. Keep your existing contact path available during the pilot.

[Founder name]

Internal note: confirm signup and support work before sending. This is a draft, not evidence that onboarding or routing is complete.

## Founder Post

Stay in the work.

The phone rings while you're with a customer, making the product, or finishing the job.

I built BotBound for that moment: Bots for calls, texts, and email, shaped around your business and your rules.

Start free: `https://botbound.me/signup?plan=free`

Private testing free. Live use paid. Activation subject to availability.

## Launch Email

**Subject:** Give the Phone a Bot

**Preheader:** Calls and follow-up, built around your business.

The phone rarely waits for a good moment.

BotBound gives you Bots for calls, texts, and email, with your knowledge, your rules, and a clear way to hand things back to you.

**Start Free:** `https://botbound.me/signup?plan=free`

Private testing free. Live use paid. Activation subject to availability.

## Press and Partner Description

BotBound gives owner-led businesses configurable Bots for calls, texts, and email. Each Bot works from the business's knowledge and rules, with owner controls, configured actions, and a shared outcome record. The company is preparing a controlled design-partner pilot. Free Builder supports private setup and rehearsal; paid plans add live capacity when activation is available.

Keep this as preparation copy while the destination or production gates remain blocked. [PR and Creator Outreach](../launch-2026-09/copy/PR_AND_CREATOR_OUTREACH.md) contains drafts only.

## Film and Product Captions

Use **Hands Full? Bot on the Line.** or **Your Next Hire Is a Bot.** as publishing copy. Any film with retired copy, public setup steps, or stale UI must be updated and reviewed before reuse. New captions do not repair old pixels.

Accessibility captions must describe the actual audio and meaningful sounds. Do not add invented Bot/customer dialogue to a music-only film. The Second Ring original has score, ring, and chime without spoken voice. Selling voice quality requires an actual, labeled Bot-audio demonstration.

A claimed booking, reply, or other result needs a verified labeled test record or a visibly labeled configured example. No general “Answered. Booked. Confirmed.” proof rail without that context.

## CTA and Destination

| Intent | CTA | Destination | Boundary |
| --- | --- | --- | --- |
| Free start | Start Free | `/signup?plan=free` | Private draft and rehearsal; no live number |
| Role discovery | Explore Bots | `/showcase` | No public audio demo |
| Product explanation | See Features | `/features` | Capabilities and owner controls |
| Pricing | See Pricing | `/pricing` | Catalog price is not activation evidence |
| Role signup | Start Free | `/signup?plan=free&template=[verified-template-key]` | Verify the supported key before publishing |
| Partner discussion | Get in Touch | `/contact` | Confirm the contact path works |

Use **Build and Test Free** only with an account-required private rehearsal destination. Do not use **Book a Demo** for self-serve signup. Purchase CTAs require current `/api/billing/plans` evidence for the selected plan and interval.

## Tracking

New September refresh: `utm_campaign=bb_launch_refresh_202609`.

Use lowercase platform names for `utm_source`; `organic_social`, `paid_social`, `email`, or `partner` for `utm_medium`. Add a descriptive `utm_content` without personal data. Preserve historical campaign names on historical links.

Example: `https://botbound.me/signup?plan=free&utm_source=linkedin&utm_medium=organic_social&utm_campaign=bb_launch_refresh_202609&utm_content=stay_in_the_work_feed`

Current signup intent retains source, medium, and campaign, not `utm_content`. Do not report creative-level signup attribution from that field. Use separately named campaigns for separately measured tests.

## Product and Claim Boundaries

- Free Builder includes one private draft Bot and bounded simulation. It does not include a production number or customer conversations.
- Source catalog: Starter $19/month or $190/year, 50 voice minutes; Starter Plus $39/month or $390/year, 100 minutes; Pro $79/month or $790/year, 190 minutes. Recheck live catalog and activation state before publication.
- Every active paid Bot gets its own number and managed email identity within plan capacity; unused capacity does not pre-provision numbers.
- Actions depend on configured tools, permissions, approvals, and handoffs. An imported or reviewed list does not itself authorize outreach.
- Outbound campaign promotion remains held until `outbound_campaign_ready` and the exact audience, destination, copy, and asset are approved.
- No guaranteed bookings, revenue, availability, every-call coverage, invented results, or unsupported customer counts and testimonials.
- Generated scenes are illustration. Historical screenshots and local synthetic-data previews are not current deployed product proof.
- No public setup-step lists or competing process slogans. No “One Bot” headline suggesting a product-wide limit.

## Publication Check

Review the final asset and caption together: current copy, Title Case, readable crop, correct CTA, working destination, accurate offer, required example labels, and recorded provenance. Product proof must match the exact deployed source. Record the final file hash and placement. Paid distribution additionally requires the explicit media budget and operational gates in [Paid Media and Placement Notes](../launch-2026-09/copy/PAID_MEDIA_AND_PLACEMENT_NOTES.md).

## Source Map

- Product and surface availability: `../../README.md`
- Catalog and usage: `../../src/lib/plan-catalog.ts`
- Signup attribution: `../../src/lib/signup-intent.ts`
- Voice roster: `../../src/lib/voice-catalog.ts`
- Positioning authority: `../../docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`
- Identity and typography: `../BOTBOUND-BRAND-GUIDE.md`
- Current asset selection: `../CURRENT-ASSET-INDEX.md`
- Operational launch status: `../../docs/FOUNDER_LAUNCH_COMMAND_CENTER.md`
