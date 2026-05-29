# Wireline Launch Execution Plan — Owner-Grade Precision

**Mission:** Take Wireline from 90% to owner-grade launch readiness (would bet name + capital)  
**Timeline:** 3-4 days focused execution  
**Standard:** No shortcuts. Every item must survive "would I bet my own money on this?"

---

## Phase 1: Critical Path Hardening (Day 1-2)

### 1.1 AuthZ Default-Deny Contract
**Purpose:** Close the single highest-risk gap (opt-in auth → guaranteed auth)  
**Effort:** 2-3 hours  
**Deliverable:** Generated contract + test that fails if new routes lack auth

```typescript
// scripts/generate-authz-matrix.ts
// - Parse all route files
// - Extract router mount points
// - Verify authenticateUser or documented public exemption
// - Fail CI if uncovered routes found
```

**Acceptance:**
- [ ] Script runs in <5 seconds
- [ ] Identifies all 52 route modules
- [ ] Fails CI on any new route without explicit auth annotation
- [ ] Generates markdown matrix for docs

### 1.2 Webhook Rate Limiting Matrix
**Purpose:** Close DDoS/abuse surface on public webhooks  
**Effort:** 1-2 hours  
**Deliverable:** Rate limits on all public webhook endpoints

| Webhook | Current | Target | Implementation |
|---------|---------|--------|----------------|
| Stripe | None | N/A (signature + idempotency sufficient) | Document why |
| Twilio | None | 30/min burst | `twilio-webhook.ts` |
| Meta | None | 60/min | `meta-webhook-routes.ts` |
| Escalation | **12/min** ✅ | Maintain | Already done |

**Acceptance:**
- [ ] Twilio has reasonable burst limit
- [ ] Meta has reasonable limit
- [ ] All limits tested
- [ ] Documented in security matrix

### 1.3 Multi-Tenant Isolation Adversarial Tests
**Purpose:** Prove tenant A cannot read/write tenant B's data  
**Effort:** 4-6 hours  
**Deliverable:** TDD test suite that actively tries to break isolation

**Test Cases:**
- [ ] Cross-tenant agent read (should 404 or 403)
- [ ] Cross-tenant agent update (should 403)
- [ ] Cross-tenant knowledge base query (should return empty)
- [ ] Cross-tenant webhook list (should not include other's webhooks)
- [ ] Cross-tenant billing read (should 403)

**Acceptance:**
- [ ] All tests fail without proper isolation
- [ ] All tests pass with current implementation
- [ ] CI runs on every PR

---

## Phase 2: Test Coverage Density (Day 2-3)

### 2.1 Billing Full Matrix
**Purpose:** Money paths must be bulletproof  
**Effort:** 2-3 hours  
**Deliverable:** Extended billing test coverage

**Test Cases:**
- [ ] Overage calculation at tier boundaries
- [ ] Proration on plan change
- [ ] Failed payment retry flow
- [ ] Spend budget hard cap enforcement
- [ ] Spend alert email firing

### 2.2 Agent Runtime Red-Team Harness
**Purpose:** Ensure agent cannot be manipulated to violate guardrails  
**Effort:** 4-6 hours  
**Deliverable:** Adversarial test suite

**Test Cases:**
- [ ] Prompt injection to bypass "never claim action without tool"
- [ ] Attempt to extract another tenant's knowledge base
- [ ] Attempt to escalate to human without valid reason
- [ ] Attempt to make calls outside business hours
- [ ] Attempt to access disallowed topics

---

## Phase 3: Design System Completion (Day 3)

### 3.1 God File Slicing: InsightsView
**Purpose:** Make maintainable, prevent regression magnet  
**Effort:** 6-8 hours  
**Pattern:** Same as `ClaudeRecipes` → barrel + subfolder

**Structure:**
```
src/components/insights/
├── index.ts (barrel)
├── types.ts
├── shared.tsx
├── InsightsView.tsx (reduced to ~200 LOC orchestrator)
└── panels/
    ├── CallVolumePanel.tsx
    ├── SentimentPanel.tsx
    ├── ConversionPanel.tsx
    └── TrendsPanel.tsx
```

### 3.2 Voice Observability
**Purpose:** Know when demo lines degrade before prospects do  
**Effort:** 4-6 hours  
**Deliverable:** Per-call metrics + alerting

**Metrics:**
- [ ] TTFT per call (target: <900ms)
- [ ] STT error rate
- [ ] TTS error rate
- [ ] Full pipeline latency

**Alerting:**
- [ ] TTFT p95 > 1.2s for 5 minutes → alert
- [ ] Demo line health check fails → alert

---

## Phase 4: SMB Onboarding Magic (Day 3-4)

### 4.1 Time-to-First-Call Optimization
**Purpose:** Non-technical SMB owner succeeds in <8 minutes  
**Effort:** 1-2 days  
**Deliverable:** Streamlined wizard + success state

**Flow:**
1. Stripe checkout (already good)
2. Agent creation wizard (simplify)
3. Phone number selection (auto-provision if possible)
4. **New:** Test call with clear success indicator
5. **New:** "You're live" celebration + next steps

**Acceptance:**
- [ ] Measured time <8 minutes for non-technical user
- [ ] Clear success state (not just "configured")
- [ ] Failure paths have human-readable errors

---

## Phase 5: Operational Excellence (Day 4)

### 5.1 Supply-Chain Policy
**Purpose:** No dependency surprises in production  
**Effort:** 30 minutes  
**Deliverable:** `npm audit` in CI

**Implementation:**
```json
// package.json
"scripts": {
  "verify": "npm run lint && npm run docs:check && npm run security:audit && npm run test:run && npm run build",
  "security:audit": "npm audit --audit-level=high"
}
```

### 5.2 SOC2 Evidence Automation
**Purpose:** One-command auditor handoff  
**Effort:** 2-3 hours  
**Deliverable:** Evidence pack generator

**Contents:**
- [ ] Access control list (from authZ matrix)
- [ ] Change log (from git)
- [ ] Security test results
- [ ] Penetration test proxy (adversarial test results)

---

## Execution Order

**Priority 1 (Must have before launch):**
1. AuthZ default-deny contract
2. Webhook rate limit matrix
3. Multi-tenant adversarial tests

**Priority 2 (High want):**
4. Billing full matrix
5. Agent red-team harness
6. SMB onboarding magic

**Priority 3 (Polish):**
7. God file slicing
8. Voice observability
9. SOC2 evidence automation

---

## Daily Standup Format

**Yesterday:**
- [Completed items]

**Today:**
- [Planned items from this plan]

**Blockers:**
- [Any risks or decisions needed]

**Confidence Level:**
- [ ] Still on track for owner-grade
- [ ] At risk — need to adjust

---

## Definition of Done

Each item must satisfy:
1. **Code complete** — Implemented, reviewed, no todos
2. **Tested** — Unit tests + integration/E2E where appropriate
3. **Documented** — Comments, README updates if needed
4. **CI passing** — No lint, type, or test failures
5. **Owner-grade verified** — I would bet my name on this not breaking

---

## Success Criteria

**At end of execution:**
- [ ] AuthZ matrix generates clean report
- [ ] All public webhooks have rate limits
- [ ] Multi-tenant adversarial tests pass
- [ ] Billing tests cover edge cases
- [ ] SMB onboarding <8 minutes measured
- [ ] `npm audit` runs in CI
- [ ] I can say: "I would bet my capital on this"

---

*Execute with precision. No theater. Only owner-grade work.*
