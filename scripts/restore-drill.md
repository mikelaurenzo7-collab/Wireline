# Supabase PITR Restore Drill

This runbook documents the Point-In-Time Recovery (PITR) restore procedure for the Wireline Supabase database. Run this drill **before launch** and **quarterly thereafter** to verify backup integrity and document measured RTO/RPO.

---

## Prerequisites

- Admin access to the production Supabase project (via dashboard)
- A scratch/staging Supabase project for restore testing
- `psql` CLI installed (`brew install postgresql` or `apt-get install postgresql-client`)
- Environment variables from production (`.env`)

---

## Part 1: Verify PITR is Enabled

1. Log into the Supabase dashboard for the **production project**
2. Navigate to **Settings → Database**
3. Confirm **"Point in Time Recovery"** is enabled
4. Document the retention period: **_______ days** (default: 7 days on Pro plan, 30 days on Enterprise)
5. Note the earliest restore point: **_______________________** (UTC timestamp)

> ⚠️ **If PITR is not enabled**, enable it immediately. The retention clock starts from the moment you enable it, so historical data cannot be recovered retroactively.

---

## Part 2: Create a Scratch Project for Restore Testing

1. In the Supabase dashboard, create a new project: **`wireline-restore-drill-YYYY-MM-DD`**
2. Select the same region as production (to minimize data transfer time in a real DR scenario)
3. Wait for the project to provision (~2 minutes)
4. Copy the connection string from **Settings → Database → Connection string (URI)**
5. Set environment variables for the scratch project:
   ```bash
   export SCRATCH_SUPABASE_URL="https://SCRATCH_REF.supabase.co"
   export SCRATCH_SERVICE_ROLE_KEY="eyJhbG..."
   export SCRATCH_DB_PASSWORD="your-postgres-password-from-dashboard"
   export SCRATCH_PROJECT_REF="SCRATCH_REF"
   ```

---

## Part 3: Perform the PITR Restore

Supabase PITR restores are **destructive** — they replace the target database entirely. Use a scratch project.

### Step 1: Trigger the Restore

1. In the Supabase dashboard for the **scratch project**, navigate to **Settings → Database → Backups**
2. Click **"Restore from another project"** or **"Point in Time Recovery"**
3. Select the **production project** as the source
4. Choose a restore point:
   - **Option A (drill):** 1 hour ago (to verify recent data is recoverable)
   - **Option B (disaster scenario):** The last known good timestamp before the incident
5. Confirm the restore
6. Start timer: **Restore initiated at: _______________________**

### Step 2: Monitor Progress

- The restore can take **5–30 minutes** depending on database size
- Dashboard will show: `Restoring database...`
- Wait for status to change to: `Database is healthy`

### Step 3: Measure RTO

- **Restore completed at: _______________________**
- **Measured RTO (Recovery Time Objective): _______ minutes**

---

## Part 4: Verify Data Integrity

Connect to the restored scratch database and run smoke tests:

```bash
# Set connection details
export PGHOST="db.${SCRATCH_PROJECT_REF}.supabase.co"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres"
export PGPASSWORD="${SCRATCH_DB_PASSWORD}"

# Connect
psql

# Run verification queries
SELECT COUNT(*) FROM wireline_users;
SELECT COUNT(*) FROM wireline_call_logs;
SELECT COUNT(*) FROM wireline_agents;
SELECT MAX(created_at) FROM wireline_call_logs;  -- Should match restore point
```

Expected results:

| Table | Row Count (from production) | Row Count (after restore) | Match? |
|-------|------------------------------|----------------------------|--------|
| `wireline_users` | _______ | _______ | ☐ Yes ☐ No |
| `wireline_call_logs` | _______ | _______ | ☐ Yes ☐ No |
| `wireline_agents` | _______ | _______ | ☐ Yes ☐ No |

> **RPO Measurement**: The `MAX(created_at)` from `wireline_call_logs` shows the last transaction included in the restore. The delta between that and the current time is your **Recovery Point Objective (RPO)** for this backup.

**Measured RPO: _______ minutes** (should be ≤ 5 minutes on Supabase Pro with WAL streaming)

---

## Part 5: Test Application Boot

Deploy the Wireline app against the restored database to verify schema compatibility:

```bash
# Update .env to point to scratch project
export VITE_SUPABASE_URL="${SCRATCH_SUPABASE_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SCRATCH_SERVICE_ROLE_KEY}"

# Boot the server
npm run dev
```

Smoke tests:

- [ ] Server starts without crashes
- [ ] `/api/health` returns 200
- [ ] Dashboard loads in the browser
- [ ] Can log in with an existing user from the restored data
- [ ] Call logs table populates correctly
- [ ] No RLS policy errors in server logs

---

## Part 6: Measure RPO for Edge Cases

PITR can recover to **any second** within the retention window, but test edge cases:

### Scenario A: Can we restore to 5 minutes ago?

1. Note the current UTC time: **_______________________**
2. Trigger a restore to **(current time - 5 minutes)**
3. Verify the restore completes
4. Check `MAX(created_at)` from `wireline_call_logs` matches the target

**Result:** ☐ Success ☐ Failure (document why: _______________________)

### Scenario B: Can we restore to the oldest available point?

1. Trigger a restore to the **earliest restore point** (from Part 1)
2. Measure how long the restore takes (older backups may be slower)
3. Verify data integrity

**Result:** ☐ Success ☐ Failure (document why: _______________________)

---

## Part 7: Document Findings

### RTO (Recovery Time Objective)

| Restore Point | Database Size | Time to Complete Restore |
|---------------|---------------|--------------------------|
| 1 hour ago | _______ GB | _______ minutes |
| Oldest available | _______ GB | _______ minutes |

**Documented RTO for SLA:** _______ minutes (use p95 from multiple drills)

### RPO (Recovery Point Objective)

**Documented RPO:** ≤ 5 minutes (Supabase WAL streaming guarantee)

### Known Limitations

- [ ] Restore requires admin dashboard access (no CLI/API trigger yet)
- [ ] Cannot restore individual tables (full database only)
- [ ] Restore is destructive to the target project
- [ ] _______________________________________________________ (add any discovered issues)

---

## Part 8: Clean Up

1. **Delete the scratch project** from the Supabase dashboard (Settings → General → Delete project)
2. Commit this completed runbook to version control with the drill date
3. Set a calendar reminder for the next quarterly drill

---

## Appendix: Real Disaster Recovery Procedure

In a **production incident** requiring restore:

1. **DO NOT RESTORE DIRECTLY TO PRODUCTION** — that is destructive
2. Create a new Supabase project: `wireline-recovery-YYYY-MM-DD`
3. Restore production into that project using PITR (Part 3 above)
4. Verify data integrity (Part 4)
5. Update DNS / Vercel environment variables to point to the recovery project
6. Test the app thoroughly before announcing recovery complete
7. Once stable, optionally migrate back to the original project (or keep the recovery project as the new production)

**Estimated Total RTO (drill-to-live):** _______ minutes (RTO + 10 min verification + 5 min DNS)

---

## Drill Execution Log

| Date | Operator | RTO Measured | RPO Measured | Issues Found | Status |
|------|----------|--------------|--------------|--------------|--------|
| YYYY-MM-DD | Name | ___ min | ___ min | None / (describe) | ☐ Pass ☐ Fail |
| | | | | | |
| | | | | | |

**Next scheduled drill:** _______________________
