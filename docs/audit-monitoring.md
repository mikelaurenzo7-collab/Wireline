# Audit & Activity Monitoring

Wireline includes enterprise-grade audit logging and activity monitoring for compliance, security, and debugging.

## Features

- **Comprehensive activity tracking** — all user actions, agent changes, settings updates, API calls
- **Security monitoring** — failed authentication, rate limit violations, unauthorized access attempts
- **AI spend tracking** — token usage, costs, and latency per API call
- **Flexible filtering** — by event type, severity, date range, resource type
- **Export capabilities** — CSV and JSON export for compliance reporting
- **Real-time statistics** — aggregate views of activity patterns

## Event Types

### Authentication
- `auth.login` - Successful login
- `auth.logout` - User logout
- `auth.failed_login` - Failed login attempt
- `auth.password_reset` - Password reset initiated

### Agent Management
- `agent.created` - New agent created
- `agent.updated` - Agent configuration changed
- `agent.deleted` - Agent removed
- `agent.training_updated` - Directives/knowledge/personality updated

### Settings & Configuration
- `settings.updated` - Settings changed
- `settings.api_key_rotated` - API key rotated

### Billing
- `billing.subscription_changed` - Subscription plan changed
- `billing.payment_method_updated` - Payment method updated

### API Usage
- `api.claude_call` - Anthropic Claude API call
- `api.gemini_call` - Google Gemini API call
- `api.vapi_call` - Vapi voice API call

### Security
- `security.rate_limit_exceeded` - Rate limit violation
- `security.unauthorized_access` - Unauthorized access attempt
- `security.suspicious_activity` - Suspicious behavior detected

### Data Operations
- `data.export` - Data exported (CSV/JSON)
- `data.import` - Data imported
- `data.bulk_delete` - Bulk deletion performed

## Severity Levels

- **info** — Normal operations
- **warning** — Attention needed but not critical
- **error** — Operation failed or rejected
- **critical** — Security issue or system problem

## API Endpoints

### GET /api/audit/events
Fetch audit events with filtering.

**Query parameters:**
- `event_type` — Filter by event type (can be array)
- `severity` — Filter by severity (can be array)
- `resource_type` — Filter by resource type
- `start_date` — ISO timestamp for range start
- `end_date` — ISO timestamp for range end
- `search` — Search in action, email, resource ID
- `days` — Show last N days (default: 7)
- `limit` — Max results per page (default: 100)
- `offset` — Pagination offset (default: 0)

**Response:**
```json
{
  "events": [
    {
      "id": 123,
      "user_id": "uuid",
      "event_type": "agent.created",
      "severity": "info",
      "action": "created",
      "actor_email": "user@example.com",
      "resource_type": "agent",
      "resource_id": "node-sales-1",
      "metadata": { "agent_name": "Sales Agent" },
      "ip_address": "192.168.1.1",
      "created_at": "2026-05-05T12:00:00Z"
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

### GET /api/audit/stats
Get aggregate statistics.

**Query parameters:**
- `days` — Period to analyze (default: 30)

**Response:**
```json
{
  "total_events": 1234,
  "by_severity": {
    "info": 1000,
    "warning": 200,
    "error": 30,
    "critical": 4
  },
  "by_type": {
    "api.claude_call": 800,
    "agent.updated": 50,
    "auth.login": 100
  },
  "total_cost_usd": 45.6789,
  "total_api_calls": 800,
  "period_days": 30
}
```

### GET /api/audit/export
Export audit events.

**Query parameters:**
- `format` — `csv` or `json` (default: csv)
- `days` — Period to export (default: 30)

**Response:** File download with appropriate Content-Type

## Compliance Use Cases

### SOC 2 Type II
- Track all access to sensitive data
- Log configuration changes
- Monitor security events
- Export audit trails for auditors

### GDPR
- Log data exports per user
- Track consent changes
- Monitor access to personal data
- Provide audit trails for DPAs

### HIPAA
- Track PHI access (if applicable)
- Log administrative actions
- Monitor security incidents
- Generate compliance reports

## Best Practices

1. **Review regularly** — Check audit log weekly for anomalies
2. **Set up alerts** — Monitor critical security events
3. **Export for compliance** — Keep quarterly exports for records
4. **Monitor costs** — Track AI spend via audit log
5. **Investigate failures** — Review failed auth attempts promptly

## Database Schema

```sql
CREATE TABLE wireline_audit_log (
    id BIGINT PRIMARY KEY,
    user_id UUID,
    event_type TEXT,
    severity TEXT DEFAULT 'info',
    action TEXT,
    actor_email TEXT,
    resource_type TEXT,
    resource_id TEXT,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    -- AI-specific fields
    provider TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_create_tokens INTEGER,
    cost_usd DECIMAL(12, 6),
    latency_ms INTEGER,
    created_at TIMESTAMPTZ
);
```

## Security Considerations

- All audit records are immutable (no UPDATE or DELETE operations)
- Row-level security enforces user isolation
- Failed authentication attempts are logged before rejection
- Rate limit violations are logged before 429 response
- IP addresses and user agents captured for forensics
