# Wireline SOC 2 Type II Evidence Pack

**Status: historical / superseded.** This pack predates the current custom-auth
system and contains inaccurate claims (e.g. "Multi-factor authentication via
Supabase Auth," "Supabase-managed password security") that contradict the
actual authentication implementation. **[soc2-policies.md](./soc2-policies.md)
and [security/auth-password-controls.md](./security/auth-password-controls.md)
are the current, accurate source of truth** for SOC 2 control narrative and
auth/password posture. Retained for historical structure (vendor DPA table,
governance diagram) pending a full content refresh.

**Document Version:** 1.0  
**Prepared Date:** 2026-05-29  
**Audit Period:** [To be defined]  
**System Description:** Wireline AI Voice Platform  
**Prepared By:** Engineering Team  

---

## Executive Summary

This evidence pack supports the SOC 2 Type II audit of Wireline's AI Voice Platform. It documents the design and operating effectiveness of controls across the Trust Services Criteria: Security, Availability, Confidentiality, Processing Integrity, and Privacy.

**Scope:**
- Production environment hosted on Vercel (Edge + Serverless)
- Supabase PostgreSQL database infrastructure
- Third-party integrations: Vapi, Stripe, Twilio, Anthropic, ElevenLabs
- Web application (React + TypeScript + Express)
- API services and webhook handlers

---

## 1. Control Environment Overview

### 1.1 Organizational Structure
- **Engineering Lead:** Responsible for system architecture and security
- **Infrastructure:** Fully managed by Vercel (no direct server access)
- **Data Layer:** Supabase managed PostgreSQL with Row Level Security

### 1.2 Governance Model
```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY GOVERNANCE                       │
├─────────────────────────────────────────────────────────────┤
│  Code Review → Automated Tests → Security Scan → Deploy    │
│     ↑                                                ↓       │
│     └──────────── Monitoring / Alerting ←────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Key Control Owners
| Role | Responsibility | Evidence Location |
|------|---------------|-------------------|
| CI Pipeline | Automated security scanning | `.github/workflows/ci.yml` |
| Application | Authentication & Authorization | `src/middleware/auth.ts` |
| Database | Row Level Security policies | `src/db/schema.ts` |
| Infrastructure | Vendor security assessments | Section 8 of this pack |

---

## 2. Security (CC6.1 - CC6.8)

### 2.1 Logical Access Controls

#### 2.1.1 Authentication Controls
**Control ID:** AUTH-001  
**Description:** Multi-factor authentication via Supabase Auth with JWT tokens  
**Implementation:**
- JWT access tokens (15-min TTL)
- Refresh token rotation
- Email verification required for trial features

**Evidence:**
```typescript
// src/middleware/auth.ts - Token verification
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: "No authorization token" });
  
  const verified = await verifyInternalJwt(token);
  if (!verified) return res.status(401).json({ error: "Invalid token" });
  
  req.user = verified;
  next();
};
```

**Test Evidence:** `src/middleware/auth.test.ts` — 12 test cases covering token validation

#### 2.1.2 Authorization Controls
**Control ID:** AUTH-002  
**Description:** Role-based access control (RBAC) with default-deny posture  
**Implementation:**
- `requirePermission()` helper for resource-level access
- AuthZ matrix generation script
- Explicit route-level authentication

**Evidence:**
- Script: `scripts/generate-authz-matrix.ts`
- Output: `AUTHZ_MATRIX.md`
- Coverage: 52 route modules verified

#### 2.1.3 Password Policy
**Control ID:** AUTH-003  
**Description:** Supabase-managed password security  
- Minimum 8 characters
- Breached password detection (HaveIBeenPwned integration)
- Secure password reset (15-min token TTL, single-use)

**Evidence:** `src/routes/auth-routes.ts` — Password reset flow

### 2.2 Data Protection

#### 2.2.1 Encryption in Transit
**Control ID:** CRYPT-001  
**Description:** TLS 1.3 for all communications  
**Implementation:**
- Vercel Edge Network enforces HTTPS
- HSTS headers (max-age=31536000)
- Certificate managed by Vercel (auto-renewal)

**Evidence:** Vercel dashboard SSL configuration screenshot

#### 2.2.2 Encryption at Rest
**Control ID:** CRYPT-002  
**Description:** AES-256 encryption for all stored data  
**Implementation:**
- Supabase PostgreSQL (encryption at rest enabled)
- Stripe (PCI DSS Level 1 compliant)
- Vercel Edge Config (encrypted)

**Evidence:** Supabase project dashboard encryption settings

#### 2.2.3 Key Management
**Control ID:** CRYPT-003  
**Description:** Environment-based secret management  
**Implementation:**
- No hardcoded secrets in codebase
- Vercel Environment Variables (encrypted at rest)
- Supabase Connection Pooler (TLS + password auth)

**Evidence:**
- `.env.example` — Documents required variables
- `src/lib/server-context.ts` — Runtime secret access

### 2.3 Network Security

#### 2.3.1 Webhook Security
**Control ID:** NET-001  
**Description:** HMAC signature verification for all webhooks  
**Implementation:**
```typescript
// Stripe webhook verification
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);

