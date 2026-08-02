# Wireline Company Identity Pack

**Status:** Active product contract  
**Date:** 2026-07-11  
**Owner:** Wireline

## Decision

Wireline should give each live voice agent a dedicated company identity, not merely a phone number.

The customer-facing package is:

1. **Dedicated Wireline number** for inbound calls, outbound calls, callbacks, and SMS where supported.
2. **Verified calling identity** using the customer's company display name, traditional CNAM fallback, and optional enhanced logo/call-reason assets where supported.
3. **Registered SMS identity** for compliant application-to-person messaging.
4. **Branded email identity** using the customer's sender name and authenticated sending domain.
5. **One shared identity record** across the agent's voice, SMS, and email work.

## What Wireline can promise

Wireline can:

- provision or attach a dedicated business number on eligible paid plans;
- collect and validate the company's identity profile;
- separate profile readiness from external provider approval;
- record an auditable request for Wireline review;
- support founder-led provider submission during the founding-customer phase;
- track review state per channel;
- use one company identity across the agent's connected channels;
- show exactly what is missing before a review request can be made.

## What Wireline must not promise

Wireline must not claim that:

- a company name will appear on every recipient's phone;
- a logo or call reason will appear on every mobile network or device;
- completing the Wireline form means a carrier has approved the identity;
- clicking the review button automatically submits to every provider;
- traditional CNAM and enhanced mobile branding are the same thing;
- an SMS sender is production-ready before required business/campaign registration;
- an email sender is authenticated before DNS/domain verification succeeds;
- provider approval timing or acceptance is controlled by Wireline.

The customer-facing guarantee is intentionally narrow:

> Wireline records a verified business profile and supports provider submission through approved workflows. Final display, coverage, timing, and approval remain controlled by carriers, devices, and inbox providers.

## Current implementation

### Product surface

`src/components/settings/CompanyIdentityPack.tsx` is mounted in Phone settings and provides:

- legal business name;
- customer-facing brand name;
- HTTPS logo URL;
- 15-character caller-ID fallback name;
- company website;
- support email;
- default call reason;
- voice, SMS, and email channel selection;
- per-channel profile readiness;
- per-channel provider status;
- an explicit Wireline identity-review request;
- provider-state-aware review controls that prevent no-op resubmission;
- explicit fail-closed feedback when no channel is selected;
- 44-pixel minimum channel-selection targets.

### API

`src/routes/company-identity-routes.ts` exposes authenticated endpoints:

- `GET /api/company-identity`
- `POST /api/company-identity`
- `POST /api/company-identity/review-request`

The review request is audit logged as `company_identity.review_requested`. Repeated requests are idempotent: they do not downgrade an approved or in-review channel back to `review_requested`.

A changed identity or dedicated number invalidates stale provider state. That reconciliation is persisted and audit logged as `company_identity.review_invalidated`; it is not merely hidden in an API response.

### Persistence, privacy, and concurrency

Canonical brand fields remain in `wireline_settings`:

- `business_name`
- `brand_name`
- `brand_logo_url`

The channel-specific identity workflow is stored under `wireline_user_preferences.preferences.company_identity` so it can evolve without adding carrier-specific columns to the tenant settings table.

Provider-owned states are not user-editable. The canonical user-preferences writer is mounted before the legacy settings router, terminates the matching request, and preserves the server-owned `company_identity` namespace instead of accepting client-supplied provider states.

Company Identity saves, review requests, stale-state reconciliation, and ordinary preference-envelope writes share a transaction-scoped PostgreSQL advisory lock. The settings and user-preferences rows are also locked before state is recalculated. This prevents an ordinary preference save from restoring an older identity snapshot over a newer profile or review request.

Provider review state is bound to a SHA-256 digest of the actual reviewed identity, including the dedicated number. The normalized business profile is not duplicated as a raw fingerprint in preferences or audit metadata. Changing the company identity or number invalidates stale review state. Merely adding another requested channel does not erase an already-approved identity for another channel.

An explicitly empty or corrupt channel selection fails closed. Wireline never silently broadens it back to voice, SMS, and email.

### Founding-customer operating mode

The current launch path is intentionally founder-led:

1. The customer completes the identity profile.
2. Wireline validates channel prerequisites.
3. The customer requests Wireline review.
4. The request and exact identity digest are recorded durably.
5. Wireline operations completes the applicable carrier, messaging, or email-provider workflow manually.
6. Provider status is reflected only after authoritative evidence exists.

Automatic provider submission is not claimed until the relevant provider adapters, callbacks, and admin controls are implemented and proven.

## State model

### Profile status

- `incomplete` — required business information is missing.
- `ready` — Wireline has the minimum profile needed to request provider review.

### Provider status

- `not_requested`
- `review_requested`
- `in_review`
- `approved`
- `rejected`
- `limited`

`ready` never means `approved`.

## Channel requirements

### Calling identity

Minimum Wireline profile:

- dedicated Wireline number;
- company display name;
- 15-character caller-ID fallback name;
- company website.

Traditional CNAM is the fallback for landlines and other non-enhanced displays. Enhanced mobile branded calling can include a verified display name, logo, and call reason, but support depends on carrier, network, device, geography, and product availability.

### SMS identity

Minimum Wireline profile:

- dedicated Wireline number;
- company display name;
- company website;
- support email.

This only establishes profile readiness. United States application-to-person long-code messaging still requires the applicable A2P 10DLC business and campaign registration before production traffic.

### Email identity

Minimum Wireline profile:

- company display name;
- company website;
- support email on the company domain.

This only establishes profile readiness. Branded sending requires provider/domain authentication such as SPF, DKIM, and the applicable sending-provider verification. Recipient inboxes retain control over final rendering.

## Provider integration posture

Twilio's current Branded Calling product can display a verified display name, company logo, and call reason on supported mobile networks. Twilio documents the US Basic and Enhanced products as public beta on T-Mobile and Verizon and directs independent software vendors to its Compliance resources for customer onboarding. Traditional CNAM remains the documented landline fallback.

Twilio also documents A2P 10DLC as the US carrier standard for verified and consensual application-to-person traffic sent through local long-code numbers.

Official references:

- https://www.twilio.com/docs/voice/branded-calling
- https://www.twilio.com/docs/messaging/compliance/a2p-10dlc

## Next implementation sequence

1. Add a platform-admin operations queue and provider-state transition surface.
2. Add provider adapters for Branded Calling compliance/provisioning status once account access is approved.
3. Add A2P 10DLC customer registration orchestration and status webhooks.
4. Add email-domain DNS verification and provider status.
5. Add immutable provider-evidence attachments to every state transition.
6. Add number-level identity mapping so different business lines can use distinct approved identities.
7. Add monitoring for rejected, expired, or coverage-limited identities.

## Success criteria

- Customers understand that the number belongs to their voice agent.
- Customers can configure one recognizable company identity across channels.
- Wireline never represents profile completion as provider approval.
- Every review request and invalidation is auditable.
- Provider limitations are visible before activation.
- Identity or number changes invalidate stale review states durably.
- Adding a channel does not erase unrelated approvals.
- Concurrent preference writes cannot restore stale identity state.
- Empty or corrupt channel scope never broadens silently.
- The product remains provider-neutral even when Twilio is the initial carrier implementation.
