# Stress matrix — interact, don’t tour

**Rule:** Opening a page is **0% done**. A route is **tested** only when every
**Must** item below is attempted and waited out.

Use `browser_wait` after sends, saves, and route changes. **Do not** leave while
spinners say Connecting, Preparing, or Thinking.

| Wait target | Max wait | If exceeded |
|-------------|----------|-------------|
| Director/Painter stream | 4 min | Screenshot + BLOCK |
| Painter HTML render | 3 min | Screenshot + ROUGH/BLOCK |
| Route/tab transition | 5 s | Screenshot if stale prev page |
| Modal/dialog open | 3 s | BLOCK if no response |
| Chart/table load | 8 s | ROUGH if perpetual skeleton |

Mark each row in the journal: `pass | fail | skip (why)`.

---

## A. Auth & shell

| # | Must interact | Pass criteria |
|---|---------------|---------------|
| A1 | Sign in with demo credentials | Lands in app, no error toast |
| A2 | Click **every** sidebar group item top→bottom | Each route renders |
| A3 | On each route: click **every tab** visible | Tab content changes |
| A4 | TopBar title updates after sidebar click | Matches destination |
| A5 | Open hamburger at **390px** | Full nav reachable |
| A6 | Keyboard (desktop): `g` then `r`, `g` then `d`, `g` then `p` | Navigates to Chat, Ops, Phone |
| A7 | Tab through one form | Focus ring visible |
| A8 | Sign out → protected URL | Redirects to auth |
| A9 | Browser Back after sign out | No leaked private data |

---

## B. Director Chat — every chip & mode

Find Chat from sidebar. After **Clear thread** (session start only):

### B1. Composer toolbar — click each once

| Control | Must do |
|---------|---------|
| Model picker | Open, change model, confirm composer reflects |
| Connectors | Open panel, close |
| Capabilities | Open catalog → tap a skill → text in composer |
| Coach | Select an agent (e.g. Casey/Ava) → Abilities chip appears |
| Abilities | Toggle when coaching |
| Design mode (BETA) | Toggle on + off |
| Brand setup | Open panel (Design mode) |
| Account branding | Toggle (Design mode) |
| Deep / Brain | Toggle on for at least one long probe |
| Attach / PDF | Open; upload only if safe test file available |
| Enter | Sends message |
| Shift+Enter | New line, does not send |

### B2. Starter prompts — click → send → **wait for full stream**

Minimum **all featured** on full run; quick run = any 3:

- What agent should I hire first?
- Audit my fleet — what should I fix first?
- Set up a sales agent for my business
- Draft a one-page plan for my company
- Research competitors and pricing in my market
- Build a follow-up sequence for missed calls
- Write a support playbook for angry callers
- Generate logo concepts for my brand
- Design a website with HTML I can copy
- Review recent calls and coach my agents
- Help me set up compliant collections outreach
- **More prompts** → expand → run at least one more

### B3. Strategy — type or paste, wait for stream

- `Audit my fleet — what should I fix first?`
- `What should my team focus on this week based on recent calls?`
- `Draft a one-page GTM plan for my business`
- `Analyze my outbound pipeline — where are deals stalling?`
- Deep on + `Do a deep dive on my fleet performance over the last 30 days`

### B4. Create — wait for substantive reply

- Business plan, phone script, 3-email sequence, billing-dispute SOP
- Homepage hero copy
- Full website (sitemap + HTML prototype)
- TypeScript Express route with Zod (expect fenced code)
- Objection handling matrix

### B5. Execute & approvals — **must approve AND deny**

| Prompt | Must see |
|--------|----------|
| `Call Jordan Lee back about tomorrow's estimate` | Proposal card |
| `Text the lead we spoke with yesterday a booking link` | Proposal or staged flow |
| `Email the customer a summary of our call and next steps` | Proposal |
| `Look up their Shopify order, text them the status, and log it in CRM` | Multi-step or approval |

Then: **Approve** one safe card → toast + thread updates. **Deny** another → toast.

### B6. Research — wait for sources if shown

- Competitors and pricing in my market
- `What are the latest TCPA rules for outbound SMS to leads?`

### B7. Integrations (prompt-level)

- HubSpot caller lookup
- Shopify order #1042
- Slack alert on repeat hot lead
- Calendar availability Thursday
- Apollo enrich + cold opener
- DocuSign NDA follow-up