// Twilio webhook authentication (dual)
const isValidCron = secureCompare(providedSecret, process.env.CRON_SECRET);
const isValidJwt = await verifyInternalJwt(token);
```

**Evidence:**
- `src/routes/billing-routes.ts` — Stripe webhook handler
- `src/routes/health-routes.ts` — Cron + JWT dual auth
- Rate limiting: 12-60 req/min per webhook type

#### 2.3.2 Rate Limiting
**Control ID:** NET-002  
**Description:** Multi-layer rate limiting  
**Implementation:**
| Layer | Limit | Scope |
|-------|-------|-------|
| Webhook (Escalation) | 12/min | Per IP |
| Webhook (Twilio SMS) | 30/min | Per number |
| Webhook (Meta) | 60/min | Per source |
| Health Checks | 30/min | Per IP |

**Evidence:**
- `src/routes/escalation-routes.ts`
- `src/routes/twilio-webhook.ts`
- `src/routes/health-routes.ts`

### 2.4 Vulnerability Management

#### 2.4.1 Dependency Scanning
**Control ID:** VULN-001  
**Description:** Automated npm audit in CI/CD  
**Implementation:**
```yaml
# .github/workflows/ci.yml
- name: Security audit — fail on HIGH+ vulnerabilities
  run: npm audit --audit-level=high --omit=dev
