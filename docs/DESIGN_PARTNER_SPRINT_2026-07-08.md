# Design Partner Sprint — Sales Wedge (Weeks 9–12)

**Status:** Ready to execute after Compliance Center + approval-gated integrations ship.

## Goal

Recruit **10–25 design partners** across sales-heavy categories and prove the one-week success loop:

> Connect lead source → train sales agent → pass test call → make one compliant real call → approve follow-up → see booked/qualified outcome in ledger.

## Partner segments

- Agencies
- Home services
- Real estate teams
- Insurance agencies
- B2B SaaS / services
- Recruiting / staffing
- Local professional services

## Success criteria (per partner, 7 days)

| Step | Signal |
|------|--------|
| 1 | Lead source attached (`lead_source_added`) |
| 2 | Sales agent trained (`sales_agent_created` + readiness passed) |
| 3 | Test call completed |
| 4 | Number wired (`number_wired`) |
| 5 | First real sales call (`first_sales_call_completed`) |
| 6 | First approved action (`first_next_action_approved`) |
| 7 | Booked or qualified outcome visible in Outcome Ledger |

## Kill signals (pivot if observed)

- **&lt;30%** reach step 6 within 7 days → onboarding friction, not dialer quality
- **&gt;20%** compliance blocks without user understanding why → Compliance Center UX failure
- **&lt;50%** approval inbox task completion → proposed actions not valuable or too noisy

## Operator checklist

- [ ] Partner signed on Business plan or funded Conversation Balance
- [ ] Playbook selected (speed-to-lead recommended first)
- [ ] Federal DNC configured before marketing outbound playbooks
- [ ] HubSpot or Google Calendar connected for booking proof
- [ ] Weekly review: activation status + `activationWithApprovedAction`

## Instrumentation

Track via server `product_event` logs and:

- `GET /api/activation/status` → `activationWithApprovedAction`
- Outcome Ledger on Overview + Studio
- Approval Inbox completion rate
