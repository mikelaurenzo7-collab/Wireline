# Resend Delivery Feedback

**Status:** code path launch-ready; production webhook registration and signing secret remain an external provider configuration step until explicitly verified.

Wireline sends platform email through Resend. Delivery feedback closes the loop so the platform stops retrying addresses that Resend has identified as permanently unsafe while preserving the distinction between **delivery risk** and **customer marketing preference**.

## Production endpoint

`POST https://trywireline.com/api/webhooks/resend`

The endpoint accepts `application/json` only and uses the raw request bytes. It verifies Resend / Standard Webhooks headers before parsing JSON or touching the database:

- `svix-id`
- `svix-timestamp`
- `svix-signature`

The signing secret belongs in `RESEND_WEBHOOK_SECRET`. Never commit it. The production endpoint should be the only target that receives the production signing secret.

## Events to subscribe

Enable these Resend events for the production webhook:

| Event | Wireline behavior |
| --- | --- |
| `email.bounced` | Permanent provider delivery suppression. |
| `email.complained` | Permanent provider delivery suppression. |
| `email.suppressed` | Permanent provider delivery suppression. |
| `email.failed` | Operational evidence only; do not automatically suppress the recipient. |
| `email.delivery_delayed` | Temporary delivery-delay evidence only; do not suppress the recipient. |

Unknown `email.*` events may be recorded as bounded operational evidence without creating a suppression.

## Data boundary

`wireline_resend_webhook_events` stores only the provider event id/type, provider email id, occurrence time, recipient count, suppression count, and a bounded detail code. It does **not** store subject lines, HTML, rendered text, or raw webhook payloads.

`wireline_email_delivery_suppressions` stores the normalized recipient address because the sender must be able to prevent future delivery attempts. This table is separate from `wireline_email_suppressions`, which also carries user unsubscribe preference.

A provider hard bounce/complaint/suppression is written to both the provider delivery-suppression table and the existing canonical commercial suppression table. A marketing unsubscribe is **not** copied into the provider delivery-suppression table, so transactional verification, password-reset, and billing mail are not accidentally disabled by an ordinary marketing preference.

## Sender behavior

Every platform Resend send checks provider delivery suppression before calling Resend. If that check fails or the suppression store is unavailable, the send fails closed and callers must not claim delivery.

Commercial lifecycle mail still performs the additional CAN-SPAM / one-click-unsubscribe preference check.

## Activation procedure

1. In Resend, create a production webhook targeting `https://trywireline.com/api/webhooks/resend`.
2. Subscribe to the five events listed above.
3. Copy the generated `whsec_...` signing secret into a secure local environment as `RESEND_WEBHOOK_SECRET`.
4. Run `node scripts/sync-resend-env-to-vercel.mjs` with an authorized Vercel token. The script syncs the webhook secret to **production only**.
5. Redeploy production.
6. Use Resend's test-event capability or a controlled test address to send a signed event.
7. Verify:
   - invalid / stale signatures return non-2xx;
   - a hard-bounce/complaint/suppressed event produces one idempotent webhook receipt and provider delivery suppression;
   - a delayed/failed event produces operational evidence but no suppression;
   - a duplicate event id returns success without multiplying state;
   - no subject/body/raw-payload content lands in the receipt ledger.

## Rollback

If provider feedback is misconfigured, disable/delete the Resend webhook or remove `RESEND_WEBHOOK_SECRET`. The Wireline endpoint will return 503 when verification is unavailable. Do not bypass signature verification and do not convert temporary delivery delays into permanent suppression.