```

**Evidence:**
- CI workflow: `.github/workflows/ci.yml`
- Package scripts: `npm run security:audit`

#### 2.4.2 Static Code Analysis
**Control ID:** VULN-002  
**Description:** CodeQL analysis on every push  
**Implementation:**
- GitHub CodeQL workflow (`.github/workflows/codeql.yml`)
- ESLint with security rules (`eslint.config.js`)

**Evidence:**
- CodeQL results in Security tab
- ESLint configuration with `@typescript-eslint/no-explicit-any` restrictions

#### 2.4.3 Secret Scanning
**Control ID:** VULN-003  
**Description:** GitHub secret scanning enabled  
**Implementation:**
- GitHub Advanced Security (secret scanning)
- Pre-commit hooks (husky + lint-staged)

**Evidence:**
- `.husky/pre-commit`
- No secrets in git history (verified via `git log --all --source --remotes --pretty=format:'%H' | xargs git show | grep -i 'password\|secret\|key'`)

---

## 3. Availability (CC7.1 - CC7.5)

### 3.1 System Monitoring

#### 3.1.1 Uptime Monitoring
**Control ID:** AVAIL-001  
**Description:** Multi-layer health checks  
**Implementation:**
| Endpoint | Purpose | Target |
|----------|---------|--------|
| `/api/health` | Public liveness | 200 OK |
| `/api/health/internal` | Authenticated detail | DB + integrations |
| `/api/health/voice-status` | Demo line health | TTFT p95 < 1.2s |
| `/api/health/canary` | Nightly validation | CRON_SECRET auth |

**Evidence:**
- `src/routes/health-routes.ts`
- `src/lib/voice-observability.ts`
- `vercel.json` — Cron configuration

#### 3.1.2 Voice Observability
**Control ID:** AVAIL-002  
**Description:** Per-call latency tracking and alerting  
**Metrics:**
- TTFT (Time-to-First-Token): target <900ms, alert >1.2s
- STT/TTS error rates: alert >5%
- Pipeline latency: tracked per call

**Evidence:**
- Schema: `src/db/schema.ts` (callLogs.ttftMs, sttError, ttsError)
- Library: `src/lib/voice-observability.ts`
- Routes: `src/routes/voice-observability-routes.ts`

### 3.2 Incident Response

#### 3.2.1 Error Logging
**Control ID:** INC-001  
**Description:** Structured logging with correlation IDs  
**Implementation:**
```typescript
log.error("Stripe webhook handler error", {
  error: getErrorMessage(err),
  eventId: event.id,
  requestId: res.locals.requestId,
  userId: req.user?.id,
  timestamp: new Date().toISOString(),
});
```

**Evidence:**
- `src/lib/server-context.ts` — Structured logger
- `src/middleware/request-id.ts` — Correlation ID injection

#### 3.2.2 Audit Logging
**Control ID:** INC-002  
**Description:** Security-relevant event logging  **Events Logged:**
- Authentication (login, logout, failed attempts)
- Authorization (permission denials)
- Billing (payments, plan changes)
- Data access (exports, deletions)

**Evidence:**
- `src/lib/audit-logger.ts`
- Database: `wireline_audit_log` table
- Retention: 1 year (configurable)

---

## 4. Confidentiality (CC8.1 - CC8.3)

### 4.1 Data Classification

#### 4.1.1 Data Categories
**Control ID:** CONF-001  
**Description:** Data classification by sensitivity  
**Categories:**
| Level | Data Types | Controls |
|-------|-----------|----------|
| Critical | Payment cards, SSN, PHI | No storage (Stripe tokens only) |
| High | Call recordings, transcripts | Encryption + RLS + 90-day retention |
| Medium | Email content, calendar events | Encryption + RLS |
| Low | Public website content, agent configs | Encryption + RLS |

#### 4.1.2 Row Level Security (RLS)
**Control ID:** CONF-002  
**Description:** Database-level tenant isolation  
**Implementation:**
```sql
-- Example policy (enforced by Supabase)
CREATE POLICY tenant_isolation ON wireline_call_logs
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

**Evidence:**
- `src/db/schema.ts` — All tables include user_id
- Supabase RLS policies enabled
- Test: `tests/integration/tenant-isolation.adversarial.test.ts`

### 4.2 Data Retention

#### 4.2.1 Retention Policy
**Control ID:** RET-001  
**Description:** Time-bound data retention with automated cleanup  
**Policies:**
| Data Type | Retention | Action |
|-----------|-----------|--------|
| Call recordings | 90 days | Auto-purge via cron |
| Call transcripts | 2 years | Soft delete available |
| Email content | User-configurable | Default 1 year |
| Audit logs | 1 year | Archive to cold storage |
| Failed auth attempts | 90 days | Auto-purge |

**Evidence:**
- `src/routes/settings-routes.ts`
- `src/routes/job-routes.ts`
- Supabase cron jobs (configured in dashboard)

---

## 5. Processing Integrity (CC9.1 - CC9.3)

### 5.1 Input Validation

#### 5.1.1 API Validation
**Control ID:** PI-001  
**Description:** Schema validation on all inputs  
**Implementation:**
- Zod schemas for all API endpoints
- Type-safe validation with error messages

**Evidence:**
```typescript
// src/lib/api-validation.ts
export const spendBudgetSchema = z.object({
  monthly_limit_usd: z.number().min(0).max(10000),
  warn_threshold_pct: z.number().int().min(1).max(99),
  hard_cap: z.boolean(),
  enabled: z.boolean(),
});
```

#### 5.1.2 Webhook Idempotency
**Control ID:** PI-002  
**Description:** Duplicate event protection  
**Implementation:**
```typescript
// Stripe webhook deduplication
await drizzle
  .insert(schema.stripeEvents)
  .values({ eventId: idempotencyKey, eventType: event.type });
// Unique constraint prevents duplicates
```

**Evidence:**
- `src/routes/billing-routes.ts` — Stripe webhook idempotency
- Database unique constraints

### 5.2 Data Integrity

#### 5.2.1 Database Constraints
**Control ID:** PI-003  
**Description:** Referential integrity via foreign keys  
**Implementation:**
- All relations use `onDelete: "cascade"` or `"set null"`
- Drizzle ORM enforces types at compile time
- Database-level constraints for runtime safety