### B8. Coach mode probes

- `Make Ava's greeting warmer and mention same-day service`
- `Turn on calendar booking and SMS for my sales agent`
- `Review Ava's last 5 calls and suggest script improvements`
- Return to fleet-only (deselect coach)

### B9. Routing guards

| Prompt | Must NOT happen |
|--------|-----------------|
| Small email-validation function | Painter-only; no code block |
| Plumbing website with booking CTA | Logo concepts instead of site |
| Website **without** Design mode | Handoff toward Design or inline HTML |
| Same website **with** Design mode | Inline design path |

### B10. Thread UX

- Phases: connecting → preparing → thinking → reply
- Artifacts panel after code deliverable
- Research sources panel after web probe
- Clear thread → empty hero with capability pills
- Long reply scrolls; approval cards tappable at 390px

---

## C. Painter / Design (Beta)

Separate from Chat. Clear thread at session start.

| # | Must |
|---|------|
| C1 | Beta badge visible |
| C2 | Desktop: chat + preview split |
| C3 | Mobile: Chat / Preview tabs |
| C4 | Click **each** starter OR minimum 4 on hour run |
| C5 | Render probe: `Design a one-page landing for a debt relief firm — hero, trust strip, FAQ, contact CTA.` — **wait up to 3 min** |
| C6 | Brand setup → second prompt reflects profile |
| C7 | Clear thread → empty state |

Starters: local service landing, onboarding flow, ops dashboard, pricing page,
appointment booking, help center.

---

## D. Live Ops — every tab

| Tab | Must interact |
|-----|---------------|
| Live floor | Pulse metrics; expand/open a call card if any |
| Actions | Proposed vs live queue items |
| Triage | Queue grid, priority UI |
| Analytics | Charts or empty state — wait for load |

---

## E. Training — every tab

| Tab | Must |
|-----|------|
| Knowledge | List or empty; open an entry if present |
| Voices | Open voice picker |
| Pronunciation | View rules table |
| Simulator | Start or open run UI (don’t need live call) |
| Flow | Open flow editor |

---

## F. Insights — open every sub-view

**Performance:** funnel, goals, heatmap, leaderboard

**Quality:** failures, latency, quality

**Revenue:** attribution, topics, spend

Each view: wait for chart or designed empty — not infinite skeleton.

---

## G. Agents

| Area | Must |
|------|------|
| Templates | Scroll gallery; open deploy CTA (cancel if destructive) |
| My Fleet | Open agent card; find edit/settings entry |

---

## H. Channels

### Phone

| Tab | Must |
|-----|------|
| Call History | Expand a row if data; note demo badge |
| Outbound | Open dispatch, campaigns, sequences, callbacks sub-views |
| Appointments | upcoming + history |

### Email

Open inbox → open a thread → body renders

### SMS

Open thread list → open a thread (do not text real numbers)

### Pipeline

Stages visible; open a lead card; try an action button if safe

### Contact profile

From phone or pipeline → open contact timeline `/contact/...`

---

## I. Admin & compliance

### Admin gear — every tab

Branding, Carrier, Billing, Team, Growth, Activity (and DNC/Audit if nested)

Each: interact with primary control (toggle, save, invite — **cancel** if destructive)

### Sidebar compliance

- Integrations → open marketplace card → connect modal
- DNC → list or add UI
- Audit → log rows or empty
- Help → search or open article

### Founder (if visible)

Open; if 403, note skip

---

## J. Stress & edge (anywhere)

- Double-click primary CTA once
- Submit empty required form
- Cancel mid-dialog
- Rapid route switch ×3 — no stale content >2s
- Director: double-send same message — thread not corrupted

---

## K. Mobile pass (390px)

Minimum:

- Auth → hamburger → Chat, Ops, Phone
- One full Director prompt with stream wait
- One approval card tap target check
- One admin or training tab

---

## Coverage tally (for final report)

Copy into report — every **unattempted Must** is a **coverage gap**:

```
Stress matrix: __ / __ Must items attempted
Director toolbar: __ / 11
Director probes sent: __
Approvals: approve ☐  deny ☐
Painter starters: __ / 4+
Ops tabs: __ / 4
Training tabs: __ / 5
Insights views: __ / 9
Admin tabs: __ / 6+
```
