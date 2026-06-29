# 2026-06-29 Design Migration Regroup

## Inputs reviewed

- Uploaded ZIP: `Wireline Agent Creation Platform-handoff.zip`
- Current target screenshots: Overview, Call Simulator, Agent Studio Canvas, Flow Composer
- Recently merged mainline work since the `studio-agents-overview` merge
- Production support surfaces: GitHub main, Vercel production deployment history, Supabase schema, Stripe product/price catalog

## What the migration is optimizing for

1. **Exact quiet layout language from the handoff** — letterpress typography, off-white canvas, pale green active states, tight cards, minimal copy.
2. **Agent language everywhere** — the old Assistants mental model is retired except where the prototype itself used it as source text.
3. **Personal + business separation** — users should see both lanes clearly without needing a separate Agents page.
4. **Fast activation** — creation should feel like the prototype Fast Start, not a settings form.
5. **Commercial clarity** — Stripe-backed plans sell capacity and operating layer; Conversation Balance funds live work.

## Audit findings

### Already strong

- Studio now has the correct two-pane structure: Wireline Assistant on the left, Agent Canvas on the right.
- Agent Canvas first fold matches the screenshot hierarchy: Identity, Voice, Workflows, Knowledge Base, Situations.
- The secondary workspace pages have largely moved into the quiet screenshot system: Connections, Account, Billing, Team, Phone, Apps.
- Stripe has active products for Wireline Personal, Team, Business, Enterprise, and Conversation Balance.
- Supabase already has the right production primitives: agents, accounts, phone numbers, call logs, onboarding progress, subscriptions, credit ledger, and settings.

### Remaining risks

- Any reintroduction of `assistant` copy in primary nav or creation can confuse the new IA.
- Overview can become too heavy if the all-agent roster is full-page instead of compact dashboard content.
- Fast Start must not hide phone-number provisioning; it is a monetizable lock-in and activation point.
- Knowledge sub-tabs need to continue feeling like one workspace, not four separate products.
- Pricing copy must stay aligned with actual Stripe products and avoid legacy tier names.

## Changes made in this pass

### Overview

- Recut Overview into the screenshot layout: greeting, metrics, quick actions, compact agent roster, recent calls, continuous-line banner.
- Kept personal and business separation inside the roster card.
- Added `Browse templates` back to quick actions to mirror the target screenshot.
- Preserved all-agent visibility without restoring a standalone Agents page.

### Fast Start

- Replaced the old New Agent settings form with a Fast Start modal based on the ZIP screenshot.
- Uses a top progress rail, `Step 1 of 5`, the prompt `What do you need handled?`, chips, personal/business posture selection, optional name, voice, response style, and number provisioning.
- Defaults are smart: if no name is entered, a clean starter name is generated; if no brief is entered, Wireline seeds a brief by posture.
- Created agents now land in Studio Canvas instead of the old knowledge/training route.

### Contracts

- Extended `agent-navigation-contract.test.ts` so Overview, Fast Start, Studio Canvas, and agent language stay protected.

## Next path forward

1. **Finish Fast Start steps 2–5**
   - Step 2: business/person profile + business hours
   - Step 3: voice + greeting preview
   - Step 4: tools + phone number provisioning
   - Step 5: test call + deploy

2. **Make Knowledge sub-tabs equally production-grade**
   - Knowledge: docs/FAQs/scripts upload
   - Voice: model/voice picker and preview
   - Flows: stage editor with snippets
   - Simulator: scenario runner with call transcript and coaching

3. **Wire Overview to real data**
   - Calls today from `wireline_call_logs`
   - Balance from `wireline_credit_ledger`
   - Connections from settings/integration tables
   - Plan from subscription state

4. **Strengthen commercial surface**
   - Surface Team ($29/mo), Business ($59/mo), Enterprise, and Conversation Balance consistently.
   - Keep legacy Stripe products hidden unless needed for migration support.

5. **Visual QA gate**
   - Capture production desktop and mobile screenshots for Overview, Studio, Fast Start, Knowledge, Simulator, Flows, Billing, Connections.
   - Fail design check on `Assistants`, `New assistant`, `Your assistants`, legacy purple, or old standalone `/agents` IA.