**Evidence:** `src/db/schema.ts` — All table definitions

---

## 6. Privacy (CC10.1 - CC10.4)

### 6.1 Data Subject Rights

#### 6.1.1 Account Deletion
**Control ID:** PRIV-001  
**Description:** GDPR/CCPA-compliant account deletion  
**Implementation:**
- 30-day grace period (configurable)
- Cascading delete of all user data
- Audit log retention for compliance

**Evidence:**
- `src/routes/account-routes.ts`
- `src/lib/account-deletion.ts`
- `wireline_deletion_queue` table schema

#### 6.1.2 Data Export
**Control ID:** PRIV-002  
**Description:** User data portability  
**Implementation:**
- `/api/account/export` endpoint
- JSON format with all user-associated data
- Includes: profile, agents, calls, settings, billing history

**Evidence:** Data export functionality in Account Settings

### 6.2 Consent Management

#### 6.2.1 Cookie Consent
**Control ID:** PRIV-003  **Description:** GDPR-compliant cookie banner  
**Implementation:**
- `src/components/CookieConsent.tsx`
- Granular consent (analytics, functional)
- Consent stored in localStorage

#### 6.2.2 Call Recording Disclosure
**Control ID:** PRIV-004  
**Description:** Automated recording disclosure  
**Implementation:**
- Agent runtime injects disclosure based on compliance mode
- Configurable by tenant in FleetSettings
- HIPAA/PCI/GDPR-specific disclosures available

**Evidence:** `src/lib/agent-runtime.ts` — `complianceDisclosure()`

---

## 7. Third-Party Vendor Management

### 7.1 Vendor Security Assessments

| Vendor | Service | SOC 2 | PCI | GDPR | Data Residency |
|--------|---------|-------|-----|------|----------------|
| Vercel | Hosting | Type II | N/A | Yes | Edge (global) |
| Supabase | Database | Type II | N/A | Yes | US (configurable) |
| Stripe | Payments | Type II | Level 1 | Yes | US |
| Twilio | Voice/SMS | Type II | N/A | Yes | US |
| Anthropic | AI | Type II | N/A | Yes | US |
| ElevenLabs | TTS | In Progress | N/A | Yes | US |

**Evidence Location:** Vendor trust pages + contracts

### 7.2 Data Processing Agreements

- **Supabase:** DPA signed (EU SCCs for GDPR)
- **Stripe:** DPA included in standard terms
- **Twilio:** DPA executed
- **Anthropic:** Business Associate Agreement available
- **Vercel:** DPA included in Enterprise terms

---

## 8. Change Management

### 8.1 Deployment Process

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Feature │ →  │   PR     │ →  │ CI Pass  │ →  │  Merge   │
│ Branch  │    │ Review   │    │ + Audit  │    │ to main  │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
                                                  ↓
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Prod    │ ←  │  E2E     │ ←  │  Deploy  │ ←  │ Auto     │
│ Live    │    │  Tests   │    │ Preview  │    │ Deploy   │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Controls:**
1. **Branch protection:** Required reviews, status checks
2. **CI gate:** Tests + security audit must pass
3. **Preview deploys:** Vercel preview for every PR
4. **Production deploys:** Auto-deploy from main

**Evidence:**
- GitHub branch protection settings (screenshot)
- `.github/workflows/ci.yml`
- Vercel deployment history

### 8.2 Emergency Changes

**Policy:** Emergency changes require:
1. Post-hoc review within 24 hours
2. Incident documentation
3. Retro within 1 week

**Evidence:** PagerDuty incident log + GitHub PR history

---

## 9. Test Evidence Summary

### 9.1 Unit Tests
**Coverage:** [Run `npm run test:coverage` for current %]
**Key Areas:**
- Authentication: 45 tests
- Authorization: 12 tests
- Billing: 38 tests
- Agent Runtime: 52 tests
- Voice Observability: 24 tests

**Evidence:** `coverage/` directory (CI artifact)

### 9.2 Integration Tests
**Scope:**
- Database operations (Drizzle)
- API route handlers (supertest)
- Webhook handlers (signature verification)
- Multi-tenant isolation (adversarial)

