# Wireline Service Level & Support Policy

**Updated:** August 11, 2026  
**Applies to:** Wireline self-serve service unless a signed order form or agreement says otherwise.

## Contract boundary

Wireline's public plans are sold as self-serve software. They do **not** include a contractual uptime SLA, service-credit schedule, guaranteed incident-response time, dedicated Slack channel, or 24/7 founder escalation unless those terms are expressly included in a signed agreement.

Scale / Enterprise customers may negotiate support, availability, security, data-handling, and service-credit terms. A signed agreement controls over this document if the two conflict.

## Availability posture

Wireline is engineered for continuous operation across calling, messaging, email, and the web application, with provider fallbacks and bounded failure modes where the product can safely provide them.

- Public service posture: `https://trywireline.com/status`
- Public application health: `GET /api/health`
- Public voice reliability surface: `GET /api/health/voice-status`
- Authenticated/operator diagnostics provide additional provider, queue, and SLO evidence.

These surfaces report observed system state. They are operational evidence, not a contractual uptime guarantee.

## Support

- Product and account support: `support@trywireline.com`
- Security reports and security-document requests: `security@trywireline.com`
- In-product support and escalation paths may be available by plan and configuration.

Wireline prioritizes widespread voice/runtime outages and security incidents above ordinary product questions. Any response or resolution times stated in an executed Enterprise agreement are contractual only for that customer.

## Incidents

Wireline uses application health probes, job/queue monitoring, provider diagnostics, structured error reporting, and a nightly public-line canary to detect failures. Some checks are request-driven rather than scheduled; monitoring cadence and alert delivery depend on the active production configuration. The operator SLO snapshot treats the incident-response path as configured only when both a protected monitor credential and an owner contact are present; that configuration alone does not prove external polling or alert delivery.

During a material incident, Wireline aims to:

1. contain customer impact;
2. preserve data and billing integrity;
3. restore the safest viable service path;
4. communicate material customer-facing status through the appropriate product/support surface; and
5. document root cause and corrective action when warranted.

These are operating objectives, not guaranteed response-time commitments for self-serve plans.

## Provider dependencies

Wireline depends on managed infrastructure and communications providers for functions including cloud hosting, telephony, voice orchestration, model inference, payments, email delivery, database hosting, and rate limiting. Wireline designs for graceful degradation and fallback where practical, but an upstream outage can still affect service.

## Data durability and retention

- Primary application data is stored in managed Postgres infrastructure.
- Backup and point-in-time-recovery capabilities follow the active managed-database plan and production configuration; Wireline does not publicly promise a recovery window that has not been independently verified for the active plan.
- Call transcripts use tenant-configurable retention with a **365-day default, minimum 90 days, and a supported 90–365 day range**.
- Managed full-call provider audio recording is disabled by default. Caller-submitted voicemail or message-recording features may create audio when the feature is intentionally used.
- Account deletion and privacy-rights workflows use server-owned deletion paths for user-owned product data; third-party processors may retain bounded records as required for security, fraud prevention, billing, legal obligations, or their documented retention cycles.

## Enterprise terms

Customers that need a contractual uptime target, BAA, DPA, security addendum, named support contacts, incident-notification window, data-residency term, recovery objective, or service credits should obtain those terms in writing before relying on them.

This document deliberately describes what Wireline can substantiate today. Roadmap work, internal targets, and historical runbooks are not customer commitments.
