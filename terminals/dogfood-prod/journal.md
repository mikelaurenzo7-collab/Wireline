# Wireline dogfood — founder account (commission hunt)

**Date:** 2026-06-08  
**URL:** https://trywireline.com  
**Account:** Founder (user-provided login)  
**Mode:** Full hunt + employee leveling

## Checklist

- [x] 0 — Login (founder account — user logged in)
- [ ] 0b — Session reset (Chat clear + Design clear)
- [ ] 1 — Shell sweep (sidebar, tabs, 390px)
- [ ] 2 — Director Chat ★ (toolbar, probes, approvals, routing)
- [ ] 3 — Design beta ★ (Painter, Export, integrations)
- [ ] 4 — Ops, Training, Insights, Agents
- [ ] 5 — Phone, Email, SMS, Pipeline, Contact
- [ ] 6 — Admin, Integrations, DNC, Audit, Help
- [ ] 7 — Edge stress (double-send, empty forms, rapid nav)
- [ ] 8 — Mobile 390px spot-check
- [ ] 9 — Report + bug tally + employee training ledger

## Session log

### 2026-06-08 — Start
- User logged into founder account; landed on `/ops` (Live Ops)
- Prior context: demo account lacked Twilio numbers; founder account expected to have real fleet config
- Test target number for live call/text triggers: **+15617270142** (user's NY number, consented)

### Findings so far
- Fleet: **19 agents** deployed (Jordan, Growth Coordinator, Jake, Billing Specialist, Elena,
  Personal Assistant, Aisha, Diana, Marcus, Tier 2 Technical Lead, Outbound Prospector, Riley,
  Avery, Priya, Maya, Tyler, Alex, Casey, Mira). Ops shows 0 on-call / 19 available.
- Jordan (Customer Service, voice) is well-configured: 14 knowledge facts, 11 directives,
  capabilities wired (CRM 5 tools, Slack, SMS 2, Zoom, Calendar 2, Shopify 9, Square 5, DocuSign,
  Meta, Apollo, Teams, Excel, Sheets), system prompt present, business hours 24/7.
- Carrier: Default Wireline phone number ID = 9665293f-a3df-4285-b982-ebfc08de8c99 (set);
  Browser voice key CONNECTED; SMS sender = +14692571581; operator alert number = +15617270142.

### Bug candidates (to confirm + file)
- **B1 (P1) — App-wide nav/tab render desync.** First click on a sidebar link OR a tab updates
  the URL + aria-selected/focus but the content panel does NOT re-render; a 2nd click or ~1.5s
  wait is required. Reproduced 4×: Live Ops→Agents nav, Phone Outbound sub-tabs (Dispatch),
  Settings nav, Carrier tab. Trust-breaking — looks broken/stuck.
- **B2 (P1) — Carrier registered-numbers list renders "undefined".** Settings→Carrier shows
  16 number rows all labeled "Assign agent to undefined" / "Delete undefined" with empty campaign
  tags. Numbers exist but display/label is undefined. Screenshot: carrier_undefined_numbers.png.
- **B3 (P2) — Outbound dispatch agent dropdown: option click intercepted** by the "Agent" <label>
  (click target intercepted, dropdown escapes). Custom listbox not reliably clickable via overlay.
- **B4 (note) — /api/agents returns UNAUTHORIZED** for a same-origin credentialed fetch from page
  context (httpOnly cookie not honored on direct fetch; UI works). Likely in-memory bearer. Low
  priority / by-design candidate — flagged for verification, not counted as a bug yet.

### P0 — Director stream auth failure (30s spin, no reasoning, empty thread)
- **Repro:** Send Director message when session cookie expired.
- **Network:** `POST /api/director/messages/stream` → **401** (~80ms); cascade 401 on
  `/api/director/messages`, `/api/fleet/presence`, `/api/agents`.
- **UI:** "Connecting to Director" with no thinking stream → thread resets to empty hero;
  operator message disappears. No session-expired error shown.
- **Root cause:** `refreshSessionIfNeeded()` failure ignored; onError runs recover +
  non-streaming fallback (also 401) and removes optimistic operator message.
- **Fix staged:** branch `fix/director-auth-session-expired` — auth session-expired event,
  early abort, keep operator text, toast + redirect to sign-in.
- **After session clear:** redirected to `/signin?redirect=%2Fchat` (expected).
