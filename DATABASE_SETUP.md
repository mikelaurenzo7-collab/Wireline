# Wireline Database Setup & Optimization Guide

**Database**: PostgreSQL via Supabase  
**Connection**: Transaction pooler (port 6543) for serverless  
**ORM**: Drizzle ORM  
**Status**: Production-ready with optimizations

---

## Quick Verification

```bash
# Run health check
npm run db:health

# Check migrations status
npm run db:check

# Push any pending migrations (use with caution in production)
npm run db:push
```

---

## Schema Overview

### Core Tables (30+ tables organized by domain)

#### 1. Identity & Accounts
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_users` | User accounts | UUID PK, unique email, RLS enabled |
| `wireline_password_reset_tokens` | Secure password resets | Hashed tokens, 15-min TTL |
| `wireline_email_verification_tokens` | Email verification | Hashed tokens, 24-hour TTL |

#### 2. Settings & Billing
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_settings` | Per-user configuration | FK → users (cascade), unique user_id |
| `wireline_subscriptions` | Stripe subscription tracking | FK → users, price_id indexing |
| `wireline_spend_budget_alerts` | AI spend monitoring | FK → settings, threshold-based |

#### 3. Fleet (AI Agents)
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_agents` | Agent definitions | FK → users, enabled_tools JSONB |
| `wireline_agent_directives` | Agent instructions | FK → agents, priority ordering |
| `wireline_knowledge` | Agent knowledge base | FK → agents, vector-ready |
| `wireline_lessons` | Learned behaviors | FK → agents, lesson versioning |
| `wireline_cloned_voices` | ElevenLabs voice clones | FK → users, voice_id unique |
| `wireline_pronunciation_dicts` | Custom pronunciations | FK → agents, term/phoneme storage |

#### 4. Communications
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_call_logs` | Voice call records | FK → users/agents, vapi_call_id unique |
| `wireline_sms_threads` | SMS conversations | FK → users, phone indexing |
| `wireline_sms_messages` | Individual SMS | FK → threads, direction/status |
| `wireline_email_threads` | Email conversations | FK → users, unread count |
| `wireline_email_messages` | Individual emails | FK → threads, message_id unique |

#### 5. Scheduling
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_appointments` | Booked meetings | FK → users/agents, time indexing |
| `wireline_calendar_accounts` | OAuth calendar connections | FK → users, provider-specific |
| `wireline_calendar_events` | Synced events | FK → accounts, external_id unique |

#### 6. Outbound Campaigns
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_campaigns` | Campaign definitions | FK → users, status/dates |
| `wireline_leads` | Campaign leads | FK → campaigns, phone/email indexing |
| `wireline_cadences` | Multi-touch sequences | FK → campaigns, step ordering |
| `wireline_cadence_runs` | Executed cadence steps | FK → leads/cadences, status |

#### 7. Operations & Compliance
| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `wireline_fleet_tasks` | Background job queue | FK → users, status/priority |
| `wireline_audit_log` | Compliance logging | FK → users, event type indexing |
| `wireline_dnc_list` | Do Not Call registry | Phone hashing, per-user |
| `wireline_consent_log` | TCPA consent tracking | FK → users, phone/timestamp |
| `wireline_webhooks` | Outbound webhooks | FK → users, event type array |

---

## Optimization Status

### ✅ Implemented

| Optimization | Status | Impact |
|--------------|--------|--------|
| **Foreign Key Constraints** | ✅ All tables | Referential integrity enforced |
| **Cascading Deletes** | ✅ users → all related | Clean account deletion |
| **UUID Primary Keys** | ✅ All tables | Distributed-safe, non-sequential |
| **Timestamps with Timezone** | ✅ All tables | Proper timezone handling |
| **JSONB for Metadata** | ✅ agents, logs, settings | Flexible schema, queryable |
| **Unique Constraints** | ✅ email, vapi_call_id, etc. | Data integrity |

### 🔧 Recommended Index Additions

