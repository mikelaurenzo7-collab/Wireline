# OpenAI Realtime cost and key operations

## Admission reserve

BotBound pins browser voice to `gpt-realtime-2.1`. OpenAI lists audio input at
$32/M tokens and audio output at $64/M tokens. Its Realtime cost guide documents
600 user-audio tokens and 1,200 assistant-audio tokens per minute. Continuous
full-duplex audio is therefore $0.096/minute, or $0.48 for the platform's
five-minute maximum, before text, special tokens, reasoning, and repeated
conversation context.

The runtime doubles that floor and rounds up to a $1.00 five-minute admission
reserve. `WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD` may raise the reserve;
unset uses $1.00, while malformed values and values below $1.00 fail closed.
Retention-ratio truncation retains 80% and caps post-instruction conversation
context at 8,000 tokens. The reserve is a conservative budget gate, not an
invoice ceiling; compare reserved and measured provider cost regularly.

Sources:

- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://developers.openai.com/api/docs/guides/realtime-costs
- https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/calls/methods/accept

## Planned key rotation with in-flight drain

The two credential sources rotate independently:

| Source                     | Current key              | Previous-key drain slot           |
| -------------------------- | ------------------------ | --------------------------------- |
| Runtime/Studio             | `OPENAI_API_KEY`         | `OPENAI_API_KEY_PREVIOUS`         |
| ChatGPT private simulation | `OPENAI_API_KEY_CHATKIT` | `OPENAI_API_KEY_CHATKIT_PREVIOUS` |

Authenticated ChatGPT private simulation falls back to the runtime source when
its current ChatKit key is unset. Public and guest audio/call demos are retired.
Each durable hangup records its exact source and key fingerprint. New calls use
only a current key; a hangup may use the same source's previous key only when
its fingerprint matches. Never overwrite a nonempty previous slot during a
second rotation.

1. Confirm the relevant previous slot is empty and no earlier rotation remains.
2. Create a new project-scoped service-account key. Record its key ID in the
   operator log, but never log or commit the secret.
3. In one deployment, move the old current value into its matching `*_PREVIOUS`
   slot, place the new value in the current slot, and redeploy. Do this separately
   for Preview and Production; never copy a Production secret into Preview.
4. Start one canary call and confirm creation plus its durable hangup. Watch for
   fingerprint mismatch, late-hangup, and dead-letter logs.
5. Keep the previous key for at least 15 minutes (five-minute call cap, retries,
   cron cadence, and safety margin) **and** until this query has no non-done rows
   created before the cutover:

   ```sql
   select status, count(*)
   from wireline_jobs
   where type = 'openai_realtime_hangup'
     and created_at <= :cutover_at
     and status is distinct from 'done'
   group by status;
   ```

6. Investigate any pending, running, failed, or dead row; time alone is not drain
   proof. When the query is empty, revoke the old key at OpenAI, clear only its
   matching previous slot, redeploy, and run another canary.

Rollback after new-key calls exist must preserve both generations: restore the
old key as current and put the new key in the matching previous slot, then drain
again. For a suspected compromise, revoke immediately even though old calls may
need provider-console termination; restore clean current credentials, inspect
all unfinished hangups, and canary before reopening traffic.

Project service-account API reference:
https://developers.openai.com/api/reference/typescript/resources/admin/subresources/organization/subresources/projects
