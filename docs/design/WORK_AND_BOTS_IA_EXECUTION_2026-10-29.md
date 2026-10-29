# BotBound: Work + Bots design system and IA execution plan

**Date:** October 29, 2026  
**Reference:** Existing GitHub `main` at `1f5aad0589ff342dde86b4eb11f16575a450687a` before this branch.  
**State:** First architecture/route pass in a review branch. **Not production-certified.**

## Product decision

BotBound is not a collection of separate builders. **Work** is the central task and conversation surface, with a resizable browser/computer panel beside chat on desktop, and a clear Chat/Browser switch on narrow screens. **Bots** are the durable resources that perform work. Distinguish them from sessions, conversations, browser tasks, channels and connected tools. **Default to one Bot, allow additional Bots on demand. Do not introduce an account-level one-Bot limit or extra charges as part of a design change.**

The currently functioning `/studio` implementation should remain the internal canonical route during rollout, displayed as **Work**. This preserves inbound links from mobile apps, browser extension, voice and integrations. Move to a `/work` URL only after codebase-wide deep-link and callback inventory. `/agents` remains a compatibility redirect to Work for now. The optional `/bots` is a fallback roster for larger collections (more than three), not a permanent desktop or mobile navigation item. One to three Bots use compact identity links in the desktop rail and the Bot details menu in Work. Configuration continues in the existing `/studio?agent=…&section=setup` pane until it is verified that all controls can be rehomed safely. An agent-specific route is a later migration, not an assumption.

## Authenticated navigation

| Zone | Primary destination | Purpose |
| --- | --- | --- |
| Work | Work (`/studio`) | Task chat, browser, takeover, rehearsal and setup panel |
| Work | Inbox (`/inbox`) | Messages, approvals and review |
| Work | Calls (`/phone`) | Call operations, logs and setup |
| Work | Calendar (`/calendar`) | Appointments and availability |
| Contextual | Bots (`/bots`) | Optional overflow roster for more than three Bots |
| Manage | Knowledge (`/knowledge`) | Bot-grounded facts |
| Manage | Insights (`/insights`) | Outcomes and performance |
| Manage | Connections (`/connections`) | Integrations and channels |
| Account | Settings (`/settings`) | Billing, team, security, apps and appearance |

Browser (`/computer`) is a contextual Work panel first, retaining a direct route for compatibility and isolated troubleshooting. It is not a competing top-level product. Rehearsal and Setup are modes of an individual Bot, not peer businesses.

## Design principles

- Make **the conversation the control surface and browser the execution surface**. Avoid a second dashboard nested within chat.
- Keep the left navigation compact, resizable, collapsible, and persistent; maintain existing keyboard shortcuts and Bot scope. When a Bot identity is visible, do not show a second redundant Work link on desktop.
- Allocate desktop space to user content. The browser must be resizable without compressing the composer below a readable width. Preserve takeover, approvals, tab state and explicit safety gating.
- Mobile: one readable primary pane at a time, with an obvious Chat/Browser switch and a single bottom dock. Do not render a tiny split-screen.
- Use typography, spacing and aligned rows before bordered cards. Reserve cards for distinct data objects, not every line or group.
- Secondary configuration stays progressive; no redundant headings, gratuitous icons, empty ornament, or explanatory paragraphs where concise controls work.
- Interactive elements have visible hover/focus/touch states and truthful loading, empty, error, disabled and unavailable states.
- Do not replace customer data, default to publishing bots, auto-send messages, alter billing/subscriptions, or weaken approval/handoff protection.

## Public and authenticated surface backlog

### P0 — foundation
1. Unify visible Work naming; preserve existing stable `/studio` route and deep links.
2. Provide up to three Bot identities in the desktop rail; use one current Bot menu for switching and for Phone, Inbox, Knowledge, Computer, Set Up and optional Add Bot. Keep a fallback roster for larger collections. Preserve creation, activation and phone/email provisioning.
3. Make public mobile Product/Pricing navigation reachable; audit sign-in and signup route handoff.
4. Keep command palette, desktop rail, mobile More and route registry consistent.
5. Update tests/contracts and verify build, typecheck, navigation, account boundaries and existing flow preservation.

### P1 — systematic design pass
6. Normalize foundations: type scale, spacing, widths, density, focus styling, surfaces, modal/drawer/popup z-index, theme tokens, and responsive ownership. Edit shared primitives instead of adding competing global CSS overrides.
7. Work: status/control bar; bot switcher; task history and composer; split/browser resizing; takeover permissions; error, loading, stale-frame and no-task states; keyboard and mobile pane switching.
8. Bot identity details: setup and review progressive disclosure, new-bot wizard, voice/number/email/knowledge/tools, state, safety, revisions and permissions. Do not lose paid provisioning and voice cloning functionality. Memory and routines should only be exposed as separate controls when backed by real working routes/APIs. Optional subagent work stays internal until supported and permission-scoped.
9. Inbox, Calls, Calendar, Insights, Knowledge and Connections: compact page headers, clear tables/lists, purposeful filters, modal and panel behavior.
10. Account Settings, Billing, Team, Apps, Compliance: explicit destructive-action safeguards, concise forms, accessible focus, no decorative-only icons.
11. Public: landing, features, pricing, use cases, trust, policies, auth, onboarding, mobile navigation, legal clarity, brand/typography and CTA consistency.

### P2 — comprehensive release gates
12. Run `npm run verify:full` and focused UX/IA tests in CI, plus visual-manifest, contract and server smoke checks. Investigate any failing check before merge.
13. Review PR diff and confirm default branch and deployed service commit. Do not infer readiness from the last successful build alone.
14. Confirm the intended Render workspace explicitly, enumerate all production services and branch/auto-deploy configurations, and verify every applicable service is on the same revision. Manual deploy only when auto deploy is off. Recheck production domains, sign-in, session, APIs, browser tasks, phone, email and billing without sending live traffic.
15. **Post-deployment** screenshot and interaction QA: public and authenticated routes at phone/tablet/desktop widths, modal/drawer/menu/empty/error states, keyboard focus and theme variants. Triage and fix regressions in follow-up PRs and redeploy.
16. Keep a documented release SHA, rollback target, health results and outstanding issues.

## Current blockers, explicitly not silently bypassed

- Production authenticated Browser Use session expired and redirects to sign-in. The account holder must authenticate again for full authenticated visual QA.
- Render exposes **My Workspace** and **BEASTBOTS**; the platform requires the owner to select the correct workspace before any deployment/service action.
- Deep Research has been steered toward the Codex desktop, Claude Cowork, ChatGPT Work, and Cursor multi-pane workbench patterns; its report may require changes to this plan, so the architecture pass is not a complete product-wide visual redesign.
- The original repository's `main` branch is not protected. Do not merge solely because a PR exists; honor tests and deployment verification.

## Acceptance criteria

Navigation and bot scope are unambiguous. One Bot is sufficient for most users, with optional additional Bots rather than permanent extra navigation. Bot create/select/configure and Work chat/browser remain functional with preserved deep links. Mobile navigation and public pricing are reachable. No loss of telephony, email, knowledge, browser control, billing, auth or tenant boundaries. Accessibility basics pass. Pre-merge checks are green. Production services and SHA are confirmed. Post-deploy visual QA is completed and any exceptions are documented.