```sql
-- High-frequency queries (user + time sorted)
CREATE INDEX CONCURRENTLY idx_call_logs_user_created 
ON wireline_call_logs(user_id, created_at DESC);

-- Inbox queries (user + recency)
CREATE INDEX CONCURRENTLY idx_email_threads_user_last 
ON wireline_email_threads(user_id, last_message_at DESC);

-- Campaign management (user + status)
CREATE INDEX CONCURRENTLY idx_campaigns_user_status 
ON wireline_campaigns(user_id, status);

-- Audit queries (user + time for compliance)
CREATE INDEX CONCURRENTLY idx_audit_log_user_created 
ON wireline_audit_log(user_id, created_at DESC);

-- Phone lookups (DNC, consent, caller ID)
CREATE INDEX CONCURRENTLY idx_call_logs_customer_number 
ON wireline_call_logs(customer_number);

-- Subscription lookups (for billing webhooks)
CREATE INDEX CONCURRENTLY idx_subscriptions_stripe_customer 
ON wireline_subscriptions(stripe_customer_id);
```

---

## Connection Configuration

### Supabase Transaction Pooler (Recommended for Serverless)

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[REGION].pooler.supabase.com:6543/postgres
```

**Your connection**: Set `POSTGRES_URL` in `.env` (see `.env.example`). Never commit credentials to version control.

### Connection Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Port** | 6543 | Transaction pooler (not 5432 direct) |
| **Mode** | Transaction | Automatic connection pooling |
| **Pool Size** | Dynamic | Supabase-managed (up to 200) |
| **Timeout** | 60s | Serverless-optimized |

### Vercel Environment Variables

```bash
# Required
POSTGRES_URL=postgresql://postgres.[REF]:[PASS]@[REGION].pooler.supabase.com:6543/postgres
INTERNAL_JWT_SECRET=<64-character hex string>
```

---

## Row Level Security (RLS)

### Critical Tables with RLS

```sql
-- Users table (prevents cross-tenant access)
ALTER TABLE wireline_users ENABLE ROW LEVEL SECURITY;

-- Call logs (users only see their own calls)
ALTER TABLE wireline_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_calls ON wireline_call_logs
FOR ALL TO authenticated
USING (user_id = auth.uid());

-- Settings (per-user isolation)
ALTER TABLE wireline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_settings ON wireline_settings
FOR ALL TO authenticated
USING (user_id = auth.uid());

-- Agents (tenant isolation)
ALTER TABLE wireline_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_agents ON wireline_agents
FOR ALL TO authenticated
USING (user_id = auth.uid());
```

### RLS Verification

```bash
# Check RLS status per table
\d+ wireline_users
\d+ wireline_call_logs
```

---

## Backup & Recovery

### Supabase Automated Backups

| Plan | Backup Frequency | Retention |
|------|------------------|-----------|
| Free | Daily | 7 days |
| Pro | Daily + PITR | 7 days (PITR: 7 days) |
| Team | Daily + PITR | 14 days |
| Enterprise | Custom | Custom |

### Manual Backup (pg_dump)

```bash
# Schema only (substitute your pooler host + project ref)
pg_dump --schema-only -h $PGHOST -p 6543 -U postgres.$PROJECT_REF postgres > schema_backup.sql

# Full backup (data + schema)
pg_dump -h $PGHOST -p 6543 -U postgres.$PROJECT_REF postgres > full_backup.sql
```

### Point-in-Time Recovery (PITR)

Available in Supabase Dashboard → Database → Backups

---

## Performance Monitoring

### Key Metrics to Watch

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Query Time (p95)** | < 100ms | > 500ms |
| **Connection Pool** | < 80% | > 90% |
| **Cache Hit Ratio** | > 95% | < 90% |
| **Index Usage** | > 90% | < 80% |
| **Table Bloat** | < 20% | > 50% |

### Health Check Output Example

```
======================================================================
WIRELINE DATABASE HEALTH REPORT
======================================================================

Status: ✅ HEALTHY

📊 STATISTICS:
  Tables: 35
  Indexes: 78
  Estimated Total Rows: 12,450

📈 LARGEST TABLES:
  • wireline_call_logs: 5,230 rows (28 MB)
  • wireline_audit_log: 3,120 rows (18 MB)
  • wireline_email_messages: 1,890 rows (12 MB)

⚠️ WARNINGS:
  • Missing index on wireline_email_threads(user_id, last_message_at)
  • Row Level Security not enabled on wireline_webhooks

