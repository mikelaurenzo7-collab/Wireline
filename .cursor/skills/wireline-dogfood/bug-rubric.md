# Bug rubric — commission hunter severity

File every defect with **repro steps**, **expected**, **actual**, **screenshot**.
When unsure, **fail closed** (file it).

---

## P0 — ship blocker / trust break

- App crash, white screen, uncaught error boundary on core route
- `/api/*` **500** on happy-path action (send message, export, connect OAuth)
- **OAuth broken** — invalid scopes, redirect loop, token not stored
- Director **approval executes** without explicit approve (or deny ignored)
- **Session leak** — private data after sign-out or wrong tenant
- Export/download produces corrupt or empty artifact when UI says success
- Infinite spinner past wait table with no error message

---

## P1 — feature broken / major friction

- Stream **never completes** within 4 min (with screenshot)
- Wrong **routing** — e.g. code request → Painter-only; website → logo hijack
- Approval card stuck; approve/deny no toast or thread update
- Tab/sidebar nav shows **stale** previous page >2s
- Primary CTA **dead** (no op, no feedback)
- Integration shows connected but API returns `connected: false`
- Mobile: approval card or composer unusable at 390px
- Painter render succeeds but **Export** lanes all disabled incorrectly

---

## P2 — polish / clarity

- Copy confusion, typo in operator-facing text
- Empty state doesn't explain next step
- Minor layout overlap, non-blocking scroll issue
- Chart skeleton >8s then loads (note; escalate if perpetual)
- Demo badge missing on seeded row (trust nit)

---

## Quality notes (not severity bugs)

Track separately under **Quality / moat** in report:

- Painter live pipeline failed → HTML prototype fallback (Summit Home Services etc.)
- Generic render vs brand-specific output
- Marketing page motion/a11y (only if user scoped marketing)

---

## Evidence bar

| Severity | Minimum evidence |
|----------|------------------|
| P0 | Screenshot + repro steps + URL |
| P1 | Screenshot or exact error text + repro |
| P2 | One-line repro + screen name |

**Commission rule:** 3+ P1s on same surface → note **systemic** pattern in report.

---

## Coverage gaps ≠ passes

If a **Must** row in [coverage.md](coverage.md) was not attempted, list it under
**Coverage gaps** — do not mark the area pass.
