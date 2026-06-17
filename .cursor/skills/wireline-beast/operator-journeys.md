# Operator journeys — scenario-driven E2E

**Routes are infrastructure. Journeys are the product.**

Each journey is a **scripted operator story** using sidebar clicks only. Pass =
happy path completes with no P0 and no dead ends. Log journey ID in report.

---

## J1 — Morning command (Founder) ★ P0

**Story:** Operator starts the day: fleet pulse → Director priorities → one insight.

| Step | Action | Pass |
|------|--------|------|
| 1 | Sign in → lands `/ops` | Floor or quiet state loads |
| 2 | Scan Live floor metrics / agent cards | Numbers or empty state; no clip |
| 3 | Sidebar → **Chat** | Empty hero or cleared thread |
| 4 | Send: `What should my team focus on this week based on recent calls?` | Stream completes; actionable bullets |
| 5 | Sidebar → **Insights** → Performance funnel | Chart or empty state |
| 6 | Return **Ops** via sidebar | No stale Chat overlay |

**Fail closed:** Director hang, sidebar clip on Insights, session lost.

---

## J2 — Floor hour (Ops lead) ★ P0

**Story:** Supervisor monitors live activity and proposed actions.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/ops` Live floor | Pulse visible |
| 2 | Tab → **Actions** | Proposed vs live distinguishable |
| 3 | Tab → **Triage** | Queue grid; priority readable |
| 4 | Tab → **Analytics** | Chart loads |
| 5 | 390px: hamburger → Triage | Usable without horizontal scroll |
| 6 | Keyboard: `g` `t` → triage | Lands triage tab |

**Design check:** live vs proposed uses color/label, not color alone (a11y).

---

## J3 — Fleet audit & coach (Founder) ★ P0

**Story:** Audit fleet → coach one agent → return to fleet-only.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/chat` Clear thread | No degraded banner |
| 2 | Capabilities → Fleet audit OR starter chip | Composer filled |
| 3 | Send fleet audit prompt | preparing → reply; fleet-specific content |
| 4 | **Coach** → pick agent (e.g. Casey) | Context strip + Abilities |
| 5 | `Make the greeting warmer and mention same-day service` | Reply references agent |
| 6 | Return to fleet-only | Coach strip clears |
| 7 | Optional: **Deep** on + deep dive prompt | Opus/deep indicator visible |

---

## J4 — Triage to contact (Ops lead) ★ P1

**Story:** From queue to contact timeline.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/ops` → Triage | Rows or empty |
| 2 | If row exists: open contact | `/contact/:number` timeline |
| 3 | Else: **Phone** → expand call history row if seeded | Contact or detail panel |
| 4 | Back via sidebar | No broken back stack |

Skip with reason if demo has zero triage/history rows.

---

## J5 — Pipeline to execute (Rev) ★ P1

**Story:** Check pipeline → ask Director to follow up → approval card.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/pipeline` | Stages visible; demo badge if seeded |
| 2 | `/chat` | |
| 3 | `Call Jordan Lee back about tomorrow's estimate` | ProposalCard appears |
| 4 | **Deny** (safe) | Toast; card resolves |
| 5 | Second execute prompt → **Approve** if safe demo action | Toast; thread updates |

Jordan Lee is canonical demo copy in `wireline-director-design.ts`.

---

## J6 — Integration story (Founder) ★ P1

**Story:** Marketplace → Director proposes integration work.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/integrations` | Grid loads |
| 2 | Open one card (HubSpot/Shopify) | Modal/sheet; connect CTA |
| 3 | `/chat` → CRM or Shopify probe | Substantive reply or honest "not connected" |
| 4 | No fake "done" without approval card when action is mutating | Trust |

---

## J7 — Compliance pass (Admin) ★ P1

**Story:** Prove guardrails exist in UI.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/admin` → DNC or `/dnc` | Block list UI |
| 2 | `/audit` or admin audit tab | Log table or empty |
| 3 | `/chat` → `What are the latest TCPA rules for outbound SMS to leads?` | Research-style reply |
| 4 | Execute deny path (J5 step 4) | Human override works |

---

## J8 — Painter ship check (Design) ★ P0

**Story:** Studio produces click-through preview.

| Step | Action | Pass |
|------|--------|------|
| 1 | `/design` Clear thread | |
| 2 | Click starter OR debt-relief landing prompt | Stream starts |
| 3 | Wait ≤3 min | Preview panel has HTML/device frame |
| 4 | 390px: Preview tab | Preview visible |
| 5 | Brand setup → send second prompt | Profile state reflected or documented |

---

## J9 — First 15 minutes (New operator) ★ Launch gate

**Story:** Cold start — can a new demo user orient?

| Step | Action | Pass |
|------|--------|------|
| 1 | Sign in | No onboarding dead-end |
| 2 | Find **Chat** without help doc | Sidebar obvious |
| 3 | Click one starter → send | Success |
| 4 | Find **Agents** → My Fleet | Cards visible |
| 5 | Find **Phone** + **Admin** branding | Reachable |
| 6 | Help center search one term | Results or empty |

Scores **discoverability** — log MOAT if founder can't find Director in <3 clicks.

---

## Journey ↔ coverage map

| Journey | Primary coverage sections |
|---------|---------------------------|
| J1 | A, B, C (partial), G |
| J2 | E, B, N |
| J3 | C full |
| J4 | E, I, contact |
| J5 | I, C5 |
| J6 | J, C7 |
| J7 | J, C5, C6 |
| J8 | D |
| J9 | A, B, C, H, J |

**Minimum weekly:** J1 + J2 + J3 + J8  
**Minimum launch:** all P0 + all P1