💡 OPTIMIZATION RECOMMENDATIONS:
  • Consider VACUUM ANALYZE for wireline_audit_log
  • 2 potentially unused indexes found

🔧 MISSING INDEXES:
  • wireline_email_threads(user_id, last_message_at DESC)
  • wireline_campaigns(user_id, status)

======================================================================
```

---

## Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| 0001 | 2024-XX | Initial purge function |
| 0002 | 2024-XX | Email thread read tracking |
| 0003 | 2024-XX | Drift column backfill |
| 0004 | 2024-XX | Fleet task payload JSONB |
| 0005 | 2024-XX | CRM connected email field |
| 0006 | 2024-XX | Bigint PK migration |
| 0007 | 2024-XX | Agent conversation messages |
| 0008 | 2024-XX | Extra agents à la carte |
| 0009 | 2024-XX | Cloned voices table |
| 0010 | 2024-XX | Voice LLM default: Claude Sonnet |
| 0011 | 2024-XX | Performance indexes |
| 0012 | 2024-XX | Voice LLM default: GPT-4o |
| 0013 | 2024-XX | Voice LLM default: Gemini 3 Flash |
| 0014 | 2025-XX | Performance goals tracking |
| 0015 | 2025-XX | Foreign key constraints |
| 0016 | 2025-XX | Customer number indexing |

---

## Troubleshooting

### Common Issues

#### 1. Connection Pool Exhaustion

**Symptoms**: `FATAL: sorry, too many clients already`

**Solution**:
- Ensure using port 6543 (transaction pooler), not 5432
- Check for connection leaks in application code
- Monitor active connections in Supabase Dashboard

#### 2. Slow Queries

**Symptoms**: API response times > 2s

**Solution**:
```sql
-- Find slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Add missing indexes based on query patterns
CREATE INDEX CONCURRENTLY idx_slow_query ON table(column);
```

#### 3. High Storage Usage

**Symptoms**: Supabase storage warning

**Solution**:
```sql
-- Check table sizes
SELECT pg_size_pretty(pg_total_relation_size('wireline_audit_log'));

-- Archive old data
DELETE FROM wireline_audit_log 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM FULL wireline_audit_log;
```

#### 4. RLS Bypass Issues

**Symptoms**: Users seeing other users' data

**Solution**:
```sql
-- Verify RLS is enabled
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname LIKE 'wireline_%';

-- Force RLS for table owner
ALTER TABLE wireline_call_logs FORCE ROW LEVEL SECURITY;
```

---

## Security Checklist

- [ ] **RLS Enabled** on all tenant-scoped tables
- [ ] **Service Role Key** only used server-side, never exposed
- [ ] **Connection Pooler** (6543) used instead of direct (5432)
- [ ] **Encrypted at Rest** (Supabase default)
- [ ] **SSL/TLS Required** (enforced by Supabase)
- [ ] **Backup Verified** (test restore quarterly)
- [ ] **Audit Logging** enabled for compliance tables
- [ ] **Password Resets** use hashed tokens with short TTL

---

## Next Optimization Phase

### Week 1: Index Optimization
- [ ] Add 6 recommended indexes for high-frequency queries
- [ ] Verify index usage with `pg_stat_user_indexes`
- [ ] Drop unused indexes (>30 days no scans)

### Week 2: Partitioning Strategy
- [ ] Partition `wireline_audit_log` by month (compliance tables grow fast)
- [ ] Partition `wireline_call_logs` by month (high-volume table)
- [ ] Implement partition pruning for queries

### Week 3: Read Replicas
- [ ] Enable Supabase read replica (Pro plan+)
- [ ] Route reporting queries to replica
- [ ] Keep writes on primary

---

## Verification Commands

```bash
# Full health check
npm run db:health

# Check specific table
npx drizzle-kit studio

# Verify connection
node -e "
const { createClient } = require('@vercel/postgres');
const client = createClient({ connectionString: process.env.POSTGRES_URL });
client.connect().then(() => console.log('✅ Connected')).catch(e => console.error('❌', e));
"
```

---

**Status**: Database is production-ready with optimizations in place. Run `npm run db:health` for current status.
