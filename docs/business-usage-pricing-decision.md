# Wireline Billing Catalog Direction

## Product model

Wireline sells operating capacity, not template access.

- All templates are unlocked.
- Personal starts with free build and training, then funds live work through Conversation Balance.
- Team, Business, and Enterprise add shared operating capacity, routing, governance, and deeper integration controls.
- Live work should always reconcile through a durable ledger instead of vague "unlimited" promises.

## Target commercial structure

| Offer | Commercial role | Current billing expectation |
| --- | --- | --- |
| Personal | Solo or founder use | No required subscription; live work funded through Conversation Balance top-ups |
| Team | Shared SMB coverage | Recurring capacity tier plus Conversation Balance |
| Business | Revenue, support, and front desk teams | Recurring capacity tier plus pooled Conversation Balance |
| Enterprise | Governed rollout, SSO, policy, audit, BYO telephony | Annual committed usage and contract terms |
| Conversation Balance | One-time funding | Web checkout only; customer-controlled top-ups |

## Stripe direction

Create clean new Stripe products for the commercial model instead of reviving mixed legacy names.

- `Wireline Personal`
- `Wireline Team`
- `Wireline Business`
- `Wireline Enterprise`
- `Conversation Balance`

Each recurring offer should have explicit metadata for the internal plan id and price type. Top-ups should be one-time checkout products or price points, not template-gated subscriptions.

## Migration guardrails

- Do not archive or delete anything tied to active subscriptions.
- Do not archive or delete anything tied to active payment links until replacements exist.
- Preserve internal plan ids in code until subscription storage, entitlements, and webhook sync are migrated safely.
- Keep top-up funding idempotent through ledger references and Stripe invoice or session identifiers.

## Still required before live rollout

1. Finalize the durable Conversation Balance ledger and renewal grant behavior.
2. Decide which recurring tiers remain self-serve versus contact-sales only.
3. Create the new Stripe products and prices.
4. Repoint environment variables and checkout flows to the new prices.
5. Archive stale consumer-style products only after the new catalog is verified.
6. Re-run Vercel env coverage, Stripe checkout, webhook, and portal verification after the live swap.
