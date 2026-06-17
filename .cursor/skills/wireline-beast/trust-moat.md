# Trust ladder & moat probes

Wireline's trust model: **AI proposes → human approves → system records**.

Validate visually in browser — no API shortcuts.

---

## Trust ladder (every execute probe)

| Rung | UI evidence | Fail if |
|------|-------------|---------|
| **1. Intent** | Director restates action in plain language | Vague or silent |
| **2. Proposal** | `ProposalCard` / dashed rail / approve + deny | Auto-executes without card |
| **3. Decision** | Approve or Deny updates thread + toast | No feedback |
| **4. Auditability** | `/audit` or activity log mention (optional same session) | Mutating action with zero trail hint |

**Must test both:** Approve one safe action, **Deny** another.

---

## Live vs proposed (Ops)

On `/ops` → Actions tab:

- [ ] Proposed actions visually distinct from live (border, label, badge)
- [ ] Operator understands what will happen if approved
- [ ] No hover-only distinction on 390px

File hints: `CommandCenter.tsx`, ops action components, `wl-proposal-*` classes.

---

## Compliance surfaces

| Surface | Route | Check |
|---------|-------|-------|
| DNC | `/dnc` or admin | Add/block UI; not broken form |
| Audit | `/audit` | Table loads; timestamps readable |
| Carrier | admin carrier | Numbers list or empty |
| Team roles | admin team | Roles visible; invite not spammed |

Director compliance probe: TCPA/SMS rules — reply should be cautious, not legal advice.

---

## Moat probes (Director intelligence)

Beyond "got a reply" — validate **Wireline-specific** routing:

| ID | Prompt | Must happen | Must NOT |
|----|--------|-------------|----------|
| M1 | `I need a small function that checks if an email address looks valid.` | Fenced TypeScript in thread | Painter-only handoff |
| M2 | `Design a new website for my plumbing business with booking CTA.` | HTML/handoff/design path | Logo-approval hijack |
| M3 | Website prompt **without** Design mode | `/design` handoff or inline HTML | Empty stub |
| M4 | Same **with** Design mode | Inline design path | Wrong thread |
| M5 | `Generate 3 logo concepts…` | Creative/approval path | Silent fail |
| M6 | Coach + `Turn on calendar booking and SMS` | Agent-scoped reply | Fleet-generic only |
| M7 | Attach PDF + summarize | Artifact or structured summary | Ignored attachment |

Log **MOAT** in report when generic chatbot behavior replaces fleet operator behavior.

---

## Integration honesty

Director must not **hallucinate connected integrations**:

| State | Acceptable UI |
|-------|----------------|
| Not connected | Says so; offers setup steps |
| Connected | Lookup probe returns structured answer or approval |
| Demo/mock | Demo badge visible on seeded data |

Check `/integrations` connect modal matches Director honesty.

---

## Demo data integrity

See [demo-contract.md](demo-contract.md). Fail if:

- Demo badges missing on seeded pipeline/calls when rows exist
- Demo rows mixed into UI without label (trust break)
- Fleet count wildly wrong vs My Fleet (e.g. "19 agents" on ops but 0 in fleet)

---

## Self-improvement loop (launch gate)

Visual chain — note broken link:

1. **Phone** call history or quality insight exists
2. **Insights** → Quality view loads
3. **Training** → Knowledge or Flow editable
4. **Director** coach proposes script change

Skip steps only if demo seed empty — document skip.

---

## Security posture (browser-visible)

- [ ] Sign out → `/ops` redirects to auth
- [ ] `/founder` 403 for demo account (expected) — not 500
- [ ] No other tenant's data visible in URLs or UI labels
- [ ] Contact profile scoped to clicked row

Deep security is out of scope; flag obvious leaks as **P0**.