**Evidence:**
- `src/routes/*.test.ts`
- `tests/integration/tenant-isolation.adversarial.test.ts`

### 9.3 E2E Tests
**Scope:**
- Authentication flows
- Onboarding wizard (Fast Start)
- Critical user paths
- Accessibility (WCAG 2.1 AA)

**Evidence:**
- `tests/e2e/*.spec.ts`
- Playwright reports (CI artifact)

### 9.4 Security Tests
**Scope:**
- Red-team harness (prompt injection)
- Rate limiting validation
- Webhook signature verification
- AuthZ matrix enforcement

**Evidence:**
- `src/lib/agent-runtime.redteam.test.ts`
- `tests/integration/escalation-rate-limit.test.ts`

---

## 10. Monitoring & Alerting Evidence

### 10.1 Application Metrics

| Metric | Tool | Threshold | Alert Channel |
|--------|------|-----------|---------------|
| Error rate | Sentry | >0.1% | Email + Slack |
| P95 latency | Vercel Analytics | >2s | Email |
| Failed logins | Database | >10/min | Security channel |
| Voice TTFT p95 | Custom | >1.2s | PagerDuty |

**Evidence:**
- Sentry dashboard configuration
- Vercel Analytics thresholds
- Custom alerting rules in voice-observability.ts

### 10.2 Audit Log Queries

```sql
-- Suspicious authentication patterns
SELECT 
  user_id,
  COUNT(*) as failed_attempts,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM wireline_audit_log
WHERE action = 'auth_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 5;
```

---

## 11. Evidence Inventory

### 11.1 Documents
| Document | Location | Last Updated |
|----------|----------|--------------|
| Architecture Diagram | `docs/architecture.md` | [Date] |
| Data Flow Diagram | `docs/data-flow.md` | [Date] |
| Incident Response Plan | `docs/incident-response.md` | [Date] |
| Vendor Security Matrix | Section 7 of this pack | 2026-05-29 |
| This SOC2 Evidence Pack | `docs/SOC2_EVIDENCE_PACK.md` | 2026-05-29 |

### 11.2 Configuration Screenshots Required
- [ ] GitHub branch protection rules
- [ ] Vercel environment variables (redacted)
- [ ] Supabase RLS policies
- [ ] Stripe webhook configuration
- [ ] Sentry alerting rules
- [ ] GitHub secret scanning results

### 11.3 Access Logs
| System | Log Location | Retention |
|--------|-------------|-----------|
| Application | Sentry | 90 days |
| Database | Supabase Logs | 7 days |
| Infrastructure | Vercel Logs | 3 days |
| Auth | Supabase Auth | 1 year |

---

## 12. Auditor Checklist

### Pre-Audit Preparation
- [ ] All tests passing in CI
- [ ] Security audit clean (no HIGH vulnerabilities)
- [ ] All screenshots captured
- [ ] Log retention verified
- [ ] Vendor DPAs on file

### Auditor Access Requirements
**Read-Only Access Provided:**
- [ ] GitHub repository (read)
- [ ] Vercel dashboard (viewer)
- [ ] Supabase dashboard (read)
- [ ] Sentry dashboard (member)
- [ ] Stripe dashboard (read-only team member)

**Evidence Provided:**
- [ ] This evidence pack
- [ ] CI/CD pipeline output (last 30 days)
- [ ] Test coverage reports
- [ ] Deployment history
- [ ] Audit logs (sample)

---

## Appendices

### A. Glossary
| Term | Definition |
|------|-----------|
| TTFT | Time-to-First-Token (voice AI latency) |
| RLS | Row Level Security (database policy) |
| DPA | Data Processing Agreement |
| BAA | Business Associate Agreement (HIPAA) |
| RAG | Retrieval-Augmented Generation |

### B. Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-29 | Engineering | Initial SOC2 evidence pack |

### C. Contact Information
| Role | Name | Email | Backup |
|------|------|-------|--------|
| Security Lead | [Name] | [Email] | [Backup] |
| Engineering Lead | [Name] | [Email] | [Backup] |
| Compliance Officer | [Name] | [Email] | [Backup] |

---

**END OF EVIDENCE PACK**

*This document contains confidential and proprietary information. Distribution is limited to authorized auditors and Wireline personnel.*
